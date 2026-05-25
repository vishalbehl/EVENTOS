import uuid
from typing import Optional
from pydantic import BaseModel, ConfigDict


class CapacityRuleCreate(BaseModel):
    session_id: Optional[uuid.UUID] = None
    room_id: Optional[uuid.UUID] = None
    capacity: int
    waitlist_enabled: bool = True
    auto_promote: bool = True
    priority_enabled: bool = False


class CapacityRuleUpdate(BaseModel):
    capacity: Optional[int] = None
    waitlist_enabled: Optional[bool] = None
    auto_promote: Optional[bool] = None
    priority_enabled: Optional[bool] = None


class CapacityRuleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    event_id: uuid.UUID
    session_id: Optional[uuid.UUID] = None
    room_id: Optional[uuid.UUID] = None
    capacity: int
    waitlist_enabled: bool
    auto_promote: bool
    priority_enabled: bool


class CapacityStatusResponse(BaseModel):
    id: Optional[uuid.UUID] = None
    level: str  # event, session, room
    target_id: uuid.UUID
    target_name: str
    capacity: int
    current_occupancy: int
    waitlist_count: int
    occupancy_rate: float
