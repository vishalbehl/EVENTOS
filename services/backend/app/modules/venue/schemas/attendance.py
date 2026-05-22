import uuid
from datetime import datetime
from typing import Optional, Dict, Any
from pydantic import BaseModel, ConfigDict, Field


class CheckInRequest(BaseModel):
    # Support checking in by participant_id, badge_code, or nfc_uid
    participant_id: Optional[uuid.UUID] = None
    badge_code: Optional[str] = None
    nfc_uid: Optional[str] = None
    session_id: Optional[uuid.UUID] = None
    method: str = Field(default="qr", max_length=50)  # qr, nfc, barcode, manual, self
    device_id: str = Field(default="unknown", max_length=100)


class CheckOutRequest(BaseModel):
    participant_id: Optional[uuid.UUID] = None
    badge_code: Optional[str] = None
    nfc_uid: Optional[str] = None
    session_id: Optional[uuid.UUID] = None
    device_id: str = Field(default="unknown", max_length=100)


class AttendanceLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    participant_id: uuid.UUID
    session_id: Optional[uuid.UUID] = None
    checkin_time: datetime
    checkout_time: Optional[datetime] = None
    duration: Optional[int] = None
    method: str
    device_id: str
    created_at: datetime


class AttendanceMetricsResponse(BaseModel):
    total_registered: int
    total_checked_in: int
    attendance_rate: float
    no_show_count: int
    no_show_rate: float
    session_occupancy: Dict[str, int]
