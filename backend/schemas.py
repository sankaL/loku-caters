from pydantic import BaseModel, EmailStr, field_validator


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
