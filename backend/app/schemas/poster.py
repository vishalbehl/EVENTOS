# backend/app/schemas/poster.py
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional, List, Dict

from pydantic import BaseModel, field_validator


POSTER_STATUSES = ("pending", "submitted", "under_review", "approved", "rejected", "withdrawn")


class PosterCreate(BaseModel):
    """Called by speaker portal / organizer to register a new poster."""
    title: str
    authors: str
    category: Optional[str] = None
    abstract: Optional[str] = None
    speaker_id: Optional[uuid.UUID] = None  # Link to speaker if applicable
    session_id: Optional[uuid.UUID] = None  # Link to session for scheduling

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str) -> str:
        if len(v.strip()) < 5:
            raise ValueError("Title must be at least 5 characters.")
        return v.strip()


class PosterUpdate(BaseModel):
    title: Optional[str] = None
    authors: Optional[str] = None
    category: Optional[str] = None
    abstract: Optional[str] = None
    session_id: Optional[uuid.UUID] = None
    status: Optional[str] = None


class PosterReviewRequest(BaseModel):
    """Organizer approves or rejects a poster submission."""
    decision: str  # "approved" | "rejected"
    rejection_reason: Optional[str] = None

    @field_validator("decision")
    @classmethod
    def validate_decision(cls, v: str) -> str:
        if v not in ("approved", "rejected"):
            raise ValueError("decision must be 'approved' or 'rejected'")
        return v

    def model_post_init(self, __context: object) -> None:
        if self.decision == "rejected" and not self.rejection_reason:
            raise ValueError("rejection_reason is required when rejecting a poster.")


class PosterScheduleRequest(BaseModel):
    """Assign an approved poster to a physical display screen."""
    display_screen: str  # e.g. "lobby-left", "screen-3"
    display_order: int = 0
    is_featured: bool = False

    @field_validator("display_screen")
    @classmethod
    def validate_screen(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("display_screen cannot be empty.")
        return v.strip().lower()


class PosterUploadRequest(BaseModel):
    """Author requests a presigned URL to upload their poster file."""
    filename: str
    file_size_bytes: int
    mime_type: Optional[str] = None
    # FULL | LIMITED | NONE
    recording_rights: Optional[str] = "NONE"

    @field_validator("file_size_bytes")
    @classmethod
    def validate_size(cls, v: int) -> int:
        max_bytes = 100 * 1024 * 1024  # Increased to 100 MB
        if v > max_bytes:
            raise ValueError("Poster file exceeds maximum size of 100 MB.")
        return v

    @field_validator("filename")
    @classmethod
    def validate_filename(cls, v: str) -> str:
        restricted = {
            "exe", "msi", "bat", "cmd", "ps1", "vbs", "sh", "bin", 
            "com", "scr", "pif", "js", "jar", "app", "dmg", "pkg"
        }
        ext = v.split('.')[-1].lower().strip() if '.' in v else ""
        if ext in restricted:
            raise ValueError(f"File format '.{ext}' is restricted for security reasons.")
        return v


class PresignedPosterUploadResponse(BaseModel):
    poster_id: uuid.UUID
    upload_url: str
    expires_in: int


class PosterBatchScheduleRequest(BaseModel):
    # Map of screen_id -> list of poster_ids
    assignments: Dict[str, List[uuid.UUID]]

class PosterBatchStatusRequest(BaseModel):
    poster_ids: List[uuid.UUID]
    status: str


class PosterResponse(BaseModel):
    id: uuid.UUID
    event_id: uuid.UUID
    speaker_id: Optional[uuid.UUID] = None
    speaker_name: Optional[str] = None
    speaker_email: Optional[str] = None
    reviewed_by: Optional[uuid.UUID] = None
    title: str
    authors: Optional[str] = None
    category: Optional[str] = None
    abstract: Optional[str] = None
    storage_path: Optional[str] = None
    original_filename: Optional[str] = None
    file_size_bytes: Optional[int] = None
    thumbnail_url: Optional[str] = None
    status: str
    rejection_reason: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    display_screen: Optional[str] = None
    display_order: int
    is_featured: bool
    version_number: int
    session_id: Optional[uuid.UUID] = None
    submitted_at: datetime
    created_at: datetime

    model_config = {"from_attributes": True}
