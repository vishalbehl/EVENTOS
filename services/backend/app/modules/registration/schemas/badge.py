import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, ConfigDict, Field


class PrinterRegister(BaseModel):
    name: str = Field(..., max_length=100)
    ip_address: str = Field(..., max_length=50)
    location: str = Field(..., max_length=150)
    status: str = Field(default="offline", max_length=30)
    vendor_id: Optional[uuid.UUID] = None
    room_id: Optional[uuid.UUID] = None
    external_reference: Optional[str] = Field(default=None, max_length=150)
    deployment_starts_at: Optional[datetime] = None
    deployment_ends_at: Optional[datetime] = None


class PrinterResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    ip_address: str
    location: str
    status: str
    organization_id: Optional[uuid.UUID] = None
    event_id: Optional[uuid.UUID] = None
    vendor_id: Optional[uuid.UUID] = None
    room_id: Optional[uuid.UUID] = None
    external_reference: Optional[str] = None
    deployment_starts_at: Optional[datetime] = None
    deployment_ends_at: Optional[datetime] = None


class BadgeGenerateRequest(BaseModel):
    participant_id: uuid.UUID
    template_id: Optional[uuid.UUID] = None


class BadgeReprintRequest(BaseModel):
    badge_id: uuid.UUID
    printer_id: uuid.UUID
    reason: str = "damaged"  # damaged, correction, lost


class BadgeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    participant_id: uuid.UUID
    badge_code: str
    qr_token: str
    barcode: str
    nfc_uid: Optional[str] = None
    template_id: Optional[uuid.UUID] = None
    status: str
    issued_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class BadgeHistoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    badge_id: uuid.UUID
    action: str
    performed_by: Optional[uuid.UUID] = None
    metadata: Dict[str, Any] = Field(..., validation_alias="action_metadata")
    created_at: datetime


class BadgePrintJobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    badge_id: uuid.UUID
    printer_id: uuid.UUID
    status: str
    queued_at: datetime
    printed_at: Optional[datetime] = None


class BadgeScanResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    badge_id: uuid.UUID
    location: str
    scan_type: str
    created_at: datetime
