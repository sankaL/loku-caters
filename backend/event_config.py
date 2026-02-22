import json
from pathlib import Path
from typing import Optional

from sqlalchemy.orm import Session

_config_path = Path(__file__).parent / "event-config.json"
with open(_config_path) as f:
    _file_config: dict = json.load(f)

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
        raise RuntimeError("No active event found in database")
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
        "hero_subheader": event.hero_subheader,
        "promo_details": event.promo_details,
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


def get_item_from_db(db: Session, item_id: str) -> Optional[object]:
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
        raise RuntimeError("No active event found in database")
    return event.event_date
