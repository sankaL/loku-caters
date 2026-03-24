from datetime import date, datetime, timedelta, timezone
import json
import uuid
from urllib.parse import urlencode
from urllib.request import urlopen
from typing import Any, Optional, Union, Literal
from functools import lru_cache

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from jose import JWTError, jwt
from pydantic import BaseModel, EmailStr, field_validator, model_validator
from sqlalchemy import func, or_, case
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from config import settings
from constants import OrderStatus
from database import get_db
from event_config import (
    CURRENCY,
    RANDOM_REQUESTS_EVENT_KIND,
    NoActiveEventError,
    EventNotFoundError,
    get_config_from_db,
    get_config_for_event_id_from_db,
)
from event_images import get_event_image_catalog, validate_event_image_key
from models import CateringRequest, CateringRequestComment, Customer, Event, Feedback, Item, Location, Order
from schemas import (
    CustomerUpdate, EventCreate, EventUpdate, ItemCreate, ItemUpdate, LocationCreate, LocationUpdate,
    CATERING_REQUEST_STATUSES, FEEDBACK_ORIGIN_LABELS, FEEDBACK_REASON_LABELS, FEEDBACK_STATUSES,
    FEEDBACK_TYPE_LABELS, CateringRequestCommentCreate, CateringRequestStatusUpdate,
    CustomerEventReminderRequest, FeedbackStatusUpdate, FeedbackCommentUpdate,
)
from services.customers import (
    CustomerEmailConflictError,
    CustomerNotFoundError,
    sync_customer_from_contact,
    update_customer_from_admin,
)
from services.email import send_confirmation, send_event_reminder_email, send_payment_reminder, send_reminder
from services.pricing import PricingLineInput, normalize_combo_deals, quote_cart, serialize_combo_deals

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

@lru_cache(maxsize=8)
def _fetch_jwks(issuer: str) -> dict:
    url = issuer.rstrip("/") + "/.well-known/jwks.json"
    with urlopen(url, timeout=5) as response:
        return json.loads(response.read().decode("utf-8"))


def verify_admin_token(authorization: str = Header(...)) -> dict:
    """Verify that the request carries a valid Supabase-issued JWT."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")
    token = authorization[len("Bearer "):]
    try:
        header = jwt.get_unverified_header(token)
        alg = header.get("alg")

        # Legacy/shared-secret projects
        if alg == "HS256":
            if not settings.supabase_jwt_secret:
                raise HTTPException(status_code=401, detail="Server missing JWT secret")
            return jwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                options={"verify_aud": False},
            )

        # Modern Supabase projects (asymmetric JWT signing)
        if alg in {"RS256", "ES256"}:
            unverified_claims = jwt.get_unverified_claims(token)
            issuer = unverified_claims.get("iss")
            if not issuer:
                raise HTTPException(status_code=401, detail="Token missing issuer")

            jwks = _fetch_jwks(issuer)
            kid = header.get("kid")
            key = next((k for k in jwks.get("keys", []) if k.get("kid") == kid), None)
            if key is None:
                raise HTTPException(status_code=401, detail="Signing key not found")

            return jwt.decode(
                token,
                key,
                algorithms=[alg],
                issuer=issuer,
                options={"verify_aud": False},
            )

        raise HTTPException(status_code=401, detail=f"Unsupported token algorithm: {alg}")
    except JWTError as exc:
        raise HTTPException(status_code=401, detail=f"Invalid token: {exc}")


# ---------------------------------------------------------------------------
# Dev login (local testing only -- requires DEV_MODE=true in .env)
# ---------------------------------------------------------------------------

@router.post("/dev-login")
def dev_login():
    if not settings.dev_mode:
        raise HTTPException(status_code=404, detail="Not found")
    if not settings.supabase_jwt_secret:
        raise HTTPException(status_code=500, detail="SUPABASE_JWT_SECRET is required for dev login")
    now = datetime.now(timezone.utc)
    payload = {
        "sub": "dev-admin",
        "email": "admin@dev.local",
        "role": "authenticated",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=7)).timestamp()),
    }
    token = jwt.encode(payload, settings.supabase_jwt_secret, algorithm="HS256")
    return {"access_token": token}


# ---------------------------------------------------------------------------
# Inline schemas
# ---------------------------------------------------------------------------

class StatusUpdate(BaseModel):
    status: str


ALLOWED_PAYMENT_METHODS = {"cash", "etransfer", "other"}


class PaymentUpdate(BaseModel):
    paid: bool
    payment_method: Optional[str] = None
    payment_method_other: Optional[str] = None

    @field_validator("payment_method", mode="before")
    @classmethod
    def normalize_payment_method(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        stripped = str(v).strip().lower()
        return stripped or None

    @field_validator("payment_method_other", mode="before")
    @classmethod
    def normalize_payment_method_other(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        stripped = str(v).strip()
        return stripped or None

    @model_validator(mode="after")
    def validate_payment_fields(self) -> "PaymentUpdate":
        if not self.paid:
            self.payment_method = None
            self.payment_method_other = None
            return self

        if not self.payment_method:
            raise ValueError("payment_method is required when paid is true")
        if self.payment_method not in ALLOWED_PAYMENT_METHODS:
            raise ValueError("Invalid payment_method")

        if self.payment_method == "other":
            if not self.payment_method_other:
                raise ValueError("payment_method_other is required when payment_method is other")
            return self

        self.payment_method_other = None
        return self

class BulkCustomerDeleteRequest(BaseModel):
    ids: list[str]

    @field_validator("ids")
    @classmethod
    def validate_ids(cls, ids: list[str]) -> list[str]:
        cleaned = [str(value).strip() for value in ids if str(value).strip()]
        if not cleaned:
            raise ValueError("ids must contain at least one id")
        return list(dict.fromkeys(cleaned))


ALLOWED_STATUS_TRANSITIONS: dict[str, set[str]] = {
    OrderStatus.PENDING: {OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.CANCELLED},
    OrderStatus.CONFIRMED: {OrderStatus.CONFIRMED, OrderStatus.PICKED_UP, OrderStatus.NO_SHOW, OrderStatus.CANCELLED},
    OrderStatus.PICKED_UP: {OrderStatus.PICKED_UP, OrderStatus.NO_SHOW, OrderStatus.CANCELLED},
    OrderStatus.NO_SHOW: {OrderStatus.NO_SHOW, OrderStatus.PICKED_UP, OrderStatus.CANCELLED},
    OrderStatus.CANCELLED: {OrderStatus.CANCELLED, OrderStatus.PICKED_UP, OrderStatus.NO_SHOW},
}


class AdminOrderCreate(BaseModel):
    event_id: Optional[int] = None
    group_id: Optional[str] = None
    mode: Literal["event", "random"] = "event"
    name: str
    email: Optional[EmailStr] = None
    phone_number: Optional[str] = None
    item_id: str
    quantity: int
    pickup_location: str
    pickup_time_slot: str
    pickup_address: Optional[str] = None
    pickup_date: Optional[date] = None
    unit_price: Optional[float] = None
    notes: Optional[str] = None
    exclude_email: bool = False

    @field_validator("name", "item_id", "pickup_location", "pickup_time_slot")
    @classmethod
    def required_trim(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("Field cannot be empty")
        return stripped

    @field_validator("phone_number", mode="before")
    @classmethod
    def normalize_phone(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        stripped = str(v).strip()
        return stripped or None

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        stripped = str(v).strip()
        return stripped or None

    @field_validator("notes", mode="before")
    @classmethod
    def normalize_notes(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        stripped = str(v).strip()
        return stripped or None

    @field_validator("pickup_address", mode="before")
    @classmethod
    def normalize_pickup_address(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        stripped = str(v).strip()
        return stripped or None

    @field_validator("unit_price")
    @classmethod
    def validate_unit_price(cls, v: Optional[float]) -> Optional[float]:
        if v is None:
            return None
        if v < 0:
            raise ValueError("unit_price cannot be negative")
        return round(float(v), 2)

    @field_validator("quantity")
    @classmethod
    def quantity_must_be_positive(cls, v: int) -> int:
        if v < 1:
            raise ValueError("Quantity must be at least 1")
        return v

    @field_validator("group_id", mode="before")
    @classmethod
    def normalize_group_id(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        stripped = str(v).strip()
        return stripped or None

    @model_validator(mode="after")
    def require_contact_unless_excluded(self) -> "AdminOrderCreate":
        if not self.exclude_email:
            if not self.email:
                raise ValueError("email is required unless exclude_email is true")
        if self.mode == "random" and self.pickup_date is None:
            raise ValueError("pickup_date is required for random orders")
        return self


class AdminOrderUpdate(BaseModel):
    name: str
    email: Optional[EmailStr] = None
    phone_number: Optional[str] = None
    item_id: str
    quantity: int
    pickup_location: str
    pickup_time_slot: str
    mode: Literal["event", "random"] = "event"
    pickup_address: Optional[str] = None
    pickup_date: Optional[date] = None
    unit_price: Optional[float] = None
    notes: Optional[str] = None
    exclude_email: bool = False

    @field_validator("name", "item_id", "pickup_location", "pickup_time_slot")
    @classmethod
    def required_trim(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("Field cannot be empty")
        return stripped

    @field_validator("phone_number", mode="before")
    @classmethod
    def normalize_phone(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        stripped = str(v).strip()
        return stripped or None

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        stripped = str(v).strip()
        return stripped or None

    @field_validator("notes", mode="before")
    @classmethod
    def normalize_notes(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        stripped = str(v).strip()
        return stripped or None

    @field_validator("pickup_address", mode="before")
    @classmethod
    def normalize_pickup_address(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        stripped = str(v).strip()
        return stripped or None

    @field_validator("unit_price")
    @classmethod
    def validate_unit_price(cls, v: Optional[float]) -> Optional[float]:
        if v is None:
            return None
        if v < 0:
            raise ValueError("unit_price cannot be negative")
        return round(float(v), 2)

    @field_validator("quantity")
    @classmethod
    def quantity_must_be_positive(cls, v: int) -> int:
        if v < 1:
            raise ValueError("Quantity must be at least 1")
        return v

    @model_validator(mode="after")
    def require_contact_unless_excluded(self) -> "AdminOrderUpdate":
        if not self.exclude_email:
            if not self.email:
                raise ValueError("email is required unless exclude_email is true")
        if self.mode == "random" and self.pickup_date is None:
            raise ValueError("pickup_date is required for random orders")
        return self


class BulkRemindRequest(BaseModel):
    order_ids: list[str]


class FeedbackBulkDeleteRequest(BaseModel):
    ids: list[str]


class FeedbackBulkStatusRequest(BaseModel):
    ids: list[str]
    status: str


class CateringRequestBulkDeleteRequest(BaseModel):
    ids: list[str]


class CateringRequestBulkStatusRequest(BaseModel):
    ids: list[str]
    status: str


class RandomRequestsConfigUpdate(BaseModel):
    etransfer_enabled: bool
    etransfer_email: Optional[str] = None


# ---------------------------------------------------------------------------
# Events CRUD
# ---------------------------------------------------------------------------

def _event_dict(event: Event, *, total_revenue: float = 0.0, order_count: int = 0) -> dict:
    normalized_combo_deals = serialize_combo_deals(normalize_combo_deals(event.combo_deals or []))
    return {
        "id": event.id,
        "name": event.name,
        "event_date": event.event_date,
        "kind": getattr(event, "kind", "event"),
        "hero_header": event.hero_header,
        "hero_header_sage": event.hero_header_sage,
        "hero_subheader": event.hero_subheader,
        "promo_details": event.promo_details,
        "tooltip_enabled": event.tooltip_enabled,
        "tooltip_header": event.tooltip_header,
        "tooltip_body": event.tooltip_body,
        "tooltip_image_key": event.tooltip_image_key,
        "hero_side_image_key": event.hero_side_image_key,
        "etransfer_enabled": event.etransfer_enabled,
        "etransfer_email": event.etransfer_email,
        "is_active": event.is_active,
        "item_ids": event.item_ids or [],
        "location_ids": event.location_ids or [],
        "combo_deals": normalized_combo_deals,
        "updated_at": event.updated_at.isoformat() if event.updated_at else None,
        "total_revenue": total_revenue,
        "order_count": order_count,
    }


def _is_random_requests_event(event: Optional[Event]) -> bool:
    return bool(event is not None and getattr(event, "kind", "event") == RANDOM_REQUESTS_EVENT_KIND)


def _customer_email_event_date(event: Optional[Event], fallback: str = "") -> str:
    if event is None:
        return fallback
    if _is_random_requests_event(event):
        return ""
    event_date = _normalize_group_text(getattr(event, "event_date", None))
    return event_date if event_date is not None else fallback


def _format_pickup_date_display(pickup_date) -> str:
    if pickup_date is None:
        return ""
    if isinstance(pickup_date, str) and pickup_date:
        return pickup_date
    try:
        return pickup_date.strftime("%B ") + str(pickup_date.day) + _ordinal_suffix(pickup_date.day) + pickup_date.strftime(", %Y")
    except (AttributeError, TypeError):
        return str(pickup_date) if pickup_date else ""


def _ordinal_suffix(day: int) -> str:
    if 11 <= day <= 13:
        return "th"
    return {1: "st", 2: "nd", 3: "rd"}.get(day % 10, "th")


def _resolve_order_email_date(order: Order, event: Optional[Event], fallback: str = "") -> str:
    pickup_date = getattr(order, "pickup_date", None)
    if pickup_date is not None:
        formatted = _format_pickup_date_display(pickup_date)
        if formatted:
            return formatted
    return _customer_email_event_date(event, fallback)


def _require_random_requests_event(db: Session) -> Event:
    event = db.query(Event).filter(Event.kind == RANDOM_REQUESTS_EVENT_KIND).first()
    if event is None:
        raise HTTPException(status_code=404, detail="Random Requests event not found")
    return event


def _normalize_price(value: float) -> float:
    return round(float(value), 2)


def _item_base_unit_price(item: Item) -> float:
    return float(item.discounted_price if item.discounted_price is not None else item.price)


def _apply_manual_pricing(
    *,
    order: Order,
    item: Item,
    unit_price: Optional[float],
) -> None:
    base_unit_price = _item_base_unit_price(item)
    manual_unit_price = _normalize_price(unit_price if unit_price is not None else base_unit_price)
    quantity = int(order.quantity)
    catalog_base_total = _normalize_price(base_unit_price * quantity)
    total_price = _normalize_price(manual_unit_price * quantity)
    base_total = _normalize_price(max(catalog_base_total, total_price))
    discount_total = _normalize_price(max(base_total - total_price, 0))

    order.item_name = item.name
    order.base_total_price = base_total
    order.discount_total = discount_total
    order.total_price = total_price
    order.pricing_meta = {
        "mode": "manual",
        "base_unit_price": base_unit_price,
        "manual_unit_price": manual_unit_price,
        "base_total": catalog_base_total,
        "manual_total_price": total_price,
    }


def _existing_manual_unit_price(order: Order) -> Optional[float]:
    meta = order.pricing_meta or {}
    raw_unit_price = meta.get("manual_unit_price")
    if raw_unit_price is not None:
        try:
            return _normalize_price(float(raw_unit_price))
        except (TypeError, ValueError):
            return None

    quantity = int(order.quantity or 0)
    if quantity > 0:
        try:
            return _normalize_price(float(order.total_price) / quantity)
        except (TypeError, ValueError, ZeroDivisionError):
            return None
    return None


def _resolve_order_pickup_address(db: Session, order: Order) -> str:
    pickup_address = _normalize_group_text(getattr(order, "pickup_address", None))
    if pickup_address:
        return pickup_address

    location = db.query(Location).filter(
        or_(Location.name == order.pickup_location, Location.id == order.pickup_location)
    ).first()
    if location and getattr(location, "address", None):
        return str(location.address).strip()
    return ""


def _validate_event_images(payload: Union[EventCreate, EventUpdate]) -> tuple[Optional[str], Optional[str]]:
    try:
        tooltip_image_key = validate_event_image_key(payload.tooltip_image_key, "tooltip")
        hero_side_image_key = validate_event_image_key(payload.hero_side_image_key, "hero_side")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return tooltip_image_key, hero_side_image_key


def _validate_event_combo_deals(payload: Union[EventCreate, EventUpdate]) -> list[dict[str, Any]]:
    try:
        combo_payload = [entry.model_dump(mode="json") for entry in payload.combo_deals]
        normalized = normalize_combo_deals(combo_payload, allowed_item_ids=set(payload.item_ids))
        return serialize_combo_deals(normalized)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/event-images")
def admin_list_event_images(_: dict = Depends(verify_admin_token)):
    return get_event_image_catalog()


@router.get("/events")
def admin_list_events(
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    active_order = Order.status.notin_(["cancelled", "no_show"])
    rows = (
        db.query(
            Event,
            func.coalesce(
                func.sum(
                    case(
                        (active_order, Order.total_price),
                        else_=0,
                    )
                ),
                0,
            ).label("total_revenue"),
            func.coalesce(
                func.sum(
                    case(
                        (active_order, 1),
                        else_=0,
                    )
                ),
                0,
            ).label("order_count"),
        )
        .outerjoin(Order, Order.event_id == Event.id)
        .group_by(Event.id)
        .order_by(Event.id.desc())
        .all()
    )
    return [
        _event_dict(event, total_revenue=float(rev), order_count=int(cnt))
        for event, rev, cnt in rows
    ]


@router.get("/events/{event_id}")
def admin_get_event(
    event_id: int,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return _event_dict(event)


@router.get("/events/{event_id}/config")
def admin_get_event_config(
    event_id: int,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    try:
        return get_config_for_event_id_from_db(db, event_id)
    except EventNotFoundError:
        raise HTTPException(status_code=404, detail="Event not found")


@router.post("/events", status_code=201)
def admin_create_event(
    body: EventCreate,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    tooltip_image_key, hero_side_image_key = _validate_event_images(body)
    combo_deals = _validate_event_combo_deals(body)
    event = Event(
        name=body.name,
        event_date=body.event_date,
        kind="event",
        hero_header=body.hero_header,
        hero_header_sage=body.hero_header_sage,
        hero_subheader=body.hero_subheader,
        promo_details=body.promo_details,
        tooltip_enabled=body.tooltip_enabled,
        tooltip_header=body.tooltip_header,
        tooltip_body=body.tooltip_body,
        tooltip_image_key=tooltip_image_key,
        hero_side_image_key=hero_side_image_key,
        etransfer_enabled=body.etransfer_enabled,
        etransfer_email=str(body.etransfer_email) if body.etransfer_email is not None else None,
        is_active=False,
        item_ids=body.item_ids,
        location_ids=body.location_ids,
        combo_deals=combo_deals,
        updated_at=datetime.now(timezone.utc),
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return _event_dict(event)


@router.put("/random-requests/config")
def admin_update_random_requests_config(
    body: RandomRequestsConfigUpdate,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    event = _require_random_requests_event(db)
    event.etransfer_enabled = body.etransfer_enabled
    event.etransfer_email = str(body.etransfer_email) if body.etransfer_email is not None else None
    event.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(event)
    return _event_dict(event)


@router.put("/events/{event_id}")
def admin_update_event(
    event_id: int,
    body: EventUpdate,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    tooltip_image_key, hero_side_image_key = _validate_event_images(body)
    combo_deals = _validate_event_combo_deals(body)
    event = db.query(Event).filter(Event.id == event_id).first()
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")
    if _is_random_requests_event(event):
        raise HTTPException(status_code=400, detail="Random Requests is a system event and cannot be edited")
    event.name = body.name
    event.event_date = body.event_date
    event.hero_header = body.hero_header
    event.hero_header_sage = body.hero_header_sage
    event.hero_subheader = body.hero_subheader
    event.promo_details = body.promo_details
    event.tooltip_enabled = body.tooltip_enabled
    event.tooltip_header = body.tooltip_header
    event.tooltip_body = body.tooltip_body
    event.tooltip_image_key = tooltip_image_key
    event.hero_side_image_key = hero_side_image_key
    event.etransfer_enabled = body.etransfer_enabled
    event.etransfer_email = str(body.etransfer_email) if body.etransfer_email is not None else None
    event.item_ids = body.item_ids
    event.location_ids = body.location_ids
    event.combo_deals = combo_deals
    event.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(event)
    return _event_dict(event)


@router.post("/events/{event_id}/activate")
def admin_activate_event(
    event_id: int,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    event = db.query(Event).filter(Event.id == event_id).first()
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")
    if _is_random_requests_event(event):
        raise HTTPException(status_code=400, detail="Random Requests is a system event and cannot be activated")
    db.query(Event).update({"is_active": False})
    event.is_active = True
    event.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(event)
    return _event_dict(event)


@router.post("/events/{event_id}/deactivate")
def admin_deactivate_event(
    event_id: int,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    event = db.query(Event).filter(Event.id == event_id).first()
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")
    if _is_random_requests_event(event):
        raise HTTPException(status_code=400, detail="Random Requests is a system event and cannot be deactivated")
    event.is_active = False
    event.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(event)
    return _event_dict(event)


@router.delete("/events/{event_id}")
def admin_delete_event(
    event_id: int,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    event = db.query(Event).filter(Event.id == event_id).first()
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")
    if _is_random_requests_event(event):
        raise HTTPException(status_code=400, detail="Random Requests is a system event and cannot be deleted")
    if event.is_active:
        raise HTTPException(status_code=400, detail="Cannot delete the active event")

    existing_orders = db.query(Order).filter(Order.event_id == event_id).count()
    if existing_orders > 0:
        raise HTTPException(status_code=400, detail="Cannot delete event with existing orders")
    db.delete(event)
    db.commit()
    return {"success": True}


# ---------------------------------------------------------------------------
# Items CRUD
# ---------------------------------------------------------------------------

def _item_dict(item: Item) -> dict:
    minimum_order_quantity = max(1, int(getattr(item, "minimum_order_quantity", 1) or 1))
    return {
        "id": item.id,
        "name": item.name,
        "description": item.description,
        "price": float(item.price),
        "discounted_price": float(item.discounted_price) if item.discounted_price is not None else None,
        "minimum_order_quantity": minimum_order_quantity,
        "sort_order": item.sort_order,
    }


@router.get("/items")
def admin_list_items(
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    items = db.query(Item).order_by(Item.sort_order).all()
    return [_item_dict(i) for i in items]


@router.post("/items", status_code=201)
def admin_create_item(
    body: ItemCreate,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    max_sort = db.query(func.max(Item.sort_order)).scalar()
    next_sort = (max_sort + 1) if max_sort is not None else 0
    item = Item(
        name=body.name,
        description=body.description,
        price=body.price,
        discounted_price=body.discounted_price,
        minimum_order_quantity=body.minimum_order_quantity if body.minimum_order_quantity is not None else 1,
        sort_order=next_sort,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return _item_dict(item)


@router.put("/items/{item_id}")
def admin_update_item(
    item_id: str,
    body: ItemUpdate,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    item.name = body.name
    item.description = body.description
    item.price = body.price
    item.discounted_price = body.discounted_price
    if body.minimum_order_quantity is not None:
        item.minimum_order_quantity = body.minimum_order_quantity
    db.commit()
    db.refresh(item)
    return _item_dict(item)


@router.delete("/items/{item_id}")
def admin_delete_item(
    item_id: str,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    db.delete(item)
    db.commit()
    return {"success": True}


# ---------------------------------------------------------------------------
# Locations CRUD
# ---------------------------------------------------------------------------

def _location_dict(loc: Location) -> dict:
    return {
        "id": loc.id,
        "name": loc.name,
        "address": loc.address,
        "time_slots": loc.time_slots,
        "sort_order": loc.sort_order,
    }


@router.get("/locations")
def admin_list_locations(
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    locations = db.query(Location).order_by(Location.sort_order).all()
    return [_location_dict(l) for l in locations]


@router.post("/locations", status_code=201)
def admin_create_location(
    body: LocationCreate,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    max_sort = db.query(func.max(Location.sort_order)).scalar()
    next_sort = (max_sort + 1) if max_sort is not None else 0
    loc = Location(
        name=body.name,
        address=body.address,
        time_slots=body.time_slots,
        sort_order=next_sort,
    )
    db.add(loc)
    db.commit()
    db.refresh(loc)
    return _location_dict(loc)


@router.put("/locations/{location_id}")
def admin_update_location(
    location_id: str,
    body: LocationUpdate,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    loc = db.query(Location).filter(Location.id == location_id).first()
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")
    loc.name = body.name
    loc.address = body.address
    loc.time_slots = body.time_slots
    db.commit()
    db.refresh(loc)
    return _location_dict(loc)


@router.delete("/locations/{location_id}")
def admin_delete_location(
    location_id: str,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    loc = db.query(Location).filter(Location.id == location_id).first()
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")
    db.delete(loc)
    db.commit()
    return {"success": True}


# ---------------------------------------------------------------------------
# Order endpoints
# ---------------------------------------------------------------------------

def _order_dict(order: Order) -> dict:
    return {
        "id": order.id,
        "event_id": int(order.event_id) if getattr(order, "event_id", None) is not None else None,
        "group_id": order.group_id,
        "name": order.name,
        "email": order.email,
        "phone_number": order.phone_number,
        "item_id": order.item_id,
        "item_name": order.item_name,
        "quantity": order.quantity,
        "pickup_location": order.pickup_location,
        "pickup_time_slot": order.pickup_time_slot,
        "pickup_address": getattr(order, "pickup_address", None),
        "pickup_date": order.pickup_date.isoformat() if getattr(order, "pickup_date", None) is not None else None,
        "base_total_price": float(order.base_total_price),
        "discount_total": float(order.discount_total),
        "total_price": float(order.total_price),
        "pricing_meta": order.pricing_meta or {},
        "status": order.status,
        "reminded": bool(order.reminded),
        "paid": bool(order.paid),
        "payment_method": order.payment_method,
        "payment_method_other": order.payment_method_other,
        "notes": order.notes,
        "exclude_email": bool(order.exclude_email),
        "created_at": order.created_at.isoformat() if order.created_at else None,
    }


def _get_reminder_context(db: Session, orders: list[Order]) -> tuple[dict[int, Event], str, dict]:
    event_ids = sorted({int(o.event_id) for o in orders if getattr(o, "event_id", None) is not None})
    events = db.query(Event).filter(Event.id.in_(event_ids)).all() if event_ids else []
    events_by_id: dict[int, Event] = {int(event.id): event for event in events}

    active_event = db.query(Event).filter(Event.is_active == True, Event.kind != RANDOM_REQUESTS_EVENT_KIND).first()
    active_event_date = active_event.event_date if active_event else ""
    active_etransfer = {
        "enabled": bool(active_event.etransfer_enabled) if active_event else False,
        "email": active_event.etransfer_email if active_event else None,
    }

    return events_by_id, active_event_date, active_etransfer


def _customer_dict(customer: Customer) -> dict:
    return {
        "id": customer.id,
        "name": customer.name,
        "email": customer.email,
        "phone_number": customer.phone_number,
        "pickup_locations": list(customer.pickup_locations or []),
        "created_at": customer.created_at.isoformat() if customer.created_at else None,
        "updated_at": customer.updated_at.isoformat() if customer.updated_at else None,
    }


def _normalize_group_text(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    stripped = str(value).strip()
    return stripped or None


def _normalize_group_email(value: Optional[str]) -> Optional[str]:
    normalized = _normalize_group_text(value)
    return normalized.lower() if normalized is not None else None


def _validate_group_order_payload(existing_group_orders: list[Order], body: AdminOrderCreate) -> None:
    if not existing_group_orders:
        return

    first_order = existing_group_orders[0]
    mismatched_fields: list[str] = []
    shared_fields = (
        ("name", _normalize_group_text(first_order.name), _normalize_group_text(body.name)),
        ("email", _normalize_group_email(first_order.email), _normalize_group_email(str(body.email) if body.email is not None else None)),
        ("phone_number", _normalize_group_text(first_order.phone_number), _normalize_group_text(body.phone_number)),
        ("pickup_location", _normalize_group_text(first_order.pickup_location), _normalize_group_text(body.pickup_location)),
        ("pickup_time_slot", _normalize_group_text(first_order.pickup_time_slot), _normalize_group_text(body.pickup_time_slot)),
        ("pickup_address", _normalize_group_text(getattr(first_order, "pickup_address", None)), _normalize_group_text(getattr(body, "pickup_address", None))),
        ("exclude_email", bool(first_order.exclude_email), bool(body.exclude_email)),
    )
    for field_name, existing_value, incoming_value in shared_fields:
        if existing_value != incoming_value:
            mismatched_fields.append(field_name)

    if mismatched_fields:
        raise HTTPException(
            status_code=400,
            detail=f"group_id must reuse the same bundle details: {', '.join(mismatched_fields)}",
        )


def _reset_group_payment_state(orders: list[Order]) -> None:
    for order in orders:
        order.paid = False
        order.payment_method = None
        order.payment_method_other = None


def _already_confirmed_response(order: Order, group_orders: list[Order]) -> Optional[dict[str, Any]]:
    if not group_orders or not all(group_order.status == OrderStatus.CONFIRMED for group_order in group_orders):
        return None

    return {
        "success": True,
        "order_id": order.id,
        "status": order.status,
        "email_sent": False,
        "email_suppressed": any(group_order.exclude_email for group_order in group_orders),
    }


def _reminder_result(order: Order, *, status: str, message: str) -> dict:
    email = None
    if order.email and str(order.email).strip():
        email = str(order.email).strip()

    return {
        "success": True,
        "order_id": order.id,
        "status": status,
        "message": message,
        "email": email,
        "name": order.name,
        "reminded": bool(order.reminded),
    }


def _prepare_reminder_order_data(
    order: Order,
    db: Session,
    *,
    events_by_id: dict[int, Event],
    active_event_date: str,
    active_etransfer: dict,
) -> tuple[Optional[dict], Optional[dict], list[Order]]:
    group_orders = _get_order_group_rows(db, order)

    if any(group_order.status != OrderStatus.CONFIRMED for group_order in group_orders):
        return _reminder_result(
            order,
            status="skipped_not_confirmed",
            message="Only confirmed orders can be reminded",
        ), None, group_orders

    if all(group_order.reminded for group_order in group_orders):
        return _reminder_result(
            order,
            status="skipped_already_reminded",
            message="Already reminded",
        ), None, group_orders

    if any(group_order.exclude_email for group_order in group_orders):
        return _reminder_result(
            order,
            status="skipped_excluded",
            message="Excluded from email",
        ), None, group_orders

    if not order.email or not str(order.email).strip():
        return _reminder_result(
            order,
            status="skipped_missing_email",
            message="Missing email",
        ), None, group_orders

    address = _resolve_order_pickup_address(db, order)

    event = events_by_id.get(int(order.event_id)) if getattr(order, "event_id", None) is not None else None
    event_date = _resolve_order_email_date(order, event, active_event_date)
    etransfer = {
        "enabled": bool(event.etransfer_enabled) if event else active_etransfer["enabled"],
        "email": event.etransfer_email if event else active_etransfer["email"],
    }

    order_data = _group_email_order_data(orders=group_orders, event=event, address=address)
    order_data["event_date"] = event_date
    order_data["etransfer_enabled"] = etransfer["enabled"]
    order_data["etransfer_email"] = etransfer["email"]

    return None, order_data, group_orders


def _send_order_reminder(
    order: Order,
    db: Session,
    *,
    events_by_id: dict[int, Event],
    active_event_date: str,
    active_etransfer: dict,
) -> dict:
    skipped_result, order_data, group_orders = _prepare_reminder_order_data(
        order,
        db,
        events_by_id=events_by_id,
        active_event_date=active_event_date,
        active_etransfer=active_etransfer,
    )
    if skipped_result is not None:
        return skipped_result

    try:
        send_reminder(order_data)
    except Exception as exc:
        print(f"[email] Failed to send reminder to {order.email}: {exc}")
        return _reminder_result(
            order,
            status="failed",
            message="Failed to send reminder",
        )

    for group_order in group_orders:
        group_order.reminded = True
    return _reminder_result(
        order,
        status="sent",
        message="Reminder sent",
    )


def _prepare_payment_reminder_order_data(
    order: Order,
    db: Session,
    *,
    events_by_id: dict[int, Event],
    active_event_date: str,
    active_etransfer: dict,
) -> tuple[Optional[dict], Optional[dict], list[Order]]:
    group_orders = _get_order_group_rows(db, order)

    if any(group_order.status not in {OrderStatus.CONFIRMED, OrderStatus.PICKED_UP} for group_order in group_orders):
        return _reminder_result(
            order,
            status="skipped_not_confirmed",
            message="Only confirmed or picked up unpaid orders can be reminded",
        ), None, group_orders

    if all(group_order.paid for group_order in group_orders):
        return _reminder_result(
            order,
            status="skipped_paid",
            message="Order is already marked paid",
        ), None, group_orders

    if any(group_order.exclude_email for group_order in group_orders):
        return _reminder_result(
            order,
            status="skipped_excluded",
            message="Excluded from email",
        ), None, group_orders

    if not order.email or not str(order.email).strip():
        return _reminder_result(
            order,
            status="skipped_missing_email",
            message="Missing email",
        ), None, group_orders

    address = _resolve_order_pickup_address(db, order)

    event = events_by_id.get(int(order.event_id)) if getattr(order, "event_id", None) is not None else None
    event_date = _resolve_order_email_date(order, event, active_event_date)
    etransfer = {
        "enabled": bool(event.etransfer_enabled) if event else active_etransfer["enabled"],
        "email": event.etransfer_email if event else active_etransfer["email"],
    }

    order_data = _group_email_order_data(orders=group_orders, event=event, address=address)
    order_data["event_date"] = event_date
    order_data["etransfer_enabled"] = etransfer["enabled"]
    order_data["etransfer_email"] = etransfer["email"]
    order_data["pickup_completed"] = all(group_order.status == OrderStatus.PICKED_UP for group_order in group_orders)

    return None, order_data, group_orders


def _send_order_payment_reminder(
    order: Order,
    db: Session,
    *,
    events_by_id: dict[int, Event],
    active_event_date: str,
    active_etransfer: dict,
) -> dict:
    skipped_result, order_data, _group_orders = _prepare_payment_reminder_order_data(
        order,
        db,
        events_by_id=events_by_id,
        active_event_date=active_event_date,
        active_etransfer=active_etransfer,
    )
    if skipped_result is not None:
        return skipped_result

    try:
        send_payment_reminder(order_data)
    except Exception as exc:
        print(f"[email] Failed to send payment reminder to {order.email}: {exc}")
        return _reminder_result(
            order,
            status="failed",
            message="Failed to send payment reminder",
        )

    return _reminder_result(
        order,
        status="sent",
        message="Payment reminder sent",
    )


def _event_items_for_pricing(db: Session, event: Event) -> list[Item]:
    item_ids = event.item_ids or []
    if not item_ids:
        return []
    return db.query(Item).filter(Item.id.in_(item_ids)).order_by(Item.sort_order).all()


def _event_items_payload(items: list[Item]) -> list[dict[str, Any]]:
    return [
        {
            "id": item.id,
            "name": item.name,
            "description": item.description,
            "price": float(item.price),
            "discounted_price": float(item.discounted_price) if item.discounted_price is not None else None,
            "minimum_order_quantity": max(1, int(getattr(item, "minimum_order_quantity", 1) or 1)),
        }
        for item in items
    ]


def _event_locations_lookup(db: Session, event: Event) -> dict[str, Location]:
    location_ids = event.location_ids or []
    if not location_ids:
        return {}
    locations = db.query(Location).filter(Location.id.in_(location_ids)).all()
    lookup = {location.id: location for location in locations}
    lookup.update({location.name: location for location in locations})
    return lookup


def _validate_order_line_inputs(
    *,
    lines: list[PricingLineInput],
    event_items: list[Item],
) -> dict[str, Item]:
    item_lookup = {item.id: item for item in event_items}
    for line in lines:
        item = item_lookup.get(line.item_id)
        if item is None:
            raise HTTPException(status_code=400, detail="Invalid item_id for event")
        minimum_order_quantity = max(1, int(getattr(item, "minimum_order_quantity", 1) or 1))
        if line.quantity < minimum_order_quantity:
            raise HTTPException(
                status_code=400,
                detail=f"Minimum order quantity for {item.name} is {minimum_order_quantity}",
            )
    return item_lookup


def _validate_random_order_line_inputs(
    *,
    db: Session,
    item_id: str,
    quantity: int,
) -> Item:
    item = db.query(Item).filter(Item.id == item_id).first()
    if item is None:
        raise HTTPException(status_code=400, detail="Invalid item_id for random request")
    if quantity < 1:
        raise HTTPException(status_code=400, detail="Quantity must be at least 1")
    return item


def _validate_order_location(
    *,
    db: Session,
    event: Event,
    pickup_location: str,
    pickup_time_slot: str,
) -> Location:
    location_lookup = _event_locations_lookup(db, event)
    location = location_lookup.get(pickup_location)
    if not location:
        raise HTTPException(status_code=400, detail="Invalid pickup_location")
    if location.id not in (event.location_ids or []):
        raise HTTPException(status_code=400, detail="Invalid pickup_location for event")
    if pickup_time_slot not in (location.time_slots or []):
        raise HTTPException(status_code=400, detail="Invalid pickup_time_slot for location")
    return location


def _quote_event_lines(
    *,
    db: Session,
    event: Event,
    lines: list[PricingLineInput],
) -> dict[str, Any]:
    event_items = _event_items_for_pricing(db, event)
    _validate_order_line_inputs(lines=lines, event_items=event_items)
    try:
        return quote_cart(
            items=_event_items_payload(event_items),
            combo_deals=event.combo_deals or [],
            lines=lines,
            currency=CURRENCY,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


def _get_order_group_rows(db: Session, order: Order) -> list[Order]:
    if order.group_id:
        return db.query(Order).filter(Order.group_id == order.group_id).order_by(Order.created_at.asc(), Order.id.asc()).all()
    return [order]


def _apply_pricing_to_orders(
    *,
    orders: list[Order],
    pricing: dict[str, Any],
    shared_meta: Optional[dict[str, Any]] = None,
) -> None:
    by_line_id = {line["line_id"]: line for line in pricing["lines"]}
    shared_meta = shared_meta or {}
    for order in orders:
        priced_line = by_line_id.get(order.id)
        if priced_line is None:
            continue
        order.item_id = priced_line["item_id"]
        order.item_name = priced_line["item_name"]
        order.quantity = priced_line["quantity"]
        order.base_total_price = priced_line["base_total"]
        order.discount_total = priced_line["discount_total"]
        order.total_price = priced_line["total_price"]
        order.pricing_meta = {
            **shared_meta,
            "base_total": priced_line["base_total"],
            "discount_total": priced_line["discount_total"],
            "applied_combos": pricing["applied_combos"],
        }


def _reprice_order_group(
    *,
    db: Session,
    event: Event,
    orders: list[Order],
) -> dict[str, Any]:
    pricing = _quote_event_lines(
        db=db,
        event=event,
        lines=[
            PricingLineInput(line_id=order.id, item_id=order.item_id, quantity=int(order.quantity))
            for order in orders
        ],
    )
    shared_meta = {"group_id": orders[0].group_id} if orders and orders[0].group_id else {}
    _apply_pricing_to_orders(orders=orders, pricing=pricing, shared_meta=shared_meta)
    return pricing


def _group_email_order_data(
    *,
    orders: list[Order],
    event: Optional[Event],
    address: str,
) -> dict[str, Any]:
    first = orders[0]
    lines = [
        {
            "item_id": order.item_id,
            "item_name": order.item_name,
            "quantity": int(order.quantity),
            "base_total": float(order.base_total_price),
            "discount_total": float(order.discount_total),
            "total_price": float(order.total_price),
        }
        for order in orders
    ]
    subtotal = round(sum(float(order.base_total_price) for order in orders), 2)
    discount_total = round(sum(float(order.discount_total) for order in orders), 2)
    grand_total = round(sum(float(order.total_price) for order in orders), 2)
    return {
        "group_id": first.group_id,
        "name": first.name,
        "email": first.email,
        "phone_number": first.phone_number,
        "pickup_location": first.pickup_location,
        "pickup_time_slot": first.pickup_time_slot,
        "pickup_address": getattr(first, "pickup_address", None),
        "currency": CURRENCY,
        "address": address,
        "event_date": _customer_email_event_date(event),
        "etransfer_enabled": bool(event.etransfer_enabled) if event else False,
        "etransfer_email": event.etransfer_email if event else None,
        "subtotal": subtotal,
        "discount_total": discount_total,
        "total_price": grand_total,
        "items": lines,
    }


@router.post("/orders", status_code=201)
def admin_create_order(
    body: AdminOrderCreate,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    if body.event_id is not None and body.event_id < 1:
        raise HTTPException(status_code=400, detail="Invalid event_id")

    is_random_mode = body.mode == "random"
    event: Optional[Event]
    if is_random_mode:
        event = _require_random_requests_event(db)
    elif body.event_id is not None:
        event = db.query(Event).filter(Event.id == body.event_id).first()
        if event is None:
            raise HTTPException(status_code=404, detail="Event not found")
        if _is_random_requests_event(event):
            raise HTTPException(status_code=400, detail="Random Requests orders must use random mode")
    else:
        event = db.query(Event).filter(Event.is_active == True, Event.kind != RANDOM_REQUESTS_EVENT_KIND).first()
        if event is None:
            raise HTTPException(status_code=400, detail="No active event")

    random_item: Optional[Item] = None
    if is_random_mode:
        random_item = _validate_random_order_line_inputs(
            db=db,
            item_id=body.item_id,
            quantity=body.quantity,
        )
    else:
        _validate_order_location(
            db=db,
            event=event,
            pickup_location=body.pickup_location,
            pickup_time_slot=body.pickup_time_slot,
        )

    existing_group_orders = (
        db.query(Order).filter(Order.group_id == body.group_id).order_by(Order.created_at.asc(), Order.id.asc()).all()
        if body.group_id
        else []
    )
    _validate_group_order_payload(existing_group_orders, body)
    inherited_status = existing_group_orders[0].status if existing_group_orders else OrderStatus.PENDING
    inherited_paid = False
    inherited_payment_method = None
    inherited_payment_method_other = None

    order = Order(
        id=str(uuid.uuid4()),
        event_id=int(event.id),
        group_id=body.group_id,
        name=body.name,
        email=str(body.email) if body.email is not None else None,
        phone_number=body.phone_number,
        item_id=body.item_id,
        item_name=body.item_id,
        quantity=body.quantity,
        pickup_location=body.pickup_location,
        pickup_time_slot=body.pickup_time_slot,
        pickup_address=body.pickup_address,
        pickup_date=body.pickup_date if is_random_mode else getattr(event, "pickup_date", None),
        base_total_price=0,
        discount_total=0,
        total_price=0,
        pricing_meta={},
        status=inherited_status,
        paid=inherited_paid,
        payment_method=inherited_payment_method,
        payment_method_other=inherited_payment_method_other,
        notes=body.notes,
        exclude_email=body.exclude_email,
    )
    db.add(order)
    db.flush()

    if is_random_mode and random_item is not None:
        _apply_manual_pricing(order=order, item=random_item, unit_price=body.unit_price)

    if order.group_id:
        group_orders = db.query(Order).filter(Order.group_id == order.group_id).order_by(Order.created_at.asc(), Order.id.asc()).all()
        if any(int(group_order.event_id) != int(event.id) for group_order in group_orders):
            raise HTTPException(status_code=400, detail="group_id cannot span multiple events")
        _reset_group_payment_state(group_orders)
        if is_random_mode:
            for group_order in group_orders:
                if group_order.id != order.id:
                    continue
                group_order.event_id = int(event.id)
                if random_item is not None:
                    _apply_manual_pricing(order=group_order, item=random_item, unit_price=body.unit_price)
        else:
            _reprice_order_group(db=db, event=event, orders=group_orders)
    else:
        if is_random_mode:
            if random_item is None:
                raise HTTPException(status_code=400, detail="Invalid random order item")
        else:
            pricing = _quote_event_lines(
                db=db,
                event=event,
                lines=[PricingLineInput(line_id=order.id, item_id=order.item_id, quantity=order.quantity)],
            )
            _apply_pricing_to_orders(orders=[order], pricing=pricing)

    sync_customer_from_contact(
        db,
        name=body.name,
        email=str(body.email) if body.email is not None else None,
        phone_number=body.phone_number,
        pickup_location=body.pickup_location,
    )

    db.commit()
    db.refresh(order)

    return _order_dict(order)


@router.get("/orders")
def admin_list_orders(
    status: Optional[str] = Query(None),
    event_id: Optional[int] = Query(None),
    paid: Optional[bool] = Query(None),
    email: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    query = db.query(Order)
    if status:
        query = query.filter(Order.status == status)
    if event_id is not None:
        query = query.filter(Order.event_id == event_id)
    if paid is not None:
        query = query.filter(Order.paid == paid)
    if email is not None:
        query = query.filter(Order.email == email)
    orders = query.order_by(Order.created_at.desc()).all()
    return [_order_dict(o) for o in orders]


@router.post("/orders/remind")
def admin_bulk_remind(
    body: BulkRemindRequest,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    requested_ids = body.order_ids or []
    unique_ids = list(dict.fromkeys(requested_ids))

    orders = (
        db.query(Order).filter(Order.id.in_(unique_ids)).all()
        if unique_ids
        else []
    )
    orders_by_id: dict[str, Order] = {o.id: o for o in orders}
    events_by_id, active_event_date, active_etransfer = _get_reminder_context(db, orders)

    reminded_count = 0
    failed_emails = 0
    skipped_already_reminded = 0
    skipped_excluded = 0
    skipped_missing_email = 0
    processed_groups: set[str] = set()

    for order_id in unique_ids:
        order = orders_by_id.get(order_id)
        if order is None:
            continue
        group_key = order.group_id or order.id
        if group_key in processed_groups:
            continue
        processed_groups.add(group_key)
        result = _send_order_reminder(
            order,
            db,
            events_by_id=events_by_id,
            active_event_date=active_event_date,
            active_etransfer=active_etransfer,
        )
        if result["status"] == "sent":
            reminded_count += 1
        elif result["status"] == "failed":
            failed_emails += 1
        elif result["status"] == "skipped_already_reminded":
            skipped_already_reminded += 1
        elif result["status"] == "skipped_excluded":
            skipped_excluded += 1
        elif result["status"] == "skipped_missing_email":
            skipped_missing_email += 1

    if reminded_count > 0:
        db.commit()
    return {
        "success": True,
        "reminded": reminded_count,
        "failed_emails": failed_emails,
        "skipped_already_reminded": skipped_already_reminded,
        "skipped_excluded": skipped_excluded,
        "skipped_missing_email": skipped_missing_email,
    }


@router.post("/orders/{order_id}/remind")
def admin_send_single_reminder(
    order_id: str,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    events_by_id, active_event_date, active_etransfer = _get_reminder_context(db, [order])
    result = _send_order_reminder(
        order,
        db,
        events_by_id=events_by_id,
        active_event_date=active_event_date,
        active_etransfer=active_etransfer,
    )
    if result["status"] == "sent":
        db.commit()
    return result


@router.post("/orders/{order_id}/payment-remind")
def admin_send_single_payment_reminder(
    order_id: str,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    events_by_id, active_event_date, active_etransfer = _get_reminder_context(db, [order])
    return _send_order_payment_reminder(
        order,
        db,
        events_by_id=events_by_id,
        active_event_date=active_event_date,
        active_etransfer=active_etransfer,
    )


@router.get("/orders/{order_id}")
def admin_get_order(
    order_id: str,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return _order_dict(order)


@router.put("/orders/{order_id}")
def admin_update_order(
    order_id: str,
    body: AdminOrderUpdate,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    event = db.query(Event).filter(Event.id == int(order.event_id)).first() if getattr(order, "event_id", None) is not None else None
    if event is None:
        raise HTTPException(status_code=400, detail="Order is missing event context")

    is_random_mode = _is_random_requests_event(event) or body.mode == "random"
    if body.mode == "random" and not _is_random_requests_event(event):
        raise HTTPException(status_code=400, detail="Random Requests orders can only be edited in the random bucket")

    preserved_manual_unit_price = _existing_manual_unit_price(order)
    random_item: Optional[Item] = None
    if is_random_mode:
        random_item = _validate_random_order_line_inputs(
            db=db,
            item_id=body.item_id,
            quantity=body.quantity,
        )
    else:
        _validate_order_location(
            db=db,
            event=event,
            pickup_location=body.pickup_location,
            pickup_time_slot=body.pickup_time_slot,
        )

    if order.group_id:
        group_orders = _get_order_group_rows(db, order)
        for group_order in group_orders:
            group_order.name = body.name
            group_order.email = str(body.email) if body.email is not None else None
            group_order.phone_number = body.phone_number
            group_order.pickup_location = body.pickup_location
            group_order.pickup_time_slot = body.pickup_time_slot
            group_order.pickup_address = body.pickup_address
            group_order.pickup_date = body.pickup_date if is_random_mode else (getattr(event, "pickup_date", None) or body.pickup_date)
            group_order.notes = body.notes
            group_order.exclude_email = body.exclude_email
            if group_order.id == order.id:
                group_order.item_id = body.item_id
                group_order.quantity = body.quantity
                if is_random_mode and random_item is not None:
                    _apply_manual_pricing(
                        order=group_order,
                        item=random_item,
                        unit_price=body.unit_price if body.unit_price is not None else preserved_manual_unit_price,
                    )
        if is_random_mode:
            for group_order in group_orders:
                if group_order.id != order.id:
                    continue
                group_order.event_id = int(event.id)
        else:
            _reprice_order_group(db=db, event=event, orders=group_orders)
    else:
        order.name = body.name
        order.email = str(body.email) if body.email is not None else None
        order.phone_number = body.phone_number
        order.item_id = body.item_id
        order.quantity = body.quantity
        order.pickup_location = body.pickup_location
        order.pickup_time_slot = body.pickup_time_slot
        order.pickup_address = body.pickup_address
        order.pickup_date = body.pickup_date if is_random_mode else (getattr(event, "pickup_date", None) or body.pickup_date)
        order.notes = body.notes
        order.exclude_email = body.exclude_email
        if is_random_mode:
            if random_item is None:
                raise HTTPException(status_code=400, detail="Invalid random order item")
            _apply_manual_pricing(
                order=order,
                item=random_item,
                unit_price=body.unit_price if body.unit_price is not None else preserved_manual_unit_price,
            )
        else:
            pricing = _quote_event_lines(
                db=db,
                event=event,
                lines=[PricingLineInput(line_id=order.id, item_id=order.item_id, quantity=order.quantity)],
            )
            _apply_pricing_to_orders(orders=[order], pricing=pricing)

    sync_customer_from_contact(
        db,
        name=body.name,
        email=str(body.email) if body.email is not None else None,
        phone_number=body.phone_number,
        pickup_location=body.pickup_location,
    )

    db.commit()
    db.refresh(order)
    return _order_dict(order)


@router.post("/orders/{order_id}/confirm")
def admin_confirm_order(
    order_id: str,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    group_orders = _get_order_group_rows(db, order)
    already_confirmed = _already_confirmed_response(order, group_orders)
    if already_confirmed is not None:
        return already_confirmed
    if any(group_order.status not in {OrderStatus.PENDING, OrderStatus.CONFIRMED} for group_order in group_orders):
        raise HTTPException(status_code=409, detail="Only pending orders can be confirmed")

    email_sent = False
    email_suppressed = any(group_order.exclude_email for group_order in group_orders)

    if not email_suppressed:
        if not order.email or not str(order.email).strip():
            raise HTTPException(
                status_code=400,
                detail="Order email is missing. Set exclude_email=true to confirm without email.",
            )

        event = db.query(Event).filter(Event.id == int(order.event_id)).first() if getattr(order, "event_id", None) is not None else None
        if event is None:
            event = db.query(Event).filter(Event.is_active == True, Event.kind != RANDOM_REQUESTS_EVENT_KIND).first()
        event_date = _resolve_order_email_date(order, event)
        etransfer = {
            "enabled": bool(event.etransfer_enabled) if event else False,
            "email": event.etransfer_email if event else None,
        }

        address = _resolve_order_pickup_address(db, order)

        order_data = _group_email_order_data(orders=group_orders, event=event, address=address)
        order_data["event_date"] = event_date
        order_data["etransfer_enabled"] = etransfer["enabled"]
        order_data["etransfer_email"] = etransfer["email"]

        email_sent = True
        try:
            send_confirmation(order_data)
        except Exception as exc:
            email_sent = False
            print(f"[email] Failed to send confirmation to {order.email}: {exc}")

    for group_order in group_orders:
        group_order.status = OrderStatus.CONFIRMED
    db.commit()

    return {
        "success": True,
        "order_id": order_id,
        "status": order.status,
        "email_sent": email_sent,
        "email_suppressed": email_suppressed,
    }


@router.patch("/orders/{order_id}/status")
def update_order_status(
    order_id: str,
    body: StatusUpdate,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    if body.status not in OrderStatus.ALL:
        raise HTTPException(status_code=400, detail="Invalid status")
    order = db.query(Order).filter(Order.id == order_id).first()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    allowed = ALLOWED_STATUS_TRANSITIONS.get(order.status)
    if allowed is None:
        raise HTTPException(status_code=409, detail="Invalid current status")
    if body.status not in allowed:
        raise HTTPException(status_code=409, detail="Invalid status transition")

    group_orders = _get_order_group_rows(db, order)
    for group_order in group_orders:
        group_order.status = body.status
    db.commit()
    return {"success": True, "status": order.status}


@router.patch("/orders/{order_id}/payment")
def update_order_payment(
    order_id: str,
    body: PaymentUpdate,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    if body.paid and order.status == OrderStatus.PENDING:
        raise HTTPException(status_code=409, detail="Cannot mark as paid while status is pending")

    group_orders = _get_order_group_rows(db, order)
    for group_order in group_orders:
        group_order.paid = body.paid
        group_order.payment_method = body.payment_method
        group_order.payment_method_other = body.payment_method_other
    db.commit()
    return {
        "success": True,
        "paid": bool(order.paid),
        "payment_method": order.payment_method,
        "payment_method_other": order.payment_method_other,
    }


@router.delete("/orders/{order_id}")
def delete_order(
    order_id: str,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    event = db.query(Event).filter(Event.id == int(order.event_id)).first() if getattr(order, "event_id", None) is not None else None
    group_id = order.group_id
    db.delete(order)
    db.flush()
    if group_id and event is not None and not _is_random_requests_event(event):
        remaining_orders = db.query(Order).filter(Order.group_id == group_id).order_by(Order.created_at.asc(), Order.id.asc()).all()
        if remaining_orders:
            _reprice_order_group(db=db, event=event, orders=remaining_orders)
    db.commit()
    return {"success": True}


@router.get("/customers")
def admin_list_customers(
    search: Optional[str] = Query(None),
    pickup_location: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    query = db.query(Customer)

    trimmed_search = search.strip() if search else None
    if trimmed_search:
        like = f"%{trimmed_search}%"
        query = query.filter(
            or_(
                Customer.name.ilike(like),
                Customer.email.ilike(like),
                Customer.phone_number.ilike(like),
            )
        )

    trimmed_pickup_location = pickup_location.strip() if pickup_location else None
    if trimmed_pickup_location:
        query = query.filter(Customer.pickup_locations.contains([trimmed_pickup_location]))

    customers = query.order_by(Customer.updated_at.desc(), Customer.created_at.desc(), Customer.id.desc()).all()
    return [_customer_dict(customer) for customer in customers]


@router.put("/customers/{customer_id}")
def admin_update_customer(
    customer_id: str,
    body: CustomerUpdate,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    try:
        customer = update_customer_from_admin(
            db,
            customer_id=customer_id,
            name=body.name,
            email=str(body.email),
            phone_number=body.phone_number,
        )
        db.commit()
    except CustomerNotFoundError:
        db.rollback()
        raise HTTPException(status_code=404, detail="Customer not found")
    except CustomerEmailConflictError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Customer email already exists")
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Customer email already exists")

    db.refresh(customer)
    return _customer_dict(customer)


@router.post("/customers/{customer_id}/event-reminder")
def admin_send_customer_event_reminder(
    customer_id: str,
    body: CustomerEventReminderRequest,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if customer is None:
        raise HTTPException(status_code=404, detail="Customer not found")

    email = (customer.email or "").strip()
    if not email:
        return {
            "status": "skipped_missing_email",
            "message": "Customer is missing an email address",
        }

    try:
        active_config = get_config_from_db(db)
    except NoActiveEventError:
        raise HTTPException(status_code=400, detail="No active event")

    locations_by_id = {
        str(location.get("id")): location
        for location in active_config.get("locations", [])
        if isinstance(location, dict) and str(location.get("id") or "").strip()
    }
    items_by_id = {
        str(item.get("id")): item
        for item in active_config.get("items", [])
        if isinstance(item, dict) and str(item.get("id") or "").strip()
    }

    invalid_location_ids = [location_id for location_id in body.location_ids if location_id not in locations_by_id]
    if invalid_location_ids:
        raise HTTPException(status_code=400, detail="Selected pickup locations are not part of the active event")

    invalid_item_ids = [item_id for item_id in body.item_ids if item_id not in items_by_id]
    if invalid_item_ids:
        raise HTTPException(status_code=400, detail="Selected items are not part of the active event")

    frontend_base_url = settings.frontend_url.rstrip("/")
    event_id = active_config.get("event", {}).get("id")
    order_query = {"event_id": event_id} if event_id is not None else {}
    feedback_query = {**order_query, "feedback": "event-reminder"}
    order_url = f"{frontend_base_url}/orders"
    if order_query:
        order_url = f"{order_url}?{urlencode(order_query)}"
    feedback_url = f"{frontend_base_url}/orders?{urlencode(feedback_query)}"

    email_data = {
        "name": customer.name,
        "email": email,
        "event_date": str(active_config.get("event", {}).get("date") or ""),
        "pickup_locations": [
            str(locations_by_id[location_id].get("name") or location_id)
            for location_id in body.location_ids
        ],
        "items": [
            str(items_by_id[item_id].get("name") or item_id)
            for item_id in body.item_ids
        ],
        "order_url": order_url,
        "feedback_url": feedback_url,
    }

    try:
        send_event_reminder_email(email_data)
    except Exception as exc:
        print(f"[email] Failed to send event reminder to {email}: {exc}")
        return {
            "status": "failed",
            "message": "Failed to send event reminder",
        }

    return {
        "status": "sent",
        "message": "Event reminder sent",
    }


@router.post("/customers/bulk-delete")
def admin_bulk_delete_customers(
    body: BulkCustomerDeleteRequest,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    deleted = (
        db.query(Customer)
        .filter(Customer.id.in_(body.ids))
        .delete(synchronize_session=False)
    )
    db.commit()
    return {"success": True, "deleted": deleted}


# ---------------------------------------------------------------------------
# Catering request endpoints
# ---------------------------------------------------------------------------

@router.get("/catering-requests")
def admin_list_catering_requests(
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    rows = db.query(CateringRequest).order_by(CateringRequest.created_at.desc()).all()
    comments = (
        db.query(CateringRequestComment)
        .order_by(CateringRequestComment.created_at.desc())
        .all()
    )

    comments_by_request_id: dict[str, list[dict]] = {}
    for comment in comments:
        comments_by_request_id.setdefault(comment.catering_request_id, []).append(
            {
                "id": comment.id,
                "body": comment.body,
                "created_at": comment.created_at.isoformat() if comment.created_at else None,
            }
        )

    items = []
    for row in rows:
        normalized_status = "done" if row.status == "resolved" else row.status
        full_name = " ".join(
            part.strip()
            for part in [row.first_name, row.last_name]
            if part and part.strip()
        ).strip()
        items.append(
            {
                "id": row.id,
                "first_name": row.first_name,
                "last_name": row.last_name,
                "full_name": full_name,
                "email": row.email,
                "phone_number": row.phone_number,
                "event_date": row.event_date,
                "guest_count": row.guest_count,
                "event_type": row.event_type,
                "budget_range": row.budget_range,
                "special_requests": row.special_requests,
                "status": normalized_status,
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "comments": comments_by_request_id.get(row.id, []),
            }
        )

    status_counts = {
        status_key: sum(
            1
            for row in rows
            if ("done" if row.status == "resolved" else row.status) == status_key
        )
        for status_key in ("new", "in_review", "in_progress", "rejected", "done")
    }

    return {
        "total": len(rows),
        "status_counts": status_counts,
        "items": items,
    }


@router.post("/catering-requests/bulk-delete")
def bulk_delete_catering_requests(
    body: CateringRequestBulkDeleteRequest,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    deleted = 0
    if body.ids:
        db.query(CateringRequestComment).filter(
            CateringRequestComment.catering_request_id.in_(body.ids)
        ).delete(synchronize_session=False)
        deleted = db.query(CateringRequest).filter(CateringRequest.id.in_(body.ids)).delete(
            synchronize_session=False
        )
        db.commit()
    return {"success": True, "deleted": deleted}


@router.post("/catering-requests/bulk-status")
def bulk_update_catering_request_status(
    body: CateringRequestBulkStatusRequest,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    if body.status not in CATERING_REQUEST_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    if body.ids:
        db.query(CateringRequest).filter(CateringRequest.id.in_(body.ids)).update(
            {"status": body.status},
            synchronize_session=False,
        )
        db.commit()
    return {"success": True}


@router.delete("/catering-requests/{request_id}")
def delete_catering_request(
    request_id: str,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    catering_request = db.query(CateringRequest).filter(CateringRequest.id == request_id).first()
    if catering_request is None:
        raise HTTPException(status_code=404, detail="Catering request not found")
    db.query(CateringRequestComment).filter(
        CateringRequestComment.catering_request_id == request_id
    ).delete(synchronize_session=False)
    db.delete(catering_request)
    db.commit()
    return {"success": True}


@router.patch("/catering-requests/{request_id}/status")
def update_catering_request_status(
    request_id: str,
    body: CateringRequestStatusUpdate,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    catering_request = db.query(CateringRequest).filter(CateringRequest.id == request_id).first()
    if catering_request is None:
        raise HTTPException(status_code=404, detail="Catering request not found")
    catering_request.status = body.status
    db.commit()
    return {"success": True, "status": catering_request.status}


@router.post("/catering-requests/{request_id}/comments")
def add_catering_request_comment(
    request_id: str,
    body: CateringRequestCommentCreate,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    catering_request = db.query(CateringRequest).filter(CateringRequest.id == request_id).first()
    if catering_request is None:
        raise HTTPException(status_code=404, detail="Catering request not found")

    comment = CateringRequestComment(
        id=str(uuid.uuid4()),
        catering_request_id=request_id,
        body=body.comment,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return {
        "success": True,
        "comment": {
            "id": comment.id,
            "body": comment.body,
            "created_at": comment.created_at.isoformat() if comment.created_at else None,
        },
    }


# ---------------------------------------------------------------------------
# Feedback endpoints
# ---------------------------------------------------------------------------

@router.get("/feedback")
def admin_list_feedback(
    reason: Optional[str] = Query(None),
    origin: Optional[str] = Query(None),
    feedback_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    query = db.query(Feedback).order_by(Feedback.created_at.desc())
    if reason:
        query = query.filter(Feedback.reason == reason)
    if origin:
        query = query.filter(Feedback.origin == origin)
    if feedback_type:
        query = query.filter(Feedback.feedback_type == feedback_type)

    rows = query.all()

    items = [
        {
            "id": row.id,
            "origin": row.origin,
            "origin_label": FEEDBACK_ORIGIN_LABELS.get(row.origin, row.origin),
            "feedback_type": row.feedback_type,
            "feedback_type_label": FEEDBACK_TYPE_LABELS.get(row.feedback_type, row.feedback_type),
            "order_id": row.order_id,
            "name": row.name,
            "contact": row.contact,
            "reason": row.reason,
            "reason_label": FEEDBACK_REASON_LABELS.get(row.reason, row.reason) if row.reason else None,
            "other_details": row.other_details,
            "message": row.message,
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "status": row.status,
            "admin_comment": row.admin_comment,
        }
        for row in rows
    ]

    all_rows = db.query(Feedback).all()
    total = len(all_rows)

    origin_counts = {
        origin_key: sum(1 for row in all_rows if row.origin == origin_key)
        for origin_key in FEEDBACK_ORIGIN_LABELS
    }
    type_counts = {
        feedback_key: sum(1 for row in all_rows if row.feedback_type == feedback_key)
        for feedback_key in FEEDBACK_TYPE_LABELS
    }

    reason_counts: dict[str, int] = {}
    for row in all_rows:
        if row.origin not in {"events_page_non_customer", "event_reminder_email"}:
            continue
        if row.reason:
            reason_counts[row.reason] = reason_counts.get(row.reason, 0) + 1

    pre_order_count = origin_counts["events_page_non_customer"] + origin_counts["event_reminder_email"]
    reason_metrics = [
        {
            "reason": r,
            "label": FEEDBACK_REASON_LABELS.get(r, r),
            "count": reason_counts.get(r, 0),
            "pct": round(reason_counts.get(r, 0) / pre_order_count * 100) if pre_order_count else 0,
        }
        for r in FEEDBACK_REASON_LABELS
    ]

    return {
        "total": total,
        "origin_counts": origin_counts,
        "type_counts": type_counts,
        "reason_metrics": reason_metrics,
        "items": items,
    }


@router.post("/feedback/bulk-delete")
def bulk_delete_feedback(
    body: FeedbackBulkDeleteRequest,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    deleted = 0
    if body.ids:
        deleted = db.query(Feedback).filter(Feedback.id.in_(body.ids)).delete(synchronize_session=False)
        db.commit()
    return {"success": True, "deleted": deleted}


@router.post("/feedback/bulk-status")
def bulk_update_feedback_status(
    body: FeedbackBulkStatusRequest,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    if body.status not in FEEDBACK_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    if body.ids:
        db.query(Feedback).filter(Feedback.id.in_(body.ids)).update(
            {"status": body.status}, synchronize_session=False
        )
        db.commit()
    return {"success": True}


@router.delete("/feedback/{feedback_id}")
def delete_feedback(
    feedback_id: str,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    fb = db.query(Feedback).filter(Feedback.id == feedback_id).first()
    if fb is None:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(fb)
    db.commit()
    return {"success": True}


@router.patch("/feedback/{feedback_id}/status")
def update_feedback_status(
    feedback_id: str,
    body: FeedbackStatusUpdate,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    fb = db.query(Feedback).filter(Feedback.id == feedback_id).first()
    if fb is None:
        raise HTTPException(status_code=404, detail="Not found")
    fb.status = body.status
    db.commit()
    return {"success": True, "status": fb.status}


@router.patch("/feedback/{feedback_id}/comment")
def update_feedback_comment(
    feedback_id: str,
    body: FeedbackCommentUpdate,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    fb = db.query(Feedback).filter(Feedback.id == feedback_id).first()
    if fb is None:
        raise HTTPException(status_code=404, detail="Not found")
    fb.admin_comment = body.admin_comment
    db.commit()
    return {"success": True}
