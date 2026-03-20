import os
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import patch

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("RESEND_API_KEY", "test-key")

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from constants import OrderStatus  # noqa: E402
from models import Location, Order  # noqa: E402
from routers.admin import (  # noqa: E402
    _send_order_payment_reminder,
    admin_send_single_payment_reminder,
)
from services.email import send_payment_reminder  # noqa: E402


def make_order(**overrides):
    base = {
        "id": "order-1",
        "event_id": 42,
        "group_id": None,
        "name": "Test Customer",
        "email": "test@example.com",
        "phone_number": "111-222-3333",
        "item_id": "lamprais",
        "item_name": "Lamprais",
        "quantity": 1,
        "pickup_location": "Markham",
        "pickup_time_slot": "10:00 AM - 11:00 AM",
        "base_total_price": 24.0,
        "discount_total": 0.0,
        "total_price": 24.0,
        "status": OrderStatus.CONFIRMED,
        "reminded": False,
        "paid": False,
        "payment_method": None,
        "payment_method_other": None,
        "exclude_email": False,
    }
    base.update(overrides)
    return SimpleNamespace(**base)


class FakeQuery:
    def __init__(self, result):
        self.result = result

    def filter(self, *_args, **_kwargs):
        return self

    def first(self):
        return self.result


class FakeSession:
    def __init__(self, *, order=None, location=None):
        self.order = order
        self.location = location

    def query(self, model):
        if model is Order:
            return FakeQuery(self.order)
        if model is Location:
            return FakeQuery(self.location)
        raise AssertionError(f"Unexpected model query: {model}")


class PaymentReminderTests(unittest.TestCase):
    def test_single_payment_reminder_endpoint_sends_expected_payload(self):
        order = make_order()
        db = FakeSession(order=order, location=SimpleNamespace(address="123 Main St"))
        active_etransfer = {"enabled": True, "email": "payments@example.com"}

        with patch("routers.admin._get_reminder_context", return_value=({}, "April 2, 2026", active_etransfer)):
            with patch("routers.admin._get_order_group_rows", return_value=[order]):
                with patch("routers.admin.send_payment_reminder") as mock_send:
                    result = admin_send_single_payment_reminder("order-1", db, {})

        self.assertEqual(result, {"success": True, "order_id": "order-1", "status": "sent", "message": "Payment reminder sent", "email": "test@example.com", "name": "Test Customer", "reminded": False})
        mock_send.assert_called_once()
        payload = mock_send.call_args.args[0]
        self.assertEqual(payload["email"], "test@example.com")
        self.assertEqual(payload["event_date"], "April 2, 2026")
        self.assertEqual(payload["etransfer_email"], "payments@example.com")
        self.assertEqual(payload["address"], "123 Main St")

    def test_grouped_payment_reminder_sends_single_summary(self):
        first = make_order(id="order-1", group_id="group-1", item_name="Lamprais", quantity=1, total_price=24.0, base_total_price=24.0)
        second = make_order(id="order-2", group_id="group-1", item_name="Fish Cutlet", quantity=2, total_price=12.0, base_total_price=12.0)
        db = FakeSession(order=first, location=SimpleNamespace(address="123 Main St"))
        event = SimpleNamespace(event_date="April 2, 2026", etransfer_enabled=True, etransfer_email="payments@example.com")

        with patch("routers.admin._get_order_group_rows", return_value=[first, second]):
            with patch("routers.admin.send_payment_reminder") as mock_send:
                result = _send_order_payment_reminder(
                    first,
                    db,
                    events_by_id={42: event},
                    active_event_date="",
                    active_etransfer={"enabled": False, "email": None},
                )

        self.assertEqual(result["status"], "sent")
        mock_send.assert_called_once()
        payload = mock_send.call_args.args[0]
        self.assertEqual(payload["total_price"], 36.0)
        self.assertEqual(len(payload["items"]), 2)
        self.assertEqual(payload["items"][0]["item_name"], "Lamprais")
        self.assertEqual(payload["items"][1]["item_name"], "Fish Cutlet")

    def test_payment_reminder_skips_paid_bundle(self):
        order = make_order(paid=True)
        db = FakeSession(order=order)

        with patch("routers.admin._get_order_group_rows", return_value=[order]):
            result = _send_order_payment_reminder(
                order,
                db,
                events_by_id={},
                active_event_date="April 2, 2026",
                active_etransfer={"enabled": False, "email": None},
            )

        self.assertEqual(result["status"], "skipped_paid")
        self.assertEqual(result["message"], "Order is already marked paid")

    def test_payment_reminder_skips_not_confirmed_orders(self):
        order = make_order(status=OrderStatus.PENDING)
        db = FakeSession(order=order)

        with patch("routers.admin._get_order_group_rows", return_value=[order]):
            result = _send_order_payment_reminder(
                order,
                db,
                events_by_id={},
                active_event_date="April 2, 2026",
                active_etransfer={"enabled": False, "email": None},
            )

        self.assertEqual(result["status"], "skipped_not_confirmed")
        self.assertEqual(result["message"], "Only confirmed unpaid orders can be reminded")

    def test_payment_reminder_skips_missing_email(self):
        order = make_order(email="   ")
        db = FakeSession(order=order)

        with patch("routers.admin._get_order_group_rows", return_value=[order]):
            result = _send_order_payment_reminder(
                order,
                db,
                events_by_id={},
                active_event_date="April 2, 2026",
                active_etransfer={"enabled": False, "email": None},
            )

        self.assertEqual(result["status"], "skipped_missing_email")
        self.assertEqual(result["message"], "Missing email")

    def test_payment_reminder_skips_excluded_email(self):
        order = make_order(exclude_email=True)
        db = FakeSession(order=order)

        with patch("routers.admin._get_order_group_rows", return_value=[order]):
            result = _send_order_payment_reminder(
                order,
                db,
                events_by_id={},
                active_event_date="April 2, 2026",
                active_etransfer={"enabled": False, "email": None},
            )

        self.assertEqual(result["status"], "skipped_excluded")
        self.assertEqual(result["message"], "Excluded from email")

    def test_payment_reminder_returns_failed_when_mailer_raises(self):
        order = make_order()
        db = FakeSession(order=order, location=SimpleNamespace(address="123 Main St"))

        with patch("routers.admin._get_order_group_rows", return_value=[order]):
            with patch("routers.admin.send_payment_reminder", side_effect=RuntimeError("boom")):
                result = _send_order_payment_reminder(
                    order,
                    db,
                    events_by_id={},
                    active_event_date="April 2, 2026",
                    active_etransfer={"enabled": False, "email": None},
                )

        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["message"], "Failed to send payment reminder")

    def test_payment_reminder_mailer_uses_resend_send(self):
        email_data = {
            "name": "Alex",
            "email": "alex@example.com",
            "event_date": "April 2, 2026",
            "pickup_location": "Markham",
            "pickup_time_slot": "10:00 AM - 11:00 AM",
            "address": "123 Main St",
            "total_price": 24.0,
            "subtotal": 24.0,
            "discount_total": 0.0,
            "etransfer_enabled": True,
            "etransfer_email": "payments@example.com",
            "items": [
                {
                    "item_name": "Lamprais",
                    "quantity": 1,
                    "base_total": 24.0,
                    "discount_total": 0.0,
                    "total_price": 24.0,
                }
            ],
        }

        with patch("services.email.resend.Emails.send") as mock_send:
            send_payment_reminder(email_data)

        mock_send.assert_called_once()
        payload = mock_send.call_args.args[0]
        self.assertEqual(payload["to"], ["alex@example.com"])
        self.assertIn("Payment Reminder", payload["subject"])
        self.assertIn("automated reminder", payload["html"])
        self.assertIn("please disregard this message", payload["html"])


if __name__ == "__main__":
    unittest.main()
