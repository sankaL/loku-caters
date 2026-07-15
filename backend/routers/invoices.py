from __future__ import annotations

import copy
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
    model_validator,
)
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import get_db
from models import Event, Invoice, InvoiceSettings, Order
from routers.admin import verify_admin_token
from services.invoice_pdf import build_invoice_pdf
from services.invoices import (
    build_invoice_document_snapshot,
    calculate_invoice_amounts,
    default_due_date,
    invoice_lines_from_orders,
    money,
    next_invoice_number,
    optional_text,
    order_snapshot,
)


router = APIRouter(prefix="/api/admin", tags=["admin-invoices"])
PaymentMethod = Literal["etransfer", "cash", "other"]


class InvoiceSettingsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    business_name: str = Field(min_length=1, max_length=160)
    business_address: Optional[str] = Field(default=None, max_length=1000)
    business_email: Optional[EmailStr] = None
    business_phone: Optional[str] = Field(default=None, max_length=80)
    payment_method: Literal["none", "etransfer", "cash", "other"] = "none"
    payment_email: Optional[EmailStr] = None
    payment_instructions: Optional[str] = Field(default=None, max_length=1500)
    default_footer_note: Optional[str] = Field(default=None, max_length=1000)

    @field_validator("business_name", mode="before")
    @classmethod
    def normalize_business_name(cls, value: Any) -> str:
        return str(value or "").strip()

    @field_validator(
        "business_address",
        "business_phone",
        "payment_instructions",
        "default_footer_note",
        mode="before",
    )
    @classmethod
    def normalize_optional_text(cls, value: Any) -> Optional[str]:
        return optional_text(value)

    @model_validator(mode="after")
    def validate_payment_details(self) -> "InvoiceSettingsUpdate":
        if self.payment_method == "etransfer" and self.payment_email is None:
            raise ValueError("Payment email is required for e-transfer")
        if self.payment_method != "etransfer":
            self.payment_email = None
        return self


class InvoiceLineInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    description: str = Field(min_length=1, max_length=300)
    quantity: int = Field(ge=1, le=100000)
    unit_price: Decimal = Field(ge=0, max_digits=10, decimal_places=2)

    @field_validator("description", mode="before")
    @classmethod
    def normalize_description(cls, value: Any) -> str:
        return str(value or "").strip()


class InvoiceCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_bundle_id: Optional[str] = Field(default=None, max_length=255)
    issue_date: date = Field(default_factory=date.today)
    due_date: Optional[date] = None
    customer_name: Optional[str] = Field(default=None, max_length=200)
    customer_email: Optional[EmailStr] = None
    customer_phone: Optional[str] = Field(default=None, max_length=80)
    memo: Optional[str] = Field(default=None, max_length=2000)
    line_items: Optional[list[InvoiceLineInput]] = Field(
        default=None, min_length=1, max_length=200
    )
    discount_total: Optional[Decimal] = Field(
        default=None, ge=0, max_digits=10, decimal_places=2
    )
    paid: Optional[bool] = None
    payment_method: Optional[PaymentMethod] = None
    payment_method_other: Optional[str] = Field(default=None, max_length=200)

    @field_validator(
        "source_bundle_id",
        "customer_name",
        "customer_phone",
        "memo",
        "payment_method_other",
        mode="before",
    )
    @classmethod
    def normalize_optional_fields(cls, value: Any) -> Optional[str]:
        return optional_text(value)

    @model_validator(mode="after")
    def validate_fields(self) -> "InvoiceCreate":
        if self.due_date is not None and self.due_date < self.issue_date:
            raise ValueError("Due date cannot be earlier than issue date")
        if self.source_bundle_id is None and self.line_items is None:
            raise ValueError("At least one invoice item is required")
        if self.payment_method == "other" and not self.payment_method_other:
            raise ValueError("Other payment method details are required")
        if self.payment_method != "other":
            self.payment_method_other = None
        return self


class InvoiceUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_bundle_id: Optional[str] = Field(default=None, max_length=255)
    issue_date: Optional[date] = None
    due_date: Optional[date] = None
    customer_name: Optional[str] = Field(default=None, max_length=200)
    customer_email: Optional[EmailStr] = None
    customer_phone: Optional[str] = Field(default=None, max_length=80)
    memo: Optional[str] = Field(default=None, max_length=2000)
    line_items: Optional[list[InvoiceLineInput]] = Field(
        default=None, min_length=1, max_length=200
    )
    discount_total: Optional[Decimal] = Field(
        default=None, ge=0, max_digits=10, decimal_places=2
    )
    paid: Optional[bool] = None
    payment_method: Optional[PaymentMethod] = None
    payment_method_other: Optional[str] = Field(default=None, max_length=200)

    @field_validator(
        "source_bundle_id",
        "customer_name",
        "customer_phone",
        "memo",
        "payment_method_other",
        mode="before",
    )
    @classmethod
    def normalize_optional_fields(cls, value: Any) -> Optional[str]:
        return optional_text(value)

    @model_validator(mode="after")
    def validate_payment_details(self) -> "InvoiceUpdate":
        if self.payment_method == "other" and not self.payment_method_other:
            raise ValueError("Other payment method details are required")
        if self.payment_method is not None and self.payment_method != "other":
            self.payment_method_other = None
        return self


def _settings_dict(settings: InvoiceSettings) -> dict[str, Any]:
    return {
        "business_name": settings.business_name,
        "business_address": settings.business_address,
        "business_email": settings.business_email,
        "business_phone": settings.business_phone,
        "payment_method": settings.payment_method,
        "payment_email": settings.payment_email,
        "payment_instructions": settings.payment_instructions,
        "default_footer_note": settings.default_footer_note,
        "updated_at": settings.updated_at.isoformat() if settings.updated_at else None,
    }


def _get_settings(db: Session) -> InvoiceSettings:
    settings = db.query(InvoiceSettings).filter(InvoiceSettings.id == 1).first()
    if settings is not None:
        return settings
    settings = InvoiceSettings(id=1, business_name="Loku Caters", payment_method="none")
    db.add(settings)
    try:
        db.commit()
    except IntegrityError:
        # Another request created the singleton concurrently. Load that row.
        db.rollback()
        settings = db.query(InvoiceSettings).filter(InvoiceSettings.id == 1).first()
        if settings is None:
            raise
    db.refresh(settings)
    return settings


def _get_bundle_orders(db: Session, bundle_id: str) -> list[Order]:
    grouped = (
        db.query(Order)
        .filter(Order.group_id == bundle_id)
        .order_by(Order.created_at.asc(), Order.id.asc())
        .all()
    )
    if grouped:
        return grouped
    order = db.query(Order).filter(Order.id == bundle_id).first()
    return [order] if order is not None else []


def _source_details(db: Session, bundle_id: str) -> tuple[list[Order], dict[str, Any]]:
    orders = _get_bundle_orders(db, bundle_id)
    if not orders:
        raise HTTPException(status_code=404, detail="Order bundle not found")
    event_id = getattr(orders[0], "event_id", None)
    event = (
        db.query(Event).filter(Event.id == event_id).first()
        if event_id is not None
        else None
    )
    source = order_snapshot(orders, event.name if event is not None else None)
    if source is None:
        raise HTTPException(status_code=404, detail="Order bundle not found")
    return orders, source


def _payment_dict(invoice: Invoice) -> dict[str, Any]:
    return {
        "paid": bool(invoice.paid),
        "payment_method": invoice.payment_method,
        "payment_method_other": invoice.payment_method_other,
    }


def _invoice_dict(invoice: Invoice, *, include_snapshot: bool) -> dict[str, Any]:
    snapshot = invoice.snapshot or {}
    order_data = snapshot.get("order") or {}
    payload = {
        "id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "number_year": invoice.number_year,
        "source_bundle_id": invoice.source_bundle_id,
        "source_order_id": invoice.source_order_id,
        "source_event_id": invoice.source_event_id,
        "order_reference": invoice.order_reference,
        "event_name": order_data.get("event_name"),
        "customer_name": invoice.customer_name,
        "customer_email": invoice.customer_email,
        "customer_phone": invoice.customer_phone,
        "issue_date": invoice.issue_date.isoformat(),
        "due_date": invoice.due_date.isoformat(),
        "memo": invoice.memo,
        "currency": invoice.currency,
        "line_items": invoice.line_items or [],
        "subtotal": float(invoice.subtotal),
        "discount_total": float(invoice.discount_total),
        "total": float(invoice.total),
        "payment": _payment_dict(invoice),
        "created_at": invoice.created_at.isoformat() if invoice.created_at else None,
        "updated_at": invoice.updated_at.isoformat() if invoice.updated_at else None,
    }
    if include_snapshot:
        payload["snapshot"] = snapshot
    return payload


def _require_invoice(db: Session, invoice_id: str) -> Invoice:
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if invoice is None:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return invoice


def _validate_amounts(
    lines: list[dict[str, Any]], discount_total: Any
) -> tuple[list[dict[str, Any]], dict[str, float]]:
    normalized, amounts = calculate_invoice_amounts(lines, discount_total)
    if money(amounts["discount_total"]) > money(amounts["subtotal"]):
        raise HTTPException(
            status_code=422, detail="Discount cannot exceed the invoice subtotal"
        )
    return normalized, amounts


def _sync_snapshot(
    invoice: Invoice,
    source: Optional[dict[str, Any]] = None,
    *,
    source_changed: bool = False,
) -> None:
    snapshot = copy.deepcopy(invoice.snapshot or {})
    snapshot["version"] = 2
    snapshot["currency"] = invoice.currency
    snapshot.setdefault("customer", {}).update(
        {
            "name": invoice.customer_name,
            "email": invoice.customer_email,
            "phone": invoice.customer_phone,
        }
    )
    snapshot.setdefault("invoice", {}).update(
        {
            "issue_date": invoice.issue_date.isoformat(),
            "due_date": invoice.due_date.isoformat(),
            "memo": invoice.memo,
        }
    )
    if source_changed:
        snapshot["order"] = source
    invoice.snapshot = snapshot


@router.get("/invoice-settings")
def get_invoice_settings(
    db: Session = Depends(get_db), _: dict = Depends(verify_admin_token)
):
    return _settings_dict(_get_settings(db))


@router.put("/invoice-settings")
def update_invoice_settings(
    body: InvoiceSettingsUpdate,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    settings = _get_settings(db)
    for field_name, value in body.model_dump().items():
        setattr(
            settings, field_name, str(value) if isinstance(value, EmailStr) else value
        )
    settings.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(settings)
    return _settings_dict(settings)


@router.get("/invoices")
def list_invoices(
    source_bundle_id: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    query = db.query(Invoice)
    if source_bundle_id is not None:
        query = query.filter(Invoice.source_bundle_id == source_bundle_id)
    invoices = query.order_by(
        Invoice.created_at.desc(), Invoice.invoice_number.desc()
    ).all()
    return [_invoice_dict(invoice, include_snapshot=False) for invoice in invoices]


@router.post("/invoices", status_code=status.HTTP_201_CREATED)
def create_invoice(
    body: InvoiceCreate,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    orders: list[Order] = []
    source: Optional[dict[str, Any]] = None
    if body.source_bundle_id:
        orders, source = _source_details(db, body.source_bundle_id)

    primary = orders[0] if orders else None
    customer_name = (
        body.customer_name or str(getattr(primary, "name", "") or "").strip()
    )
    if not customer_name:
        raise HTTPException(status_code=422, detail="Customer name is required")
    due_date = body.due_date or default_due_date(
        body.issue_date, getattr(primary, "pickup_date", None)
    )

    raw_lines = (
        [line.model_dump() for line in body.line_items]
        if body.line_items is not None
        else invoice_lines_from_orders(orders)
    )
    order_discount = sum(
        (money(getattr(order, "discount_total", 0)) for order in orders),
        Decimal("0.00"),
    )
    discount = (
        body.discount_total if body.discount_total is not None else order_discount
    )
    lines, amounts = _validate_amounts(raw_lines, discount)

    paid = (
        body.paid
        if body.paid is not None
        else bool(orders and all(bool(order.paid) for order in orders))
    )
    payment_method = (
        body.payment_method
        if body.paid is not None or body.payment_method is not None
        else optional_text(getattr(primary, "payment_method", None))
    )
    payment_method_other = (
        body.payment_method_other if payment_method == "other" else None
    )
    if not paid:
        payment_method = None
        payment_method_other = None

    settings = _get_settings(db)
    customer_email = (
        str(body.customer_email)
        if body.customer_email is not None
        else getattr(primary, "email", None)
    )
    customer_phone = (
        body.customer_phone
        if body.customer_phone is not None
        else getattr(primary, "phone_number", None)
    )
    snapshot = build_invoice_document_snapshot(
        settings=settings,
        source_order=source,
        issue_date=body.issue_date,
        due_date=due_date,
        customer_name=customer_name,
        customer_email=customer_email,
        customer_phone=customer_phone,
        memo=body.memo,
    )
    invoice_number, sequence = next_invoice_number(db, body.issue_date.year)
    invoice = Invoice(
        id=str(uuid.uuid4()),
        invoice_number=invoice_number,
        number_year=body.issue_date.year,
        number_sequence=sequence,
        source_bundle_id=body.source_bundle_id,
        source_order_id=source.get("primary_order_id") if source else None,
        source_event_id=source.get("event_id") if source else None,
        order_reference=source.get("reference") if source else None,
        customer_name=customer_name,
        customer_email=optional_text(customer_email),
        customer_phone=optional_text(customer_phone),
        issue_date=body.issue_date,
        due_date=due_date,
        memo=optional_text(body.memo),
        currency=snapshot["currency"],
        line_items=lines,
        subtotal=amounts["subtotal"],
        discount_total=amounts["discount_total"],
        total=amounts["total"],
        paid=paid,
        payment_method=payment_method,
        payment_method_other=payment_method_other,
        snapshot=snapshot,
    )
    db.add(invoice)
    db.commit()
    db.refresh(invoice)
    return _invoice_dict(invoice, include_snapshot=True)


@router.get("/invoices/{invoice_id}")
def get_invoice(
    invoice_id: str,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    return _invoice_dict(_require_invoice(db, invoice_id), include_snapshot=True)


@router.patch("/invoices/{invoice_id}")
def update_invoice(
    invoice_id: str,
    body: InvoiceUpdate,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    invoice = _require_invoice(db, invoice_id)
    fields = body.model_fields_set
    next_issue_date = (
        body.issue_date
        if "issue_date" in fields and body.issue_date is not None
        else invoice.issue_date
    )
    next_due_date = (
        body.due_date
        if "due_date" in fields and body.due_date is not None
        else invoice.due_date
    )
    if next_issue_date.year != invoice.number_year:
        raise HTTPException(
            status_code=422, detail="Issue date must remain in the invoice number year"
        )
    if next_due_date < next_issue_date:
        raise HTTPException(
            status_code=422, detail="Due date cannot be earlier than issue date"
        )

    source: Optional[dict[str, Any]] = None
    source_changed = "source_bundle_id" in fields
    if source_changed:
        if body.source_bundle_id:
            _, source = _source_details(db, body.source_bundle_id)
            invoice.source_bundle_id = body.source_bundle_id
            invoice.source_order_id = source["primary_order_id"]
            invoice.source_event_id = source["event_id"]
            invoice.order_reference = source["reference"]
        else:
            invoice.source_bundle_id = None
            invoice.source_order_id = None
            invoice.source_event_id = None
            invoice.order_reference = None

    if "customer_name" in fields:
        if not body.customer_name:
            raise HTTPException(status_code=422, detail="Customer name is required")
        invoice.customer_name = body.customer_name
    if "customer_email" in fields:
        invoice.customer_email = (
            str(body.customer_email) if body.customer_email is not None else None
        )
    if "customer_phone" in fields:
        invoice.customer_phone = body.customer_phone
    if "memo" in fields:
        invoice.memo = body.memo

    raw_lines = (
        [line.model_dump() for line in body.line_items]
        if "line_items" in fields and body.line_items is not None
        else list(invoice.line_items or [])
    )
    discount = (
        body.discount_total
        if "discount_total" in fields and body.discount_total is not None
        else invoice.discount_total
    )
    lines, amounts = _validate_amounts(raw_lines, discount)
    invoice.line_items = lines
    invoice.subtotal = amounts["subtotal"]
    invoice.discount_total = amounts["discount_total"]
    invoice.total = amounts["total"]

    if "paid" in fields and body.paid is not None:
        invoice.paid = body.paid
    if "payment_method" in fields:
        invoice.payment_method = body.payment_method
    if "payment_method_other" in fields:
        invoice.payment_method_other = body.payment_method_other
    if not invoice.paid:
        invoice.payment_method = None
        invoice.payment_method_other = None
    elif invoice.payment_method != "other":
        invoice.payment_method_other = None

    invoice.issue_date = next_issue_date
    invoice.due_date = next_due_date
    invoice.updated_at = datetime.now(timezone.utc)
    _sync_snapshot(invoice, source, source_changed=source_changed)
    db.commit()
    db.refresh(invoice)
    return _invoice_dict(invoice, include_snapshot=True)


@router.delete("/invoices/{invoice_id}")
def delete_invoice(
    invoice_id: str,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    db.delete(_require_invoice(db, invoice_id))
    db.commit()
    return {"success": True}


@router.get("/invoices/{invoice_id}/pdf")
def export_invoice_pdf(
    invoice_id: str,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    invoice = _require_invoice(db, invoice_id)
    pdf = build_invoice_pdf(
        invoice_number=invoice.invoice_number,
        snapshot=invoice.snapshot or {},
        payment=_payment_dict(invoice),
        line_items=invoice.line_items or [],
        amounts={
            "subtotal": float(invoice.subtotal),
            "discount_total": float(invoice.discount_total),
            "total": float(invoice.total),
        },
    )
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{invoice.invoice_number}.pdf"'
        },
    )
