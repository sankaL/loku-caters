import os
import sys
import unittest
from datetime import date, datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("RESEND_API_KEY", "test-key")

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from database import get_db  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from main import app  # noqa: E402
from models import Event, Invoice, InvoiceSettings, Order  # noqa: E402
from routers import invoices  # noqa: E402
from sqlalchemy.exc import IntegrityError  # noqa: E402


class FakeQuery:
    def __init__(self, rows):
        self.rows = list(rows)
        self.criteria = []

    def filter(self, *criteria):
        self.criteria.extend(criteria)
        return self

    def order_by(self, *_args):
        return self

    @staticmethod
    def _matches(row, criterion) -> bool:
        left = getattr(criterion, "left", None)
        right = getattr(criterion, "right", None)
        key = getattr(left, "key", None) or getattr(left, "name", None)
        if key is None:
            return True
        expected = getattr(right, "value", right)
        return getattr(row, key, None) == expected

    def _filtered(self):
        return [row for row in self.rows if all(self._matches(row, criterion) for criterion in self.criteria)]

    def first(self):
        rows = self._filtered()
        return rows[0] if rows else None

    def all(self):
        return self._filtered()


class FakeSession:
    def __init__(self, *, orders, settings, events):
        self.orders = list(orders)
        self.settings = list(settings)
        self.events = list(events)
        self.invoices = []
        self.commit_count = 0

    def query(self, model):
        if model is Order:
            return FakeQuery(self.orders)
        if model is Invoice:
            return FakeQuery(self.invoices)
        if model is InvoiceSettings:
            return FakeQuery(self.settings)
        if model is Event:
            return FakeQuery(self.events)
        raise AssertionError(f"Unexpected model query: {model}")

    def add(self, row):
        now = datetime.now(timezone.utc)
        if isinstance(row, Invoice):
            row.created_at = row.created_at or now
            row.updated_at = row.updated_at or now
            self.invoices.append(row)
            return
        if isinstance(row, InvoiceSettings):
            row.updated_at = row.updated_at or now
            self.settings.append(row)
            return
        raise AssertionError(f"Unexpected row type: {type(row)}")

    def delete(self, row):
        self.invoices.remove(row)

    def commit(self):
        self.commit_count += 1

    def rollback(self):
        return None

    def refresh(self, _row):
        return None


class RacingSettingsSession(FakeSession):
    def __init__(self, *, orders, events):
        super().__init__(orders=orders, settings=[], events=events)
        self.pending_settings = None
        self.rollback_count = 0

    def add(self, row):
        if isinstance(row, InvoiceSettings):
            self.pending_settings = row
            return
        super().add(row)

    def commit(self):
        self.commit_count += 1
        raise IntegrityError("insert invoice settings", {}, Exception("duplicate singleton"))

    def rollback(self):
        self.rollback_count += 1
        self.pending_settings = None
        self.settings = [make_settings()]


def make_order():
    return SimpleNamespace(
        id="order-12345678",
        group_id=None,
        event_id=12,
        name="Test Customer",
        email="customer@example.com",
        phone_number="555-0100",
        item_id="lamprais",
        item_name="Lamprais",
        quantity=2,
        base_total_price=32,
        discount_total=2,
        total_price=30,
        pickup_location="Toronto",
        pickup_time_slot="12:00 PM",
        pickup_address="1 Main Street",
        pickup_date=date(2026, 7, 4),
        created_at=datetime(2026, 6, 20, tzinfo=timezone.utc),
        paid=False,
        payment_method=None,
        payment_method_other=None,
    )


def make_settings():
    return InvoiceSettings(
        id=1,
        business_name="Loku Caters",
        business_address="Toronto, ON",
        business_email="hello@example.com",
        business_phone="555-0199",
        payment_method="etransfer",
        payment_email="pay@example.com",
        payment_instructions="Include the invoice number.",
        default_footer_note="Thank you.",
        updated_at=datetime(2026, 6, 1, tzinfo=timezone.utc),
    )


class InvoiceRouteTests(unittest.TestCase):
    def setUp(self):
        self.order = make_order()
        self.session = FakeSession(
            orders=[self.order],
            settings=[make_settings()],
            events=[SimpleNamespace(id=12, name="July Batch")],
        )
        self.client = TestClient(app)

        def override_get_db():
            yield self.session

        app.dependency_overrides[get_db] = override_get_db
        app.dependency_overrides[invoices.verify_admin_token] = lambda: {"sub": "dev-admin"}

    def tearDown(self):
        app.dependency_overrides.clear()

    def test_get_settings_persists_missing_singleton_once(self):
        self.session.settings.clear()

        first = self.client.get("/api/admin/invoice-settings")
        second = self.client.get("/api/admin/invoice-settings")

        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.json()["business_name"], "Loku Caters")
        self.assertEqual(second.status_code, 200)
        self.assertEqual(len(self.session.settings), 1)
        self.assertEqual(self.session.commit_count, 1)

    def test_get_settings_recovers_when_concurrent_request_creates_singleton(self):
        racing_session = RacingSettingsSession(
            orders=[self.order],
            events=[SimpleNamespace(id=12, name="July Batch")],
        )

        settings = invoices._get_settings(racing_session)

        self.assertEqual(settings.business_name, "Loku Caters")
        self.assertEqual(racing_session.commit_count, 1)
        self.assertEqual(racing_session.rollback_count, 1)

    def test_invoice_http_lifecycle_duplicate_and_snapshot_payment_fallback(self):
        rejected = self.client.post(
            "/api/admin/invoices",
            json={"source_bundle_id": self.order.id, "total": 1},
        )
        self.assertEqual(rejected.status_code, 422)

        with patch("routers.invoices.next_invoice_number", return_value=("INV-2026-0001", 1)):
            created = self.client.post(
                "/api/admin/invoices",
                json={
                    "source_bundle_id": self.order.id,
                    "issue_date": "2026-06-30",
                    "due_date": "2026-07-04",
                    "memo": "HTTP test invoice",
                },
            )

        self.assertEqual(created.status_code, 201)
        invoice = created.json()
        self.assertEqual(invoice["invoice_number"], "INV-2026-0001")
        self.assertEqual(invoice["total"], 30.0)
        self.assertEqual(invoice["payment"]["source"], "order")

        duplicate = self.client.post(
            "/api/admin/invoices",
            json={"source_bundle_id": self.order.id},
        )
        self.assertEqual(duplicate.status_code, 409)
        self.assertEqual(duplicate.json()["detail"]["invoice_id"], invoice["id"])

        listed = self.client.get("/api/admin/invoices")
        self.assertEqual(listed.status_code, 200)
        self.assertEqual([row["id"] for row in listed.json()], [invoice["id"]])

        fetched = self.client.get(f"/api/admin/invoices/{invoice['id']}")
        self.assertEqual(fetched.status_code, 200)
        self.assertEqual(fetched.json()["snapshot"]["order"]["reference"], "ORDER-12")

        updated = self.client.patch(
            f"/api/admin/invoices/{invoice['id']}",
            json={"customer_name": "Updated Customer", "memo": "Updated memo"},
        )
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.json()["customer_name"], "Updated Customer")
        self.assertEqual(updated.json()["snapshot"]["invoice"]["memo"], "Updated memo")

        self.session.orders.clear()
        fallback = self.client.get(f"/api/admin/invoices/{invoice['id']}")
        self.assertEqual(fallback.status_code, 200)
        self.assertEqual(
            fallback.json()["payment"],
            {
                "paid": False,
                "payment_method": None,
                "payment_method_other": None,
                "source": "snapshot",
                "order_exists": False,
            },
        )

        exported = self.client.get(f"/api/admin/invoices/{invoice['id']}/pdf")
        self.assertEqual(exported.status_code, 200)
        self.assertEqual(exported.headers["content-type"], "application/pdf")
        self.assertTrue(exported.content.startswith(b"%PDF"))

        deleted = self.client.delete(f"/api/admin/invoices/{invoice['id']}")
        self.assertEqual(deleted.status_code, 200)
        self.assertEqual(deleted.json(), {"success": True})
        self.assertEqual(self.client.get(f"/api/admin/invoices/{invoice['id']}").status_code, 404)


if __name__ == "__main__":
    unittest.main()
