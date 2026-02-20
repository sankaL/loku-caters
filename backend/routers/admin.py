from datetime import datetime, timezone
from typing import Optional

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

def verify_admin_token(authorization: str = Header(...)) -> dict:
    """Verify that the request carries a valid Supabase-issued JWT."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")
    token = authorization[len("Bearer "):]
    try:
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )
        return payload
    except JWTError as exc:
        raise HTTPException(status_code=401, detail=f"Invalid token: {exc}")


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class EventConfigUpdate(BaseModel):
    event_date: str
    currency: str
    items: list[dict]
    locations: list[dict]


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
    }

    try:
        send_confirmation(order_data)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to send confirmation email: {exc}",
        )

    order.status = OrderStatus.CONFIRMED
    db.commit()

    return {"success": True, "order_id": order_id, "status": order.status}
