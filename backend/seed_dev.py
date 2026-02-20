"""Seed development orders for local testing.

Usage:
    cd backend
    python seed_dev.py
"""

import uuid
from datetime import datetime, timezone, timedelta

from database import SessionLocal
from models import Order


ORDERS = [
    {
        "name": "Priya Navaratnam",
        "item_id": "lamprais-01",
        "item_name": "Lamprais",
        "quantity": 2,
        "pickup_location": "Woodbridge",
        "pickup_time_slot": "12:00 PM - 1:00 PM",
        "phone_number": "+1 (905) 555-0101",
        "email": "priya.n@example.com",
        "total_price": 40.00,
        "status": "pending",
        "created_at": datetime.now(timezone.utc) - timedelta(hours=3),
    },
    {
        "name": "Rohan De Silva",
        "item_id": "lamprais-01",
        "item_name": "Lamprais",
        "quantity": 4,
        "pickup_location": "Welland",
        "pickup_time_slot": "1:00 PM - 2:00 PM",
        "phone_number": "+1 (289) 555-0202",
        "email": "rohan.ds@example.com",
        "total_price": 80.00,
        "status": "pending",
        "created_at": datetime.now(timezone.utc) - timedelta(hours=5),
    },
    {
        "name": "Anushka Fernando",
        "item_id": "lamprais-01",
        "item_name": "Lamprais",
        "quantity": 1,
        "pickup_location": "Woodbridge",
        "pickup_time_slot": "1:00 PM - 2:00 PM",
        "phone_number": "+1 (647) 555-0303",
        "email": "anushka.f@example.com",
        "total_price": 20.00,
        "status": "confirmed",
        "created_at": datetime.now(timezone.utc) - timedelta(days=1),
    },
    {
        "name": "Chaminda Perera",
        "item_id": "lamprais-01",
        "item_name": "Lamprais",
        "quantity": 3,
        "pickup_location": "Welland",
        "pickup_time_slot": "4:00 PM - 5:00 PM",
        "phone_number": "+1 (905) 555-0404",
        "email": "chaminda.p@example.com",
        "total_price": 60.00,
        "status": "pending",
        "created_at": datetime.now(timezone.utc) - timedelta(hours=1),
    },
    {
        "name": "Malini Wickramasinghe",
        "item_id": "lamprais-01",
        "item_name": "Lamprais",
        "quantity": 2,
        "pickup_location": "Welland",
        "pickup_time_slot": "6:00 PM - 7:00 PM",
        "phone_number": "+1 (416) 555-0505",
        "email": "malini.w@example.com",
        "total_price": 40.00,
        "status": "confirmed",
        "created_at": datetime.now(timezone.utc) - timedelta(days=2),
    },
    {
        "name": "Kasun Rajapaksa",
        "item_id": "lamprais-01",
        "item_name": "Lamprais",
        "quantity": 5,
        "pickup_location": "Woodbridge",
        "pickup_time_slot": "2:00 PM - 3:00 PM",
        "phone_number": "+1 (905) 555-0606",
        "email": "kasun.r@example.com",
        "total_price": 100.00,
        "status": "pending",
        "created_at": datetime.now(timezone.utc) - timedelta(minutes=30),
    },
]


def seed():
    db = SessionLocal()
    try:
        inserted = 0
        for data in ORDERS:
            order = Order(
                id=str(uuid.uuid4()),
                **data,
            )
            db.add(order)
            inserted += 1
        db.commit()
        print(f"Seeded {inserted} orders.")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
