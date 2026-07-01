from __future__ import annotations

import copy
import uuid
from datetime import date, datetime, timezone
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import get_db
from models import Event, Invoice, InvoiceSettings, Order
from routers.admin import verify_admin_token
from services.invoice_pdf import build_invoice_pdf
from services.invoices import build_invoice_snapshot, default_due_date, next_invoice_number, optional_text


router = APIRouter(prefix="/api/admin", tags=["admin-invoices"])


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

    @field_validator("business_address", "business_phone", "payment_instructions", "default_footer_note", mode="before")
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


class InvoiceCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_bundle_id: str = Field(min_length=1, max_length=255)
    issue_date: date = Field(default_factory=date.today)
    due_date: Optional[date] = None
    customer_name: Optional[str] = Field(default=None, max_length=200)
    customer_email: Optional[EmailStr] = None
    customer_phone: Optional[str] = Field(default=None, max_length=80)
    memo: Optional[str] = Field(default=None, max_length=2000)

    @field_validator("source_bundle_id", mode="before")
    @classmethod
    def normalize_bundle_id(cls, value: Any) -> str:
        return str(value or "").strip()

    @field_validator("customer_name", "customer_phone", "memo", mode="before")
    @classmethod
    def normalize_optional_fields(cls, value: Any) -> Optional[str]:
        return optional_text(value)

    @model_validator(mode="after")
    def validate_dates(self) -> "InvoiceCreate":
        if self.due_date is not None and self.due_date < self.issue_date:
            raise ValueError("Due date cannot be earlier than issue date")
        return self


class InvoiceUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    issue_date: Optional[date] = None
    due_date: Optional[date] = None
    customer_name: Optional[str] = Field(default=None, max_length=200)
    customer_email: Optional[EmailStr] = None
    customer_phone: Optional[str] = Field(default=None, max_length=80)
    memo: Optional[str] = Field(default=None, max_length=2000)

    @field_validator("customer_name", "customer_phone", "memo", mode="before")
    @classmethod
    def normalize_optional_fields(cls, value: Any) -> Optional[str]:
        return optional_text(value)


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
    db.flush()
    return settings


def _get_bundle_orders(db: Session, bundle_id: str) -> list[Order]:
    grouped = db.query(Order).filter(Order.group_id == bundle_id).order_by(Order.created_at.asc(), Order.id.asc()).all()
    if grouped:
        return grouped
    order = db.query(Order).filter(Order.id == bundle_id).first()
    return [order] if order is not None else []


def _current_payment(db: Session, invoice: Invoice) -> dict[str, Any]:
    current_orders = _get_bundle_orders(db, invoice.source_bundle_id)
    fallback = (invoice.snapshot or {}).get("payment_fallback") or {}
    if not current_orders:
        return {
            "paid": bool(fallback.get("paid")),
            "payment_method": fallback.get("payment_method"),
            "payment_method_other": fallback.get("payment_method_other"),
            "source": "snapshot",
            "order_exists": False,
        }
    primary = current_orders[0]
    return {
        "paid": all(bool(order.paid) for order in current_orders),
        "payment_method": primary.payment_method,
        "payment_method_other": primary.payment_method_other,
        "source": "order",
        "order_exists": True,
    }


def _invoice_dict(db: Session, invoice: Invoice, *, include_snapshot: bool) -> dict[str, Any]:
    snapshot = invoice.snapshot or {}
    order_snapshot = snapshot.get("order") or {}
    payload = {
        "id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "number_year": invoice.number_year,
        "source_bundle_id": invoice.source_bundle_id,
        "source_order_id": invoice.source_order_id,
        "source_event_id": invoice.source_event_id,
        "order_reference": order_snapshot.get("reference"),
        "event_name": order_snapshot.get("event_name"),
        "customer_name": invoice.customer_name,
        "customer_email": invoice.customer_email,
        "customer_phone": invoice.customer_phone,
        "issue_date": invoice.issue_date.isoformat(),
        "due_date": invoice.due_date.isoformat(),
        "memo": invoice.memo,
        "currency": invoice.currency,
        "subtotal": float(invoice.subtotal),
        "discount_total": float(invoice.discount_total),
        "total": float(invoice.total),
        "payment": _current_payment(db, invoice),
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


@router.get("/invoice-settings")
def get_invoice_settings(
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    settings = _get_settings(db)
    return _settings_dict(settings)


@router.put("/invoice-settings")
def update_invoice_settings(
    body: InvoiceSettingsUpdate,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    settings = _get_settings(db)
    for field_name, value in body.model_dump().items():
        setattr(settings, field_name, str(value) if isinstance(value, EmailStr) else value)
    settings.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(settings)
    return _settings_dict(settings)


@router.get("/invoices")
def list_invoices(
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    invoices = db.query(Invoice).order_by(Invoice.created_at.desc(), Invoice.invoice_number.desc()).all()
    return [_invoice_dict(db, invoice, include_snapshot=False) for invoice in invoices]


@router.post("/invoices", status_code=status.HTTP_201_CREATED)
def create_invoice(
    body: InvoiceCreate,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    existing = db.query(Invoice).filter(Invoice.source_bundle_id == body.source_bundle_id).first()
    if existing is not None:
        raise HTTPException(status_code=409, detail={"message": "This order already has an invoice", "invoice_id": existing.id})

    orders = _get_bundle_orders(db, body.source_bundle_id)
    if not orders:
        raise HTTPException(status_code=404, detail="Order bundle not found")
    primary = orders[0]
    customer_name = body.customer_name or str(primary.name or "").strip()
    if not customer_name:
        raise HTTPException(status_code=422, detail="Customer name is required")
    due_date = body.due_date or default_due_date(body.issue_date, getattr(primary, "pickup_date", None))
    settings = _get_settings(db)
    event = db.query(Event).filter(Event.id == primary.event_id).first()
    snapshot = build_invoice_snapshot(
        orders=orders,
        settings=settings,
        event_name=event.name if event is not None else None,
        issue_date=body.issue_date,
        due_date=due_date,
        customer_name=customer_name,
        customer_email=str(body.customer_email) if body.customer_email is not None else primary.email,
        customer_phone=body.customer_phone if body.customer_phone is not None else primary.phone_number,
        memo=body.memo,
    )
    invoice_number, sequence = next_invoice_number(db, body.issue_date.year)
    amounts = snapshot["amounts"]
    customer = snapshot["customer"]
    invoice = Invoice(
        id=str(uuid.uuid4()),
        invoice_number=invoice_number,
        number_year=body.issue_date.year,
        number_sequence=sequence,
        source_bundle_id=body.source_bundle_id,
        source_order_id=str(primary.id),
        source_event_id=int(primary.event_id) if primary.event_id is not None else None,
        customer_name=customer["name"],
        customer_email=customer.get("email"),
        customer_phone=customer.get("phone"),
        issue_date=body.issue_date,
        due_date=due_date,
        memo=optional_text(body.memo),
        currency=snapshot["currency"],
        subtotal=amounts["subtotal"],
        discount_total=amounts["discount_total"],
        total=amounts["total"],
        snapshot=snapshot,
    )
    db.add(invoice)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        duplicate = db.query(Invoice).filter(Invoice.source_bundle_id == body.source_bundle_id).first()
        if duplicate is not None:
            raise HTTPException(status_code=409, detail={"message": "This order already has an invoice", "invoice_id": duplicate.id}) from exc
        raise
    db.refresh(invoice)
    return _invoice_dict(db, invoice, include_snapshot=True)


@router.get("/invoices/by-bundle/{bundle_id}")
def get_invoice_by_bundle(
    bundle_id: str,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    invoice = db.query(Invoice).filter(Invoice.source_bundle_id == bundle_id).first()
    if invoice is None:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return _invoice_dict(db, invoice, include_snapshot=False)


@router.get("/invoices/{invoice_id}")
def get_invoice(
    invoice_id: str,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    return _invoice_dict(db, _require_invoice(db, invoice_id), include_snapshot=True)


@router.patch("/invoices/{invoice_id}")
def update_invoice(
    invoice_id: str,
    body: InvoiceUpdate,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    invoice = _require_invoice(db, invoice_id)
    fields = body.model_fields_set
    next_issue_date = body.issue_date if "issue_date" in fields and body.issue_date is not None else invoice.issue_date
    next_due_date = body.due_date if "due_date" in fields and body.due_date is not None else invoice.due_date
    if next_issue_date.year != invoice.number_year:
        raise HTTPException(status_code=422, detail="Issue date must remain in the invoice number year")
    if next_due_date < next_issue_date:
        raise HTTPException(status_code=422, detail="Due date cannot be earlier than issue date")

    if "customer_name" in fields:
        if not body.customer_name:
            raise HTTPException(status_code=422, detail="Customer name is required")
        invoice.customer_name = body.customer_name
    if "customer_email" in fields:
        invoice.customer_email = str(body.customer_email) if body.customer_email is not None else None
    if "customer_phone" in fields:
        invoice.customer_phone = body.customer_phone
    if "memo" in fields:
        invoice.memo = body.memo
    invoice.issue_date = next_issue_date
    invoice.due_date = next_due_date
    invoice.updated_at = datetime.now(timezone.utc)

    snapshot = copy.deepcopy(invoice.snapshot or {})
    snapshot.setdefault("customer", {}).update({
        "name": invoice.customer_name,
        "email": invoice.customer_email,
        "phone": invoice.customer_phone,
    })
    snapshot.setdefault("invoice", {}).update({
        "issue_date": invoice.issue_date.isoformat(),
        "due_date": invoice.due_date.isoformat(),
        "memo": invoice.memo,
    })
    invoice.snapshot = snapshot
    db.commit()
    db.refresh(invoice)
    return _invoice_dict(db, invoice, include_snapshot=True)


@router.delete("/invoices/{invoice_id}")
def delete_invoice(
    invoice_id: str,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    invoice = _require_invoice(db, invoice_id)
    db.delete(invoice)
    db.commit()
    return {"success": True}


@router.get("/invoices/{invoice_id}/pdf")
def export_invoice_pdf(
    invoice_id: str,
    db: Session = Depends(get_db),
    _: dict = Depends(verify_admin_token),
):
    invoice = _require_invoice(db, invoice_id)
    payment = _current_payment(db, invoice)
    pdf = build_invoice_pdf(invoice_number=invoice.invoice_number, snapshot=invoice.snapshot or {}, payment=payment)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{invoice.invoice_number}.pdf"'},
    )
