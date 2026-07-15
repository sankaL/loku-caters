import os
import sys
import unittest

from pydantic import ValidationError

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from schemas import OrderCheckoutCreate, OrderQuoteRequest  # noqa: E402


class OrderSchemaTests(unittest.TestCase):
    def test_quote_request_rejects_duplicate_item_lines(self):
        with self.assertRaises(ValidationError) as exc:
            OrderQuoteRequest(
                lines=[
                    {"item_id": "lamprais", "quantity": 1},
                    {"item_id": "lamprais", "quantity": 2},
                ]
            )

        self.assertIn("Duplicate cart lines are not allowed", str(exc.exception))

    def test_checkout_request_rejects_duplicate_item_lines(self):
        with self.assertRaises(ValidationError) as exc:
            OrderCheckoutCreate(
                name="Test Customer",
                pickup_location="Markham",
                pickup_time_slot="10:00 AM",
                email="test@example.com",
                lines=[
                    {"item_id": "lamprais", "quantity": 1},
                    {"item_id": "lamprais", "quantity": 2},
                ],
            )

        self.assertIn("Duplicate cart lines are not allowed", str(exc.exception))

    def test_quote_request_rejects_excessive_cart_lines(self):
        with self.assertRaises(ValidationError):
            OrderQuoteRequest(
                lines=[
                    {"item_id": f"item-{index}", "quantity": 1} for index in range(51)
                ]
            )

    def test_quote_request_rejects_excessive_total_quantity(self):
        with self.assertRaises(ValidationError):
            OrderQuoteRequest(
                lines=[
                    {"item_id": "lamprais", "quantity": 200},
                    {"item_id": "roll", "quantity": 51},
                ]
            )

    def test_checkout_request_rejects_oversized_customer_name(self):
        with self.assertRaises(ValidationError):
            OrderCheckoutCreate(
                name="a" * 201,
                pickup_location="Markham",
                pickup_time_slot="10:00 AM",
                email="test@example.com",
                lines=[{"item_id": "lamprais", "quantity": 1}],
            )


if __name__ == "__main__":
    unittest.main()
