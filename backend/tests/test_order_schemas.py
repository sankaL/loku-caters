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


if __name__ == "__main__":
    unittest.main()
