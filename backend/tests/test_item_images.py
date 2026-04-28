import os
import sys
import unittest
from types import SimpleNamespace

from fastapi import HTTPException

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
os.environ.setdefault("DATABASE_URL", "sqlite:///./test.db")

from event_config import _build_config_from_event  # noqa: E402
from event_images import resolve_event_image_path  # noqa: E402
from models import Item, Location  # noqa: E402
from routers.admin import _item_dict, _validate_menu_item_image_key  # noqa: E402


class FakeQuery:
    def __init__(self, rows):
        self.rows = rows

    def filter(self, *args, **kwargs):
        return self

    def order_by(self, *args, **kwargs):
        return self

    def all(self):
        return self.rows


class FakeSession:
    def __init__(self, *, items=None, locations=None):
        self.items = list(items or [])
        self.locations = list(locations or [])

    def query(self, model):
        if model is Item:
            return FakeQuery(self.items)
        if model is Location:
            return FakeQuery(self.locations)
        return FakeQuery([])


class ItemImageTests(unittest.TestCase):
    def test_menu_item_image_key_validation(self):
        self.assertEqual(_validate_menu_item_image_key(" menu-item-lamprais "), "menu-item-lamprais")
        self.assertIsNone(_validate_menu_item_image_key(""))
        with self.assertRaises(HTTPException) as exc:
            _validate_menu_item_image_key("tooltip-lamprais-how-its-made")
        self.assertEqual(exc.exception.status_code, 400)

    def test_admin_item_payload_includes_resolved_image_path(self):
        item = SimpleNamespace(
            id="item-1",
            name="Lamprais",
            description="Banana leaf rice",
            price=20,
            discounted_price=None,
            minimum_order_quantity=1,
            image_key="menu-item-lamprais",
            sort_order=0,
        )

        payload = _item_dict(item)

        self.assertEqual(payload["image_key"], "menu-item-lamprais")
        self.assertEqual(payload["image_path"], "/assets/food/client-menu/lamprais.webp")

    def test_public_config_items_include_image_key_and_path(self):
        item = SimpleNamespace(
            id="item-1",
            name="Lamprais",
            description="Banana leaf rice",
            price=20,
            discounted_price=None,
            minimum_order_quantity=1,
            image_key="menu-item-lamprais",
            sort_order=0,
        )
        location = SimpleNamespace(
            id="location-1",
            name="Woodbridge",
            address="123 Test Street",
            time_slots=["12:00 PM"],
            sort_order=0,
        )
        event = SimpleNamespace(
            id=1,
            event_date="April 28th, 2026",
            kind="event",
            item_ids=["item-1"],
            location_ids=["location-1"],
            combo_deals=[],
            hero_header="",
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
            is_active=True,
        )

        payload = _build_config_from_event(FakeSession(items=[item], locations=[location]), event)

        self.assertEqual(payload["items"][0]["image_key"], "menu-item-lamprais")
        self.assertEqual(payload["items"][0]["image_path"], resolve_event_image_path("menu-item-lamprais"))


if __name__ == "__main__":
    unittest.main()
