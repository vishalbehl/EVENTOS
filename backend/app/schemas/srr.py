# =============================================================
# Speaker Ready Room schemas
# =============================================================
import uuid
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field, ConfigDict


class StationCreate(BaseModel):
    station_number: int = Field(ge=1)
    device_name: Optional[str] = Field(None, max_length=100)
    ip_address: Optional[str] = None


class StationUpdate(BaseModel):
    device_name: Optional[str] = Field(None, max_length=100)
    ip_address: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class StationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    event_id: uuid.UUID
    station_number: int
    device_name: Optional[str] = None
    ip_address: Optional[str] = None
    status: str
    assigned_speaker_id: Optional[uuid.UUID] = None
    session_assigned_at: Optional[datetime] = None
    last_heartbeat_at: Optional[datetime] = None
    notes: Optional[str] = None
    is_active: bool
    updated_at: datetime


class StationAssignRequest(BaseModel):
    station_id: uuid.UUID
    speaker_id: uuid.UUID


class StationResetRequest(BaseModel):
    station_id: uuid.UUID
    reason: Optional[str] = None


class CheckinResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    event_id: uuid.UUID
    speaker_id: uuid.UUID
    station_id: Optional[uuid.UUID] = None
    checkin_method: str
    checked_in_at: datetime
    checked_out_at: Optional[datetime] = None


class QRCheckinRequest(BaseModel):
    """Kiosk scans QR → sends token to API."""
    token: str = Field(min_length=1)


class QRCheckinResponse(BaseModel):
    """Returned to kiosk after successful check-in."""
    speaker_id: uuid.UUID
    speaker_name: str
    station_number: int
    station_id: uuid.UUID
    session_name: Optional[str] = None
    session_start_time: Optional[datetime] = None
    checkin_id: uuid.UUID


class ActivityLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    station_id: Optional[uuid.UUID] = None
    speaker_id: Optional[uuid.UUID] = None
    action: str
    details: Optional[dict] = None
    occurred_at: datetime
