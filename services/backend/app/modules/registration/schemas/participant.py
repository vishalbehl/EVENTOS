import uuid
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict, model_validator


class ParticipantCreate(BaseModel):
    # Support both single `name` and split first_name/last_name.
    # At least one of name or first_name must be provided.
    name: Optional[str] = Field(None, max_length=255)
    first_name: Optional[str] = Field(None, max_length=150)
    last_name: Optional[str] = Field(None, max_length=150)
    email: Optional[str] = Field(None, max_length=320)
    phone: Optional[str] = Field(None, max_length=30)
    role: str = Field(default="Delegate", max_length=50)
    role_id: Optional[uuid.UUID] = Field(None)
    roles: List[str] = Field(default_factory=list)
    track_id: Optional[uuid.UUID] = Field(None)
    company: Optional[str] = Field(None, max_length=255)
    designation: Optional[str] = Field(None, max_length=255)
    country: Optional[str] = Field(None, max_length=100)
    paid_status: str = Field(default="Unpaid", max_length=30)
    source: str = Field(default="offline", max_length=30)
    regno: Optional[str] = Field(None, max_length=50)
    custom_fields: Optional[dict] = Field(default_factory=dict)
    confirm_merge: bool = Field(default=False)

    @model_validator(mode="after")
    def derive_name_fields(self) -> "ParticipantCreate":
        fn = (self.first_name or "").strip()
        ln = (self.last_name or "").strip()
        nm = (self.name or "").strip()

        if fn or ln:
            # first/last provided → compose name
            self.first_name = fn
            self.last_name = ln
            self.name = f"{fn} {ln}".strip()
        elif nm:
            # only name provided → split on first space
            parts = nm.split(" ", 1)
            self.first_name = parts[0]
            self.last_name = parts[1] if len(parts) > 1 else ""
            self.name = nm
        else:
            raise ValueError("Either 'name' or 'first_name' must be provided.")
        return self


class ParticipantUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=255)
    first_name: Optional[str] = Field(None, max_length=150)
    last_name: Optional[str] = Field(None, max_length=150)
    email: Optional[str] = Field(None, max_length=320)
    phone: Optional[str] = Field(None, max_length=30)
    role: Optional[str] = Field(None, max_length=50)
    role_id: Optional[uuid.UUID] = Field(None)
    roles: Optional[List[str]] = Field(None)
    track_id: Optional[uuid.UUID] = Field(None)
    company: Optional[str] = Field(None, max_length=255)
    designation: Optional[str] = Field(None, max_length=255)
    country: Optional[str] = Field(None, max_length=100)
    paid_status: Optional[str] = Field(None, max_length=30)
    regno: Optional[str] = Field(None, max_length=50)
    custom_fields: Optional[dict] = Field(None)

    @model_validator(mode="after")
    def derive_name_fields(self) -> "ParticipantUpdate":
        fn = self.first_name
        ln = self.last_name
        nm = self.name

        if fn is not None and ln is not None:
            self.first_name = fn.strip()
            self.last_name = ln.strip()
            self.name = f"{self.first_name} {self.last_name}".strip()
            self.model_fields_set.update({"first_name", "last_name", "name"})
        elif nm is not None:
            nm = nm.strip()
            parts = nm.split(" ", 1)
            self.first_name = parts[0]
            self.last_name = parts[1] if len(parts) > 1 else ""
            self.name = nm
            self.model_fields_set.update({"first_name", "last_name", "name"})
        return self


class ParticipantResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    event_id: uuid.UUID
    regno: Optional[str] = None
    name: str
    first_name: str = ""
    last_name: str = ""
    email: Optional[str] = None
    phone: Optional[str] = None
    role_id: Optional[uuid.UUID] = None
    role: str
    roles: List[str] = []
    track_id: Optional[uuid.UUID] = None
    company: Optional[str] = None
    designation: Optional[str] = None
    country: Optional[str] = None
    approval_status: str
    paid_status: str
    badge_status: str
    checkin_status: str
    source: str
    qr_code_url: Optional[str] = None
    custom_fields: dict = {}
    is_free: bool = False
    registered_at: datetime
    updated_at: datetime


class RegistrationConfirmationQRRequest(BaseModel):
    reason: str = Field(min_length=5, max_length=1000)
    case_reference: Optional[str] = Field(None, max_length=160)


class RegistrationConfirmationQRResponse(BaseModel):
    credential_id: uuid.UUID
    participant_id: uuid.UUID
    event_id: uuid.UUID
    status: str
    version: int
    verification_url: str
    image_url: str
    issued_at: datetime
    rotated_at: Optional[datetime] = None


class PublicRegistrationConfirmationResponse(BaseModel):
    valid: bool
    credential_id: uuid.UUID
    event_id: uuid.UUID
    event_name: str
    participant_name: str
    registration_number: Optional[str] = None
    approval_status: str
    issued_at: datetime
    freshness_at: datetime



class CheckInCreate(BaseModel):
    session_id: uuid.UUID


class CheckInResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    event_id: uuid.UUID
    participant_id: uuid.UUID
    session_id: uuid.UUID
    check_in_time: datetime
    updated_at: datetime


class SkippedImportRow(BaseModel):
    row: int
    name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    reason: str


class ExcelImportResponse(BaseModel):
    message: str
    inserted: int
    waitlisted: int
    merged: int
    skipped: int
    skipped_details: List[SkippedImportRow]
