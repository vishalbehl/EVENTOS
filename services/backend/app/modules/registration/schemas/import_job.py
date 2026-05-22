# =============================================================
# Excel import job schemas
# =============================================================
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict


class ImportJobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    event_id: uuid.UUID
    filename: str
    status: str
    rows_total: int
    rows_imported: int
    rows_failed: int
    sessions_created: int
    speakers_created: int
    rooms_created: int
    error_summary: Optional[Any] = None
    completed_at: Optional[datetime] = None
    created_at: datetime


class ImportPreviewRow(BaseModel):
    """Single parsed row shown in dry-run preview."""
    row_number: int
    session_code: Optional[str] = None
    session_name: Optional[str] = None
    room_name: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    talk_start_time: Optional[str] = None
    talk_end_time: Optional[str] = None
    talk_duration_min: Optional[int] = None
    presentation_title: Optional[str] = None
    speaker_first_name: Optional[str] = None
    speaker_last_name: Optional[str] = None
    speaker_email: Optional[str] = None
    errors: List[str] = []
    warnings: List[str] = []
    is_valid: bool = True


class ImportPreviewResponse(BaseModel):
    """Dry-run result before the organizer confirms the import."""
    job_id: uuid.UUID
    rows_total: int
    rows_valid: int
    rows_with_errors: int
    rows_with_warnings: int
    sessions_to_create: int
    speakers_to_create: int
    rooms_to_create: int
    preview_rows: List[ImportPreviewRow]
    can_import: bool    # True if no blocking errors


class ColumnMappingRequest(BaseModel):
    """
    When the Excel headers don't match expected names, the
    organizer maps each column to the correct field.
    """
    job_id: uuid.UUID
    mapping: Dict[str, str]  # {"Column A": "session_code", ...}


class ImportConfirmRequest(BaseModel):
    job_id: uuid.UUID
