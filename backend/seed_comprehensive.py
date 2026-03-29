#!/usr/bin/env python3
"""Comprehensive seed script for local dev database.

Seeds:
- 6 menu items
- 6 pickup locations
- 3 events (with items and locations linked)
- 30 orders per event (90 total)
- Customers from orders
- 30 feedback entries
- 30 catering requests

Run from the backend/ directory with local env vars set:
    python3 seed_comprehensive.py

The script is idempotent -- it clears existing data before inserting.
"""

import uuid
import random
from datetime import datetime, timezone, timedelta, date
from faker import Faker

from database import SessionLocal
from constants import OrderStatus
from models import Item, Location, Event, Order, Customer, Feedback, CateringRequest

fake = Faker()

# ---------------------------------------------------------------------------
# Reference data
# ---------------------------------------------------------------------------

ITEM_DATA = [
    {"name": "Lamprais", "description": "Traditional Dutch-influenced Sri Lankan rice and curry dish baked in a banana leaf", "price": 20.00, "discounted_price": None, "minimum_order_quantity": 1},
    {"name": "Chicken Biryani", "description": "Aromatic basmati rice layered with spiced chicken and fried onions", "price": 18.00, "discounted_price": 15.00, "minimum_order_quantity": 1},
    {"name": "Fish Curry", "description": "Fresh tilapia in a rich Sri Lankan coconut curry with curry leaves", "price": 16.00, "discounted_price": None, "minimum_order_quantity": 1},
    {"name": "Dhal Curry", "description": "Creamy red lentil curry tempered with mustard seeds and curry leaves", "price": 8.00, "discounted_price": None, "minimum_order_quantity": 1},
    {"name": "Pol Sambol", "description": "Spicy coconut relish with red onions, chili, and lime", "price": 6.00, "discounted_price": None, "minimum_order_quantity": 1},
    {"name": "Watalappan", "description": "Traditional coconut custard pudding with cardamom and jaggery", "price": 7.00, "discounted_price": None, "minimum_order_quantity": 1},
]

LOCATION_DATA = [
    {"name": "Welland", "address": "123 King Street, Welland, ON", "time_slots": ["11:00 AM - 12:00 PM", "12:00 PM - 1:00 PM", "1:00 PM - 2:00 PM"]},
    {"name": "Woodbridge", "address": "456 Weston Road, Woodbridge, ON", "time_slots": ["12:00 PM - 1:00 PM", "1:00 PM - 2:00 PM", "2:00 PM - 3:00 PM"]},
    {"name": "Scarborough", "address": "789 Kennedy Road, Scarborough, ON", "time_slots": ["11:30 AM - 12:30 PM", "12:30 PM - 1:30 PM", "1:30 PM - 2:30 PM"]},
    {"name": "Mississauga", "address": "321 Hurontario Street, Mississauga, ON", "time_slots": ["12:00 PM - 1:00 PM", "1:00 PM - 2:00 PM", "2:00 PM - 3:00 PM"]},
    {"name": "North York", "address": "654 Yonge Street, North York, ON", "time_slots": ["11:00 AM - 12:00 PM", "12:00 PM - 1:00 PM", "1:00 PM - 2:00 PM"]},
    {"name": "Brampton", "address": "987 Main Street North, Brampton, ON", "time_slots": ["12:30 PM - 1:30 PM", "1:30 PM - 2:30 PM", "2:30 PM - 3:30 PM"]},
]

EVENT_DATA = [
    {
        "name": "March 2026 Batch",
        "event_date": "March 28th, 2026",
        "pickup_date": "2026-03-28",
        "hero_header": "March Batch Pre-Order",
        "hero_header_sage": "Now Open",
        "hero_subheader": "Authentic Sri Lankan Lamprais made fresh for you",
        "promo_details": "Order by March 21st to secure your Lamprais!",
        "is_active": True,
    },
    {
        "name": "April 2026 Batch",
        "event_date": "April 25th, 2026",
        "pickup_date": "2026-04-25",
        "hero_header": "April Batch Pre-Order",
        "hero_header_sage": "Limited Spots",
        "hero_subheader": "Traditional recipes passed down through generations",
        "promo_details": "Early bird pricing on selected items!",
        "is_active": False,
    },
    {
        "name": "May 2026 Batch",
        "event_date": "May 30th, 2026",
        "pickup_date": "2026-05-30",
        "hero_header": "May Batch Pre-Order",
        "hero_header_sage": "New Menu Items",
        "hero_subheader": "Experience the authentic taste of Sri Lankan cuisine",
        "promo_details": "Try our new Fish Curry this month!",
        "is_active": False,
    },
]

FEEDBACK_ORIGINS = ["contact_us", "events_page_non_customer", "events_page_customer"]
FEEDBACK_TYPES = ["general_question", "feedback", "collaboration", "other"]
FEEDBACK_REASONS = ["price_too_high", "location_not_convenient", "dietary_needs", "not_available", "different_menu", "prefer_delivery", "not_interested", "other"]
FEEDBACK_STATUSES = ["new", "in_progress", "resolved"]

CATERING_EVENT_TYPES = ["wedding", "corporate", "birthday", "anniversary", "religious", "cultural", "other"]
CATERING_BUDGET_RANGES = ["under_500", "500_to_1000", "1000_to_2500", "2500_to_5000", "over_5000"]
CATERING_STATUSES = ["new", "in_review", "in_progress", "rejected", "done"]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def clear_all_tables(db):
    """Clear all data from tables in correct order (respecting dependencies)."""
    print("Clearing existing data...")
    db.query(CateringRequest).delete()
    db.query(Feedback).delete()
    db.query(Order).delete()
    db.query(Customer).delete()
    db.query(Event).delete()
    db.query(Location).delete()
    db.query(Item).delete()
    db.commit()
    print("  All tables cleared.")


def seed_items(db):
    """Seed 6 menu items."""
    print("Seeding items...")
    items = []
    for i, data in enumerate(ITEM_DATA):
        item = Item(
            id=str(uuid.uuid4()),
            name=data["name"],
            description=data["description"],
            price=data["price"],
            discounted_price=data["discounted_price"],
            minimum_order_quantity=data["minimum_order_quantity"],
            sort_order=i,
        )
        db.add(item)
        items.append(item)
    db.commit()
    print(f"  Created {len(items)} items.")
    return items


def seed_locations(db):
    """Seed 6 pickup locations."""
    print("Seeding locations...")
    locations = []
    for i, data in enumerate(LOCATION_DATA):
        location = Location(
            id=str(uuid.uuid4()),
            name=data["name"],
            address=data["address"],
            time_slots=data["time_slots"],
            sort_order=i,
        )
        db.add(location)
        locations.append(location)
    db.commit()
    print(f"  Created {len(locations)} locations.")
    return locations


def seed_events(db, items, locations):
    """Seed 3 events with items and locations linked, plus the Random Requests system event."""
    print("Seeding events...")
    events = []
    for i, data in enumerate(EVENT_DATA):
        event = Event(
            name=data["name"],
            event_date=data["event_date"],
            pickup_date=date.fromisoformat(data["pickup_date"]) if data["pickup_date"] else None,
            kind="event",
            hero_header=data["hero_header"],
            hero_header_sage=data["hero_header_sage"],
            hero_subheader=data["hero_subheader"],
            promo_details=data["promo_details"],
            tooltip_enabled=False,
            etransfer_enabled=False,
            is_active=data["is_active"],
            item_ids=[item.id for item in items],
            location_ids=[loc.id for loc in locations],
            combo_deals=[],
            updated_at=datetime.now(timezone.utc),
        )
        db.add(event)
        events.append(event)
    
    # Create the Random Requests system event (used for manual/admin orders)
    random_requests_event = Event(
        name="Random Requests",
        event_date="",
        kind="random_requests",
        hero_header="",
        hero_header_sage="",
        hero_subheader="",
        promo_details=None,
        tooltip_enabled=False,
        etransfer_enabled=True,
        etransfer_email="orders@lokucaters.com",
        is_active=False,
        item_ids=[item.id for item in items],
        location_ids=[loc.id for loc in locations],
        combo_deals=[],
        updated_at=datetime.now(timezone.utc),
    )
    db.add(random_requests_event)
    events.append(random_requests_event)
    
    db.commit()
    print(f"  Created {len(events)} events (including Random Requests system event).")
    return events


def generate_orders_for_event(db, event, items, locations, count=30):
    """Generate orders for a specific event.
    
    About half of the orders are multi-item "cart" orders with a shared group_id.
    The rest are single-item orders.
    """
    orders = []
    statuses = [OrderStatus.PENDING, OrderStatus.CONFIRMED, OrderStatus.CONFIRMED, OrderStatus.CONFIRMED, OrderStatus.PICKED_UP, OrderStatus.NO_SHOW, OrderStatus.CANCELLED]
    
    # Vary creation times over the past 2 weeks
    base_offset_hours = random.randint(0, 168)  # base offset for this batch of orders
    
    for i in range(count):
        location = random.choice(locations)
        time_slot = random.choice(location.time_slots)
        
        # Vary creation times within the past 2 weeks
        offset_hours = base_offset_hours + random.randint(0, 168)
        created_at = datetime.now(timezone.utc) - timedelta(hours=offset_hours)
        
        status = random.choice(statuses)
        paid = status in [OrderStatus.CONFIRMED, OrderStatus.PICKED_UP] and random.choice([True, False])
        
        name = fake.name()
        email = fake.email()
        phone = fake.phone_number()
        
        # Decide if this is a multi-item order (about 50%)
        is_multi_item = random.random() < 0.5
        
        if is_multi_item:
            # Multi-item cart order - 2 to 4 items
            num_items_in_cart = random.randint(2, 4)
            group_id = str(uuid.uuid4())
            cart_items = random.sample(items, num_items_in_cart)
            
            for cart_item in cart_items:
                quantity = random.randint(1, 3)
                base_price = float(cart_item.discounted_price) if cart_item.discounted_price else float(cart_item.price)
                line_total = base_price * quantity
                
                order = Order(
                    id=str(uuid.uuid4()),
                    event_id=event.id,
                    name=name,
                    item_id=cart_item.id,
                    item_name=cart_item.name,
                    quantity=quantity,
                    pickup_location=location.name,
                    pickup_time_slot=time_slot,
                    pickup_address=location.address,
                    pickup_date=event.pickup_date,
                    group_id=group_id,
                    phone_number=phone,
                    email=email,
                    base_total_price=line_total,
                    discount_total=0.0,
                    total_price=line_total,
                    pricing_meta={"group_size": num_items_in_cart},
                    status=status,
                    reminded=random.choice([True, False]),
                    paid=paid,
                    payment_method="cash" if paid else None,
                    created_at=created_at,
                )
                db.add(order)
                orders.append(order)
        else:
            # Single-item order
            item = random.choice(items)
            quantity = random.randint(1, 5)
            
            base_price = float(item.discounted_price) if item.discounted_price else float(item.price)
            total_price = base_price * quantity
            
            order = Order(
                id=str(uuid.uuid4()),
                event_id=event.id,
                name=name,
                item_id=item.id,
                item_name=item.name,
                quantity=quantity,
                pickup_location=location.name,
                pickup_time_slot=time_slot,
                pickup_address=location.address,
                pickup_date=event.pickup_date,
                phone_number=phone,
                email=email,
                base_total_price=total_price,
                discount_total=0.0,
                total_price=total_price,
                pricing_meta={},
                status=status,
                reminded=random.choice([True, False]),
                paid=paid,
                payment_method="cash" if paid else None,
                created_at=created_at,
            )
            db.add(order)
            orders.append(order)
    
    db.commit()
    return orders


def seed_orders(db, events, items, locations):
    """Seed 30 orders per event."""
    print("Seeding orders...")
    total_orders = 0
    all_orders = []
    for event in events:
        orders = generate_orders_for_event(db, event, items, locations, count=30)
        total_orders += len(orders)
        all_orders.extend(orders)
        print(f"  Event '{event.name}': {len(orders)} orders")
    print(f"  Total: {total_orders} orders.")
    return all_orders


def seed_customers_from_orders(db, orders):
    """Create customers from unique emails in orders."""
    print("Seeding customers...")
    seen_emails = set()
    customers = []
    
    for order in orders:
        if order.email and order.email.lower() not in seen_emails:
            seen_emails.add(order.email.lower())
            customer = Customer(
                id=str(uuid.uuid4()),
                email=order.email.lower(),
                name=order.name,
                phone_number=order.phone_number,
                pickup_locations=[order.pickup_location] if order.pickup_location else [],
                created_at=order.created_at,
                updated_at=datetime.now(timezone.utc),
            )
            db.add(customer)
            customers.append(customer)
    
    db.commit()
    print(f"  Created {len(customers)} customers.")
    return customers


def seed_feedback(db, events, orders):
    """Seed 30 feedback entries across events, including ratings for the new reviews page."""
    print("Seeding feedback...")
    feedback_list = []
    
    # Get customer orders for linking
    order_by_email = {o.email.lower(): o for o in orders if o.email}
    
    # Extended origins to include the new reviews_page
    EXTENDED_ORIGINS = FEEDBACK_ORIGINS + ["reviews_page"]
    
    for i in range(30):
        origin = random.choice(EXTENDED_ORIGINS)
        feedback_type = random.choice(FEEDBACK_TYPES)
        
        # New: Add rating logic
        rating = random.randint(3, 5) if random.random() > 0.2 else random.randint(1, 2)
        # Show in reviews if it's high rated (4-5) and random chance
        show_in_reviews = rating >= 4 and random.random() > 0.4
        
        # For event-related feedback, try to link to an order
        linked_order = None
        name = None
        contact = None
        reason = None
        other_details = None
        message = fake.paragraph(nb_sentences=3)
        
        if origin == "events_page_customer" and order_by_email:
            # Link to a random customer order
            linked_order = random.choice(list(order_by_email.values()))
            name = linked_order.name
            contact = linked_order.email
        
        if origin == "events_page_non_customer":
            reason = random.choice(FEEDBACK_REASONS)
            if reason == "other":
                other_details = fake.sentence()
            name = fake.name()
            contact = fake.email()
            
        if origin == "reviews_page":
            name = fake.name()
            feedback_type = "feedback"
        
        feedback = Feedback(
            id=str(uuid.uuid4()),
            origin=origin,
            feedback_type=feedback_type,
            order_id=linked_order.id if linked_order else None,
            name=name,
            contact=contact,
            reason=reason,
            other_details=other_details,
            message=message,
            rating=rating,
            show_in_reviews=show_in_reviews,
            created_at=datetime.now(timezone.utc) - timedelta(hours=random.randint(0, 504)),  # up to 3 weeks ago
            status=random.choice(FEEDBACK_STATUSES),
            admin_comment=None,
        )
        db.add(feedback)
        feedback_list.append(feedback)
    
    # Add a few guaranteed high-quality reviews for the carousel
    stellar_reviews = [
        ("The lamprais was out of this world! Reminded me exactly of home. Thank you Loku Caters!", 5, "Nimal Perera"),
        ("Best Sri Lankan food in the GTA. The pol sambol was perfectly spicy.", 5, "Sarah J."),
        ("Very impressed with the packaging and the care taken. Highly recommended.", 4, "Michael De Silva"),
        ("A bit of a wait at the pickup point, but the food made it all worth it. 5 stars for the taste!", 5, "Priya K."),
    ]
    
    for msg, rat, n in stellar_reviews:
        f = Feedback(
            id=str(uuid.uuid4()),
            origin="reviews_page",
            feedback_type="feedback",
            name=n,
            message=msg,
            rating=rat,
            show_in_reviews=True,
            created_at=datetime.now(timezone.utc) - timedelta(days=random.randint(1, 5)),
            status="resolved"
        )
        db.add(f)
        feedback_list.append(f)
    
    db.commit()
    print(f"  Created {len(feedback_list)} feedback entries (including {len(stellar_reviews)} stellar public reviews).")
    return feedback_list


def seed_catering_requests(db):
    """Seed 30 catering requests."""
    print("Seeding catering requests...")
    requests = []
    
    for i in range(30):
        first_name = fake.first_name()
        last_name = fake.last_name()
        event_type = random.choice(CATERING_EVENT_TYPES)
        
        # Generate event date in the future (1-6 months from now)
        days_ahead = random.randint(30, 180)
        event_date = (datetime.now(timezone.utc) + timedelta(days=days_ahead)).strftime("%Y-%m-%d")
        
        request = CateringRequest(
            id=str(uuid.uuid4()),
            first_name=first_name,
            last_name=last_name,
            email=fake.email(),
            phone_number=fake.phone_number(),
            event_date=event_date,
            guest_count=random.randint(10, 200),
            event_type=event_type,
            budget_range=random.choice(CATERING_BUDGET_RANGES),
            special_requests=fake.paragraph(nb_sentences=2) if random.random() > 0.3 else None,
            status=random.choice(CATERING_STATUSES),
            created_at=datetime.now(timezone.utc) - timedelta(hours=random.randint(0, 720)),  # up to 30 days ago
        )
        db.add(request)
        requests.append(request)
    
    db.commit()
    print(f"  Created {len(requests)} catering requests.")
    return requests


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    db = SessionLocal()
    try:
        # Clear existing data
        clear_all_tables(db)
        
        # Seed core entities
        items = seed_items(db)
        locations = seed_locations(db)
        events = seed_events(db, items, locations)
        
        # Seed related entities
        orders = seed_orders(db, events, items, locations)
        customers = seed_customers_from_orders(db, orders)
        feedback = seed_feedback(db, events, orders)
        catering_requests = seed_catering_requests(db)
        
        print("\n" + "=" * 50)
        print("SEED SUMMARY")
        print("=" * 50)
        print(f"  Items:              {len(items)}")
        print(f"  Locations:          {len(locations)}")
        print(f"  Events:             {len(events)}")
        print(f"  Orders:             {len(orders)}")
        print(f"  Customers:          {len(customers)}")
        print(f"  Feedback:           {len(feedback)}")
        print(f"  Catering Requests:  {len(catering_requests)}")
        print("=" * 50)
        print("Seed complete!")
        
    finally:
        db.close()


if __name__ == "__main__":
    main()
