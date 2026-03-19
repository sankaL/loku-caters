import os
import sys
import unittest
from types import SimpleNamespace

from fastapi import HTTPException

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("RESEND_API_KEY", "test-key")

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from constants import OrderStatus  # noqa: E402
from routers.admin import (  # noqa: E402
    _already_confirmed_response,
    _reset_group_payment_state,
    _validate_group_order_payload,
)


def make_order(**overrides):
    base = {
        "id": "order-1",
        "name": "Test Customer",
        "email": "test@example.com",
        "phone_number": "111-222-3333",
        "pickup_location": "Markham",
        "pickup_time_slot": "10:00 AM - 11:00 AM",
        "exclude_email": False,
        "status": OrderStatus.CONFIRMED,
        "paid": True,
        "payment_method": "cash",
        "payment_method_other": None,
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def make_body(**overrides):
    base = {
        "name": "Test Customer",
        "email": "test@example.com",
        "phone_number": "111-222-3333",
        "pickup_location": "Markham",
        "pickup_time_slot": "10:00 AM - 11:00 AM",
        "exclude_email": False,
    }
    base.update(overrides)
    return SimpleNamespace(**base)


class AdminGroupingTests(unittest.TestCase):
    def test_validate_group_order_payload_allows_matching_shared_fields(self):
        existing = [make_order()]
        body = make_body(email=" TEST@example.com ")

        _validate_group_order_payload(existing, body)

    def test_validate_group_order_payload_rejects_mismatched_bundle_details(self):
        existing = [make_order()]
        body = make_body(pickup_location="Scarborough")

        with self.assertRaises(HTTPException) as exc_context:
            _validate_group_order_payload(existing, body)

        self.assertEqual(exc_context.exception.status_code, 400)
        self.assertIn("pickup_location", str(exc_context.exception.detail))

    def test_reset_group_payment_state_clears_bundle_payment_flags(self):
        orders = [
            make_order(id="order-1", paid=True, payment_method="cash"),
            make_order(id="order-2", paid=True, payment_method="etransfer", payment_method_other="memo"),
        ]

        _reset_group_payment_state(orders)

        for order in orders:
            self.assertFalse(order.paid)
            self.assertIsNone(order.payment_method)
            self.assertIsNone(order.payment_method_other)

    def test_already_confirmed_response_is_idempotent_for_group_lines(self):
        group_orders = [
            make_order(id="order-1", status=OrderStatus.CONFIRMED),
            make_order(id="order-2", status=OrderStatus.CONFIRMED),
        ]

        result = _already_confirmed_response(group_orders[0], group_orders)

        self.assertEqual(
            result,
            {
                "success": True,
                "order_id": "order-1",
                "status": OrderStatus.CONFIRMED,
                "email_sent": False,
                "email_suppressed": False,
            },
        )

    def test_already_confirmed_response_skips_incomplete_groups(self):
        group_orders = [
            make_order(id="order-1", status=OrderStatus.CONFIRMED),
            make_order(id="order-2", status=OrderStatus.PENDING),
        ]

        self.assertIsNone(_already_confirmed_response(group_orders[0], group_orders))


if __name__ == "__main__":
    unittest.main()
