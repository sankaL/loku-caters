from __future__ import annotations

from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Iterable, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from event_config import get_currency


MONEY_QUANTUM = Decimal("0.01")


def money(value: Any) -> Decimal:
    return Decimal(str(value or 0)).quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)


def optional_text(value: Any) -> Optional[str]:
    normalized = str(value or "").strip()
    return normalized or None


def settings_snapshot(settings: Any) -> dict[str, Any]:
    return {
        "business_name": str(getattr(settings, "business_name", None) or "Loku Caters").strip(),
        "business_address": optional_text(getattr(settings, "business_address", None)),
        "business_email": optional_text(getattr(settings, "business_email", None)),
        "business_phone": optional_text(getattr(settings, "business_phone", None)),
        "payment_method": str(getattr(settings, "payment_method", None) or "none"),
        "payment_email": optional_text(getattr(settings, "payment_email", None)),
        "payment_instructions": optional_text(getattr(settings, "payment_instructions", None)),
        "default_footer_note": optional_text(getattr(settings, "default_footer_note", None)),
    }


def default_due_date(issue_date: date, pickup_date: Optional[date]) -> date:
    if pickup_date is not None and pickup_date >= issue_date:
        return pickup_date
    return issue_date


def build_invoice_snapshot(
    *,
    orders: Iterable[Any],
    settings: Any,
    event_name: Optional[str],
    issue_date: date,
    due_date: date,
    customer_name: str,
    customer_email: Optional[str],
    customer_phone: Optional[str],
    memo: Optional[str],
) -> dict[str, Any]:
    rows = sorted(list(orders), key=lambda order: (getattr(order, "created_at", None), str(order.id)))
    if not rows:
        raise ValueError("Cannot create an invoice without order lines")
    if due_date < issue_date:
        raise ValueError("Due date cannot be earlier than issue date")

    primary = rows[0]
    bundle_id = optional_text(getattr(primary, "group_id", None)) or str(primary.id)
    line_items: list[dict[str, Any]] = []
    subtotal = Decimal("0.00")
    discount_total = Decimal("0.00")
    total = Decimal("0.00")

    for order in rows:
        quantity = max(1, int(getattr(order, "quantity", 0) or 0))
        line_subtotal = money(getattr(order, "base_total_price", 0))
        line_discount = money(getattr(order, "discount_total", 0))
        line_total = money(getattr(order, "total_price", 0))
        subtotal += line_subtotal
        discount_total += line_discount
        total += line_total
        line_items.append(
            {
                "source_order_id": str(order.id),
                "item_id": str(getattr(order, "item_id", "") or ""),
                "description": str(getattr(order, "item_name", "") or "Item"),
                "quantity": quantity,
                "unit_price": float((line_subtotal / quantity).quantize(MONEY_QUANTUM, rounding=ROUND_HALF_UP)),
                "subtotal": float(line_subtotal),
                "discount": float(line_discount),
                "total": float(line_total),
            }
        )

    paid = all(bool(getattr(order, "paid", False)) for order in rows)
    pickup_date = getattr(primary, "pickup_date", None)
    created_at = getattr(primary, "created_at", None)

    return {
        "version": 1,
        "currency": get_currency(),
        "vendor": settings_snapshot(settings),
        "customer": {
            "name": customer_name.strip(),
            "email": optional_text(customer_email),
            "phone": optional_text(customer_phone),
        },
        "invoice": {
            "issue_date": issue_date.isoformat(),
            "due_date": due_date.isoformat(),
            "memo": optional_text(memo),
        },
        "order": {
            "bundle_id": bundle_id,
            "primary_order_id": str(primary.id),
            "reference": str(primary.id)[:8].upper(),
            "event_id": int(primary.event_id) if getattr(primary, "event_id", None) is not None else None,
            "event_name": optional_text(event_name),
            "pickup_location": optional_text(getattr(primary, "pickup_location", None)),
            "pickup_time_slot": optional_text(getattr(primary, "pickup_time_slot", None)),
            "pickup_address": optional_text(getattr(primary, "pickup_address", None)),
            "pickup_date": pickup_date.isoformat() if pickup_date is not None else None,
            "ordered_at": created_at.isoformat() if created_at is not None else None,
            "lines": line_items,
        },
        "amounts": {
            "subtotal": float(money(subtotal)),
            "discount_total": float(money(discount_total)),
            "total": float(money(total)),
        },
        "payment_fallback": {
            "paid": paid,
            "payment_method": optional_text(getattr(primary, "payment_method", None)),
            "payment_method_other": optional_text(getattr(primary, "payment_method_other", None)),
        },
    }


def next_invoice_number(db: Session, year: int) -> tuple[str, int]:
    sequence = db.execute(
        text(
            """
            INSERT INTO invoice_number_counters (year, last_value)
            VALUES (:year, 1)
            ON CONFLICT (year)
            DO UPDATE SET last_value = invoice_number_counters.last_value + 1
            RETURNING last_value
            """
        ),
        {"year": year},
    ).scalar_one()
    return f"INV-{year}-{int(sequence):04d}", int(sequence)
