from datetime import datetime, timedelta, timezone
import json
import uuid
from urllib.request import urlopen
from typing import Optional
from functools import lru_cache

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy.orm import Session

from config import settings
from constants import OrderStatus
from database import get_db
from event_config import get_config_from_db
from models import EventConfig, Order
from services.email import send_confirmation

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
# Schemas
# ---------------------------------------------------------------------------

class EventConfigUpdate(BaseModel):
    event_date: str
    currency: str
    items: list[dict]
    locations: list[dict]


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


# ---------------------------------------------------------------------------
# Config endpoints
# ---------------------------------------------------------------------------

@router.get("/config")
def admin_get_config(
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    return get_config_from_db(db)


@router.put("/config")
def admin_update_config(
    body: EventConfigUpdate,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    row = db.query(EventConfig).filter(EventConfig.id == 1).first()
    if row is None:
        row = EventConfig(id=1)
        db.add(row)

    row.event_date = body.event_date
    row.currency = body.currency
    row.items = body.items
    row.locations = body.locations
    row.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(row)
    return {"success": True, "updated_at": row.updated_at}


# ---------------------------------------------------------------------------
# Order endpoints
# ---------------------------------------------------------------------------

@router.post("/orders", status_code=201)
def admin_create_order(
    body: AdminOrderCreate,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    config = get_config_from_db(db)
    item = next((i for i in config.get("items", []) if i["id"] == body.item_id), None)
    if not item:
        raise HTTPException(status_code=400, detail="Invalid item_id")
    if body.quantity < 1:
        raise HTTPException(status_code=400, detail="Quantity must be at least 1")

    pickup_location = body.pickup_location.strip()
    pickup_time_slot = body.pickup_time_slot.strip()
    location = next(
        (
            loc
            for loc in config.get("locations", [])
            if loc.get("name") == pickup_location or loc.get("id") == pickup_location
        ),
        None,
    )
    if not location:
        raise HTTPException(status_code=400, detail="Invalid pickup_location")
    if pickup_time_slot not in location.get("timeSlots", []):
        raise HTTPException(status_code=400, detail="Invalid pickup_time_slot for location")

    price = item.get("discounted_price") or item["price"]
    total_price = price * body.quantity

    order = Order(
        id=str(uuid.uuid4()),
        name=body.name.strip(),
        email=body.email.strip(),
        phone_number=body.phone_number.strip(),
        item_id=body.item_id,
        item_name=item["name"],
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

    config = get_config_from_db(db)
    address = ""
    for loc in config.get("locations", []):
        if loc.get("name") == order.pickup_location or loc.get("id") == order.pickup_location:
            address = loc.get("address", "")
            break

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
        "currency": config.get("currency", "CAD"),
        "address": address,
        "event_date": config["event"]["date"],
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
