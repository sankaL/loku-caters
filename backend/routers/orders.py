from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from event_config import (
    CURRENCY,
    NoActiveEventError,
    get_active_event_id_from_db,
    get_item_from_db,
    get_event_date_for_event_id_from_db,
    get_etransfer_config_for_event_id_from_db,
)
from models import Order
from schemas import OrderCreate, OrderResponse

router = APIRouter(prefix="/api/orders", tags=["orders"])


@router.post("", response_model=OrderResponse, status_code=201)
def create_order(order_in: OrderCreate, db: Session = Depends(get_db)):
    try:
        event_id = get_active_event_id_from_db(db)
    except NoActiveEventError:
        raise HTTPException(status_code=404, detail="no_active_event")

    item = get_item_from_db(db, order_in.item_id)
    if item is None:
        raise HTTPException(status_code=400, detail=f"Unknown item: {order_in.item_id}")

    effective_price = float(item.discounted_price) if item.discounted_price is not None else float(item.price)
    total_price = round(order_in.quantity * effective_price, 2)

    order = Order(
        event_id=event_id,
        name=order_in.name,
        item_id=item.id,
        item_name=item.name,
        quantity=order_in.quantity,
        pickup_location=order_in.pickup_location,
        pickup_time_slot=order_in.pickup_time_slot,
        phone_number=order_in.phone_number,
        email=order_in.email,
        total_price=total_price,
    )

    db.add(order)
    db.commit()
    db.refresh(order)

    event_date = get_event_date_for_event_id_from_db(db, event_id)
    etransfer = get_etransfer_config_for_event_id_from_db(db, event_id)
    order_data = {
        "event_id": event_id,
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
        "event_date": event_date,
        "etransfer_enabled": etransfer["enabled"],
        "etransfer_email": etransfer["email"],
    }

    return OrderResponse(
        success=True,
        order_id=str(order.id),
        message="Your pre-order has been placed! We will send a confirmation email once we verify your order.",
        order=order_data,
    )
