#!/usr/bin/env python3
"""Seed the local dev database with realistic test orders.

Run from the backend/ directory with local env vars set:
    python3 seed.py

The script is idempotent -- it deletes any existing orders before inserting.
"""

import uuid
from datetime import datetime, timezone, timedelta

from database import SessionLocal
from models import Event, Order
from constants import OrderStatus

SEED_ORDERS = [
    # Welland - pending
    {
        "name": "Arjun Patel",
        "email": "arjun.patel@example.com",
        "phone_number": "905-555-0101",
        "item_id": "lamprais-01",
        "item_name": "Lamprais",
        "quantity": 2,
        "pickup_location": "Welland",
        "pickup_time_slot": "11:00 AM - 12:00 PM",
        "total_price": 40.00,
        "status": OrderStatus.PENDING,
        "offset_hours": -2,
    },
    # Welland - confirmed
    {
        "name": "Maya Fernandez",
        "email": "maya.f@example.com",
        "phone_number": "647-555-0202",
        "item_id": "lamprais-01",
        "item_name": "Lamprais",
        "quantity": 1,
        "pickup_location": "Welland",
        "pickup_time_slot": "12:00 PM - 1:00 PM",
        "total_price": 20.00,
        "status": OrderStatus.CONFIRMED,
        "offset_hours": -5,
    },
    # Welland - paid
    {
        "name": "Kai Nguyen",
        "email": "kai.nguyen@example.com",
        "phone_number": "289-555-0303",
        "item_id": "lamprais-01",
        "item_name": "Lamprais",
        "quantity": 3,
        "pickup_location": "Welland",
        "pickup_time_slot": "3:00 PM - 4:00 PM",
        "total_price": 60.00,
        "status": OrderStatus.PAID,
        "offset_hours": -24,
    },
    # Welland - no_show
    {
        "name": "Anika Osei",
        "email": "anika.o@example.com",
        "phone_number": "647-555-0606",
        "item_id": "lamprais-01",
        "item_name": "Lamprais",
        "quantity": 1,
        "pickup_location": "Welland",
        "pickup_time_slot": "5:00 PM - 6:00 PM",
        "total_price": 20.00,
        "status": OrderStatus.NO_SHOW,
        "offset_hours": -48,
    },
    # Welland - confirmed, larger order
    {
        "name": "Ravi Gupta",
        "email": "ravi.g@example.com",
        "phone_number": "416-555-0808",
        "item_id": "lamprais-01",
        "item_name": "Lamprais",
        "quantity": 4,
        "pickup_location": "Welland",
        "pickup_time_slot": "7:00 PM - 8:00 PM",
        "total_price": 80.00,
        "status": OrderStatus.CONFIRMED,
        "offset_hours": -1,
    },
    # Woodbridge - pending
    {
        "name": "Priya Sharma",
        "email": "priya.s@example.com",
        "phone_number": "416-555-0404",
        "item_id": "lamprais-01",
        "item_name": "Lamprais",
        "quantity": 2,
        "pickup_location": "Woodbridge",
        "pickup_time_slot": "12:00 PM - 1:00 PM",
        "total_price": 40.00,
        "status": OrderStatus.PENDING,
        "offset_hours": -3,
    },
    # Woodbridge - picked_up
    {
        "name": "Liam Thompson",
        "email": "liam.t@example.com",
        "phone_number": "905-555-0505",
        "item_id": "lamprais-01",
        "item_name": "Lamprais",
        "quantity": 1,
        "pickup_location": "Woodbridge",
        "pickup_time_slot": "1:00 PM - 2:00 PM",
        "total_price": 20.00,
        "status": OrderStatus.PICKED_UP,
        "offset_hours": -72,
    },
    # Woodbridge - cancelled
    {
        "name": "Daniel Kim",
        "email": "d.kim@example.com",
        "phone_number": "289-555-0707",
        "item_id": "lamprais-01",
        "item_name": "Lamprais",
        "quantity": 2,
        "pickup_location": "Woodbridge",
        "pickup_time_slot": "2:00 PM - 3:00 PM",
        "total_price": 40.00,
        "status": OrderStatus.CANCELLED,
        "offset_hours": -36,
    },
]


def main() -> None:
    db = SessionLocal()
    try:
        active_event = db.query(Event).filter(Event.is_active == True).first()
        if active_event is None:
            raise RuntimeError("No active event found. Create and activate an event before seeding orders.")

        existing = db.query(Order).count()
        if existing > 0:
            print(f"Deleting {existing} existing order(s)...")
            db.query(Order).delete()
            db.commit()

        now = datetime.now(timezone.utc)
        for data in SEED_ORDERS:
            offset_hours = data.get("offset_hours", 0)
            fields = {k: v for k, v in data.items() if k != "offset_hours"}
            fields["event_id"] = int(active_event.id)
            order = Order(
                id=str(uuid.uuid4()),
                created_at=now + timedelta(hours=offset_hours),
                **fields,
            )
            db.add(order)
            print(f"  {data['name']:20s}  {data['pickup_location']:12s}  {data['status']}")

        db.commit()
        print(f"\nSeeded {len(SEED_ORDERS)} orders.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
