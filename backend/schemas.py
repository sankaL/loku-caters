from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator


class OrderCreate(BaseModel):
    name: str
    item_id: str
    quantity: int
    pickup_location: str
    pickup_time_slot: str
    phone_number: str
    email: EmailStr

    @field_validator("quantity")
    @classmethod
    def quantity_must_be_positive(cls, v: int) -> int:
        if v < 1:
            raise ValueError("Quantity must be at least 1")
        return v

    @field_validator("name", "item_id", "pickup_location", "pickup_time_slot", "phone_number")
    @classmethod
    def must_not_be_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Field cannot be empty")
        return v.strip()


class OrderResponse(BaseModel):
    success: bool
    order_id: str
    message: str
    order: dict


class ItemCreate(BaseModel):
    name: str
    description: str = ""
    price: float
    discounted_price: Optional[float] = None


class ItemUpdate(BaseModel):
    name: str
    description: str = ""
    price: float
    discounted_price: Optional[float] = None


class ItemResponse(BaseModel):
    id: str
    name: str
    description: str
    price: float
    discounted_price: Optional[float]
    sort_order: int


class LocationCreate(BaseModel):
    name: str
    address: str = ""
    time_slots: list[str] = Field(default_factory=list)


class LocationUpdate(BaseModel):
    name: str
    address: str = ""
    time_slots: list[str] = Field(default_factory=list)


class LocationResponse(BaseModel):
    id: str
    name: str
    address: str
    time_slots: list[str]
    sort_order: int


class EventBase(BaseModel):
    name: str
    event_date: str
    hero_header: str
    hero_header_sage: str = ""
    hero_subheader: str = ""
    promo_details: Optional[str] = None
    tooltip_enabled: bool = False
    tooltip_header: Optional[str] = None
    tooltip_body: Optional[str] = None
    tooltip_image_key: Optional[str] = None
    hero_side_image_key: Optional[str] = None
    etransfer_enabled: bool = False
    etransfer_email: Optional[EmailStr] = None
    item_ids: list[str] = Field(default_factory=list)
    location_ids: list[str] = Field(default_factory=list)

    @field_validator("name", "event_date", "hero_header")
    @classmethod
    def required_text_fields(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("Field cannot be empty")
        return stripped

    @field_validator("hero_header_sage", "hero_subheader")
    @classmethod
    def optional_text_fields(cls, v: Optional[str]) -> str:
        return (v or "").strip()

    @field_validator("etransfer_email", mode="before")
    @classmethod
    def normalize_etransfer_email(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        stripped = str(v).strip()
        return stripped or None

    @field_validator("promo_details", "tooltip_header", "tooltip_body", "tooltip_image_key", "hero_side_image_key")
    @classmethod
    def optional_nullable_fields(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        stripped = v.strip()
        return stripped or None

    @model_validator(mode="after")
    def validate_tooltip_fields(self) -> "EventBase":
        if self.tooltip_enabled:
            if not self.tooltip_header:
                raise ValueError("tooltip_header is required when tooltip is enabled")
            if not self.tooltip_body:
                raise ValueError("tooltip_body is required when tooltip is enabled")
        else:
            self.tooltip_header = None
            self.tooltip_body = None
            self.tooltip_image_key = None

        if self.etransfer_enabled:
            if not self.etransfer_email:
                raise ValueError("etransfer_email is required when e-transfer is enabled")
        else:
            self.etransfer_email = None
        return self


class EventCreate(EventBase):
    pass


class EventUpdate(EventBase):
    pass


FEEDBACK_REASONS = {
    "price_too_high",
    "location_not_convenient",
    "dietary_needs",
    "not_available",
    "different_menu",
    "prefer_delivery",
    "not_interested",
    "other",
    "catering_inquiry",
    "previous_order_inquiry",
    "stay_updated",
    "general_feedback",
}

FEEDBACK_TYPES = {"non_customer", "customer", "general_contact"}


class FeedbackCreate(BaseModel):
    feedback_type: str = "non_customer"
    order_id: Optional[str] = None
    name: Optional[str] = None
    contact: Optional[str] = None
    reason: Optional[str] = None
    other_details: Optional[str] = None
    message: Optional[str] = None

    @field_validator("feedback_type")
    @classmethod
    def type_must_be_valid(cls, v: str) -> str:
        if v not in FEEDBACK_TYPES:
            raise ValueError("Invalid feedback type")
        return v

    @field_validator("reason")
    @classmethod
    def reason_must_be_valid(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in FEEDBACK_REASONS:
            raise ValueError("Invalid feedback reason")
        return v


class FeedbackResponse(BaseModel):
    success: bool
    feedback_id: str


FEEDBACK_STATUSES = {"new", "in_progress", "resolved"}


class FeedbackStatusUpdate(BaseModel):
    status: str

    @field_validator("status")
    @classmethod
    def status_must_be_valid(cls, v: str) -> str:
        if v not in FEEDBACK_STATUSES:
            raise ValueError("Invalid status")
        return v


class FeedbackCommentUpdate(BaseModel):
    admin_comment: Optional[str] = None
