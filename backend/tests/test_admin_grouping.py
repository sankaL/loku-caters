import os
import sys
import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from fastapi import HTTPException

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("RESEND_API_KEY", "test-key")

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from constants import OrderStatus  # noqa: E402
from models import Order  # noqa: E402
from routers.admin import (  # noqa: E402
    _already_confirmed_response,
    _project_order_bundle,
    _reset_group_payment_state,
    _validate_bundle_status_transition,
    _validate_group_order_payload,
    RestoreStatusAction,
    admin_cancel_order,
    admin_delete_order_bundle,
    admin_list_orders,
    admin_mark_order_no_show,
    admin_mark_order_picked_up,
    admin_restore_order,
)


def make_order(**overrides):
    now = datetime.now(timezone.utc)
    base = {
        "id": "order-1",
        "event_id": 10,
        "group_id": None,
        "name": "Test Customer",
        "email": "test@example.com",
        "phone_number": "111-222-3333",
        "item_id": "item-a",
        "item_name": "Lamprais",
        "quantity": 1,
        "pickup_location": "Markham",
        "pickup_time_slot": "10:00 AM - 11:00 AM",
        "pickup_address": None,
        "exclude_email": False,
        "status": OrderStatus.CONFIRMED,
        "reminded": False,
        "paid": True,
        "payment_method": "cash",
        "payment_method_other": None,
        "notes": None,
        "base_total_price": 20.0,
        "discount_total": 0.0,
        "total_price": 20.0,
        "created_at": now,
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


class FakeQuery:
    def __init__(self, rows):
        self.rows = rows
        self.criteria = []

    def filter(self, *criteria):
        self.criteria.extend(criteria)
        return self

    def order_by(self, *_args, **_kwargs):
        return self

    @staticmethod
    def _criterion_matches(row, criterion) -> bool:
        left = getattr(criterion, "left", None)
        right = getattr(criterion, "right", None)
        key = getattr(left, "key", None) or getattr(left, "name", None)
        if key is None:
            return True
        value = getattr(right, "value", right)
        return getattr(row, key, None) == value

    def _matches(self, row) -> bool:
        return all(
            self._criterion_matches(row, criterion) for criterion in self.criteria
        )

    def all(self):
        return [row for row in self.rows if self._matches(row)]

    def first(self):
        rows = self.all()
        return rows[0] if rows else None


class FakeSession:
    def __init__(self, orders):
        self.orders = list(orders)
        self.deleted = []
        self.rollback_called = False
        self.raise_on_commit = False

    def query(self, model):
        if model is not Order:
            raise AssertionError(f"Unexpected query model: {model}")
        return FakeQuery(self.orders)

    def delete(self, order):
        self.deleted.append(order.id)
        self.orders = [row for row in self.orders if row.id != order.id]

    def commit(self):
        if self.raise_on_commit:
            raise RuntimeError("commit failed")

    def rollback(self):
        self.rollback_called = True


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

    def test_validate_group_order_payload_rejects_mixed_status_bundles(self):
        existing = [
            make_order(id="order-1", group_id="bundle-1", status=OrderStatus.CONFIRMED),
            make_order(id="order-2", group_id="bundle-1", status=OrderStatus.PICKED_UP),
        ]
        body = make_body()

        with self.assertRaises(HTTPException) as exc_context:
            _validate_group_order_payload(existing, body)

        self.assertEqual(exc_context.exception.status_code, 409)
        self.assertEqual(
            exc_context.exception.detail, "Cannot add items to a mixed-status bundle"
        )

    def test_reset_group_payment_state_clears_bundle_payment_flags(self):
        orders = [
            make_order(id="order-1", paid=True, payment_method="cash"),
            make_order(
                id="order-2",
                paid=True,
                payment_method="etransfer",
                payment_method_other="memo",
            ),
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

    def test_validate_bundle_status_transition_checks_all_group_lines(self):
        group_orders = [
            make_order(id="order-1", status=OrderStatus.CONFIRMED),
            make_order(id="order-2", status=OrderStatus.PICKED_UP),
        ]

        with self.assertRaises(HTTPException) as exc_context:
            _validate_bundle_status_transition(group_orders, OrderStatus.CONFIRMED)

        self.assertEqual(exc_context.exception.status_code, 409)
        self.assertEqual(exc_context.exception.detail, "Invalid status transition")

    def test_project_order_bundle_computes_primary_aggregates_and_mixed_flags(self):
        first_time = datetime(2026, 3, 20, 10, 0, tzinfo=timezone.utc)
        second_time = first_time + timedelta(minutes=1)
        orders = [
            make_order(
                id="a-order",
                group_id="bundle-1",
                created_at=first_time,
                notes="First note",
                status=OrderStatus.CONFIRMED,
                paid=True,
                reminded=True,
                quantity=2,
                total_price=30.0,
                base_total_price=34.0,
                discount_total=4.0,
            ),
            make_order(
                id="b-order",
                group_id="bundle-1",
                created_at=second_time,
                notes="Second note",
                status=OrderStatus.PICKED_UP,
                paid=False,
                reminded=True,
                quantity=1,
                total_price=9.5,
                base_total_price=10.0,
                discount_total=0.5,
            ),
        ]

        bundle = _project_order_bundle(orders)

        self.assertEqual(bundle["bundle_id"], "bundle-1")
        self.assertEqual(bundle["primary_order_id"], "a-order")
        self.assertEqual(bundle["line_count"], 2)
        self.assertEqual(bundle["quantity_total"], 3)
        self.assertEqual(bundle["total_price"], 39.5)
        self.assertEqual(bundle["base_total_price"], 44.0)
        self.assertEqual(bundle["discount_total"], 4.5)
        self.assertEqual(bundle["status"], "mixed")
        self.assertEqual(bundle["status_breakdown"][OrderStatus.CONFIRMED], 1)
        self.assertEqual(bundle["status_breakdown"][OrderStatus.PICKED_UP], 1)
        self.assertFalse(bundle["paid"])
        self.assertTrue(bundle["reminded"])
        self.assertEqual(bundle["notes"], "First note")
        self.assertTrue(bundle["notes_mixed"])

    def test_admin_list_orders_bundle_view_groups_rows_and_keeps_single_status(self):
        first = make_order(
            id="order-1",
            group_id="bundle-1",
            event_id=10,
            status=OrderStatus.CONFIRMED,
            paid=True,
            reminded=True,
            created_at=datetime(2026, 3, 20, 10, 0, tzinfo=timezone.utc),
        )
        second = make_order(
            id="order-2",
            group_id="bundle-1",
            event_id=10,
            status=OrderStatus.CONFIRMED,
            paid=True,
            reminded=True,
            quantity=2,
            total_price=40.0,
            created_at=datetime(2026, 3, 20, 10, 1, tzinfo=timezone.utc),
        )
        third = make_order(
            id="order-3",
            group_id=None,
            event_id=11,
            status=OrderStatus.PENDING,
            paid=False,
            reminded=False,
            created_at=datetime(2026, 3, 21, 10, 0, tzinfo=timezone.utc),
        )
        db = FakeSession([first, second, third])

        rows = admin_list_orders(
            view="bundle",
            status=None,
            event_id=None,
            paid=None,
            email=None,
            db=db,
            _={},
        )
        self.assertEqual(len(rows), 2)

        grouped = next(row for row in rows if row["bundle_id"] == "bundle-1")
        self.assertEqual(grouped["line_count"], 2)
        self.assertEqual(grouped["status"], OrderStatus.CONFIRMED)
        self.assertTrue(grouped["paid"])
        self.assertTrue(grouped["reminded"])

    def test_admin_list_orders_bundle_view_filters_by_aggregated_status(self):
        first = make_order(
            id="order-1", group_id="bundle-1", status=OrderStatus.CONFIRMED
        )
        second = make_order(
            id="order-2", group_id="bundle-1", status=OrderStatus.PICKED_UP
        )
        third = make_order(id="order-3", group_id=None, status=OrderStatus.PENDING)
        db = FakeSession([first, second, third])

        rows = admin_list_orders(
            view="bundle",
            status="mixed",
            event_id=None,
            paid=None,
            email=None,
            db=db,
            _={},
        )

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["bundle_id"], "bundle-1")
        self.assertEqual(rows[0]["status"], "mixed")

    def test_mark_picked_up_action_updates_group(self):
        first = make_order(
            id="order-1", group_id="bundle-1", status=OrderStatus.CONFIRMED
        )
        second = make_order(
            id="order-2", group_id="bundle-1", status=OrderStatus.CONFIRMED
        )
        db = FakeSession([first, second])

        result = admin_mark_order_picked_up("order-1", db=db, _={})

        self.assertEqual(result["status"], OrderStatus.PICKED_UP)
        self.assertEqual(first.status, OrderStatus.PICKED_UP)
        self.assertEqual(second.status, OrderStatus.PICKED_UP)

    def test_mark_no_show_action_updates_group(self):
        first = make_order(
            id="order-1", group_id="bundle-1", status=OrderStatus.CONFIRMED
        )
        second = make_order(
            id="order-2", group_id="bundle-1", status=OrderStatus.CONFIRMED
        )
        db = FakeSession([first, second])

        result = admin_mark_order_no_show("order-1", db=db, _={})

        self.assertEqual(result["status"], OrderStatus.NO_SHOW)
        self.assertEqual(first.status, OrderStatus.NO_SHOW)
        self.assertEqual(second.status, OrderStatus.NO_SHOW)

    def test_cancel_action_allows_mixed_bundle_when_all_lines_can_cancel(self):
        first = make_order(
            id="order-1", group_id="bundle-1", status=OrderStatus.CONFIRMED
        )
        second = make_order(
            id="order-2", group_id="bundle-1", status=OrderStatus.PICKED_UP
        )
        db = FakeSession([first, second])

        result = admin_cancel_order("order-1", db=db, _={})

        self.assertEqual(result["status"], OrderStatus.CANCELLED)
        self.assertEqual(first.status, OrderStatus.CANCELLED)
        self.assertEqual(second.status, OrderStatus.CANCELLED)

    def test_restore_action_requires_cancelled_bundle(self):
        first = make_order(
            id="order-1", group_id="bundle-1", status=OrderStatus.CANCELLED
        )
        second = make_order(
            id="order-2", group_id="bundle-1", status=OrderStatus.CONFIRMED
        )
        db = FakeSession([first, second])

        with self.assertRaises(HTTPException) as exc_context:
            admin_restore_order(
                "order-1",
                RestoreStatusAction(target_status=OrderStatus.PICKED_UP),
                db=db,
                _={},
            )

        self.assertEqual(exc_context.exception.status_code, 409)
        self.assertEqual(
            exc_context.exception.detail, "Only cancelled orders can be restored"
        )

    def test_restore_action_reopens_cancelled_group(self):
        first = make_order(
            id="order-1", group_id="bundle-1", status=OrderStatus.CANCELLED
        )
        second = make_order(
            id="order-2", group_id="bundle-1", status=OrderStatus.CANCELLED
        )
        db = FakeSession([first, second])

        result = admin_restore_order(
            "order-1",
            RestoreStatusAction(target_status=OrderStatus.NO_SHOW),
            db=db,
            _={},
        )

        self.assertEqual(result["status"], OrderStatus.NO_SHOW)
        self.assertEqual(first.status, OrderStatus.NO_SHOW)
        self.assertEqual(second.status, OrderStatus.NO_SHOW)

    def test_admin_delete_order_bundle_rolls_back_on_commit_failure(self):
        first = make_order(id="order-1", group_id="bundle-1")
        second = make_order(id="order-2", group_id="bundle-1")
        db = FakeSession([first, second])
        db.raise_on_commit = True

        with self.assertRaises(RuntimeError):
            admin_delete_order_bundle("bundle-1", db=db, _={})

        self.assertTrue(db.rollback_called)


if __name__ == "__main__":
    unittest.main()
