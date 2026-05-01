import os
import sys
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("RESEND_API_KEY", "test-key")

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from constants import OrderStatus  # noqa: E402
from services.event_plan_pdf import build_event_plan_pdf  # noqa: E402
from services.event_planning import (  # noqa: E402
    assert_plan_can_mark_ready,
    build_event_plan_snapshot,
    duplicate_snapshot,
    summarize_snapshot,
)


def make_event(**overrides):
    base = {
        "id": 12,
        "name": "February Batch",
        "kind": "event",
        "event_date": "February 28, 2026",
        "pickup_date": None,
        "is_active": True,
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def make_order(**overrides):
    base = {
        "id": "order-1",
        "event_id": 12,
        "group_id": None,
        "name": "Test Customer",
        "item_id": "lamprais",
        "item_name": "Lamprais",
        "quantity": 2,
        "pickup_location": "Markham",
        "pickup_time_slot": "10:00 AM",
        "pickup_date": None,
        "status": OrderStatus.CONFIRMED,
        "created_at": datetime(2026, 2, 20, 12, 0, tzinfo=timezone.utc),
        "updated_at": datetime(2026, 2, 20, 12, 0, tzinfo=timezone.utc),
    }
    base.update(overrides)
    return SimpleNamespace(**base)


class EventPlanningServiceTests(unittest.TestCase):
    def test_snapshot_includes_all_non_cancelled_orders(self):
        snapshot = build_event_plan_snapshot(
            make_event(),
            [
                make_order(id="pending", status=OrderStatus.PENDING, quantity=1),
                make_order(id="confirmed", status=OrderStatus.CONFIRMED, quantity=2),
                make_order(id="picked-up", status=OrderStatus.PICKED_UP, quantity=3),
                make_order(id="no-show", status=OrderStatus.NO_SHOW, quantity=4),
                make_order(id="cancelled", status=OrderStatus.CANCELLED, quantity=99),
            ],
        )

        totals = snapshot["totals"]

        self.assertEqual(totals["included_order_count"], 4)
        self.assertEqual(totals["ordered_quantity"], 10)
        self.assertEqual(totals["planned_quantity"], 10)
        self.assertEqual(totals["issue_count"], 0)
        self.assertEqual(snapshot["status_breakdown"][OrderStatus.PENDING]["quantity"], 1)
        self.assertNotIn(OrderStatus.CANCELLED, snapshot["status_breakdown"])

    def test_over_planning_warns_without_blocking_ready(self):
        snapshot = build_event_plan_snapshot(make_event(), [make_order(quantity=2)])
        snapshot["planned_rows"][0]["quantity"] = 3

        totals = summarize_snapshot(snapshot)

        self.assertEqual(totals["ordered_quantity"], 2)
        self.assertEqual(totals["planned_quantity"], 3)
        self.assertEqual(totals["issue_count"], 0)
        self.assertEqual(totals["warning_count"], 1)
        assert_plan_can_mark_ready(snapshot)

    def test_under_planning_blocks_ready(self):
        snapshot = build_event_plan_snapshot(make_event(), [make_order(quantity=2)])
        snapshot["planned_rows"][0]["quantity"] = 1

        totals = summarize_snapshot(snapshot)

        self.assertEqual(totals["issue_count"], 1)
        with self.assertRaises(ValueError):
            assert_plan_can_mark_ready(snapshot)

    def test_refresh_preserves_split_rows_and_adds_new_quantity(self):
        original = build_event_plan_snapshot(make_event(), [make_order(id="order-1", quantity=4)])
        original["planned_rows"] = [
            {
                **original["planned_rows"][0],
                "id": "row-1",
                "planned_item_name": "Lamprais",
                "quantity": 3,
            },
            {
                **original["planned_rows"][0],
                "id": "row-2",
                "planned_item_id": "veg",
                "planned_item_name": "Vegetarian Lamprais",
                "quantity": 1,
            },
        ]

        refreshed = build_event_plan_snapshot(
            make_event(),
            [make_order(id="order-1", quantity=6, updated_at=datetime(2026, 2, 21, 12, 0, tzinfo=timezone.utc))],
            previous_snapshot=original,
        )

        quantities = {row["planned_item_name"]: row["quantity"] for row in refreshed["planned_rows"]}

        self.assertEqual(quantities["Lamprais"], 3)
        self.assertEqual(quantities["Vegetarian Lamprais"], 1)
        self.assertEqual(quantities["Unassigned"], 2)
        self.assertEqual(refreshed["totals"]["planned_quantity"], 6)
        self.assertEqual(refreshed["totals"]["issue_count"], 0)

    def test_refresh_flags_conflict_when_order_quantity_decreases(self):
        original = build_event_plan_snapshot(make_event(), [make_order(id="order-1", quantity=4)])
        original["planned_rows"][0]["quantity"] = 4

        refreshed = build_event_plan_snapshot(
            make_event(),
            [make_order(id="order-1", quantity=2)],
            previous_snapshot=original,
        )

        self.assertIn("refresh_conflict", refreshed["planned_rows"][0]["flags"])
        self.assertGreater(refreshed["totals"]["issue_count"], 0)

    def test_refresh_marks_removed_orders_without_counting_them(self):
        original = build_event_plan_snapshot(
            make_event(),
            [
                make_order(id="kept", quantity=2),
                make_order(id="removed", quantity=3),
            ],
        )

        refreshed = build_event_plan_snapshot(
            make_event(),
            [make_order(id="kept", quantity=2)],
            previous_snapshot=original,
        )

        removed_rows = [row for row in refreshed["planned_rows"] if row.get("row_state") == "removed"]

        self.assertEqual(len(removed_rows), 1)
        self.assertEqual(removed_rows[0]["source_order_id"], "removed")
        self.assertEqual(refreshed["totals"]["planned_quantity"], 2)
        self.assertEqual(refreshed["totals"]["ordered_quantity"], 2)

    def test_refresh_preserves_user_removed_rows(self):
        original = build_event_plan_snapshot(make_event(), [make_order(id="order-1", quantity=2)])
        original["planned_rows"][0]["row_state"] = "removed"
        original["planned_rows"][0]["flags"] = ["user_removed"]

        refreshed = build_event_plan_snapshot(
            make_event(),
            [make_order(id="order-1", quantity=2)],
            previous_snapshot=original,
        )

        active_rows = [row for row in refreshed["planned_rows"] if row.get("row_state") != "removed"]
        removed_rows = [row for row in refreshed["planned_rows"] if row.get("row_state") == "removed"]

        self.assertEqual(active_rows, [])
        self.assertEqual(len(removed_rows), 1)
        self.assertIn("user_removed", removed_rows[0]["flags"])
        self.assertEqual(refreshed["totals"]["planned_quantity"], 0)
        self.assertEqual(refreshed["totals"]["issue_count"], 1)

    def test_duplicate_snapshot_keeps_payload_but_updates_refresh_time(self):
        snapshot = build_event_plan_snapshot(make_event(), [make_order()])
        duplicate = duplicate_snapshot(snapshot)

        self.assertEqual(duplicate["source_event"], snapshot["source_event"])
        self.assertNotEqual(duplicate["refreshed_at"], "")

    def test_build_event_plan_pdf_returns_pdf_bytes_without_contact_fields(self):
        snapshot = build_event_plan_snapshot(make_event(), [make_order(name="Anura Perera")])
        snapshot["plan_notes"] = "Pack Markham trays first."

        pdf = build_event_plan_pdf(plan_name="Kitchen Plan", status="ready", snapshot=snapshot)

        self.assertTrue(pdf.startswith(b"%PDF"))
        self.assertGreater(len(pdf), 1000)


if __name__ == "__main__":
    unittest.main()
