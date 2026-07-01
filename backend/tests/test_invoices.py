import os
import sys
import unittest
from datetime import date, datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from pydantic import ValidationError
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("RESEND_API_KEY", "test-key")

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from routers.invoices import InvoiceCreate, InvoiceSettingsUpdate  # noqa: E402
from services.invoice_pdf import build_invoice_pdf  # noqa: E402
from services.invoices import (  # noqa: E402
    build_invoice_document_snapshot,
    calculate_invoice_amounts,
    default_due_date,
    invoice_lines_from_orders,
    next_invoice_number,
    order_snapshot,
)


def make_order(**overrides):
    values = {
        "id": "order-12345678",
        "group_id": "bundle-1",
        "event_id": 12,
        "name": "Test Customer",
        "email": "customer@example.com",
        "phone_number": "555-0100",
        "item_id": "lamprais",
        "item_name": "Lamprais",
        "quantity": 2,
        "base_total_price": 32,
        "discount_total": 2,
        "total_price": 30,
        "pickup_location": "Toronto",
        "pickup_time_slot": "12:00 PM",
        "pickup_address": "1 Main Street",
        "pickup_date": date(2026, 7, 4),
        "created_at": datetime(2026, 6, 20, tzinfo=timezone.utc),
        "paid": False,
        "payment_method": None,
        "payment_method_other": None,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def make_settings(**overrides):
    values = {
        "business_name": "Loku Caters",
        "business_address": "Toronto, ON",
        "business_email": "hello@example.com",
        "business_phone": "555-0199",
        "payment_method": "etransfer",
        "payment_email": "pay@example.com",
        "payment_instructions": "Include the invoice number.",
        "default_footer_note": "Thank you.",
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def make_document(orders=None, memo="Prepared for pickup."):
    rows = orders or [make_order()]
    lines = invoice_lines_from_orders(rows)
    discount = sum(float(order.discount_total) for order in rows)
    lines, amounts = calculate_invoice_amounts(lines, discount)
    snapshot = build_invoice_document_snapshot(
        settings=make_settings(),
        source_order=order_snapshot(rows, "July Batch"),
        issue_date=date(2026, 6, 30),
        due_date=date(2026, 7, 4),
        customer_name="Test Customer",
        customer_email="customer@example.com",
        customer_phone="555-0100",
        memo=memo,
    )
    return snapshot, lines, amounts


class InvoiceServiceTests(unittest.TestCase):
    def test_default_due_date_uses_future_pickup_and_never_precedes_issue(self):
        issue = date(2026, 6, 30)
        self.assertEqual(default_due_date(issue, date(2026, 7, 4)), date(2026, 7, 4))
        self.assertEqual(default_due_date(issue, date(2026, 6, 1)), issue)
        self.assertEqual(default_due_date(issue, None), issue)

    def test_invoice_data_aggregates_order_amounts_and_discounts(self):
        snapshot, lines, amounts = make_document([
            make_order(),
            make_order(id="order-2", item_id="rolls", item_name="Rolls", quantity=5, base_total_price=15, discount_total=0, total_price=15),
        ])

        self.assertEqual(amounts, {"subtotal": 47.0, "discount_total": 2.0, "total": 45.0})
        self.assertEqual(len(lines), 2)
        self.assertEqual(snapshot["order"]["reference"], "ORDER-12")
        self.assertEqual(snapshot["vendor"]["payment_email"], "pay@example.com")
        self.assertNotIn("lines", snapshot["order"])
        self.assertNotIn("amounts", snapshot)

    def test_snapshot_stays_unchanged_when_source_objects_change(self):
        order = make_order()
        settings = make_settings()
        snapshot = build_invoice_document_snapshot(
            settings=settings,
            source_order=order_snapshot([order], "July Batch"),
            issue_date=date(2026, 6, 30),
            due_date=date(2026, 7, 4),
            customer_name=order.name,
            customer_email=order.email,
            customer_phone=order.phone_number,
            memo=None,
        )
        order.total_price = 999
        settings.business_address = "Changed"

        self.assertEqual(snapshot["vendor"]["business_address"], "Toronto, ON")
        self.assertEqual(snapshot["order"]["reference"], "ORDER-12")

    def test_short_order_id_is_preserved_as_reference(self):
        order = make_order(id="abc", group_id=None)
        snapshot = build_invoice_document_snapshot(
            settings=make_settings(),
            source_order=order_snapshot([order], "July Batch"),
            issue_date=date(2026, 6, 30),
            due_date=date(2026, 7, 4),
            customer_name=order.name,
            customer_email=order.email,
            customer_phone=order.phone_number,
            memo=None,
        )

        self.assertEqual(snapshot["order"]["reference"], "ABC")

    def test_number_counter_resets_by_year_and_never_reuses_prior_values(self):
        engine = create_engine("sqlite:///:memory:")
        with engine.begin() as connection:
            connection.execute(text("CREATE TABLE invoice_number_counters (year INTEGER PRIMARY KEY, last_value INTEGER NOT NULL)"))
        with Session(engine) as session:
            self.assertEqual(next_invoice_number(session, 2026), ("INV-2026-0001", 1))
            self.assertEqual(next_invoice_number(session, 2026), ("INV-2026-0002", 2))
            self.assertEqual(next_invoice_number(session, 2027), ("INV-2027-0001", 1))
            session.commit()
            self.assertEqual(next_invoice_number(session, 2026), ("INV-2026-0003", 3))

    def test_create_schema_rejects_client_pricing(self):
        # InvoiceCreate uses ConfigDict(extra="forbid"), so client-supplied price
        # fields (e.g. "total") are rejected at the schema boundary.  If this
        # behaviour ever changes, ensure pricing cannot be accepted from clients.
        with self.assertRaises(ValidationError):
            InvoiceCreate(source_bundle_id="bundle-1", total=1)

    def test_settings_require_email_for_etransfer(self):
        with self.assertRaises(ValidationError):
            InvoiceSettingsUpdate(business_name="Loku Caters", payment_method="etransfer")

    def test_pdf_contains_professional_invoice_document(self):
        snapshot, lines, amounts = make_document()
        pdf = build_invoice_pdf(
            invoice_number="INV-2026-0001",
            snapshot=snapshot,
            payment={"paid": False},
            line_items=lines,
            amounts=amounts,
        )

        self.assertTrue(pdf.startswith(b"%PDF"))
        self.assertGreater(len(pdf), 3000)

    def test_pdf_still_builds_when_logo_asset_is_missing(self):
        snapshot, lines, amounts = make_document(memo=None)

        with patch("services.invoice_pdf._ASSETS_DIR", Path("/missing-invoice-assets")):
            pdf = build_invoice_pdf(
                invoice_number="INV-2026-0001",
                snapshot=snapshot,
                payment={"paid": False},
                line_items=lines,
                amounts=amounts,
            )

        self.assertTrue(pdf.startswith(b"%PDF"))


if __name__ == "__main__":
    unittest.main()
