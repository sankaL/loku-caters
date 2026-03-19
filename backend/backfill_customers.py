from __future__ import annotations

from database import SessionLocal
from models import Order
from services.customers import build_customer_backfill_rows, upsert_customer_backfill_row


def main() -> None:
    db = SessionLocal()
    try:
        orders = (
            db.query(Order)
            .filter(Order.email.isnot(None))
            .order_by(Order.created_at.asc(), Order.id.asc())
            .all()
        )
        rows = build_customer_backfill_rows(orders)
        for row in rows:
            upsert_customer_backfill_row(db, row)
        db.commit()
        print(f"Backfilled {len(rows)} customers from {len(orders)} orders.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
