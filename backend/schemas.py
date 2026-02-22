from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator


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
    id: str
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
    id: str
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


class EventCreate(BaseModel):
    name: str
    event_date: str
    hero_header: str = ""
    hero_subheader: str = ""
    promo_details: Optional[str] = None
    item_ids: list[str] = Field(default_factory=list)
    location_ids: list[str] = Field(default_factory=list)


class EventUpdate(BaseModel):
    name: str
    event_date: str
    hero_header: str = ""
    hero_subheader: str = ""
    promo_details: Optional[str] = None
    item_ids: list[str] = Field(default_factory=list)
    location_ids: list[str] = Field(default_factory=list)
