import json
from pathlib import Path

_config_path = Path(__file__).parent / "event-config.json"

with open(_config_path) as _f:
    _config: dict = json.load(_f)


def get_item(item_id: str) -> dict | None:
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
