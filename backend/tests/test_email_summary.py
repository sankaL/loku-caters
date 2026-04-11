import os
import sys
import unittest

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("RESEND_API_KEY", "test-key")

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from services.email import _build_order_summary_html  # noqa: E402


def make_order_data(**overrides):
    base = {
        "currency": "CAD",
        "pickup_location": "Markham",
        "pickup_time_slot": "10:00 AM - 11:00 AM",
        "address": "123 Main St",
        "subtotal": 20.0,
        "discount_total": 5.0,
        "total_price": 15.0,
        "items": [
            {
                "item_name": "Lamprais",
                "quantity": 1,
                "base_total": 20.0,
                "discount_total": 5.0,
                "total_price": 15.0,
            }
        ],
    }
    base.update(overrides)
    return base


class EmailSummaryTests(unittest.TestCase):
    def test_manual_pricing_discount_uses_adjusted_pricing_label(self):
        html = _build_order_summary_html(
            make_order_data(
                has_combo_discounts=False,
                has_manual_pricing=True,
            )
        )

        self.assertIn("Adjusted pricing", html)
        self.assertNotIn("Combo savings", html)

    def test_combo_discount_uses_combo_savings_label(self):
        html = _build_order_summary_html(
            make_order_data(
                has_combo_discounts=True,
                has_manual_pricing=False,
            )
        )

        self.assertIn("Combo savings", html)


if __name__ == "__main__":
    unittest.main()
