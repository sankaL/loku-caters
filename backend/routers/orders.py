from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from event_config import get_currency, get_item
from models import Order
from schemas import OrderCreate, OrderResponse
from services.email import send_confirmation

router = APIRouter(prefix="/api/orders", tags=["orders"])


@router.post("", response_model=OrderResponse, status_code=201)
def create_order(order_in: OrderCreate, db: Session = Depends(get_db)):
    item = get_item(order_in.item_id)
    if item is None:
        raise HTTPException(status_code=400, detail=f"Unknown item: {order_in.item_id}")

    total_price = round(order_in.quantity * item["price"], 2)

    order = Order(
        name=order_in.name,
        item_id=item["id"],
        item_name=item["name"],
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
        "price_per_item": item["price"],
        "currency": get_currency(),
    }

    try:
        send_confirmation(order_data)
    except Exception as exc:
        print(f"[email] Failed to send confirmation to {order.email}: {exc}")

    return OrderResponse(
        success=True,
        order_id=str(order.id),
        message="Your pre-order has been placed! Check your email for confirmation.",
        order=order_data,
    )
