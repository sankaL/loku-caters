import json
from functools import lru_cache
from pathlib import Path
from typing import Literal, Optional

_IMAGE_REGISTRY_PATH = Path(__file__).parent / "event-images.json"


@lru_cache(maxsize=1)
def _load_registry() -> dict:
    with open(_IMAGE_REGISTRY_PATH) as f:
        data: dict = json.load(f)
    helper = data.get("helper")
    images = data.get("images")
    if not isinstance(helper, dict) or not isinstance(images, list):
        raise RuntimeError("event-images.json is invalid")
    normalized_images: list[dict] = [img for img in images if isinstance(img, dict)]
    return {"helper": helper, "images": normalized_images}


def get_event_image_catalog() -> dict:
    registry = _load_registry()
    return {
        "helper": dict(registry["helper"]),
        "images": [dict(img) for img in registry["images"]],
    }


def get_event_image_by_key(key: str) -> Optional[dict]:
    for image in _load_registry()["images"]:
        if image.get("key") == key:
            return image
    return None


def resolve_event_image_path(key: Optional[str]) -> Optional[str]:
    if not key:
        return None
    image = get_event_image_by_key(key)
    if image is None:
        return None
    path = image.get("path")
    return path if isinstance(path, str) and path else None


def validate_event_image_key(key: Optional[str], image_type: Literal["tooltip", "hero_side"]) -> Optional[str]:
    if key is None:
        return None
    normalized = key.strip()
    if not normalized:
        return None
    image = get_event_image_by_key(normalized)
    if image is None:
        raise ValueError(f"Unknown image key: {normalized}")
    image_kind = image.get("type")
    if image_kind != image_type:
        raise ValueError(f"Image key '{normalized}' is type '{image_kind}', expected '{image_type}'")
    return normalized
