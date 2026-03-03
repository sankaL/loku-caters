from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator


class OrderCreate(BaseModel):
    name: str
    item_id: str
    quantity: int
    pickup_location: str
    pickup_time_slot: str
    phone_number: Optional[str] = None
    email: EmailStr

    @field_validator("quantity")
    @classmethod
    def quantity_must_be_positive(cls, v: int) -> int:
        if v < 1:
            raise ValueError("Quantity must be at least 1")
        return v

    @field_validator("name", "item_id", "pickup_location", "pickup_time_slot")
    @classmethod
    def must_not_be_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Field cannot be empty")
        return v.strip()

    @field_validator("phone_number", mode="before")
    @classmethod
    def normalize_phone(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        stripped = str(v).strip()
        return stripped or None


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
    minimum_order_quantity: Optional[int] = None

    @field_validator("minimum_order_quantity")
    @classmethod
    def minimum_order_must_be_positive(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and v < 1:
            raise ValueError("Minimum order quantity must be at least 1")
        return v


class ItemUpdate(BaseModel):
    name: str
    description: str = ""
    price: float
    discounted_price: Optional[float] = None
    minimum_order_quantity: Optional[int] = None

    @field_validator("minimum_order_quantity")
    @classmethod
    def minimum_order_must_be_positive(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and v < 1:
            raise ValueError("Minimum order quantity must be at least 1")
        return v


class ItemResponse(BaseModel):
    id: str
    name: str
    description: str
    price: float
    discounted_price: Optional[float]
    minimum_order_quantity: int
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
}

FEEDBACK_REASON_LABELS = {
    "price_too_high": "Price too high",
    "location_not_convenient": "Pickup location not convenient",
    "dietary_needs": "Food does not meet dietary needs",
    "not_available": "Not available on the event date",
    "different_menu": "Prefer a different menu item",
    "prefer_delivery": "Prefer delivery over pickup",
    "not_interested": "Not interested at this time",
    "other": "Other",
}

FEEDBACK_ORIGINS = {
    "contact_us",
    "events_page_non_customer",
    "events_page_customer",
}

FEEDBACK_ORIGIN_LABELS = {
    "contact_us": "Contact Us",
    "events_page_non_customer": "Events Page (Non-customer)",
    "events_page_customer": "Events Page (Customer)",
}

FEEDBACK_TYPES = {
    "general_question",
    "feedback",
    "collaboration",
    "other",
}

FEEDBACK_TYPE_LABELS = {
    "general_question": "General Question",
    "feedback": "Feedback",
    "collaboration": "Collaboration",
    "other": "Other",
}

LEGACY_FEEDBACK_TYPES = {"non_customer", "customer", "general_contact"}

LEGACY_CONTACT_REASON_TO_TYPE = {
    "catering_inquiry": "general_question",
    "previous_order_inquiry": "general_question",
    "stay_updated": "other",
    "general_feedback": "feedback",
    "other": "other",
}

LEGACY_CONTACT_REASONS = set(LEGACY_CONTACT_REASON_TO_TYPE)

LEGACY_CONTACT_SUBJECT_TO_TYPE = {
    "general question": "general_question",
    "feedback": "feedback",
    "collaboration": "collaboration",
    "other": "other",
}


class FeedbackCreate(BaseModel):
    origin: Optional[str] = None
    feedback_type: Optional[str] = None
    order_id: Optional[str] = None
    name: Optional[str] = None
    contact: Optional[str] = None
    reason: Optional[str] = None
    other_details: Optional[str] = None
    message: Optional[str] = None

    @field_validator("origin")
    @classmethod
    def origin_must_be_valid(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in FEEDBACK_ORIGINS:
            raise ValueError("Invalid feedback origin")
        return v

    @field_validator("reason")
    @classmethod
    def reason_must_be_valid(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in FEEDBACK_REASONS and v not in LEGACY_CONTACT_REASONS:
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


def parse_legacy_contact_subject(message: Optional[str]) -> tuple[Optional[str], Optional[str]]:
    if not message:
        return None, message

    lines = message.splitlines()
    if not lines:
        return None, message

    first_line = lines[0].strip()
    if not first_line.startswith("Subject:"):
        return None, message

    subject = first_line[len("Subject:"):].strip().lower()
    feedback_type = LEGACY_CONTACT_SUBJECT_TO_TYPE.get(subject, "other")

    remaining_lines = lines[1:]
    while remaining_lines and not remaining_lines[0].strip():
        remaining_lines = remaining_lines[1:]

    normalized_message = "\n".join(remaining_lines).strip() or None
    return feedback_type, normalized_message


def normalize_feedback_create(feedback_in: FeedbackCreate) -> dict[str, Optional[str]]:
    origin = feedback_in.origin
    feedback_type = feedback_in.feedback_type
    reason = feedback_in.reason
    other_details = feedback_in.other_details
    message = feedback_in.message

    if origin is None:
        if feedback_type is None:
            feedback_type = "non_customer"
        if feedback_type == "customer":
            origin = "events_page_customer"
            feedback_type = "feedback"
        elif feedback_type == "non_customer":
            parsed_type, normalized_message = parse_legacy_contact_subject(message)
            if parsed_type:
                origin = "contact_us"
                feedback_type = parsed_type
                message = normalized_message
                reason = None
            else:
                origin = "events_page_non_customer"
                feedback_type = "feedback"
        elif feedback_type == "general_contact":
            origin = "contact_us"
            feedback_type = LEGACY_CONTACT_REASON_TO_TYPE.get(reason or "", "other")
            reason = None
        else:
            raise ValueError("Invalid feedback type")
    else:
        if feedback_type is None:
            if origin in {"events_page_non_customer", "events_page_customer"}:
                feedback_type = "feedback"
            else:
                feedback_type = "other"
        elif feedback_type in LEGACY_FEEDBACK_TYPES:
            if feedback_type in {"customer", "non_customer"}:
                feedback_type = "feedback"
            elif feedback_type == "general_contact":
                feedback_type = LEGACY_CONTACT_REASON_TO_TYPE.get(reason or "", "other")
                reason = None

    if feedback_type not in FEEDBACK_TYPES:
        raise ValueError("Invalid feedback type")

    if origin == "events_page_non_customer":
        if feedback_type != "feedback":
            raise ValueError("Events page non-customer feedback must use type 'feedback'")
        if reason is not None and reason not in FEEDBACK_REASONS:
            raise ValueError("Invalid feedback reason")
    else:
        if feedback_type != "feedback" and origin in {"events_page_customer"}:
            raise ValueError("Events page customer feedback must use type 'feedback'")
        reason = None
        other_details = None

    return {
        "origin": origin,
        "feedback_type": feedback_type,
        "order_id": feedback_in.order_id,
        "name": feedback_in.name,
        "contact": feedback_in.contact,
        "reason": reason,
        "other_details": other_details,
        "message": message,
    }


class CateringRequestCreate(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    phone_number: Optional[str] = None
    event_date: str
    guest_count: int
    event_type: str
    budget_range: Optional[str] = None
    special_requests: Optional[str] = None

    @field_validator("guest_count")
    @classmethod
    def count_must_be_positive(cls, v: int) -> int:
        if v < 1:
            raise ValueError("Guest count must be at least 1")
        return v

    @field_validator("first_name", "last_name", "event_date", "event_type")
    @classmethod
    def required_non_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Field cannot be empty")
        return v.strip()


class CateringRequestResponse(BaseModel):
    success: bool
    request_id: str


CATERING_REQUEST_STATUSES = {"new", "in_review", "in_progress", "rejected", "done"}


class CateringRequestStatusUpdate(BaseModel):
    status: str

    @field_validator("status")
    @classmethod
    def status_must_be_valid(cls, v: str) -> str:
        if v not in CATERING_REQUEST_STATUSES:
            raise ValueError("Invalid status")
        return v


class CateringRequestCommentCreate(BaseModel):
    comment: str

    @field_validator("comment")
    @classmethod
    def comment_must_not_be_empty(cls, v: str) -> str:
        stripped = v.strip()
        if not stripped:
            raise ValueError("Comment cannot be empty")
        return stripped
