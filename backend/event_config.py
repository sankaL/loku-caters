import json
from pathlib import Path
from typing import Optional, TYPE_CHECKING

from sqlalchemy.orm import Session

from event_images import resolve_event_image_path

_config_path = Path(__file__).parent / "event-config.json"
with open(_config_path) as f:
    _file_config: dict = json.load(f)


class NoActiveEventError(RuntimeError):
    pass


class EventNotFoundError(RuntimeError):
    pass


if TYPE_CHECKING:
    from models import Item

def get_currency() -> str:
    currency = _file_config.get("currency")
    if not currency:
        raise RuntimeError("currency missing from event-config.json")
    return str(currency)


CURRENCY = get_currency()


def get_config_from_db(db: Session) -> dict:
    """Load event config with items and locations from the active event."""
    from models import Event, Item, Location
    event = db.query(Event).filter(Event.is_active == True).first()
    if event is None:
        raise NoActiveEventError("No active event found in database")
    return _build_config_from_event(db, event)


def get_config_for_event_id_from_db(db: Session, event_id: int) -> dict:
    """Load event config with items and locations for a specific event id."""
    from models import Event

    event = db.query(Event).filter(Event.id == event_id).first()
    if event is None:
        raise EventNotFoundError(f"Event not found: {event_id}")
    return _build_config_from_event(db, event)


def _build_config_from_event(db: Session, event) -> dict:
    from models import Item, Location

    item_ids = event.item_ids or []
    location_ids = event.location_ids or []

    items = (
        db.query(Item)
        .filter(Item.id.in_(item_ids))
        .order_by(Item.sort_order)
        .all()
    ) if item_ids else []

    locations = (
        db.query(Location)
        .filter(Location.id.in_(location_ids))
        .order_by(Location.sort_order)
        .all()
    ) if location_ids else []

    return {
        "event": {"date": event.event_date},
        "currency": get_currency(),
        "hero_header": event.hero_header,
        "hero_header_sage": event.hero_header_sage,
        "hero_subheader": event.hero_subheader,
        "promo_details": event.promo_details,
        "tooltip_enabled": event.tooltip_enabled,
        "tooltip_header": event.tooltip_header,
        "tooltip_body": event.tooltip_body,
        "tooltip_image_path": resolve_event_image_path(event.tooltip_image_key),
        "hero_side_image_path": resolve_event_image_path(event.hero_side_image_key),
        "etransfer_enabled": event.etransfer_enabled,
        "etransfer_email": event.etransfer_email,
        "items": [
            {
                "id": item.id,
                "name": item.name,
                "description": item.description,
                "price": float(item.price),
                "discounted_price": float(item.discounted_price) if item.discounted_price is not None else None,
            }
            for item in items
        ],
        "locations": [
            {
                "id": loc.id,
                "name": loc.name,
                "address": loc.address,
                "timeSlots": loc.time_slots,
            }
            for loc in locations
        ],
    }


def get_item_from_db(db: Session, item_id: str) -> Optional["Item"]:
    """Look up an item only if it belongs to the active event."""
    from models import Event, Item
    event = db.query(Event).filter(Event.is_active == True).first()
    if event is None or item_id not in (event.item_ids or []):
        return None
    return db.query(Item).filter(Item.id == item_id).first()


def get_event_date_from_db(db: Session) -> str:
    """Lightweight helper that only reads event_date from the active event."""
    from models import Event
    event = db.query(Event).filter(Event.is_active == True).first()
    if event is None:
        raise NoActiveEventError("No active event found in database")
    return event.event_date


def get_active_event_id_from_db(db: Session) -> int:
    """Return the current active event id."""
    from models import Event

    event = db.query(Event).filter(Event.is_active == True).first()
    if event is None:
        raise NoActiveEventError("No active event found in database")
    return int(event.id)


def get_event_date_for_event_id_from_db(db: Session, event_id: int) -> str:
    """Read event_date for a specific event id."""
    from models import Event

    event = db.query(Event).filter(Event.id == event_id).first()
    if event is None:
        raise EventNotFoundError(f"Event not found: {event_id}")
    return event.event_date


def get_etransfer_config_from_db(db: Session) -> dict:
    """Read optional e-transfer settings from the active event."""
    from models import Event
    event = db.query(Event).filter(Event.is_active == True).first()
    if event is None:
        raise NoActiveEventError("No active event found in database")
    return {
        "enabled": bool(event.etransfer_enabled),
        "email": event.etransfer_email,
    }


def get_etransfer_config_for_event_id_from_db(db: Session, event_id: int) -> dict:
    """Read optional e-transfer settings for a specific event id."""
    from models import Event

    event = db.query(Event).filter(Event.id == event_id).first()
    if event is None:
        raise EventNotFoundError(f"Event not found: {event_id}")
    return {
        "enabled": bool(event.etransfer_enabled),
        "email": event.etransfer_email,
    }
