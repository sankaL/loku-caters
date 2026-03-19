import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from event_config import CURRENCY, NoActiveEventError, get_active_event_id_from_db
from models import Event, Item, Location, Order
from schemas import (
    CartPricingResponse,
    OrderCheckoutCreate,
    OrderCheckoutResponse,
    OrderCreate,
    OrderQuoteRequest,
    OrderResponse,
)
from services.customers import sync_customer_from_contact
from services.pricing import PricingLineInput, quote_cart

router = APIRouter(prefix="/api/orders", tags=["orders"])


def _get_active_event(db: Session) -> Event:
    event = db.query(Event).filter(Event.is_active == True).first()
    if event is None:
        raise NoActiveEventError("No active event found in database")
    return event


def _get_event_items(db: Session, event: Event) -> list[Item]:
    item_ids = event.item_ids or []
    if not item_ids:
        return []
    return db.query(Item).filter(Item.id.in_(item_ids)).order_by(Item.sort_order).all()


def _get_event_locations(db: Session, event: Event) -> list[Location]:
    location_ids = event.location_ids or []
    if not location_ids:
        return []
    return db.query(Location).filter(Location.id.in_(location_ids)).order_by(Location.sort_order).all()


def _event_items_as_dict(items: list[Item]) -> list[dict]:
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


def _pricing_lines_from_cart_lines(lines) -> list[PricingLineInput]:
    return [
        PricingLineInput(line_id=f"{line.item_id}:{index}", item_id=line.item_id, quantity=line.quantity)
        for index, line in enumerate(lines)
    ]


def _validate_cart_lines(
    *,
    requested_lines: list[PricingLineInput],
    event_items: list[Item],
) -> None:
    item_lookup = {item.id: item for item in event_items}
    for line in requested_lines:
        item = item_lookup.get(line.item_id)
        if item is None:
            raise HTTPException(status_code=400, detail=f"Unknown item: {line.item_id}")
        minimum_order_quantity = max(1, int(getattr(item, "minimum_order_quantity", 1) or 1))
        if line.quantity < minimum_order_quantity:
            raise HTTPException(
                status_code=400,
                detail=f"Minimum order quantity for {item.name} is {minimum_order_quantity}",
            )


def _validate_location(event: Event, locations: list[Location], pickup_location: str, pickup_time_slot: str) -> Location:
    location_lookup = {location.name: location for location in locations}
    location_lookup.update({location.id: location for location in locations})
    location = location_lookup.get(pickup_location)
    if location is None:
        raise HTTPException(status_code=400, detail="Invalid pickup_location")
    if location.id not in (event.location_ids or []):
        raise HTTPException(status_code=400, detail="Invalid pickup_location for event")
    if pickup_time_slot not in (location.time_slots or []):
        raise HTTPException(status_code=400, detail="Invalid pickup_time_slot for location")
    return location


def _build_checkout_response(
    *,
    group_id: str,
    pricing: dict,
    event: Event,
    location: Location,
    persisted_orders: list[Order],
) -> dict:
    order_by_line_id = {order.item_id: order for order in persisted_orders}
    lines = []
    for line in pricing["lines"]:
        order = order_by_line_id.get(line["item_id"])
        if order is None:
            continue
        lines.append(
            {
                "order_id": str(order.id),
                "item_id": line["item_id"],
                "item_name": line["item_name"],
                "quantity": line["quantity"],
                "unit_price": line["unit_price"],
                "base_total": line["base_total"],
                "discount_total": line["discount_total"],
                "total_price": line["total_price"],
            }
        )

    return {
        "success": True,
        "group_id": group_id,
        "message": "Your pre-order has been placed! We will send a confirmation email once we verify your order.",
        "order": {
            "group_id": group_id,
            "name": persisted_orders[0].name if persisted_orders else "",
            "email": persisted_orders[0].email if persisted_orders else "",
            "phone_number": persisted_orders[0].phone_number if persisted_orders else None,
            "pickup_location": persisted_orders[0].pickup_location if persisted_orders else "",
            "pickup_time_slot": persisted_orders[0].pickup_time_slot if persisted_orders else "",
            "currency": CURRENCY,
            "event_date": event.event_date,
            "etransfer_enabled": bool(event.etransfer_enabled),
            "etransfer_email": event.etransfer_email,
            "location_address": location.address,
            "subtotal": pricing["subtotal"],
            "discount_total": pricing["discount_total"],
            "total_price": pricing["grand_total"],
            "applied_combos": pricing["applied_combos"],
            "lines": lines,
        },
    }


def _legacy_order_response(order: Order, *, event: Event) -> OrderResponse:
    effective_price = float(order.total_price) / order.quantity if order.quantity else 0.0
    return OrderResponse(
        success=True,
        order_id=str(order.id),
        message="Your pre-order has been placed! We will send a confirmation email once we verify your order.",
        order={
            "group_id": order.group_id,
            "name": order.name,
            "item_id": order.item_id,
            "item_name": order.item_name,
            "quantity": order.quantity,
            "pickup_location": order.pickup_location,
            "pickup_time_slot": order.pickup_time_slot,
            "phone_number": order.phone_number,
            "email": order.email,
            "base_total": float(order.base_total_price),
            "discount_total": float(order.discount_total),
            "total_price": float(order.total_price),
            "price_per_item": effective_price,
            "currency": CURRENCY,
            "event_date": event.event_date,
            "etransfer_enabled": bool(event.etransfer_enabled),
            "etransfer_email": event.etransfer_email,
        },
    )


@router.post("/quote", response_model=CartPricingResponse)
def quote_order_cart(order_in: OrderQuoteRequest, db: Session = Depends(get_db)):
    try:
        event = _get_active_event(db)
    except NoActiveEventError:
        raise HTTPException(status_code=404, detail="no_active_event")

    event_items = _get_event_items(db, event)
    pricing_lines = _pricing_lines_from_cart_lines(order_in.lines)
    _validate_cart_lines(requested_lines=pricing_lines, event_items=event_items)

    try:
        pricing = quote_cart(
            items=_event_items_as_dict(event_items),
            combo_deals=event.combo_deals or [],
            lines=pricing_lines,
            currency=CURRENCY,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return CartPricingResponse(**pricing)


@router.post("/checkout", response_model=OrderCheckoutResponse, status_code=201)
def checkout_order(order_in: OrderCheckoutCreate, db: Session = Depends(get_db)):
    try:
        event = _get_active_event(db)
    except NoActiveEventError:
        raise HTTPException(status_code=404, detail="no_active_event")

    event_items = _get_event_items(db, event)
    pricing_lines = _pricing_lines_from_cart_lines(order_in.lines)
    _validate_cart_lines(requested_lines=pricing_lines, event_items=event_items)

    event_locations = _get_event_locations(db, event)
    location = _validate_location(event, event_locations, order_in.pickup_location, order_in.pickup_time_slot)

    try:
        pricing = quote_cart(
            items=_event_items_as_dict(event_items),
            combo_deals=event.combo_deals or [],
            lines=pricing_lines,
            currency=CURRENCY,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    group_id = str(uuid.uuid4())
    persisted_orders: list[Order] = []
    for line in pricing["lines"]:
        order = Order(
            id=str(uuid.uuid4()),
            event_id=int(event.id),
            group_id=group_id,
            name=order_in.name,
            item_id=line["item_id"],
            item_name=line["item_name"],
            quantity=line["quantity"],
            pickup_location=order_in.pickup_location,
            pickup_time_slot=order_in.pickup_time_slot,
            phone_number=order_in.phone_number,
            email=str(order_in.email),
            base_total_price=line["base_total"],
            discount_total=line["discount_total"],
            total_price=line["total_price"],
            pricing_meta={
                "group_id": group_id,
                "base_total": line["base_total"],
                "discount_total": line["discount_total"],
                "applied_combos": pricing["applied_combos"],
            },
        )
        db.add(order)
        persisted_orders.append(order)

    sync_customer_from_contact(
        db,
        name=order_in.name,
        email=str(order_in.email),
        phone_number=order_in.phone_number,
        pickup_location=order_in.pickup_location,
    )

    db.commit()
    for order in persisted_orders:
        db.refresh(order)

    return OrderCheckoutResponse(
        **_build_checkout_response(
            group_id=group_id,
            pricing=pricing,
            event=event,
            location=location,
            persisted_orders=persisted_orders,
        )
    )


@router.post("", response_model=OrderResponse, status_code=201)
def create_order(order_in: OrderCreate, db: Session = Depends(get_db)):
    try:
        event_id = get_active_event_id_from_db(db)
    except NoActiveEventError:
        raise HTTPException(status_code=404, detail="no_active_event")

    event = db.query(Event).filter(Event.id == event_id).first()
    if event is None:
        raise HTTPException(status_code=404, detail="no_active_event")

    event_items = _get_event_items(db, event)
    pricing_lines = [PricingLineInput(line_id=order_in.item_id, item_id=order_in.item_id, quantity=order_in.quantity)]
    _validate_cart_lines(requested_lines=pricing_lines, event_items=event_items)

    event_locations = _get_event_locations(db, event)
    _validate_location(event, event_locations, order_in.pickup_location, order_in.pickup_time_slot)

    try:
        pricing = quote_cart(
            items=_event_items_as_dict(event_items),
            combo_deals=[],
            lines=pricing_lines,
            currency=CURRENCY,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    priced_line = pricing["lines"][0]
    order = Order(
        event_id=event_id,
        name=order_in.name,
        item_id=priced_line["item_id"],
        item_name=priced_line["item_name"],
        quantity=priced_line["quantity"],
        pickup_location=order_in.pickup_location,
        pickup_time_slot=order_in.pickup_time_slot,
        phone_number=order_in.phone_number,
        email=str(order_in.email),
        base_total_price=priced_line["base_total"],
        discount_total=priced_line["discount_total"],
        total_price=priced_line["total_price"],
        pricing_meta={"applied_combos": []},
    )

    db.add(order)
    sync_customer_from_contact(
        db,
        name=order_in.name,
        email=str(order_in.email),
        phone_number=order_in.phone_number,
        pickup_location=order_in.pickup_location,
    )
    db.commit()
    db.refresh(order)

    return _legacy_order_response(order, event=event)
