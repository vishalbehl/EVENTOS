# =============================================================
# File upload & validation schemas
# =============================================================
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, ConfigDict, field_validator


class UploadRequestBody(BaseModel):
    """Speaker asks for a presigned URL before uploading."""
    session_speaker_id: uuid.UUID
    filename: str = Field(min_length=1, max_length=500)
    file_size_bytes: int = Field(ge=1)
    mime_type: str = Field(max_length=100)
    file_format: str = Field(description="File extension without dot")
    # FULL | LIMITED | NONE
    recording_rights: Optional[str] = "NONE"

    @field_validator("file_format")
    @classmethod
    def validate_extension(cls, v: str) -> str:
        restricted = {
            "exe", "msi", "bat", "cmd", "ps1", "vbs", "sh", "bin", 
            "com", "scr", "pif", "js", "jar", "app", "dmg", "pkg"
        }
        ext = v.lower().strip().replace(".", "")
        if ext in restricted:
            raise ValueError(f"File format '.{ext}' is restricted for security reasons.")
        return ext


class PresignedUploadResponse(BaseModel):
    """Returned to the browser — it uploads directly to R2 using this URL."""
    upload_url: str           # Presigned PUT URL for R2/MinIO
    file_id: uuid.UUID        # Pre-created DB record ID
    expires_in: int           # Seconds until presigned URL expires
    max_file_size_bytes: int


class UploadConfirmRequest(BaseModel):
    """Browser calls this after the R2 PUT completes successfully."""
    file_id: uuid.UUID
    etag: Optional[str] = None   # R2 returns ETag on successful PUT


class FileValidationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    file_id: uuid.UUID
    slide_count: Optional[int] = None
    has_missing_fonts: bool = False
    missing_fonts_list: Optional[List[str]] = None
    has_unsupported_video: bool = False
    has_corrupted_slides: bool = False
    has_large_images: bool = False
    has_animations: bool = False
    has_transitions: bool = False
    notes_present: bool = False
    notes_slide_count: int = 0
    has_ole_objects: bool = False
    has_broken_ole: bool = False
    audio_objects_detected: bool = False
    audio_format_valid: bool = True
    internet_dependent_content: bool = False
    external_url_count: int = 0
    has_broken_internal_media: bool = False
    render_diff_detected: bool = False
    has_custom_addins: bool = False
    has_macros: bool = False
    pdf_fallback_forced: bool = False
    linked_assets_detected: bool = False
    linked_assets_resolved: bool = True
    image_links_detected: int = 0
    absolute_path_links_detected: int = 0
    
    # Forensic & Integrity
    sha256_hash: Optional[str] = None
    md5_hash: Optional[str] = None
    mime_type_detected: Optional[str] = None
    antivirus_status: str = "CLEAN"
    
    # Media & Advanced
    technical_metadata: Optional[Dict[str, Any]] = None
    is_bundle: bool = False
    bundle_contents: Optional[List[Dict[str, Any]]] = None

    overall_result: str         # pass | warning | fail
    error_details: Optional[Dict[str, Any]] = None
    image_count: int = 0
    video_count: int = 0
    animation_count: int = 0
    thumbnail_url: Optional[str] = None
    validated_at: datetime


class PresentationFileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    speaker_id: uuid.UUID
    session_speaker_id: uuid.UUID
    event_id: uuid.UUID

    # Contextual data for monitoring
    speaker_name: Optional[str] = None
    session_name: Optional[str] = None
    session_start_time: Optional[datetime] = None

    original_filename: str
    stored_filename: str
    storage_path: str
    file_format: str
    file_size_bytes: int
    version_number: int
    is_current_version: bool
    upload_source: str
    upload_status: str
    approved_by: Optional[uuid.UUID] = None
    approved_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    is_locked: bool
    local_sync_status: str
    uploaded_at: datetime
    recording_rights: Optional[str] = "NONE"
    validation: Optional[FileValidationResponse] = None


class FileApproveRequest(BaseModel):
    file_id: uuid.UUID


class FileRejectRequest(BaseModel):
    file_id: Optional[uuid.UUID] = None
    reason: str = Field(min_length=5, max_length=1000)


class FileBatchApproveRequest(BaseModel):
    file_ids: List[uuid.UUID] = Field(min_length=1, max_length=100)


class FileDownloadResponse(BaseModel):
    download_url: str   # Presigned GET URL
    expires_in: int     # Seconds
    filename: str
