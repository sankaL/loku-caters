import os
import sys
import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("RESEND_API_KEY", "test-key")

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from constants import OrderStatus  # noqa: E402
from models import Customer, Event, Item, Order  # noqa: E402
from routers.admin import (  # noqa: E402
    AdminOrderCreate,
    AdminOrderUpdate,
    admin_activate_event,
    admin_confirm_order,
    admin_create_order,
    admin_deactivate_event,
    admin_delete_event,
    admin_update_event,
    admin_update_order,
)
from schemas import EventUpdate  # noqa: E402


def make_event(**overrides):
    base = {
        "id": 42,
        "name": "Random Requests",
        "event_date": "Random Requests",
        "kind": "random_requests",
        "hero_header": "System bucket",
        "hero_header_sage": "",
        "hero_subheader": "",
        "promo_details": None,
        "tooltip_enabled": False,
        "tooltip_header": None,
        "tooltip_body": None,
        "tooltip_image_key": None,
        "hero_side_image_key": None,
        "etransfer_enabled": False,
        "etransfer_email": None,
        "is_active": False,
        "item_ids": [],
        "location_ids": [],
        "combo_deals": [],
        "updated_at": None,
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def make_item(**overrides):
    base = {
        "id": "item-a",
        "name": "Lamprais",
        "description": "",
        "price": 20.0,
        "discounted_price": None,
        "minimum_order_quantity": 5,
        "sort_order": 0,
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def make_order(**overrides):
    base = {
        "id": "order-1",
        "event_id": 42,
        "group_id": "group-1",
        "name": "Test Customer",
        "email": "test@example.com",
        "phone_number": "111-222-3333",
        "item_id": "item-a",
        "item_name": "Lamprais",
        "quantity": 1,
        "pickup_location": "Any Pickup",
        "pickup_time_slot": "Any Time",
        "pickup_address": "123 Random Street",
        "base_total_price": 20.0,
        "discount_total": 0.0,
        "total_price": 20.0,
        "pricing_meta": {
            "mode": "manual",
            "base_unit_price": 20.0,
            "manual_unit_price": 20.0,
            "base_total": 20.0,
            "manual_total_price": 20.0,
        },
        "status": OrderStatus.PENDING,
        "reminded": False,
        "paid": False,
        "payment_method": None,
        "payment_method_other": None,
        "notes": None,
        "exclude_email": False,
        "created_at": datetime.now(timezone.utc),
    }
    base.update(overrides)
    return Order(**base)


class FakeQuery:
    def __init__(self, rows):
        if rows is None:
            self.rows = []
        elif isinstance(rows, list):
            self.rows = rows
        else:
            self.rows = [rows]
        self.criteria = []
        self.filter_kwargs = {}

    def filter(self, *criteria, **_kwargs):
        self.criteria.extend(criteria)
        return self

    def filter_by(self, **kwargs):
        self.filter_kwargs.update(kwargs)
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
        for key, value in self.filter_kwargs.items():
            if getattr(row, key, None) != value:
                return False
        return all(self._criterion_matches(row, criterion) for criterion in self.criteria)

    def all(self):
        return [row for row in self.rows if self._matches(row)]

    def first(self):
        rows = self.all()
        return rows[0] if rows else None

    def count(self):
        return len(self.all())


class FakeSession:
    def __init__(self, *, events=None, items=None, orders=None, customers=None):
        self.events = list(events or [])
        self.items = list(items or [])
        self.orders = list(orders or [])
        self.customers = list(customers or [])

    def query(self, model):
        if model is Event:
            return FakeQuery(self.events)
        if model is Item:
            return FakeQuery(self.items)
        if model is Order:
            return FakeQuery(self.orders)
        if model is Customer:
            return FakeQuery(self.customers)
        raise AssertionError(f"Unexpected model query: {model}")

    def add(self, obj):
        if isinstance(obj, Order):
            self.orders.append(obj)
        elif isinstance(obj, Customer):
            self.customers.append(obj)
        elif isinstance(obj, Event):
            self.events.append(obj)
        elif isinstance(obj, Item):
            self.items.append(obj)

    def flush(self):
        return None

    def commit(self):
        return None

    def refresh(self, _obj):
        return None

    def delete(self, obj):
        for collection in (self.orders, self.customers, self.events, self.items):
            for index, current in enumerate(collection):
                if current is obj:
                    collection.pop(index)
                    return


class RandomRequestsAdminTests(unittest.TestCase):
    def test_admin_create_order_random_mode_persists_manual_pricing_for_multiple_lines(self):
        event = make_event()
        first_item = make_item(id="item-a", name="Lamprais", price=20.0, minimum_order_quantity=5)
        second_item = make_item(id="item-b", name="Fish Cutlet", price=8.0, minimum_order_quantity=3)
        db = FakeSession(events=[event], items=[first_item, second_item])

        first_body = AdminOrderCreate(
            event_id=42,
            group_id="group-1",
            mode="random",
            name="Test Customer",
            email="test@example.com",
            phone_number="111-222-3333",
            item_id="item-a",
            quantity=1,
            pickup_location="Any Pickup",
            pickup_time_slot="Any Time",
            pickup_address="123 Random Street",
            unit_price=14.25,
            notes="First line",
            exclude_email=False,
        )
        first_result = admin_create_order(first_body, db, {})

        second_body = AdminOrderCreate(
            event_id=42,
            group_id="group-1",
            mode="random",
            name="Test Customer",
            email="test@example.com",
            phone_number="111-222-3333",
            item_id="item-b",
            quantity=2,
            pickup_location="Any Pickup",
            pickup_time_slot="Any Time",
            pickup_address="123 Random Street",
            unit_price=9.5,
            notes="Second line",
            exclude_email=False,
        )
        second_result = admin_create_order(second_body, db, {})

        self.assertEqual(first_result["pickup_address"], "123 Random Street")
        self.assertEqual(first_result["total_price"], 14.25)
        self.assertEqual(first_result["pricing_meta"]["manual_unit_price"], 14.25)
        self.assertEqual(second_result["total_price"], 19.0)
        self.assertEqual(second_result["pricing_meta"]["manual_unit_price"], 9.5)
        self.assertEqual(len(db.orders), 2)
        self.assertEqual(db.orders[0].pricing_meta["manual_unit_price"], 14.25)
        self.assertEqual(db.orders[1].pricing_meta["manual_unit_price"], 9.5)

    def test_admin_create_order_random_mode_keeps_subtotal_consistent_for_markups(self):
        event = make_event()
        item = make_item(id="item-a", name="Lamprais", price=20.0, minimum_order_quantity=5)
        db = FakeSession(events=[event], items=[item])

        body = AdminOrderCreate(
            event_id=42,
            group_id="group-1",
            mode="random",
            name="Test Customer",
            email="test@example.com",
            phone_number="111-222-3333",
            item_id="item-a",
            quantity=2,
            pickup_location="Any Pickup",
            pickup_time_slot="Any Time",
            pickup_address="123 Random Street",
            unit_price=24.5,
            notes="Marked up line",
            exclude_email=False,
        )

        result = admin_create_order(body, db, {})

        self.assertEqual(result["base_total_price"], 49.0)
        self.assertEqual(result["discount_total"], 0.0)
        self.assertEqual(result["total_price"], 49.0)
        self.assertEqual(result["pricing_meta"]["base_total"], 40.0)
        self.assertEqual(result["pricing_meta"]["manual_total_price"], 49.0)

    def test_admin_update_order_random_mode_preserves_existing_unit_price(self):
        event = make_event()
        item = make_item(id="item-a", name="Lamprais", price=20.0, minimum_order_quantity=5)
        order = make_order(quantity=2, total_price=28.5, base_total_price=40.0, pricing_meta={
            "mode": "manual",
            "base_unit_price": 20.0,
            "manual_unit_price": 14.25,
            "base_total": 40.0,
            "manual_total_price": 28.5,
        })
        db = FakeSession(events=[event], items=[item], orders=[order])

        body = AdminOrderUpdate(
            name="Test Customer",
            email="test@example.com",
            phone_number="111-222-3333",
            item_id="item-a",
            quantity=3,
            pickup_location="Any Pickup",
            pickup_time_slot="Any Time",
            mode="random",
            pickup_address="123 Random Street",
            unit_price=None,
            notes="Updated",
            exclude_email=False,
        )
        result = admin_update_order(order.id, body, db, {})

        self.assertEqual(result["total_price"], 42.75)
        self.assertEqual(result["pricing_meta"]["manual_unit_price"], 14.25)
        self.assertEqual(db.orders[0].pickup_address, "123 Random Street")

    def test_random_mode_rejects_unknown_item_ids(self):
        event = make_event()
        db = FakeSession(events=[event], items=[])

        body = AdminOrderCreate(
            event_id=42,
            group_id="group-1",
            mode="random",
            name="Test Customer",
            email="test@example.com",
            phone_number="111-222-3333",
            item_id="missing-item",
            quantity=1,
            pickup_location="Any Pickup",
            pickup_time_slot="Any Time",
            pickup_address="123 Random Street",
            unit_price=14.25,
            notes="First line",
            exclude_email=False,
        )

        with self.assertRaises(HTTPException) as exc_context:
            admin_create_order(body, db, {})

        self.assertEqual(exc_context.exception.status_code, 400)
        self.assertIn("Invalid item_id", str(exc_context.exception.detail))

    def test_random_requests_event_cannot_be_activated_or_deleted_or_edited(self):
        event = make_event()
        db = FakeSession(events=[event])
        update_body = EventUpdate(
            name="Random Requests",
            event_date="Random Requests",
            hero_header="System bucket",
            hero_header_sage="",
            hero_subheader="",
            promo_details=None,
            tooltip_enabled=False,
            tooltip_header=None,
            tooltip_body=None,
            tooltip_image_key=None,
            hero_side_image_key=None,
            etransfer_enabled=False,
            etransfer_email=None,
            item_ids=[],
            location_ids=[],
            combo_deals=[],
        )

        with self.assertRaises(HTTPException) as activate_exc:
            admin_activate_event(42, db, {})
        self.assertEqual(activate_exc.exception.status_code, 400)

        with self.assertRaises(HTTPException) as deactivate_exc:
            admin_deactivate_event(42, db, {})
        self.assertEqual(deactivate_exc.exception.status_code, 400)

        with self.assertRaises(HTTPException) as delete_exc:
            admin_delete_event(42, db, {})
        self.assertEqual(delete_exc.exception.status_code, 400)

        with self.assertRaises(HTTPException) as update_exc:
            admin_update_event(42, update_body, db, {})
        self.assertEqual(update_exc.exception.status_code, 400)

    def test_random_requests_order_confirm_uses_order_pickup_address(self):
        event = make_event(is_active=False)
        order = make_order(
            status=OrderStatus.PENDING,
            pickup_address="789 Random Road",
            group_id=None,
            event_id=42,
            paid=False,
        )
        db = FakeSession(events=[event], orders=[order])

        with patch("routers.admin.send_confirmation") as mock_send:
            result = admin_confirm_order(order.id, db, {})

        self.assertEqual(result["status"], OrderStatus.CONFIRMED)
        mock_send.assert_called_once()
        payload = mock_send.call_args.args[0]
        self.assertEqual(payload["address"], "789 Random Road")


if __name__ == "__main__":
    unittest.main()
