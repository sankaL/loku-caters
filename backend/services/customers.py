from __future__ import annotations

import uuid
from collections import OrderedDict
from contextlib import nullcontext
from datetime import datetime, timezone
from typing import Any, Optional, Sequence

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from models import Customer


class CustomerNotFoundError(Exception):
    pass


class CustomerEmailConflictError(Exception):
    pass


def normalize_customer_email(email: Optional[str]) -> Optional[str]:
    if email is None:
        return None
    normalized = str(email).strip().lower()
    return normalized or None


def normalize_customer_name(name: Optional[str]) -> str:
    return str(name or "").strip()


def normalize_customer_phone(phone_number: Optional[str]) -> Optional[str]:
    if phone_number is None:
        return None
    normalized = str(phone_number).strip()
    return normalized or None


def normalize_pickup_location(pickup_location: Optional[str]) -> Optional[str]:
    if pickup_location is None:
        return None
    normalized = str(pickup_location).strip()
    return normalized or None


def merge_pickup_locations(
    existing_locations: Sequence[Any], pickup_location: Optional[str]
) -> list[str]:
    merged: list[str] = []
    seen: set[str] = set()

    for value in existing_locations or []:
        normalized = normalize_pickup_location(value)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        merged.append(normalized)

    normalized_pickup_location = normalize_pickup_location(pickup_location)
    if normalized_pickup_location and normalized_pickup_location not in seen:
        merged.append(normalized_pickup_location)

    return merged


def _begin_nested_if_supported(db: Session):
    begin_nested = getattr(db, "begin_nested", None)
    if callable(begin_nested):
        return begin_nested()
    return nullcontext()


def _apply_customer_updates(
    customer: Customer,
    *,
    normalized_name: str,
    normalized_phone: Optional[str],
    normalized_pickup_location: Optional[str],
    current_time: datetime,
) -> bool:
    changed = False

    if normalized_name and normalized_name != customer.name:
        customer.name = normalized_name
        changed = True

    if normalized_phone and normalized_phone != customer.phone_number:
        customer.phone_number = normalized_phone
        changed = True

    merged_locations = merge_pickup_locations(
        customer.pickup_locations or [], normalized_pickup_location
    )
    if merged_locations != list(customer.pickup_locations or []):
        customer.pickup_locations = merged_locations
        changed = True

    if changed:
        customer.updated_at = current_time

    return changed


def update_customer_from_admin(
    db: Session,
    *,
    customer_id: str,
    name: Optional[str],
    email: Optional[str],
    phone_number: Optional[str],
    now: Optional[datetime] = None,
) -> Customer:
    normalized_name = normalize_customer_name(name)
    normalized_email = normalize_customer_email(email)
    normalized_phone = normalize_customer_phone(phone_number)
    current_time = now or datetime.now(timezone.utc)

    if not normalized_name:
        raise ValueError("name cannot be empty")
    if normalized_email is None:
        raise ValueError("email cannot be empty")

    customer = db.query(Customer).filter_by(id=customer_id).first()
    if customer is None:
        raise CustomerNotFoundError(customer_id)

    changed = False

    if normalized_email != customer.email:
        duplicate_customer = (
            db.query(Customer).filter_by(email=normalized_email).first()
        )
        if duplicate_customer is not None and duplicate_customer.id != customer.id:
            raise CustomerEmailConflictError(normalized_email)
        customer.email = normalized_email
        changed = True

    if normalized_name != customer.name:
        customer.name = normalized_name
        changed = True

    if normalized_phone != customer.phone_number:
        customer.phone_number = normalized_phone
        changed = True

    if changed:
        customer.updated_at = current_time

    return customer


def sync_customer_from_contact(
    db: Session,
    *,
    name: Optional[str],
    email: Optional[str],
    phone_number: Optional[str],
    pickup_location: Optional[str],
    now: Optional[datetime] = None,
) -> Optional[Customer]:
    normalized_email = normalize_customer_email(email)
    if normalized_email is None:
        return None

    normalized_name = normalize_customer_name(name)
    normalized_phone = normalize_customer_phone(phone_number)
    normalized_pickup_location = normalize_pickup_location(pickup_location)
    current_time = now or datetime.now(timezone.utc)

    customer = db.query(Customer).filter_by(email=normalized_email).first()
    if customer is None:
        new_customer = Customer(
            id=str(uuid.uuid4()),
            email=normalized_email,
            name=normalized_name or normalized_email,
            phone_number=normalized_phone,
            pickup_locations=merge_pickup_locations([], normalized_pickup_location),
            created_at=current_time,
            updated_at=current_time,
        )
        try:
            with _begin_nested_if_supported(db):
                db.add(new_customer)
                db.flush()
            return new_customer
        except IntegrityError:
            customer = db.query(Customer).filter_by(email=normalized_email).first()
            if customer is None:
                raise

    changed = _apply_customer_updates(
        customer,
        normalized_name=normalized_name,
        normalized_phone=normalized_phone,
        normalized_pickup_location=normalized_pickup_location,
        current_time=current_time,
    )
    if changed:
        db.flush()

    return customer


def build_customer_backfill_rows(orders: Sequence[Any]) -> list[dict[str, Any]]:
    grouped: "OrderedDict[str, dict[str, Any]]" = OrderedDict()

    for order in orders:
        normalized_email = normalize_customer_email(_get_value(order, "email"))
        if normalized_email is None:
            continue

        entry = grouped.get(normalized_email)
        if entry is None:
            entry = {
                "email": normalized_email,
                "name": normalized_email,
                "phone_number": None,
                "pickup_locations": [],
                "created_at": _get_value(order, "created_at"),
                "updated_at": _get_value(order, "created_at"),
            }
            grouped[normalized_email] = entry

        normalized_name = normalize_customer_name(_get_value(order, "name"))
        if normalized_name:
            entry["name"] = normalized_name

        normalized_phone = normalize_customer_phone(_get_value(order, "phone_number"))
        if normalized_phone:
            entry["phone_number"] = normalized_phone

        entry["pickup_locations"] = merge_pickup_locations(
            entry["pickup_locations"],
            _get_value(order, "pickup_location"),
        )

        created_at = _get_value(order, "created_at")
        if created_at is not None:
            existing_created_at = entry.get("created_at")
            existing_updated_at = entry.get("updated_at")
            if existing_created_at is None or created_at < existing_created_at:
                entry["created_at"] = created_at
            if existing_updated_at is None or created_at > existing_updated_at:
                entry["updated_at"] = created_at

    return list(grouped.values())


def upsert_customer_backfill_row(db: Session, row: dict[str, Any]) -> Customer:
    customer = db.query(Customer).filter_by(email=row["email"]).first()
    if customer is None:
        customer = Customer(
            id=str(uuid.uuid4()),
            email=row["email"],
            name=row["name"],
            phone_number=row["phone_number"],
            pickup_locations=list(row["pickup_locations"]),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )
        db.add(customer)
        db.flush()
        return customer

    customer.name = row["name"]
    customer.phone_number = row["phone_number"]
    customer.pickup_locations = list(row["pickup_locations"])
    customer.created_at = row["created_at"]
    customer.updated_at = row["updated_at"]
    db.flush()
    return customer


def _get_value(item: Any, key: str) -> Any:
    if isinstance(item, dict):
        return item.get(key)
    return getattr(item, key, None)
