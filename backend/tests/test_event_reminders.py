import os
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import patch

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("RESEND_API_KEY", "test-key")

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from event_config import NoActiveEventError  # noqa: E402
from routers.admin import admin_send_customer_event_reminder  # noqa: E402
from schemas import CustomerEventReminderRequest, FeedbackCreate, normalize_feedback_create  # noqa: E402
from services.email import send_event_reminder_email  # noqa: E402


class FakeCustomerQuery:
    def __init__(self, customer):
        self.customer = customer

    def filter(self, *_args, **_kwargs):
        return self

    def first(self):
        return self.customer


class FakeSession:
    def __init__(self, customer):
        self.customer = customer

    def query(self, _model):
        return FakeCustomerQuery(self.customer)


class EventReminderTests(unittest.TestCase):
    def test_feedback_origin_event_reminder_email_allows_reason_and_other_details(self):
        payload = FeedbackCreate(
            origin="event_reminder_email",
            feedback_type="feedback",
            reason="other",
            other_details="Need a different date",
        )

        normalized = normalize_feedback_create(payload)

        self.assertEqual(normalized["origin"], "event_reminder_email")
        self.assertEqual(normalized["feedback_type"], "feedback")
        self.assertEqual(normalized["reason"], "other")
        self.assertEqual(normalized["other_details"], "Need a different date")

    def test_event_reminder_endpoint_rejects_when_no_active_event(self):
        db = FakeSession(SimpleNamespace(id="customer-1", name="A", email="a@example.com"))
        body = CustomerEventReminderRequest(location_ids=["loc-1"], item_ids=["item-1"])

        with patch("routers.admin.get_config_from_db", side_effect=NoActiveEventError("No active event")):
            with self.assertRaises(Exception) as exc_context:
                admin_send_customer_event_reminder("customer-1", body, db, {})

        self.assertEqual(getattr(exc_context.exception, "status_code", None), 400)

    def test_event_reminder_endpoint_skips_customer_without_email(self):
        db = FakeSession(SimpleNamespace(id="customer-1", name="A", email="   "))
        body = CustomerEventReminderRequest(location_ids=["loc-1"], item_ids=["item-1"])

        result = admin_send_customer_event_reminder("customer-1", body, db, {})

        self.assertEqual(
            result,
            {
                "status": "skipped_missing_email",
                "message": "Customer is missing an email address",
            },
        )

    def test_event_reminder_endpoint_validates_selected_ids_against_active_event(self):
        db = FakeSession(SimpleNamespace(id="customer-1", name="A", email="a@example.com"))
        body = CustomerEventReminderRequest(location_ids=["missing-loc"], item_ids=["item-1"])
        active_config = {
            "event": {"date": "April 2, 2026"},
            "locations": [{"id": "loc-1", "name": "Markham"}],
            "items": [{"id": "item-1", "name": "Lamprais"}],
        }

        with patch("routers.admin.get_config_from_db", return_value=active_config):
            with self.assertRaises(Exception) as exc_context:
                admin_send_customer_event_reminder("customer-1", body, db, {})

        self.assertEqual(getattr(exc_context.exception, "status_code", None), 400)

    def test_event_reminder_endpoint_sends_expected_payload(self):
        db = FakeSession(SimpleNamespace(id="customer-1", name="A", email="a@example.com"))
        body = CustomerEventReminderRequest(location_ids=["loc-1"], item_ids=["item-1"])
        active_config = {
            "event": {"date": "April 2, 2026"},
            "locations": [{"id": "loc-1", "name": "Markham"}],
            "items": [{"id": "item-1", "name": "Lamprais"}],
        }

        with patch("routers.admin.get_config_from_db", return_value=active_config):
            with patch("routers.admin.send_event_reminder_email") as mock_send:
                result = admin_send_customer_event_reminder("customer-1", body, db, {})

        self.assertEqual(result, {"status": "sent", "message": "Event reminder sent"})
        mock_send.assert_called_once()
        payload = mock_send.call_args.args[0]
        self.assertEqual(payload["email"], "a@example.com")
        self.assertEqual(payload["event_date"], "April 2, 2026")
        self.assertEqual(payload["pickup_locations"], ["Markham"])
        self.assertEqual(payload["items"], ["Lamprais"])
        self.assertTrue(payload["order_url"].endswith("/orders"))
        self.assertIn("feedback=event-reminder", payload["feedback_url"])

    def test_event_reminder_mailer_uses_resend_send(self):
        email_data = {
            "name": "Alex",
            "email": "alex@example.com",
            "event_date": "April 2, 2026",
            "pickup_locations": ["Markham"],
            "items": ["Lamprais"],
            "order_url": "https://example.com/orders",
            "feedback_url": "https://example.com/orders?feedback=event-reminder",
        }

        with patch("services.email.resend.Emails.send") as mock_send:
            send_event_reminder_email(email_data)

        mock_send.assert_called_once()
        payload = mock_send.call_args.args[0]
        self.assertEqual(payload["to"], ["alex@example.com"])
        self.assertIn("Event Reminder", payload["subject"])
        self.assertIn("Order This Batch", payload["html"])


if __name__ == "__main__":
    unittest.main()
