import json
from pathlib import Path
from typing import Optional

from sqlalchemy.orm import Session

_config_path = Path(__file__).parent / "event-config.json"

with open(_config_path) as _f:
    _config: dict = json.load(_f)


# ---------------------------------------------------------------------------
# DB-backed helpers (primary path)
# ---------------------------------------------------------------------------

def get_config_from_db(db: Session) -> dict:
    """Load the single event_config row from the database."""
    from models import EventConfig  # local import to avoid circular imports
    row = db.query(EventConfig).filter(EventConfig.id == 1).first()
    if row is None:
        raise RuntimeError("event_config row not found in database")
    return {
        "event": {"date": row.event_date},
        "currency": row.currency,
        "items": row.items,
        "locations": row.locations,
    }


def get_item_from_db(db: Session, item_id: str) -> Optional[dict]:
    config = get_config_from_db(db)
    for item in config["items"]:
        if item["id"] == item_id:
            return item
    return None


def get_currency_from_db(db: Session) -> str:
    config = get_config_from_db(db)
    return config.get("currency", "CAD")


# ---------------------------------------------------------------------------
# File-based helpers (kept as reference; no longer primary path)
# ---------------------------------------------------------------------------

def get_item(item_id: str) -> Optional[dict]:
    for item in _config["items"]:
        if item["id"] == item_id:
            return item
    return None


def get_all_items() -> list[dict]:
    return _config["items"]


def get_event_date() -> str:
    return _config["event"]["date"]


def get_currency() -> str:
    return _config.get("currency", "CAD")
