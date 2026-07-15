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
        "business_name": str(
            getattr(settings, "business_name", None) or "Loku Caters"
        ).strip(),
        "business_address": optional_text(getattr(settings, "business_address", None)),
        "business_email": optional_text(getattr(settings, "business_email", None)),
        "business_phone": optional_text(getattr(settings, "business_phone", None)),
        "payment_method": str(getattr(settings, "payment_method", None) or "none"),
        "payment_email": optional_text(getattr(settings, "payment_email", None)),
        "payment_instructions": optional_text(
            getattr(settings, "payment_instructions", None)
        ),
        "default_footer_note": optional_text(
            getattr(settings, "default_footer_note", None)
        ),
    }


def default_due_date(issue_date: date, pickup_date: Optional[date]) -> date:
    if pickup_date is not None and pickup_date >= issue_date:
        return pickup_date
    return issue_date


def invoice_lines_from_orders(orders: Iterable[Any]) -> list[dict[str, Any]]:
    lines: list[dict[str, Any]] = []
    for order in sorted(
        list(orders), key=lambda row: (getattr(row, "created_at", None), str(row.id))
    ):
        quantity = max(1, int(getattr(order, "quantity", 0) or 0))
        line_subtotal = money(getattr(order, "base_total_price", 0))
        lines.append(
            {
                "description": str(getattr(order, "item_name", "") or "Item").strip(),
                "quantity": quantity,
                "unit_price": float(money(line_subtotal / quantity)),
                "subtotal": float(line_subtotal),
            }
        )
    return lines


def calculate_invoice_amounts(
    lines: Iterable[dict[str, Any]], discount_total: Any
) -> tuple[list[dict[str, Any]], dict[str, float]]:
    normalized_lines: list[dict[str, Any]] = []
    subtotal = Decimal("0.00")
    for line in lines:
        description = str(line.get("description") or "").strip()
        quantity = int(line.get("quantity") or 0)
        unit_price = money(line.get("unit_price"))
        line_subtotal = money(unit_price * quantity)
        subtotal += line_subtotal
        normalized_lines.append(
            {
                "description": description,
                "quantity": quantity,
                "unit_price": float(unit_price),
                "subtotal": float(line_subtotal),
            }
        )
    discount = money(discount_total)
    total = money(subtotal - discount)
    return normalized_lines, {
        "subtotal": float(money(subtotal)),
        "discount_total": float(discount),
        "total": float(total),
    }


def order_snapshot(
    orders: Iterable[Any], event_name: Optional[str]
) -> Optional[dict[str, Any]]:
    rows = sorted(
        list(orders), key=lambda row: (getattr(row, "created_at", None), str(row.id))
    )
    if not rows:
        return None
    primary = rows[0]
    pickup_date = getattr(primary, "pickup_date", None)
    created_at = getattr(primary, "created_at", None)
    return {
        "bundle_id": optional_text(getattr(primary, "group_id", None))
        or str(primary.id),
        "primary_order_id": str(primary.id),
        "reference": str(primary.id)[:8].upper(),
        "event_id": int(primary.event_id)
        if getattr(primary, "event_id", None) is not None
        else None,
        "event_name": optional_text(event_name),
        "pickup_location": optional_text(getattr(primary, "pickup_location", None)),
        "pickup_time_slot": optional_text(getattr(primary, "pickup_time_slot", None)),
        "pickup_address": optional_text(getattr(primary, "pickup_address", None)),
        "pickup_date": pickup_date.isoformat() if pickup_date is not None else None,
        "ordered_at": created_at.isoformat() if created_at is not None else None,
    }


def build_invoice_document_snapshot(
    *,
    settings: Any,
    source_order: Optional[dict[str, Any]],
    issue_date: date,
    due_date: date,
    customer_name: str,
    customer_email: Optional[str],
    customer_phone: Optional[str],
    memo: Optional[str],
    currency: Optional[str] = None,
) -> dict[str, Any]:
    return {
        "version": 2,
        "currency": currency or get_currency(),
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
        "order": source_order,
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
