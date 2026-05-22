import uuid
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict


class TicketTypeCreate(BaseModel):
    role_name: str = Field(min_length=1, max_length=100)
    tier_name: str = Field(min_length=1, max_length=100)
    price: float = Field(ge=0.0)


class TicketTypeUpdate(BaseModel):
    price: Optional[float] = Field(None, ge=0.0)


class TicketTypeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    event_id: uuid.UUID
    role_name: str
    tier_name: str
    price: float
