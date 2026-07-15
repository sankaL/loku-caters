import os
import sys
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace

from sqlalchemy.exc import IntegrityError

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("RESEND_API_KEY", "test-key")

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from services.customers import (  # noqa: E402
    CustomerEmailConflictError,
    CustomerNotFoundError,
    build_customer_backfill_rows,
    merge_pickup_locations,
    normalize_customer_email,
    sync_customer_from_contact,
    update_customer_from_admin,
)


class FakeQuery:
    def __init__(self, items):
        self.items = items
        self.filters = {}

    def filter_by(self, **kwargs):
        self.filters.update(kwargs)
        return self

    def first(self):
        for item in self.items:
            if all(
                getattr(item, key, None) == value for key, value in self.filters.items()
            ):
                return item
        return None


class FakeNestedTransaction:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class FakeSession:
    def __init__(self):
        self.customers = []

    def query(self, model):
        return FakeQuery(self.customers)

    def begin_nested(self):
        return FakeNestedTransaction()

    def add(self, item):
        self.customers.append(item)

    def flush(self):
        return None

    def rollback(self):
        return None


class RaceSession(FakeSession):
    def __init__(self, conflicting_customer):
        super().__init__()
        self.conflicting_customer = conflicting_customer
        self.pending_customer = None
        self.fail_once = True

    def add(self, item):
        self.pending_customer = item

    def flush(self):
        if self.fail_once and self.pending_customer is not None:
            self.fail_once = False
            self.pending_customer = None
            self.customers = [self.conflicting_customer]
            raise IntegrityError(
                "insert",
                {},
                Exception("duplicate key value violates unique constraint"),
            )
        return None


class CustomerServiceTests(unittest.TestCase):
    def make_customer(self, **overrides):
        customer = {
            "id": "customer-1",
            "email": "test@example.com",
            "name": "Test Customer",
            "phone_number": "111-222-3333",
            "pickup_locations": ["Markham"],
            "created_at": datetime(2026, 3, 18, 12, 0, tzinfo=timezone.utc),
            "updated_at": datetime(2026, 3, 18, 12, 0, tzinfo=timezone.utc),
        }
        customer.update(overrides)
        return SimpleNamespace(**customer)

    def test_normalize_customer_email_trims_and_lowercases(self):
        self.assertEqual(
            normalize_customer_email("  Test@Example.COM "), "test@example.com"
        )
        self.assertIsNone(normalize_customer_email("   "))

    def test_merge_pickup_locations_deduplicates(self):
        merged = merge_pickup_locations(["Markham", "Toronto", "Markham"], "Toronto")
        self.assertEqual(merged, ["Markham", "Toronto"])

    def test_sync_customer_from_contact_creates_new_customer(self):
        session = FakeSession()
        now = datetime(2026, 3, 18, 12, 0, tzinfo=timezone.utc)

        customer = sync_customer_from_contact(
            session,
            name="Test Customer",
            email="TEST@example.com",
            phone_number="111-222-3333",
            pickup_location="Markham",
            now=now,
        )

        self.assertIsNotNone(customer)
        self.assertEqual(len(session.customers), 1)
        self.assertEqual(customer.email, "test@example.com")
        self.assertEqual(customer.name, "Test Customer")
        self.assertEqual(customer.phone_number, "111-222-3333")
        self.assertEqual(customer.pickup_locations, ["Markham"])
        self.assertEqual(customer.created_at, now)
        self.assertEqual(customer.updated_at, now)

    def test_sync_customer_from_contact_updates_existing_customer_without_wiping_phone(
        self,
    ):
        session = FakeSession()
        created_at = datetime(2026, 3, 18, 12, 0, tzinfo=timezone.utc)
        updated_at = datetime(2026, 3, 19, 12, 0, tzinfo=timezone.utc)

        sync_customer_from_contact(
            session,
            name="Original Name",
            email="test@example.com",
            phone_number="111-222-3333",
            pickup_location="Markham",
            now=created_at,
        )
        customer = sync_customer_from_contact(
            session,
            name="Updated Name",
            email="TEST@example.com",
            phone_number=None,
            pickup_location="Toronto",
            now=updated_at,
        )

        self.assertEqual(len(session.customers), 1)
        self.assertEqual(customer.name, "Updated Name")
        self.assertEqual(customer.phone_number, "111-222-3333")
        self.assertEqual(customer.pickup_locations, ["Markham", "Toronto"])
        self.assertEqual(customer.created_at, created_at)
        self.assertEqual(customer.updated_at, updated_at)

    def test_sync_customer_from_contact_skips_missing_email(self):
        session = FakeSession()
        customer = sync_customer_from_contact(
            session,
            name="No Email",
            email=None,
            phone_number="111-222-3333",
            pickup_location="Markham",
        )
        self.assertIsNone(customer)
        self.assertEqual(session.customers, [])

    def test_sync_customer_from_contact_recovers_from_concurrent_insert(self):
        created_at = datetime(2026, 3, 18, 12, 0, tzinfo=timezone.utc)
        updated_at = datetime(2026, 3, 19, 12, 0, tzinfo=timezone.utc)
        conflicting_customer = SimpleNamespace(
            id="customer-1",
            email="test@example.com",
            name="Existing Name",
            phone_number="111-222-3333",
            pickup_locations=["Markham"],
            created_at=created_at,
            updated_at=created_at,
        )
        session = RaceSession(conflicting_customer)

        customer = sync_customer_from_contact(
            session,
            name="Updated Name",
            email="TEST@example.com",
            phone_number="999-999-9999",
            pickup_location="Toronto",
            now=updated_at,
        )

        self.assertIs(customer, conflicting_customer)
        self.assertEqual(customer.name, "Updated Name")
        self.assertEqual(customer.phone_number, "999-999-9999")
        self.assertEqual(customer.pickup_locations, ["Markham", "Toronto"])
        self.assertEqual(customer.created_at, created_at)
        self.assertEqual(customer.updated_at, updated_at)
        self.assertEqual(session.customers, [conflicting_customer])

    def test_update_customer_from_admin_updates_contact_fields(self):
        session = FakeSession()
        customer = self.make_customer()
        session.customers = [customer]
        updated_at = datetime(2026, 3, 20, 9, 30, tzinfo=timezone.utc)

        result = update_customer_from_admin(
            session,
            customer_id="customer-1",
            name="Updated Name",
            email="UPDATED@example.com",
            phone_number="222-333-4444",
            now=updated_at,
        )

        self.assertIs(result, customer)
        self.assertEqual(result.email, "updated@example.com")
        self.assertEqual(result.name, "Updated Name")
        self.assertEqual(result.phone_number, "222-333-4444")
        self.assertEqual(result.pickup_locations, ["Markham"])
        self.assertEqual(result.updated_at, updated_at)

    def test_update_customer_from_admin_clears_phone_number(self):
        session = FakeSession()
        created_at = datetime(2026, 3, 18, 12, 0, tzinfo=timezone.utc)
        customer = self.make_customer(
            phone_number="111-222-3333", created_at=created_at, updated_at=created_at
        )
        session.customers = [customer]
        updated_at = datetime(2026, 3, 20, 9, 30, tzinfo=timezone.utc)

        result = update_customer_from_admin(
            session,
            customer_id="customer-1",
            name="Test Customer",
            email="test@example.com",
            phone_number=None,
            now=updated_at,
        )

        self.assertIs(result, customer)
        self.assertIsNone(result.phone_number)
        self.assertEqual(result.updated_at, updated_at)

    def test_update_customer_from_admin_keeps_updated_at_for_noop_save(self):
        session = FakeSession()
        created_at = datetime(2026, 3, 18, 12, 0, tzinfo=timezone.utc)
        customer = self.make_customer(created_at=created_at, updated_at=created_at)
        session.customers = [customer]

        result = update_customer_from_admin(
            session,
            customer_id="customer-1",
            name="Test Customer",
            email="test@example.com",
            phone_number="111-222-3333",
            now=datetime(2026, 3, 20, 9, 30, tzinfo=timezone.utc),
        )

        self.assertIs(result, customer)
        self.assertEqual(result.updated_at, created_at)

    def test_update_customer_from_admin_rejects_duplicate_email(self):
        session = FakeSession()
        customer = self.make_customer(id="customer-1", email="test@example.com")
        conflicting = self.make_customer(
            id="customer-2",
            email="other@example.com",
            name="Other Customer",
            phone_number="999-999-9999",
        )
        session.customers = [customer, conflicting]

        with self.assertRaises(CustomerEmailConflictError):
            update_customer_from_admin(
                session,
                customer_id="customer-1",
                name="Test Customer",
                email="OTHER@example.com",
                phone_number="111-222-3333",
            )

        self.assertEqual(customer.email, "test@example.com")

    def test_update_customer_from_admin_raises_for_missing_customer(self):
        session = FakeSession()

        with self.assertRaises(CustomerNotFoundError):
            update_customer_from_admin(
                session,
                customer_id="missing",
                name="Test Customer",
                email="test@example.com",
                phone_number="111-222-3333",
            )

    def test_build_customer_backfill_rows_groups_and_picks_latest_contact_data(self):
        rows = build_customer_backfill_rows(
            [
                {
                    "name": "First Name",
                    "email": "test@example.com",
                    "phone_number": "111-222-3333",
                    "pickup_location": "Markham",
                    "created_at": datetime(2026, 3, 1, 9, 0, tzinfo=timezone.utc),
                },
                {
                    "name": "Updated Name",
                    "email": "TEST@example.com",
                    "phone_number": None,
                    "pickup_location": "Toronto",
                    "created_at": datetime(2026, 3, 5, 9, 0, tzinfo=timezone.utc),
                },
                {
                    "name": "Second Customer",
                    "email": "second@example.com",
                    "phone_number": "999-999-9999",
                    "pickup_location": "Scarborough",
                    "created_at": datetime(2026, 3, 7, 9, 0, tzinfo=timezone.utc),
                },
            ]
        )

        self.assertEqual(len(rows), 2)
        first = rows[0]
        self.assertEqual(first["email"], "test@example.com")
        self.assertEqual(first["name"], "Updated Name")
        self.assertEqual(first["phone_number"], "111-222-3333")
        self.assertEqual(first["pickup_locations"], ["Markham", "Toronto"])
        self.assertEqual(
            first["created_at"], datetime(2026, 3, 1, 9, 0, tzinfo=timezone.utc)
        )
        self.assertEqual(
            first["updated_at"], datetime(2026, 3, 5, 9, 0, tzinfo=timezone.utc)
        )

    def test_build_customer_backfill_rows_is_idempotent(self):
        orders = [
            {
                "name": "Test Customer",
                "email": "test@example.com",
                "phone_number": "111-222-3333",
                "pickup_location": "Markham",
                "created_at": datetime(2026, 3, 1, 9, 0, tzinfo=timezone.utc),
            },
            {
                "name": "Test Customer",
                "email": "TEST@example.com",
                "phone_number": "111-222-3333",
                "pickup_location": "Toronto",
                "created_at": datetime(2026, 3, 2, 9, 0, tzinfo=timezone.utc),
            },
        ]

        first_pass = build_customer_backfill_rows(orders)
        second_pass = build_customer_backfill_rows(orders)

        self.assertEqual(first_pass, second_pass)


if __name__ == "__main__":
    unittest.main()
