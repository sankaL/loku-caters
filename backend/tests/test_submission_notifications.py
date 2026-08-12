import os
import sys
import unittest
from unittest.mock import patch

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("RESEND_API_KEY", "test-key")

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from config import settings  # noqa: E402
from routers.catering import create_catering_request  # noqa: E402
from routers.feedback import create_feedback  # noqa: E402
from schemas import CateringRequestCreate, FeedbackCreate  # noqa: E402
from services.email import (  # noqa: E402
    send_new_catering_request_notification,
    send_new_feedback_notification,
    send_new_order_notification,
)


class FakeDb:
    def add(self, row):
        self.row = row

    def commit(self):
        pass

    def refresh(self, row):
        if not row.id:
            row.id = "created-id"

    def rollback(self):
        pass


class SubmissionNotificationEmailTests(unittest.TestCase):
    def setUp(self):
        self.settings_patches = [
            patch.object(settings, "email_enabled", True),
            patch.object(
                settings,
                "notification_emails",
                "Owner@Example.com, manager@example.com,owner@example.com",
            ),
            patch.object(settings, "frontend_url", "https://admin.example.com/"),
        ]
        for settings_patch in self.settings_patches:
            settings_patch.start()

    def tearDown(self):
        for settings_patch in reversed(self.settings_patches):
            settings_patch.stop()

    @patch("services.email.resend.Emails.send")
    def test_order_notification_is_branded_and_sent_to_unique_recipients(
        self, mock_send
    ):
        send_new_order_notification(
            {
                "group_id": "group-123",
                "name": "Priya <Test>",
                "email": "priya@example.com",
                "phone_number": "555-0100",
                "pickup_location": "Markham",
                "pickup_time_slot": "10:00 AM",
                "currency": "TEST",
                "total_price": 48,
                "lines": [{"item_name": "Lamprais", "quantity": 2}],
            }
        )

        payload = mock_send.call_args.args[0]
        self.assertEqual(payload["to"], ["owner@example.com", "manager@example.com"])
        self.assertEqual(payload["subject"], "New order from Priya <Test>")
        self.assertIn("New Order Received", payload["html"])
        self.assertIn("background:#12270F", payload["html"])
        self.assertIn("Priya &lt;Test&gt;", payload["html"])
        self.assertIn("TEST 48.00", payload["html"])
        self.assertIn("https://admin.example.com/admin/orders", payload["html"])

    @patch("services.email.resend.Emails.send")
    def test_feedback_notification_includes_message_and_rating(self, mock_send):
        send_new_feedback_notification(
            {
                "name": "Nimal",
                "contact": "nimal@example.com",
                "feedback_type": "feedback",
                "origin": "reviews_page",
                "rating": 5,
                "message": "Excellent <food>!",
            }
        )

        payload = mock_send.call_args.args[0]
        self.assertIn("New Feedback Received", payload["html"])
        self.assertIn("5 / 5", payload["html"])
        self.assertIn("Excellent &lt;food&gt;!", payload["html"])
        self.assertIn("https://admin.example.com/admin/feedback", payload["html"])

    @patch("services.email.resend.Emails.send")
    def test_catering_notification_includes_request_details(self, mock_send):
        send_new_catering_request_notification(
            {
                "first_name": "Asha",
                "last_name": "Silva",
                "email": "asha@example.com",
                "event_date": "October 10, 2026",
                "event_type": "Wedding",
                "guest_count": 120,
                "budget_range": "Flexible",
                "special_requests": "Vegetarian options",
            }
        )

        payload = mock_send.call_args.args[0]
        self.assertIn("New Catering Request", payload["html"])
        self.assertIn("Asha Silva", payload["html"])
        self.assertIn("Vegetarian options", payload["html"])
        self.assertIn(
            "https://admin.example.com/admin/catering-requests", payload["html"]
        )


class SubmissionNotificationRouteTests(unittest.TestCase):
    @patch(
        "routers.feedback.send_new_feedback_notification",
        side_effect=RuntimeError("email unavailable"),
    )
    def test_feedback_succeeds_when_notification_fails(self, _mock_send):
        response = create_feedback(
            FeedbackCreate(
                origin="reviews_page",
                feedback_type="feedback",
                name="Test User",
                message="Great food",
                rating=5,
            ),
            FakeDb(),
        )

        self.assertTrue(response.success)
        self.assertEqual(response.feedback_id, "created-id")

    @patch(
        "routers.catering.send_new_catering_request_notification",
        side_effect=RuntimeError("email unavailable"),
    )
    def test_catering_request_succeeds_when_notification_fails(self, _mock_send):
        response = create_catering_request(
            CateringRequestCreate(
                first_name="Test",
                last_name="Customer",
                email="customer@example.com",
                event_date="October 10, 2026",
                guest_count=50,
                event_type="Birthday",
            ),
            FakeDb(),
        )

        self.assertTrue(response.success)
        self.assertEqual(response.request_id, "created-id")


if __name__ == "__main__":
    unittest.main()
