from __future__ import annotations

import hashlib
import mimetypes
from pathlib import Path

from fastapi import HTTPException, status

from app.config import settings


def validate_upload_metadata(*, filename: str, mime_type: str, size_bytes: int, declared_checksum: str | None = None) -> None:
    if not filename or Path(filename).name != filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"code": "INVALID_FILENAME", "message": "Filename must be a simple file name."})
    if size_bytes < 1 or size_bytes > settings.MAX_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail={"code": "FILE_TOO_LARGE", "message": "File exceeds the configured size limit."})
    if settings.ALLOWED_MIME_TYPES and mime_type not in settings.ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail={"code": "MIME_TYPE_NOT_ALLOWED", "message": "File type is not allowed."})
    if declared_checksum is not None and (
        len(declared_checksum) != 64
        or any(character not in "0123456789abcdefABCDEF" for character in declared_checksum)
    ):
        raise HTTPException(status_code=400, detail={"code": "INVALID_CHECKSUM", "message": "Checksum must be SHA-256."})
    guessed_mime, _ = mimetypes.guess_type(filename)
    if guessed_mime and mime_type and guessed_mime != mime_type:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail={"code": "MIME_EXTENSION_MISMATCH", "message": "Filename extension does not match the declared file type."},
        )


def sha256_digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def validate_file_signature(data: bytes, mime_type: str) -> None:
    """Reject objects whose leading bytes contradict their declared type."""
    signatures = {
        "application/pdf": data.startswith(b"%PDF-"),
        "application/vnd.openxmlformats-officedocument.presentationml.presentation": data.startswith(b"PK\x03\x04"),
        "application/vnd.ms-powerpoint": data.startswith(b"\xd0\xcf\x11\xe0"),
        "application/vnd.apple.keynote": data.startswith(b"PK\x03\x04"),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": data.startswith(b"PK\x03\x04"),
        "application/vnd.ms-excel": data.startswith(b"\xd0\xcf\x11\xe0"),
        "video/mp4": len(data) >= 12 and data[4:8] == b"ftyp",
    }
    if mime_type in signatures and not signatures[mime_type]:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail={"code": "FILE_SIGNATURE_MISMATCH", "message": "File contents do not match the declared file type."},
        )
