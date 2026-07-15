from datetime import date, datetime, timedelta, timezone
import json
import logging
import socket
from threading import Lock
import time
import uuid
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen
from typing import Any, Optional, Union, Literal
from functools import lru_cache

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response
import jwt
from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator
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
from event_images import (
    get_event_image_catalog,
    resolve_event_image_path,
    validate_event_image_key,
)
from models import (
    CateringRequest,
    CateringRequestComment,
    Customer,
    Event,
    EventPlan,
    Feedback,
    Item,
    Location,
    Order,
)
from schemas import (
    CustomerUpdate,
    EventCreate,
    EventUpdate,
    ItemCreate,
    ItemUpdate,
    LocationCreate,
    LocationUpdate,
    CATERING_REQUEST_STATUSES,
    FEEDBACK_ORIGIN_LABELS,
    FEEDBACK_REASON_LABELS,
    FEEDBACK_STATUSES,
    FEEDBACK_TYPE_LABELS,
    CateringRequestCommentCreate,
    CateringRequestStatusUpdate,
    CustomerEventReminderRequest,
    AdminFeedbackCreate,
    FeedbackStatusUpdate,
    FeedbackCommentUpdate,
    FeedbackReviewVisibilityUpdate,
    normalize_feedback_create,
)
from services.customers import (
    CustomerEmailConflictError,
    CustomerNotFoundError,
    sync_customer_from_contact,
    update_customer_from_admin,
)
from services.email import (
    send_confirmation,
    send_event_reminder_email,
    send_payment_reminder,
    send_reminder,
)
from services.event_plan_pdf import build_event_plan_pdf
from services.event_planning import (
    PLAN_STATUS_ARCHIVED,
    PLAN_STATUS_DRAFT,
    PLAN_STATUS_READY,
    assert_plan_can_mark_ready,
    build_source_order_fingerprint,
    build_event_plan_snapshot,
    duplicate_snapshot,
    make_default_plan_name,
    summarize_snapshot,
    utc_now,
)
from services.pricing import (
    PricingLineInput,
    normalize_combo_deals,
    quote_cart,
    serialize_combo_deals,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])
logger = logging.getLogger(__name__)

_JWKS_REFRESH_INTERVAL_SECONDS = 60
_jwks_refresh_lock = Lock()
_jwks_last_refresh: dict[str, float] = {}
_jwks_failure_until: dict[str, float] = {}
_jwks_last_good: dict[str, dict] = {}


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


@lru_cache(maxsize=8)
def _fetch_jwks(issuer: str) -> dict:
    url = issuer.rstrip("/") + "/.well-known/jwks.json"
    # The issuer is canonical server configuration, never request-controlled input.
    with urlopen(url, timeout=5) as response:  # nosec B310
        return json.loads(response.read().decode("utf-8"))


def _load_jwks(issuer: str) -> dict:
    try:
        jwks = _fetch_jwks(issuer)
    except (
        HTTPError,
        URLError,
        TimeoutError,
        socket.timeout,
        json.JSONDecodeError,
        UnicodeDecodeError,
    ) as exc:
        logger.warning("Supabase JWKS lookup failed: %s", type(exc).__name__)
        raise HTTPException(
            status_code=503,
            detail="Admin authentication is temporarily unavailable",
        ) from exc

    if not isinstance(jwks, dict) or not isinstance(jwks.get("keys"), list):
        logger.warning("Supabase JWKS response had an invalid shape")
        raise HTTPException(
            status_code=503,
            detail="Admin authentication is temporarily unavailable",
        )
    return jwks


def _find_jwk(issuer: str, kid: Optional[str]) -> Optional[dict]:
    now = time.monotonic()
    with _jwks_refresh_lock:
        if _jwks_failure_until.get(issuer, 0.0) > now:
            jwks = _jwks_last_good.get(issuer)
            if jwks is None:
                raise HTTPException(
                    status_code=503,
                    detail="Admin authentication is temporarily unavailable",
                )
        else:
            try:
                jwks = _load_jwks(issuer)
            except HTTPException:
                _jwks_failure_until[issuer] = now + _JWKS_REFRESH_INTERVAL_SECONDS
                jwks = _jwks_last_good.get(issuer)
                if jwks is None:
                    raise
            else:
                _jwks_last_good[issuer] = jwks
                _jwks_failure_until.pop(issuer, None)

        key_data = next(
            (
                key
                for key in jwks["keys"]
                if isinstance(key, dict) and key.get("kid") == kid
            ),
            None,
        )
        if key_data is not None:
            return key_data

        last_refresh = _jwks_last_refresh.get(issuer, 0.0)
        if now - last_refresh < _JWKS_REFRESH_INTERVAL_SECONDS:
            return None

        _jwks_last_refresh[issuer] = now
        _fetch_jwks.cache_clear()
        try:
            jwks = _load_jwks(issuer)
        except HTTPException:
            _jwks_failure_until[issuer] = now + _JWKS_REFRESH_INTERVAL_SECONDS
            return None
        _jwks_last_good[issuer] = jwks
        _jwks_failure_until.pop(issuer, None)
        return next(
            (
                key
                for key in jwks["keys"]
                if isinstance(key, dict) and key.get("kid") == kid
            ),
            None,
        )


def _validate_admin_claims(claims: dict) -> dict:
    if claims.get("role") != "authenticated":
        raise HTTPException(status_code=403, detail="Administrator access required")

    admin_emails = settings.get_admin_email_allowlist()
    token_email = str(claims.get("email") or "").strip().lower()
    if admin_emails and token_email not in admin_emails:
        raise HTTPException(status_code=403, detail="Administrator access required")
    return claims


def verify_admin_token(authorization: Optional[str] = Header(default=None)) -> dict:
    """Verify that the request carries a valid Supabase-issued JWT."""
    if settings.dev_mode:
        return {"sub": "dev-admin", "email": "admin@dev.local", "role": "authenticated"}
    if authorization is None:
        raise HTTPException(status_code=401, detail="Missing Bearer token")
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")
    token = authorization[len("Bearer ") :]
    if not token or token != token.strip():
        raise HTTPException(status_code=401, detail="Invalid Bearer token")

    try:
        try:
            expected_issuer = settings.get_supabase_issuer()
        except ValueError as exc:
            raise HTTPException(
                status_code=503, detail="Admin authentication is not configured"
            ) from exc

        header = jwt.get_unverified_header(token)
        alg = header.get("alg")

        # Legacy/shared-secret projects
        if alg == "HS256":
            if not settings.supabase_jwt_secret:
                raise HTTPException(status_code=401, detail="Server missing JWT secret")
            if len(settings.supabase_jwt_secret.encode("utf-8")) < 32:
                raise HTTPException(
                    status_code=503, detail="Admin authentication is not configured"
                )
            return _validate_admin_claims(
                jwt.decode(
                    token,
                    settings.supabase_jwt_secret,
                    algorithms=["HS256"],
                    issuer=expected_issuer,
                    audience="authenticated",
                )
            )

        # Modern Supabase projects (asymmetric JWT signing)
        if alg in {"RS256", "ES256"}:
            kid = header.get("kid")
            key_data = _find_jwk(expected_issuer, kid)
            if key_data is None:
                raise HTTPException(status_code=401, detail="Invalid token")
            key = jwt.PyJWK.from_dict(key_data).key

            return _validate_admin_claims(
                jwt.decode(
                    token,
                    key,
                    algorithms=[alg],
                    issuer=expected_issuer,
                    audience="authenticated",
                )
            )

        raise HTTPException(status_code=401, detail="Unsupported token algorithm")
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid token") from exc


# ---------------------------------------------------------------------------
# Dev login retained for compatibility with older local frontend sessions.
# ---------------------------------------------------------------------------


@router.post("/dev-login")
def dev_login():
    if not settings.dev_mode:
        raise HTTPException(status_code=404, detail="Not found")
    if not settings.supabase_jwt_secret:
        raise HTTPException(
            status_code=500, detail="SUPABASE_JWT_SECRET is required for dev login"
        )
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


class RestoreStatusAction(BaseModel):
    target_status: Literal[OrderStatus.PICKED_UP, OrderStatus.NO_SHOW]


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
                raise ValueError(
                    "payment_method_other is required when payment_method is other"
                )
            return self

        self.payment_method_other = None
        return self


class BulkCustomerDeleteRequest(BaseModel):
    ids: list[str] = Field(max_length=500)

    @field_validator("ids")
    @classmethod
    def validate_ids(cls, ids: list[str]) -> list[str]:
        cleaned = [str(value).strip() for value in ids if str(value).strip()]
        if not cleaned:
            raise ValueError("ids must contain at least one id")
        return list(dict.fromkeys(cleaned))


ALLOWED_STATUS_TRANSITIONS: dict[str, set[str]] = {
    OrderStatus.PENDING: {
        OrderStatus.PENDING,
        OrderStatus.CONFIRMED,
        OrderStatus.CANCELLED,
    },
    OrderStatus.CONFIRMED: {
        OrderStatus.CONFIRMED,
        OrderStatus.PICKED_UP,
        OrderStatus.NO_SHOW,
        OrderStatus.CANCELLED,
    },
    OrderStatus.PICKED_UP: {
        OrderStatus.PICKED_UP,
        OrderStatus.NO_SHOW,
        OrderStatus.CANCELLED,
    },
    OrderStatus.NO_SHOW: {
        OrderStatus.NO_SHOW,
        OrderStatus.PICKED_UP,
        OrderStatus.CANCELLED,
    },
    OrderStatus.CANCELLED: {
        OrderStatus.CANCELLED,
        OrderStatus.PICKED_UP,
        OrderStatus.NO_SHOW,
    },
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
    order_ids: list[str] = Field(max_length=500)


class FeedbackBulkDeleteRequest(BaseModel):
    ids: list[str] = Field(max_length=500)


class FeedbackBulkStatusRequest(BaseModel):
    ids: list[str] = Field(max_length=500)
    status: str


class CateringRequestBulkDeleteRequest(BaseModel):
    ids: list[str] = Field(max_length=500)


class CateringRequestBulkStatusRequest(BaseModel):
    ids: list[str] = Field(max_length=500)
    status: str


class RandomRequestsConfigUpdate(BaseModel):
    etransfer_enabled: bool
    etransfer_email: Optional[str] = None


class EventPlanCreateRequest(BaseModel):
    source_event_id: int
    name: Optional[str] = None

    @field_validator("name", mode="before")
    @classmethod
    def normalize_name(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        stripped = str(v).strip()
        return stripped or None


class EventPlanSaveRequest(BaseModel):
    expected_updated_at: str
    name: Optional[str] = None
    snapshot: dict

    @field_validator("name", mode="before")
    @classmethod
    def normalize_name(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        stripped = str(v).strip()
        return stripped or None


class EventPlanStateRequest(BaseModel):
    expected_updated_at: str


class EventPlanDuplicateRequest(BaseModel):
    name: Optional[str] = None

    @field_validator("name", mode="before")
    @classmethod
    def normalize_name(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        stripped = str(v).strip()
        return stripped or None


# ---------------------------------------------------------------------------
# Events CRUD
# ---------------------------------------------------------------------------


def _event_dict(
    event: Event, *, total_revenue: float = 0.0, order_count: int = 0
) -> dict:
    normalized_combo_deals = serialize_combo_deals(
        normalize_combo_deals(event.combo_deals or [])
    )
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
    return bool(
        event is not None
        and getattr(event, "kind", "event") == RANDOM_REQUESTS_EVENT_KIND
    )


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
        return (
            pickup_date.strftime("%B ")
            + str(pickup_date.day)
            + _ordinal_suffix(pickup_date.day)
            + pickup_date.strftime(", %Y")
        )
    except (AttributeError, TypeError):
        return str(pickup_date) if pickup_date else ""


def _ordinal_suffix(day: int) -> str:
    if 11 <= day <= 13:
        return "th"
    return {1: "st", 2: "nd", 3: "rd"}.get(day % 10, "th")


def _resolve_order_email_date(
    order: Order, event: Optional[Event], fallback: str = ""
) -> str:
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


# ---------------------------------------------------------------------------
# Event plans
# ---------------------------------------------------------------------------


def _event_plan_dict(
    plan: EventPlan,
    *,
    include_snapshot: bool = False,
    is_out_of_date: Optional[bool] = None,
) -> dict:
    data = {
        "id": plan.id,
        "name": plan.name,
        "source_event_id": plan.source_event_id,
        "source_event_kind": plan.source_event_kind,
        "status": plan.status,
        "included_order_count": int(plan.included_order_count or 0),
        "ordered_quantity": int(plan.ordered_quantity or 0),
        "planned_quantity": int(plan.planned_quantity or 0),
        "issue_count": int(plan.issue_count or 0),
        "warning_count": int(plan.warning_count or 0),
        "created_at": plan.created_at.isoformat() if plan.created_at else None,
        "updated_at": plan.updated_at.isoformat() if plan.updated_at else None,
    }
    source_event = (
        (plan.snapshot or {}).get("source_event")
        if isinstance(plan.snapshot, dict)
        else None
    )
    if source_event:
        data["source_event"] = source_event
    if is_out_of_date is not None:
        data["is_out_of_date"] = is_out_of_date
    if include_snapshot:
        data["snapshot"] = plan.snapshot or {}
    return data


def _require_event_plan(
    db: Session, plan_id: str, *, for_update: bool = False
) -> EventPlan:
    query = db.query(EventPlan).filter(EventPlan.id == plan_id)
    if for_update:
        query = query.with_for_update()
    plan = query.first()
    if plan is None:
        raise HTTPException(status_code=404, detail="Event plan not found")
    return plan


def _require_source_event(db: Session, event_id: int) -> Event:
    event = db.query(Event).filter(Event.id == event_id).first()
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")
    return event


def _source_orders_for_plan(db: Session, event_id: int) -> list[Order]:
    return (
        db.query(Order)
        .filter(Order.event_id == event_id)
        .order_by(Order.created_at.asc(), Order.id.asc())
        .all()
    )


def _source_order_line_dict(order: Order) -> dict:
    return {
        "id": str(order.id),
        "group_id": order.group_id,
        "customer_name": order.name or "",
        "item_id": order.item_id or "",
        "item_name": order.item_name or order.item_id or "",
        "quantity": int(order.quantity or 0),
        "pickup_location": order.pickup_location or "",
        "pickup_time_slot": order.pickup_time_slot or "",
        "pickup_date": order.pickup_date.isoformat()
        if getattr(order, "pickup_date", None) is not None
        else None,
        "status": order.status or OrderStatus.PENDING,
        "updated_at": (order.updated_at or order.created_at).isoformat()
        if (order.updated_at or order.created_at)
        else None,
    }


def _source_fingerprint_for_event(db: Session, event_id: int) -> dict:
    orders = (
        db.query(Order)
        .filter(Order.event_id == event_id, Order.status != OrderStatus.CANCELLED)
        .order_by(Order.created_at.asc(), Order.id.asc())
        .all()
    )
    return build_source_order_fingerprint(
        _source_order_line_dict(order) for order in orders
    )


def _source_fingerprints_for_events(
    db: Session, event_ids: set[int]
) -> dict[int, dict]:
    grouped: dict[int, list[dict]] = {event_id: [] for event_id in event_ids}
    if not event_ids:
        return grouped
    orders = (
        db.query(Order)
        .filter(Order.event_id.in_(event_ids), Order.status != OrderStatus.CANCELLED)
        .order_by(Order.event_id.asc(), Order.created_at.asc(), Order.id.asc())
        .all()
    )
    for order in orders:
        grouped.setdefault(int(order.event_id), []).append(
            _source_order_line_dict(order)
        )
    return {
        event_id: build_source_order_fingerprint(lines)
        for event_id, lines in grouped.items()
    }


def _stored_source_fingerprint(plan: EventPlan) -> Optional[dict]:
    snapshot = plan.snapshot if isinstance(plan.snapshot, dict) else {}
    fingerprint = snapshot.get("source_fingerprint")
    return fingerprint if isinstance(fingerprint, dict) else None


def _apply_event_plan_summary(plan: EventPlan, snapshot: dict) -> None:
    summary = summarize_snapshot(snapshot)
    plan.snapshot = snapshot
    plan.included_order_count = summary["included_order_count"]
    plan.ordered_quantity = summary["ordered_quantity"]
    plan.planned_quantity = summary["planned_quantity"]
    plan.issue_count = summary["issue_count"]
    plan.warning_count = summary["warning_count"]
    plan.updated_at = utc_now()


def _check_event_plan_fresh(plan: EventPlan, expected_updated_at: str) -> None:
    current = plan.updated_at.isoformat() if plan.updated_at else None
    if not expected_updated_at or expected_updated_at != current:
        raise HTTPException(status_code=409, detail="Event plan was updated elsewhere")


def _ensure_event_plan_editable(plan: EventPlan) -> None:
    if plan.status == PLAN_STATUS_ARCHIVED:
        raise HTTPException(
            status_code=409,
            detail="Archived event plans must be restored before editing",
        )


def _validate_event_plan_snapshot(snapshot: dict) -> None:
    if not isinstance(snapshot, dict):
        raise HTTPException(status_code=422, detail="Invalid event plan snapshot")
    if snapshot.get("version") != 1:
        raise HTTPException(
            status_code=422, detail="Unsupported event plan snapshot version"
        )
    source_event = snapshot.get("source_event")
    if not isinstance(source_event, dict) or source_event.get("id") is None:
        raise HTTPException(status_code=422, detail="Snapshot source event is missing")
    if not isinstance(snapshot.get("source_fingerprint"), dict):
        raise HTTPException(
            status_code=422, detail="Snapshot source fingerprint is missing"
        )
    for key in ("bundles", "order_lines", "planned_rows", "issues", "warnings"):
        if not isinstance(snapshot.get(key), list):
            raise HTTPException(
                status_code=422, detail=f"Snapshot {key} must be a list"
            )
    for row in snapshot.get("planned_rows", []):
        if not isinstance(row, dict):
            raise HTTPException(
                status_code=422, detail="Snapshot planned row is invalid"
            )
        if row.get("row_type") not in {"order", "extra"}:
            raise HTTPException(
                status_code=422, detail="Snapshot planned row type is invalid"
            )
        if not str(row.get("id") or "").strip():
            raise HTTPException(
                status_code=422, detail="Snapshot planned row id is missing"
            )
        if row.get("row_state", "active") not in {"active", "removed"}:
            raise HTTPException(
                status_code=422, detail="Snapshot planned row state is invalid"
            )


def _is_event_plan_out_of_date(
    db: Session, plan: EventPlan, *, current_fingerprint: Optional[dict] = None
) -> bool:
    stored = _stored_source_fingerprint(plan)
    if stored is None:
        return True
    current = (
        current_fingerprint
        if current_fingerprint is not None
        else _source_fingerprint_for_event(db, plan.source_event_id)
    )
    return stored != current


def _ensure_event_plan_source_fresh(db: Session, plan: EventPlan) -> None:
    if _is_event_plan_out_of_date(db, plan):
        raise HTTPException(
            status_code=409, detail="Refresh this event plan before continuing"
        )


@router.get("/event-plans")
def admin_list_event_plans(
    include_archived: bool = Query(False),
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    query = db.query(EventPlan)
    if not include_archived:
        query = query.filter(EventPlan.status != PLAN_STATUS_ARCHIVED)
    plans = query.order_by(
        EventPlan.updated_at.desc(), EventPlan.created_at.desc()
    ).all()
    fingerprints = _source_fingerprints_for_events(
        db, {int(plan.source_event_id) for plan in plans}
    )
    return [
        _event_plan_dict(
            plan,
            is_out_of_date=_is_event_plan_out_of_date(
                db,
                plan,
                current_fingerprint=fingerprints.get(int(plan.source_event_id)),
            ),
        )
        for plan in plans
    ]


@router.post("/event-plans", status_code=201)
def admin_create_event_plan(
    body: EventPlanCreateRequest,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    if body.source_event_id < 1:
        raise HTTPException(status_code=400, detail="Invalid source_event_id")
    event = _require_source_event(db, body.source_event_id)
    orders = _source_orders_for_plan(db, event.id)
    snapshot = build_event_plan_snapshot(event, orders)
    plan = EventPlan(
        id=str(uuid.uuid4()),
        name=body.name or make_default_plan_name(event),
        source_event_id=int(event.id),
        source_event_kind=getattr(event, "kind", "event"),
        status=PLAN_STATUS_DRAFT,
        snapshot=snapshot,
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    _apply_event_plan_summary(plan, snapshot)
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return _event_plan_dict(plan, include_snapshot=True, is_out_of_date=False)


@router.get("/event-plans/{plan_id}")
def admin_get_event_plan(
    plan_id: str,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    plan = _require_event_plan(db, plan_id)
    return _event_plan_dict(
        plan, include_snapshot=True, is_out_of_date=_is_event_plan_out_of_date(db, plan)
    )


@router.put("/event-plans/{plan_id}")
def admin_save_event_plan(
    plan_id: str,
    body: EventPlanSaveRequest,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    plan = _require_event_plan(db, plan_id, for_update=True)
    _ensure_event_plan_editable(plan)
    _check_event_plan_fresh(plan, body.expected_updated_at)
    if body.name:
        plan.name = body.name
    snapshot = body.snapshot
    _validate_event_plan_snapshot(snapshot)
    _apply_event_plan_summary(plan, snapshot)
    if plan.status == PLAN_STATUS_READY and plan.issue_count > 0:
        plan.status = PLAN_STATUS_DRAFT
    db.commit()
    db.refresh(plan)
    return _event_plan_dict(
        plan, include_snapshot=True, is_out_of_date=_is_event_plan_out_of_date(db, plan)
    )


@router.post("/event-plans/{plan_id}/refresh")
def admin_refresh_event_plan(
    plan_id: str,
    body: EventPlanStateRequest,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    plan = _require_event_plan(db, plan_id, for_update=True)
    _ensure_event_plan_editable(plan)
    _check_event_plan_fresh(plan, body.expected_updated_at)
    event = _require_source_event(db, plan.source_event_id)
    orders = _source_orders_for_plan(db, event.id)
    snapshot = build_event_plan_snapshot(
        event, orders, previous_snapshot=plan.snapshot or {}
    )
    _apply_event_plan_summary(plan, snapshot)
    plan.status = PLAN_STATUS_DRAFT
    db.commit()
    db.refresh(plan)
    return _event_plan_dict(plan, include_snapshot=True, is_out_of_date=False)


@router.post("/event-plans/{plan_id}/mark-ready")
def admin_mark_event_plan_ready(
    plan_id: str,
    body: EventPlanStateRequest,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    plan = _require_event_plan(db, plan_id, for_update=True)
    _ensure_event_plan_editable(plan)
    _check_event_plan_fresh(plan, body.expected_updated_at)
    _ensure_event_plan_source_fresh(db, plan)
    try:
        assert_plan_can_mark_ready(plan.snapshot or {})
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    plan.status = PLAN_STATUS_READY
    plan.updated_at = utc_now()
    db.commit()
    db.refresh(plan)
    return _event_plan_dict(
        plan, include_snapshot=True, is_out_of_date=_is_event_plan_out_of_date(db, plan)
    )


@router.post("/event-plans/{plan_id}/archive")
def admin_archive_event_plan(
    plan_id: str,
    body: EventPlanStateRequest,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    plan = _require_event_plan(db, plan_id, for_update=True)
    _check_event_plan_fresh(plan, body.expected_updated_at)
    plan.status = PLAN_STATUS_ARCHIVED
    plan.updated_at = utc_now()
    db.commit()
    db.refresh(plan)
    return _event_plan_dict(
        plan, include_snapshot=True, is_out_of_date=_is_event_plan_out_of_date(db, plan)
    )


@router.post("/event-plans/{plan_id}/restore")
def admin_restore_event_plan(
    plan_id: str,
    body: EventPlanStateRequest,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    plan = _require_event_plan(db, plan_id, for_update=True)
    _check_event_plan_fresh(plan, body.expected_updated_at)
    plan.status = PLAN_STATUS_DRAFT
    plan.updated_at = utc_now()
    db.commit()
    db.refresh(plan)
    return _event_plan_dict(
        plan, include_snapshot=True, is_out_of_date=_is_event_plan_out_of_date(db, plan)
    )


@router.post("/event-plans/{plan_id}/duplicate", status_code=201)
def admin_duplicate_event_plan(
    plan_id: str,
    body: EventPlanDuplicateRequest,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    plan = _require_event_plan(db, plan_id)
    snapshot = duplicate_snapshot(plan.snapshot or {})
    duplicate = EventPlan(
        id=str(uuid.uuid4()),
        name=body.name or f"Copy of {plan.name}",
        source_event_id=plan.source_event_id,
        source_event_kind=plan.source_event_kind,
        status=PLAN_STATUS_DRAFT,
        snapshot=snapshot,
        created_at=utc_now(),
        updated_at=utc_now(),
    )
    _apply_event_plan_summary(duplicate, snapshot)
    db.add(duplicate)
    db.commit()
    db.refresh(duplicate)
    return _event_plan_dict(
        duplicate,
        include_snapshot=True,
        is_out_of_date=_is_event_plan_out_of_date(db, duplicate),
    )


@router.get("/event-plans/{plan_id}/pdf")
def admin_export_event_plan_pdf(
    plan_id: str,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    plan = _require_event_plan(db, plan_id)
    snapshot = plan.snapshot or {}
    _ensure_event_plan_source_fresh(db, plan)
    summary = summarize_snapshot(snapshot)
    if summary["issue_count"] > 0:
        raise HTTPException(
            status_code=409, detail="Resolve blocking issues before exporting this plan"
        )
    pdf = build_event_plan_pdf(
        plan_name=plan.name, status=plan.status, snapshot=snapshot
    )
    safe_name = (
        "".join(ch if ch.isalnum() else "-" for ch in plan.name.lower()).strip("-")
        or "event-plan"
    )
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}.pdf"'},
    )


def _normalize_price(value: float) -> float:
    return round(float(value), 2)


def _item_base_unit_price(item: Item) -> float:
    return float(
        item.discounted_price if item.discounted_price is not None else item.price
    )


def _apply_manual_pricing(
    *,
    order: Order,
    item: Item,
    unit_price: Optional[float],
) -> None:
    base_unit_price = _item_base_unit_price(item)
    manual_unit_price = _normalize_price(
        unit_price if unit_price is not None else base_unit_price
    )
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

    location = (
        db.query(Location)
        .filter(
            or_(
                Location.name == order.pickup_location,
                Location.id == order.pickup_location,
            )
        )
        .first()
    )
    if location and getattr(location, "address", None):
        return str(location.address).strip()
    return ""


def _validate_event_images(
    payload: Union[EventCreate, EventUpdate],
) -> tuple[Optional[str], Optional[str]]:
    try:
        tooltip_image_key = validate_event_image_key(
            payload.tooltip_image_key, "tooltip"
        )
        hero_side_image_key = validate_event_image_key(
            payload.hero_side_image_key, "hero_side"
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return tooltip_image_key, hero_side_image_key


def _validate_menu_item_image_key(image_key: Optional[str]) -> Optional[str]:
    try:
        return validate_event_image_key(image_key, "menu_item")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


def _validate_event_combo_deals(
    payload: Union[EventCreate, EventUpdate],
) -> list[dict[str, Any]]:
    try:
        combo_payload = [entry.model_dump(mode="json") for entry in payload.combo_deals]
        normalized = normalize_combo_deals(
            combo_payload, allowed_item_ids=set(payload.item_ids)
        )
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
        etransfer_email=str(body.etransfer_email)
        if body.etransfer_email is not None
        else None,
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
    event.etransfer_email = (
        str(body.etransfer_email) if body.etransfer_email is not None else None
    )
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
        raise HTTPException(
            status_code=400,
            detail="Random Requests is a system event and cannot be edited",
        )
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
    event.etransfer_email = (
        str(body.etransfer_email) if body.etransfer_email is not None else None
    )
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
        raise HTTPException(
            status_code=400,
            detail="Random Requests is a system event and cannot be activated",
        )
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
        raise HTTPException(
            status_code=400,
            detail="Random Requests is a system event and cannot be deactivated",
        )
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
        raise HTTPException(
            status_code=400,
            detail="Random Requests is a system event and cannot be deleted",
        )
    if event.is_active:
        raise HTTPException(status_code=400, detail="Cannot delete the active event")

    existing_orders = db.query(Order).filter(Order.event_id == event_id).count()
    if existing_orders > 0:
        raise HTTPException(
            status_code=400, detail="Cannot delete event with existing orders"
        )
    db.delete(event)
    db.commit()
    return {"success": True}


# ---------------------------------------------------------------------------
# Items CRUD
# ---------------------------------------------------------------------------


def _item_dict(item: Item) -> dict:
    minimum_order_quantity = max(
        1, int(getattr(item, "minimum_order_quantity", 1) or 1)
    )
    image_key = getattr(item, "image_key", None)
    return {
        "id": item.id,
        "name": item.name,
        "description": item.description,
        "price": float(item.price),
        "discounted_price": float(item.discounted_price)
        if item.discounted_price is not None
        else None,
        "minimum_order_quantity": minimum_order_quantity,
        "image_key": image_key,
        "image_path": resolve_event_image_path(image_key),
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
    image_key = _validate_menu_item_image_key(body.image_key)
    max_sort = db.query(func.max(Item.sort_order)).scalar()
    next_sort = (max_sort + 1) if max_sort is not None else 0
    item = Item(
        name=body.name,
        description=body.description,
        price=body.price,
        discounted_price=body.discounted_price,
        minimum_order_quantity=body.minimum_order_quantity
        if body.minimum_order_quantity is not None
        else 1,
        image_key=image_key,
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
    image_key = _validate_menu_item_image_key(body.image_key)
    item.name = body.name
    item.description = body.description
    item.price = body.price
    item.discounted_price = body.discounted_price
    if body.minimum_order_quantity is not None:
        item.minimum_order_quantity = body.minimum_order_quantity
    item.image_key = image_key
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
    return [_location_dict(location) for location in locations]


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
        "event_id": int(order.event_id)
        if getattr(order, "event_id", None) is not None
        else None,
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
        "pickup_date": order.pickup_date.isoformat()
        if getattr(order, "pickup_date", None) is not None
        else None,
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


def _bundle_sort_key(order: Order) -> tuple[datetime, str]:
    created_at = getattr(order, "created_at", None)
    if created_at is None:
        created_at = datetime.min.replace(tzinfo=timezone.utc)
    return created_at, str(order.id)


def _bundle_id_for_order(order: Order) -> str:
    group_id = _normalize_group_text(getattr(order, "group_id", None))
    return group_id if group_id is not None else str(order.id)


def _build_bundle_status_breakdown(orders: list[Order]) -> dict[str, int]:
    breakdown: dict[str, int] = {}
    for order in orders:
        status = str(getattr(order, "status", "") or "").strip()
        if not status:
            continue
        breakdown[status] = breakdown.get(status, 0) + 1
    return breakdown


def _project_order_bundle(orders: list[Order]) -> dict[str, Any]:
    if not orders:
        raise ValueError("orders must not be empty")

    sorted_orders = sorted(orders, key=_bundle_sort_key)
    primary = sorted_orders[0]
    bundle_id = _bundle_id_for_order(primary)
    breakdown = _build_bundle_status_breakdown(sorted_orders)
    unique_statuses = set(breakdown.keys())
    status = sorted(unique_statuses)[0] if len(unique_statuses) == 1 else "mixed"

    normalized_notes = [
        _normalize_group_text(getattr(order, "notes", None)) for order in sorted_orders
    ]
    primary_notes = normalized_notes[0]
    notes_mixed = any(note != primary_notes for note in normalized_notes[1:])

    return {
        "id": primary.id,
        "bundle_id": bundle_id,
        "group_id": primary.group_id,
        "primary_order_id": primary.id,
        "event_id": int(primary.event_id)
        if getattr(primary, "event_id", None) is not None
        else None,
        "name": primary.name,
        "email": primary.email,
        "phone_number": primary.phone_number,
        "pickup_location": primary.pickup_location,
        "pickup_time_slot": primary.pickup_time_slot,
        "pickup_address": getattr(primary, "pickup_address", None),
        "pickup_date": primary.pickup_date.isoformat()
        if getattr(primary, "pickup_date", None) is not None
        else None,
        "line_count": len(sorted_orders),
        "quantity_total": int(
            sum(int(getattr(order, "quantity", 0) or 0) for order in sorted_orders)
        ),
        "base_total_price": round(
            sum(
                float(getattr(order, "base_total_price", 0) or 0)
                for order in sorted_orders
            ),
            2,
        ),
        "discount_total": round(
            sum(
                float(getattr(order, "discount_total", 0) or 0)
                for order in sorted_orders
            ),
            2,
        ),
        "total_price": round(
            sum(
                float(getattr(order, "total_price", 0) or 0) for order in sorted_orders
            ),
            2,
        ),
        "status": status,
        "status_breakdown": breakdown,
        "reminded": all(
            bool(getattr(order, "reminded", False)) for order in sorted_orders
        ),
        "paid": all(bool(getattr(order, "paid", False)) for order in sorted_orders),
        "payment_method": primary.payment_method,
        "payment_method_other": primary.payment_method_other,
        "notes": primary_notes,
        "notes_mixed": notes_mixed,
        "exclude_email": bool(primary.exclude_email),
        "created_at": primary.created_at.isoformat() if primary.created_at else None,
    }


def _orders_to_bundle_rows(orders: list[Order]) -> list[dict[str, Any]]:
    grouped: dict[str, list[Order]] = {}
    for order in orders:
        grouped.setdefault(_bundle_id_for_order(order), []).append(order)

    bundle_rows = [
        _project_order_bundle(group_orders) for group_orders in grouped.values()
    ]
    bundle_rows.sort(
        key=lambda row: (
            row.get("created_at") or "",
            str(row.get("primary_order_id") or ""),
        ),
        reverse=True,
    )
    return bundle_rows


def _find_orders_for_bundle_id(db: Session, bundle_id: str) -> list[Order]:
    grouped = (
        db.query(Order)
        .filter(Order.group_id == bundle_id)
        .order_by(Order.created_at.asc(), Order.id.asc())
        .all()
    )
    if grouped:
        return grouped

    single = db.query(Order).filter(Order.id == bundle_id).first()
    if single is None:
        return []
    return [single]


def _get_reminder_context(
    db: Session, orders: list[Order]
) -> tuple[dict[int, Event], str, dict]:
    event_ids = sorted(
        {int(o.event_id) for o in orders if getattr(o, "event_id", None) is not None}
    )
    events = db.query(Event).filter(Event.id.in_(event_ids)).all() if event_ids else []
    events_by_id: dict[int, Event] = {int(event.id): event for event in events}

    active_event = (
        db.query(Event)
        .filter(Event.is_active.is_(True), Event.kind != RANDOM_REQUESTS_EVENT_KIND)
        .first()
    )
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


def _validate_group_order_payload(
    existing_group_orders: list[Order], body: AdminOrderCreate
) -> None:
    if not existing_group_orders:
        return

    existing_statuses = {order.status for order in existing_group_orders}
    if len(existing_statuses) > 1:
        raise HTTPException(
            status_code=409, detail="Cannot add items to a mixed-status bundle"
        )

    first_order = existing_group_orders[0]
    mismatched_fields: list[str] = []
    shared_fields = (
        (
            "name",
            _normalize_group_text(first_order.name),
            _normalize_group_text(body.name),
        ),
        (
            "email",
            _normalize_group_email(first_order.email),
            _normalize_group_email(str(body.email) if body.email is not None else None),
        ),
        (
            "phone_number",
            _normalize_group_text(first_order.phone_number),
            _normalize_group_text(body.phone_number),
        ),
        (
            "pickup_location",
            _normalize_group_text(first_order.pickup_location),
            _normalize_group_text(body.pickup_location),
        ),
        (
            "pickup_time_slot",
            _normalize_group_text(first_order.pickup_time_slot),
            _normalize_group_text(body.pickup_time_slot),
        ),
        (
            "pickup_address",
            _normalize_group_text(getattr(first_order, "pickup_address", None)),
            _normalize_group_text(getattr(body, "pickup_address", None)),
        ),
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


def _already_confirmed_response(
    order: Order, group_orders: list[Order]
) -> Optional[dict[str, Any]]:
    if not group_orders or not all(
        group_order.status == OrderStatus.CONFIRMED for group_order in group_orders
    ):
        return None

    return {
        "success": True,
        "order_id": order.id,
        "status": order.status,
        "email_sent": False,
        "email_suppressed": any(
            group_order.exclude_email for group_order in group_orders
        ),
    }


def _validate_bundle_status_transition(
    group_orders: list[Order],
    target_status: str,
    *,
    invalid_detail: str = "Invalid status transition",
) -> None:
    if target_status not in OrderStatus.ALL:
        raise HTTPException(status_code=400, detail="Invalid status")
    if not group_orders:
        raise HTTPException(status_code=409, detail="Order bundle is empty")

    for group_order in group_orders:
        allowed = ALLOWED_STATUS_TRANSITIONS.get(group_order.status)
        if allowed is None or target_status not in allowed:
            raise HTTPException(status_code=409, detail=invalid_detail)


def _apply_bundle_status(
    order: Order,
    group_orders: list[Order],
    target_status: str,
    db: Session,
) -> dict[str, Any]:
    for group_order in group_orders:
        group_order.status = target_status
    db.commit()
    return {
        "success": True,
        "order_id": order.id,
        "status": target_status,
    }


def _get_inherited_bundle_status(existing_group_orders: list[Order]) -> str:
    # _validate_group_order_payload must run before this helper so mixed bundles
    # are rejected before a new line inherits the first line's status.
    if not existing_group_orders:
        return OrderStatus.PENDING
    return existing_group_orders[0].status


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
        return (
            _reminder_result(
                order,
                status="skipped_not_confirmed",
                message="Only confirmed orders can be reminded",
            ),
            None,
            group_orders,
        )

    if all(group_order.reminded for group_order in group_orders):
        return (
            _reminder_result(
                order,
                status="skipped_already_reminded",
                message="Already reminded",
            ),
            None,
            group_orders,
        )

    if any(group_order.exclude_email for group_order in group_orders):
        return (
            _reminder_result(
                order,
                status="skipped_excluded",
                message="Excluded from email",
            ),
            None,
            group_orders,
        )

    if not order.email or not str(order.email).strip():
        return (
            _reminder_result(
                order,
                status="skipped_missing_email",
                message="Missing email",
            ),
            None,
            group_orders,
        )

    address = _resolve_order_pickup_address(db, order)

    event = (
        events_by_id.get(int(order.event_id))
        if getattr(order, "event_id", None) is not None
        else None
    )
    event_date = _resolve_order_email_date(order, event, active_event_date)
    etransfer = {
        "enabled": bool(event.etransfer_enabled)
        if event
        else active_etransfer["enabled"],
        "email": event.etransfer_email if event else active_etransfer["email"],
    }

    order_data = _group_email_order_data(
        orders=group_orders, event=event, address=address
    )
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
    except Exception:
        logger.exception("Failed to send pickup reminder")
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

    if any(
        group_order.status not in {OrderStatus.CONFIRMED, OrderStatus.PICKED_UP}
        for group_order in group_orders
    ):
        return (
            _reminder_result(
                order,
                status="skipped_not_confirmed",
                message="Only confirmed or picked up unpaid orders can be reminded",
            ),
            None,
            group_orders,
        )

    if all(group_order.paid for group_order in group_orders):
        return (
            _reminder_result(
                order,
                status="skipped_paid",
                message="Order is already marked paid",
            ),
            None,
            group_orders,
        )

    if any(group_order.exclude_email for group_order in group_orders):
        return (
            _reminder_result(
                order,
                status="skipped_excluded",
                message="Excluded from email",
            ),
            None,
            group_orders,
        )

    if not order.email or not str(order.email).strip():
        return (
            _reminder_result(
                order,
                status="skipped_missing_email",
                message="Missing email",
            ),
            None,
            group_orders,
        )

    address = _resolve_order_pickup_address(db, order)

    event = (
        events_by_id.get(int(order.event_id))
        if getattr(order, "event_id", None) is not None
        else None
    )
    event_date = _resolve_order_email_date(order, event, active_event_date)
    etransfer = {
        "enabled": bool(event.etransfer_enabled)
        if event
        else active_etransfer["enabled"],
        "email": event.etransfer_email if event else active_etransfer["email"],
    }

    order_data = _group_email_order_data(
        orders=group_orders, event=event, address=address
    )
    order_data["event_date"] = event_date
    order_data["etransfer_enabled"] = etransfer["enabled"]
    order_data["etransfer_email"] = etransfer["email"]
    order_data["pickup_completed"] = all(
        group_order.status == OrderStatus.PICKED_UP for group_order in group_orders
    )

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
    except Exception:
        logger.exception("Failed to send payment reminder")
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
            "discounted_price": float(item.discounted_price)
            if item.discounted_price is not None
            else None,
            "minimum_order_quantity": max(
                1, int(getattr(item, "minimum_order_quantity", 1) or 1)
            ),
            "image_key": getattr(item, "image_key", None),
            "image_path": resolve_event_image_path(getattr(item, "image_key", None)),
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
        minimum_order_quantity = max(
            1, int(getattr(item, "minimum_order_quantity", 1) or 1)
        )
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
        raise HTTPException(
            status_code=400, detail="Invalid item_id for random request"
        )
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
        raise HTTPException(
            status_code=400, detail="Invalid pickup_time_slot for location"
        )
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
        return (
            db.query(Order)
            .filter(Order.group_id == order.group_id)
            .order_by(Order.created_at.asc(), Order.id.asc())
            .all()
        )
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
            PricingLineInput(
                line_id=order.id, item_id=order.item_id, quantity=int(order.quantity)
            )
            for order in orders
        ],
    )
    shared_meta = (
        {"group_id": orders[0].group_id} if orders and orders[0].group_id else {}
    )
    _apply_pricing_to_orders(orders=orders, pricing=pricing, shared_meta=shared_meta)
    return pricing


def _group_email_order_data(
    *,
    orders: list[Order],
    event: Optional[Event],
    address: str,
) -> dict[str, Any]:
    first = orders[0]
    has_combo_discounts = False
    has_manual_pricing = False
    for order in orders:
        meta = getattr(order, "pricing_meta", None) or {}
        if not isinstance(meta, dict):
            continue
        applied_combos = meta.get("applied_combos")
        if isinstance(applied_combos, list) and len(applied_combos) > 0:
            has_combo_discounts = True
        if str(meta.get("mode") or "").strip().lower() == "manual":
            has_manual_pricing = True

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
        "has_combo_discounts": has_combo_discounts,
        "has_manual_pricing": has_manual_pricing,
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
            raise HTTPException(
                status_code=400, detail="Random Requests orders must use random mode"
            )
    else:
        event = (
            db.query(Event)
            .filter(Event.is_active.is_(True), Event.kind != RANDOM_REQUESTS_EVENT_KIND)
            .first()
        )
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
        db.query(Order)
        .filter(Order.group_id == body.group_id)
        .order_by(Order.created_at.asc(), Order.id.asc())
        .all()
        if body.group_id
        else []
    )
    _validate_group_order_payload(existing_group_orders, body)
    inherited_status = _get_inherited_bundle_status(existing_group_orders)
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
        pickup_date=body.pickup_date
        if is_random_mode
        else getattr(event, "pickup_date", None),
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
        group_orders = (
            db.query(Order)
            .filter(Order.group_id == order.group_id)
            .order_by(Order.created_at.asc(), Order.id.asc())
            .all()
        )
        if any(
            int(group_order.event_id) != int(event.id) for group_order in group_orders
        ):
            raise HTTPException(
                status_code=400, detail="group_id cannot span multiple events"
            )
        _reset_group_payment_state(group_orders)
        if is_random_mode:
            for group_order in group_orders:
                if group_order.id != order.id:
                    continue
                group_order.event_id = int(event.id)
                if random_item is not None:
                    _apply_manual_pricing(
                        order=group_order, item=random_item, unit_price=body.unit_price
                    )
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
                lines=[
                    PricingLineInput(
                        line_id=order.id, item_id=order.item_id, quantity=order.quantity
                    )
                ],
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
    view: Optional[Literal["bundle"]] = Query(None),
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    if view == "bundle":
        query = db.query(Order)
        if event_id is not None:
            query = query.filter(Order.event_id == event_id)
        if email is not None:
            query = query.filter(Order.email == email)

        bundle_rows = _orders_to_bundle_rows(
            query.order_by(Order.created_at.asc(), Order.id.asc()).all()
        )
        if status:
            bundle_rows = [
                row for row in bundle_rows if str(row.get("status") or "") == status
            ]
        if paid is not None:
            bundle_rows = [
                row for row in bundle_rows if bool(row.get("paid")) == bool(paid)
            ]
        return bundle_rows

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


@router.get("/orders/bundles/{bundle_id}")
def admin_get_order_bundle(
    bundle_id: str,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    orders = _find_orders_for_bundle_id(db, bundle_id)
    if not orders:
        raise HTTPException(status_code=404, detail="Order bundle not found")

    sorted_orders = sorted(orders, key=_bundle_sort_key)
    return {
        "bundle": _project_order_bundle(sorted_orders),
        "lines": [_order_dict(order) for order in sorted_orders],
    }


@router.delete("/orders/bundles/{bundle_id}")
def admin_delete_order_bundle(
    bundle_id: str,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    orders = _find_orders_for_bundle_id(db, bundle_id)
    if not orders:
        raise HTTPException(status_code=404, detail="Order bundle not found")

    try:
        for order in orders:
            db.delete(order)
        db.commit()
    except Exception:
        rollback = getattr(db, "rollback", None)
        if callable(rollback):
            rollback()
        raise

    return {"success": True, "deleted": len(orders), "bundle_id": bundle_id}


@router.post("/orders/remind")
def admin_bulk_remind(
    body: BulkRemindRequest,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    requested_ids = body.order_ids or []
    unique_ids = list(dict.fromkeys(requested_ids))

    orders = (
        db.query(Order).filter(Order.id.in_(unique_ids)).all() if unique_ids else []
    )
    orders_by_id: dict[str, Order] = {o.id: o for o in orders}
    events_by_id, active_event_date, active_etransfer = _get_reminder_context(
        db, orders
    )

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

    events_by_id, active_event_date, active_etransfer = _get_reminder_context(
        db, [order]
    )
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

    events_by_id, active_event_date, active_etransfer = _get_reminder_context(
        db, [order]
    )
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

    event = (
        db.query(Event).filter(Event.id == int(order.event_id)).first()
        if getattr(order, "event_id", None) is not None
        else None
    )
    if event is None:
        raise HTTPException(status_code=400, detail="Order is missing event context")

    is_random_mode = _is_random_requests_event(event) or body.mode == "random"
    if body.mode == "random" and not _is_random_requests_event(event):
        raise HTTPException(
            status_code=400,
            detail="Random Requests orders can only be edited in the random bucket",
        )

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
            group_order.pickup_date = (
                body.pickup_date
                if is_random_mode
                else (getattr(event, "pickup_date", None) or body.pickup_date)
            )
            group_order.notes = body.notes
            group_order.exclude_email = body.exclude_email
            if group_order.id == order.id:
                group_order.item_id = body.item_id
                group_order.quantity = body.quantity
                if is_random_mode and random_item is not None:
                    _apply_manual_pricing(
                        order=group_order,
                        item=random_item,
                        unit_price=body.unit_price
                        if body.unit_price is not None
                        else preserved_manual_unit_price,
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
        order.pickup_date = (
            body.pickup_date
            if is_random_mode
            else (getattr(event, "pickup_date", None) or body.pickup_date)
        )
        order.notes = body.notes
        order.exclude_email = body.exclude_email
        if is_random_mode:
            if random_item is None:
                raise HTTPException(status_code=400, detail="Invalid random order item")
            _apply_manual_pricing(
                order=order,
                item=random_item,
                unit_price=body.unit_price
                if body.unit_price is not None
                else preserved_manual_unit_price,
            )
        else:
            pricing = _quote_event_lines(
                db=db,
                event=event,
                lines=[
                    PricingLineInput(
                        line_id=order.id, item_id=order.item_id, quantity=order.quantity
                    )
                ],
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
    _validate_bundle_status_transition(
        group_orders,
        OrderStatus.CONFIRMED,
        invalid_detail="Only pending orders can be confirmed",
    )

    email_sent = False
    email_suppressed = any(group_order.exclude_email for group_order in group_orders)

    if not email_suppressed:
        if not order.email or not str(order.email).strip():
            raise HTTPException(
                status_code=400,
                detail="Order email is missing. Set exclude_email=true to confirm without email.",
            )

        event = (
            db.query(Event).filter(Event.id == int(order.event_id)).first()
            if getattr(order, "event_id", None) is not None
            else None
        )
        if event is None:
            event = (
                db.query(Event)
                .filter(
                    Event.is_active.is_(True), Event.kind != RANDOM_REQUESTS_EVENT_KIND
                )
                .first()
            )
        event_date = _resolve_order_email_date(order, event)
        etransfer = {
            "enabled": bool(event.etransfer_enabled) if event else False,
            "email": event.etransfer_email if event else None,
        }

        address = _resolve_order_pickup_address(db, order)

        order_data = _group_email_order_data(
            orders=group_orders, event=event, address=address
        )
        order_data["event_date"] = event_date
        order_data["etransfer_enabled"] = etransfer["enabled"]
        order_data["etransfer_email"] = etransfer["email"]

        email_sent = True
        try:
            send_confirmation(order_data)
        except Exception:
            email_sent = False
            logger.exception("Failed to send order confirmation")

    result = _apply_bundle_status(order, group_orders, OrderStatus.CONFIRMED, db)
    result["email_sent"] = email_sent
    result["email_suppressed"] = email_suppressed
    return result


@router.post("/orders/{order_id}/actions/mark-picked-up")
def admin_mark_order_picked_up(
    order_id: str,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    group_orders = _get_order_group_rows(db, order)
    _validate_bundle_status_transition(group_orders, OrderStatus.PICKED_UP)
    return _apply_bundle_status(order, group_orders, OrderStatus.PICKED_UP, db)


@router.post("/orders/{order_id}/actions/mark-no-show")
def admin_mark_order_no_show(
    order_id: str,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    group_orders = _get_order_group_rows(db, order)
    _validate_bundle_status_transition(group_orders, OrderStatus.NO_SHOW)
    return _apply_bundle_status(order, group_orders, OrderStatus.NO_SHOW, db)


@router.post("/orders/{order_id}/actions/cancel")
def admin_cancel_order(
    order_id: str,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    group_orders = _get_order_group_rows(db, order)
    _validate_bundle_status_transition(group_orders, OrderStatus.CANCELLED)
    return _apply_bundle_status(order, group_orders, OrderStatus.CANCELLED, db)


@router.post("/orders/{order_id}/actions/restore")
def admin_restore_order(
    order_id: str,
    body: RestoreStatusAction,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    group_orders = _get_order_group_rows(db, order)
    if any(group_order.status != OrderStatus.CANCELLED for group_order in group_orders):
        raise HTTPException(
            status_code=409, detail="Only cancelled orders can be restored"
        )
    _validate_bundle_status_transition(
        group_orders, body.target_status, invalid_detail="Invalid restore target"
    )
    return _apply_bundle_status(order, group_orders, body.target_status, db)


@router.patch("/orders/{order_id}/status")
def update_order_status(
    order_id: str,
    body: StatusUpdate,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    group_orders = _get_order_group_rows(db, order)
    _validate_bundle_status_transition(group_orders, body.status)
    return _apply_bundle_status(order, group_orders, body.status, db)


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
        raise HTTPException(
            status_code=409, detail="Cannot mark as paid while status is pending"
        )

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
    event = (
        db.query(Event).filter(Event.id == int(order.event_id)).first()
        if getattr(order, "event_id", None) is not None
        else None
    )
    group_id = order.group_id
    db.delete(order)
    db.flush()
    if group_id and event is not None and not _is_random_requests_event(event):
        remaining_orders = (
            db.query(Order)
            .filter(Order.group_id == group_id)
            .order_by(Order.created_at.asc(), Order.id.asc())
            .all()
        )
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
        query = query.filter(
            Customer.pickup_locations.contains([trimmed_pickup_location])
        )

    customers = query.order_by(
        Customer.updated_at.desc(), Customer.created_at.desc(), Customer.id.desc()
    ).all()
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

    invalid_location_ids = [
        location_id
        for location_id in body.location_ids
        if location_id not in locations_by_id
    ]
    if invalid_location_ids:
        raise HTTPException(
            status_code=400,
            detail="Selected pickup locations are not part of the active event",
        )

    invalid_item_ids = [
        item_id for item_id in body.item_ids if item_id not in items_by_id
    ]
    if invalid_item_ids:
        raise HTTPException(
            status_code=400, detail="Selected items are not part of the active event"
        )

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
    except Exception:
        logger.exception("Failed to send customer event reminder")
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
                "created_at": comment.created_at.isoformat()
                if comment.created_at
                else None,
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
        deleted = (
            db.query(CateringRequest)
            .filter(CateringRequest.id.in_(body.ids))
            .delete(synchronize_session=False)
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
    catering_request = (
        db.query(CateringRequest).filter(CateringRequest.id == request_id).first()
    )
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
    catering_request = (
        db.query(CateringRequest).filter(CateringRequest.id == request_id).first()
    )
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
    catering_request = (
        db.query(CateringRequest).filter(CateringRequest.id == request_id).first()
    )
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
            "created_at": comment.created_at.isoformat()
            if comment.created_at
            else None,
        },
    }


# ---------------------------------------------------------------------------
# Feedback endpoints
# ---------------------------------------------------------------------------


def _feedback_dict(row: Feedback) -> dict:
    return {
        "id": row.id,
        "origin": row.origin,
        "origin_label": FEEDBACK_ORIGIN_LABELS.get(row.origin, row.origin),
        "feedback_type": row.feedback_type,
        "feedback_type_label": FEEDBACK_TYPE_LABELS.get(
            row.feedback_type, row.feedback_type
        ),
        "order_id": row.order_id,
        "name": row.name,
        "contact": row.contact,
        "reason": row.reason,
        "reason_label": FEEDBACK_REASON_LABELS.get(row.reason, row.reason)
        if row.reason
        else None,
        "other_details": row.other_details,
        "message": row.message,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "status": row.status,
        "admin_comment": row.admin_comment,
        "rating": row.rating,
        "show_in_reviews": bool(row.show_in_reviews),
    }


@router.post("/feedback", status_code=201)
def admin_create_feedback(
    body: AdminFeedbackCreate,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    payload = body.model_copy(update={"origin": "admin_submission"})
    try:
        normalized = normalize_feedback_create(payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    feedback = Feedback(
        **normalized,
        show_in_reviews=bool(
            body.show_in_reviews and normalized.get("rating") is not None
        ),
    )
    db.add(feedback)
    db.commit()
    db.refresh(feedback)
    return _feedback_dict(feedback)


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

    items = [_feedback_dict(row) for row in rows]

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

    pre_order_count = (
        origin_counts["events_page_non_customer"]
        + origin_counts["event_reminder_email"]
    )
    reason_metrics = [
        {
            "reason": r,
            "label": FEEDBACK_REASON_LABELS.get(r, r),
            "count": reason_counts.get(r, 0),
            "pct": round(reason_counts.get(r, 0) / pre_order_count * 100)
            if pre_order_count
            else 0,
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
        deleted = (
            db.query(Feedback)
            .filter(Feedback.id.in_(body.ids))
            .delete(synchronize_session=False)
        )
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


@router.patch("/feedback/{feedback_id}/show-in-reviews")
def toggle_feedback_show_in_reviews(
    feedback_id: str,
    body: FeedbackReviewVisibilityUpdate,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    fb = db.query(Feedback).filter(Feedback.id == feedback_id).first()
    if fb is None:
        raise HTTPException(status_code=404, detail="Not found")
    fb.show_in_reviews = body.show_in_reviews
    db.commit()
    return {"success": True, "show_in_reviews": bool(fb.show_in_reviews)}
