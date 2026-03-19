import os
import sys
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("RESEND_API_KEY", "test-key")

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from database import get_db  # noqa: E402
from main import app  # noqa: E402
from routers import admin  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


class FakeQuery:
    def __init__(self, items):
        self.items = items
        self.filters = {}

    def filter_by(self, **kwargs):
        self.filters.update(kwargs)
        return self

    def first(self):
        for item in self.items:
            if all(getattr(item, key, None) == value for key, value in self.filters.items()):
                return item
        return None


class FakeSession:
    def __init__(self, customers):
        self.customers = customers
        self.committed = False
        self.rolled_back = False

    def query(self, model):
        return FakeQuery(self.customers)

    def commit(self):
        self.committed = True

    def rollback(self):
        self.rolled_back = True

    def refresh(self, item):
        return None


def make_customer(**overrides):
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


class AdminCustomerUpdateRouteTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        self.session = FakeSession([])

        def override_get_db():
            yield self.session

        app.dependency_overrides[get_db] = override_get_db
        app.dependency_overrides[admin.verify_admin_token] = lambda: {"sub": "dev-admin"}

    def tearDown(self):
        app.dependency_overrides.clear()

    def test_update_customer_returns_404_for_missing_customer(self):
        response = self.client.put(
            "/api/admin/customers/missing",
            json={
                "name": "Updated Name",
                "email": "updated@example.com",
                "phone_number": "222-333-4444",
            },
        )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], "Customer not found")

    def test_update_customer_returns_409_for_duplicate_email(self):
        self.session.customers = [
            make_customer(id="customer-1", email="test@example.com"),
            make_customer(
                id="customer-2",
                email="other@example.com",
                name="Other Customer",
                phone_number="999-999-9999",
            ),
        ]

        response = self.client.put(
            "/api/admin/customers/customer-1",
            json={
                "name": "Updated Name",
                "email": "OTHER@example.com",
                "phone_number": "222-333-4444",
            },
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["detail"], "Customer email already exists")


if __name__ == "__main__":
    unittest.main()
