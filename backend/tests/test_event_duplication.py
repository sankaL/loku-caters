import os
import sys
import unittest
from datetime import date
from types import SimpleNamespace

from fastapi import HTTPException
from pydantic import ValidationError

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("RESEND_API_KEY", "test-key")

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from models import Event  # noqa: E402
from routers.admin import admin_duplicate_event  # noqa: E402
from schemas import EventDuplicateRequest  # noqa: E402


def make_combo_deal():
    return {
        "id": "combo-1",
        "name": "Lamprais and Roll",
        "enabled": True,
        "sort_order": 0,
        "requirement_groups": [
            {
                "id": "group-1",
                "name": "Main",
                "item_ids": ["item-1"],
                "min_quantity": 2,
            }
        ],
        "discount": {
            "type": "fixed_amount",
            "amount": 5,
            "applies_to": "combo_total",
            "target_group_id": None,
        },
    }


def make_event(**overrides):
    values = {
        "id": 42,
        "name": "Spring Batch",
        "event_date": "April 26th, 2026",
        "kind": "event",
        "hero_header": "We're Making",
        "hero_header_sage": "Lamprais",
        "hero_subheader": "Fresh batches, made with care.",
        "promo_details": "Order early.",
        "tooltip_enabled": True,
        "tooltip_header": "What is Lamprais?",
        "tooltip_body": "A Sri Lankan rice parcel.",
        "tooltip_image_key": "lamprais-tooltip",
        "hero_side_image_key": "lamprais-side",
        "etransfer_enabled": True,
        "etransfer_email": "payments@example.com",
        "is_active": True,
        "item_ids": ["item-1", "item-2"],
        "location_ids": ["location-1"],
        "combo_deals": [make_combo_deal()],
        "pickup_date": date(2026, 4, 26),
        "updated_at": None,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


class FakeEventQuery:
    def __init__(self, events):
        self.events = events
        self.event_id = None

    def filter(self, criterion):
        right = getattr(criterion, "right", None)
        self.event_id = getattr(right, "value", right)
        return self

    def first(self):
        return next(
            (event for event in self.events if event.id == self.event_id),
            None,
        )


class FakeSession:
    def __init__(self, events=None, orders=None):
        self.events = list(events or [])
        self.orders = list(orders or [])
        self.commits = 0

    def query(self, model):
        if model is Event:
            return FakeEventQuery(self.events)
        raise AssertionError(f"Unexpected model query: {model}")

    def add(self, event):
        event.id = max((existing.id for existing in self.events), default=0) + 1
        self.events.append(event)

    def commit(self):
        self.commits += 1

    def refresh(self, _event):
        return None


class EventDuplicationTests(unittest.TestCase):
    def test_duplicate_copies_configuration_with_new_identity_and_inactive_state(self):
        source = make_event()
        existing_order = SimpleNamespace(id="order-1", event_id=source.id)
        db = FakeSession(events=[source], orders=[existing_order])
        body = EventDuplicateRequest(
            name="  May Batch  ",
            event_date="  May 31st, 2026  ",
        )

        result = admin_duplicate_event(source.id, body, db, {})

        duplicate = db.events[-1]
        self.assertEqual(result["id"], 43)
        self.assertEqual(duplicate.name, "May Batch")
        self.assertEqual(duplicate.event_date, "May 31st, 2026")
        self.assertEqual(duplicate.kind, "event")
        self.assertFalse(duplicate.is_active)
        self.assertIsNone(duplicate.pickup_date)
        self.assertIsNotNone(duplicate.updated_at)
        self.assertTrue(source.is_active)
        self.assertEqual(db.orders, [existing_order])
        self.assertEqual(db.commits, 1)

        copied_fields = (
            "hero_header",
            "hero_header_sage",
            "hero_subheader",
            "promo_details",
            "tooltip_enabled",
            "tooltip_header",
            "tooltip_body",
            "tooltip_image_key",
            "hero_side_image_key",
            "etransfer_enabled",
            "etransfer_email",
            "item_ids",
            "location_ids",
            "combo_deals",
        )
        for field in copied_fields:
            self.assertEqual(getattr(duplicate, field), getattr(source, field))

    def test_duplicate_json_configuration_is_independent_from_source(self):
        source = make_event()
        db = FakeSession(events=[source])

        admin_duplicate_event(
            source.id,
            EventDuplicateRequest(name="Copy", event_date="May 31st, 2026"),
            db,
            {},
        )

        duplicate = db.events[-1]
        self.assertIsNot(duplicate.item_ids, source.item_ids)
        self.assertIsNot(duplicate.location_ids, source.location_ids)
        self.assertIsNot(duplicate.combo_deals, source.combo_deals)
        duplicate.item_ids.append("item-3")
        duplicate.location_ids.append("location-2")
        duplicate.combo_deals[0]["requirement_groups"][0]["item_ids"].append("item-2")
        self.assertEqual(source.item_ids, ["item-1", "item-2"])
        self.assertEqual(source.location_ids, ["location-1"])
        self.assertEqual(
            source.combo_deals[0]["requirement_groups"][0]["item_ids"],
            ["item-1"],
        )

    def test_duplicate_rejects_missing_source(self):
        db = FakeSession()

        with self.assertRaises(HTTPException) as exc_context:
            admin_duplicate_event(
                999,
                EventDuplicateRequest(name="Copy", event_date="May 31st, 2026"),
                db,
                {},
            )

        self.assertEqual(exc_context.exception.status_code, 404)
        self.assertEqual(exc_context.exception.detail, "Event not found")

    def test_duplicate_rejects_system_event(self):
        source = make_event(
            name="Random Requests",
            event_date="Random Requests",
            kind="random_requests",
        )
        db = FakeSession(events=[source])

        with self.assertRaises(HTTPException) as exc_context:
            admin_duplicate_event(
                source.id,
                EventDuplicateRequest(name="Copy", event_date="May 31st, 2026"),
                db,
                {},
            )

        self.assertEqual(exc_context.exception.status_code, 400)
        self.assertIn("cannot be duplicated", exc_context.exception.detail)
        self.assertEqual(len(db.events), 1)

    def test_duplicate_request_rejects_blank_fields(self):
        for field in ("name", "event_date"):
            values = {"name": "Copy", "event_date": "May 31st, 2026"}
            values[field] = "   "
            with self.subTest(field=field), self.assertRaises(ValidationError):
                EventDuplicateRequest(**values)


if __name__ == "__main__":
    unittest.main()
