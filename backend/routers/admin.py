from datetime import datetime, timedelta, timezone
import json
import uuid
from urllib.request import urlopen
from typing import Optional
from functools import lru_cache

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from config import settings
from constants import OrderStatus
from database import get_db
from event_config import CURRENCY, get_event_date_from_db
from models import Event, Feedback, Item, Location, Order
from schemas import EventCreate, EventUpdate, ItemCreate, ItemUpdate, LocationCreate, LocationUpdate
from services.email import send_confirmation, send_reminder

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


class AdminOrderCreate(BaseModel):
    name: str
    email: str
    phone_number: str
    item_id: str
    quantity: int
    pickup_location: str
    pickup_time_slot: str


class BulkRemindRequest(BaseModel):
    order_ids: list[str]


# ---------------------------------------------------------------------------
# Events CRUD
# ---------------------------------------------------------------------------

def _event_dict(event: Event) -> dict:
    return {
        "id": event.id,
        "name": event.name,
        "event_date": event.event_date,
        "hero_header": event.hero_header,
        "hero_subheader": event.hero_subheader,
        "promo_details": event.promo_details,
        "is_active": event.is_active,
        "item_ids": event.item_ids or [],
        "location_ids": event.location_ids or [],
        "updated_at": event.updated_at.isoformat() if event.updated_at else None,
    }


@router.get("/events")
def admin_list_events(
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    events = db.query(Event).order_by(Event.id.desc()).all()
    return [_event_dict(e) for e in events]


@router.post("/events", status_code=201)
def admin_create_event(
    body: EventCreate,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    event = Event(
        name=body.name,
        event_date=body.event_date,
        hero_header=body.hero_header,
        hero_subheader=body.hero_subheader,
        promo_details=body.promo_details,
        is_active=False,
        item_ids=body.item_ids,
        location_ids=body.location_ids,
        updated_at=datetime.now(timezone.utc),
    )
    db.add(event)
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
    event = db.query(Event).filter(Event.id == event_id).first()
    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")
    event.name = body.name
    event.event_date = body.event_date
    event.hero_header = body.hero_header
    event.hero_subheader = body.hero_subheader
    event.promo_details = body.promo_details
    event.item_ids = body.item_ids
    event.location_ids = body.location_ids
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
    db.query(Event).update({"is_active": False})
    event.is_active = True
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
    if event.is_active:
        raise HTTPException(status_code=400, detail="Cannot delete the active event")
    db.delete(event)
    db.commit()
    return {"success": True}


# ---------------------------------------------------------------------------
# Items CRUD
# ---------------------------------------------------------------------------

def _item_dict(item: Item) -> dict:
    return {
        "id": item.id,
        "name": item.name,
        "description": item.description,
        "price": float(item.price),
        "discounted_price": float(item.discounted_price) if item.discounted_price is not None else None,
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

@router.post("/orders", status_code=201)
def admin_create_order(
    body: AdminOrderCreate,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    item = db.query(Item).filter(Item.id == body.item_id).first()
    if not item:
        raise HTTPException(status_code=400, detail="Invalid item_id")
    if body.quantity < 1:
        raise HTTPException(status_code=400, detail="Quantity must be at least 1")

    pickup_location = body.pickup_location.strip()
    pickup_time_slot = body.pickup_time_slot.strip()
    location = db.query(Location).filter(
        or_(Location.name == pickup_location, Location.id == pickup_location)
    ).first()
    if not location:
        raise HTTPException(status_code=400, detail="Invalid pickup_location")
    if pickup_time_slot not in (location.time_slots or []):
        raise HTTPException(status_code=400, detail="Invalid pickup_time_slot for location")

    price = float(item.discounted_price) if item.discounted_price is not None else float(item.price)
    total_price = price * body.quantity

    order = Order(
        id=str(uuid.uuid4()),
        name=body.name.strip(),
        email=body.email.strip(),
        phone_number=body.phone_number.strip(),
        item_id=item.id,
        item_name=item.name,
        quantity=body.quantity,
        pickup_location=pickup_location,
        pickup_time_slot=pickup_time_slot,
        total_price=total_price,
        status=OrderStatus.PENDING,
    )
    db.add(order)
    db.commit()
    db.refresh(order)

    return {
        "id": order.id,
        "name": order.name,
        "email": order.email,
        "phone_number": order.phone_number,
        "item_id": order.item_id,
        "item_name": order.item_name,
        "quantity": order.quantity,
        "pickup_location": order.pickup_location,
        "pickup_time_slot": order.pickup_time_slot,
        "total_price": float(order.total_price),
        "status": order.status,
        "created_at": order.created_at.isoformat() if order.created_at else None,
    }


@router.get("/orders")
def admin_list_orders(
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    query = db.query(Order)
    if status:
        query = query.filter(Order.status == status)
    orders = query.order_by(Order.created_at.desc()).all()
    return [
        {
            "id": o.id,
            "name": o.name,
            "email": o.email,
            "phone_number": o.phone_number,
            "item_id": o.item_id,
            "item_name": o.item_name,
            "quantity": o.quantity,
            "pickup_location": o.pickup_location,
            "pickup_time_slot": o.pickup_time_slot,
            "total_price": float(o.total_price),
            "status": o.status,
            "created_at": o.created_at.isoformat() if o.created_at else None,
        }
        for o in orders
    ]


@router.post("/orders/remind")
def admin_bulk_remind(
    body: BulkRemindRequest,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    event_date = get_event_date_from_db(db)

    reminded_count = 0
    failed_emails = 0

    for order_id in body.order_ids:
        order = db.query(Order).filter(Order.id == order_id).first()
        if order is None:
            continue
        if order.status != OrderStatus.CONFIRMED:
            continue

        location = db.query(Location).filter(
            or_(Location.name == order.pickup_location, Location.id == order.pickup_location)
        ).first()
        address = location.address if location else ""

        effective_price = float(order.total_price) / order.quantity

        order_data = {
            "name": order.name,
            "item_name": order.item_name,
            "quantity": order.quantity,
            "pickup_location": order.pickup_location,
            "pickup_time_slot": order.pickup_time_slot,
            "email": order.email,
            "total_price": float(order.total_price),
            "price_per_item": effective_price,
            "currency": CURRENCY,
            "address": address,
            "event_date": event_date,
        }

        try:
            send_reminder(order_data)
        except Exception as exc:
            failed_emails += 1
            print(f"[email] Failed to send reminder to {order.email}: {exc}")
            continue

        order.status = OrderStatus.REMINDED
        reminded_count += 1

    db.commit()
    return {"success": True, "reminded": reminded_count, "failed_emails": failed_emails}


@router.get("/orders/{order_id}")
def admin_get_order(
    order_id: str,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return {
        "id": order.id,
        "name": order.name,
        "email": order.email,
        "phone_number": order.phone_number,
        "item_id": order.item_id,
        "item_name": order.item_name,
        "quantity": order.quantity,
        "pickup_location": order.pickup_location,
        "pickup_time_slot": order.pickup_time_slot,
        "total_price": float(order.total_price),
        "status": order.status,
        "created_at": order.created_at.isoformat() if order.created_at else None,
    }


@router.post("/orders/{order_id}/confirm")
def admin_confirm_order(
    order_id: str,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status == OrderStatus.CONFIRMED:
        raise HTTPException(status_code=409, detail="Order already confirmed")

    event_date = get_event_date_from_db(db)

    location = db.query(Location).filter(
        or_(Location.name == order.pickup_location, Location.id == order.pickup_location)
    ).first()
    address = location.address if location else ""

    effective_price = float(order.total_price) / order.quantity

    order_data = {
        "name": order.name,
        "item_id": order.item_id,
        "item_name": order.item_name,
        "quantity": order.quantity,
        "pickup_location": order.pickup_location,
        "pickup_time_slot": order.pickup_time_slot,
        "phone_number": order.phone_number,
        "email": order.email,
        "total_price": float(order.total_price),
        "price_per_item": effective_price,
        "currency": CURRENCY,
        "address": address,
        "event_date": event_date,
    }

    email_sent = True
    try:
        send_confirmation(order_data)
    except Exception as exc:
        email_sent = False
        print(f"[email] Failed to send confirmation to {order.email}: {exc}")

    order.status = OrderStatus.CONFIRMED
    db.commit()

    return {
        "success": True,
        "order_id": order_id,
        "status": order.status,
        "email_sent": email_sent,
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
    order.status = body.status
    db.commit()
    return {"success": True, "status": order.status}


@router.delete("/orders/{order_id}")
def delete_order(
    order_id: str,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    db.delete(order)
    db.commit()
    return {"success": True}


# ---------------------------------------------------------------------------
# Feedback endpoints
# ---------------------------------------------------------------------------

FEEDBACK_REASON_LABELS = {
    "price_too_high": "Price too high",
    "location_not_convenient": "Pickup location not convenient",
    "dietary_needs": "Food does not meet dietary needs",
    "not_available": "Not available on the event date",
    "different_menu": "Prefer a different menu item",
    "prefer_delivery": "Prefer delivery over pickup",
    "not_interested": "Not interested at this time",
    "other": "Other",
}


@router.get("/feedback")
def admin_list_feedback(
    reason: Optional[str] = Query(None),
    feedback_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    query = db.query(Feedback).order_by(Feedback.created_at.desc())
    if reason:
        query = query.filter(Feedback.reason == reason)
    if feedback_type:
        query = query.filter(Feedback.feedback_type == feedback_type)

    rows = query.all()

    items = [
        {
            "id": row.id,
            "feedback_type": row.feedback_type,
            "order_id": row.order_id,
            "name": row.name,
            "contact": row.contact,
            "reason": row.reason,
            "reason_label": FEEDBACK_REASON_LABELS.get(row.reason, row.reason) if row.reason else None,
            "other_details": row.other_details,
            "message": row.message,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
        for row in rows
    ]

    # Metrics across all feedback (unfiltered)
    all_rows = db.query(Feedback).all()
    total = len(all_rows)
    customer_count = sum(1 for r in all_rows if r.feedback_type == "customer")
    non_customer_count = total - customer_count

    reason_counts: dict[str, int] = {}
    for row in all_rows:
        if row.reason:
            reason_counts[row.reason] = reason_counts.get(row.reason, 0) + 1

    metrics = [
        {
            "reason": r,
            "label": FEEDBACK_REASON_LABELS.get(r, r),
            "count": reason_counts.get(r, 0),
            "pct": round(reason_counts.get(r, 0) / non_customer_count * 100) if non_customer_count else 0,
        }
        for r in FEEDBACK_REASON_LABELS
    ]

    return {
        "total": total,
        "customer_count": customer_count,
        "non_customer_count": non_customer_count,
        "metrics": metrics,
        "items": items,
    }
