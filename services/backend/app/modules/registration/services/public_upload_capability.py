"""Opaque, deterministic capabilities for scan-gated public form uploads."""
from __future__ import annotations

import hashlib
import hmac
import time
import uuid

from fastapi import HTTPException

from app.config import settings

_PURPOSE = "registration-public-upload-v1"
_MAX_LIFETIME_SECONDS = 7 * 24 * 60 * 60


def issue_public_upload_capability(
    *, upload_id: uuid.UUID, event_id: uuid.UUID, expires_at: int
) -> str:
    payload = f"{_PURPOSE}:{upload_id}:{event_id}:{expires_at}".encode("utf-8")
    signature = hmac.new(
        settings.JWT_SECRET_KEY.encode("utf-8"), payload, hashlib.sha256
    ).hexdigest()
    return f"{expires_at}.{signature}"


def verify_public_upload_capability(
    token: str | None, *, upload_id: uuid.UUID, event_id: uuid.UUID
) -> int:
    try:
        if not token or len(token) > 96:
            raise ValueError("invalid capability length")
        expiry_text, supplied = token.split(".", 1)
        expires_at = int(expiry_text)
        now = int(time.time())
        if expires_at < now or expires_at > now + _MAX_LIFETIME_SECONDS:
            raise ValueError("capability expired")
        expected = issue_public_upload_capability(
            upload_id=upload_id, event_id=event_id, expires_at=expires_at
        ).split(".", 1)[1]
        if not hmac.compare_digest(supplied, expected):
            raise ValueError("capability signature mismatch")
        return expires_at
    except (TypeError, ValueError):
        # Do not disclose whether an upload id exists.
        raise HTTPException(404, detail={"code": "UPLOAD_NOT_FOUND"}) from None


def public_upload_response(
    *, upload_id: uuid.UUID, event_id: uuid.UUID, filename: str, expires_at: int,
    status: str = "processing",
) -> dict[str, object]:
    capability = issue_public_upload_capability(
        upload_id=upload_id, event_id=event_id, expires_at=expires_at
    )
    return {
        "status": status,
        "upload_id": str(upload_id),
        "filename": filename,
        "capability": capability,
        "managed_url": (
            f"{settings.api_v1_prefix}/events/{event_id}/registration/uploads/"
            f"{upload_id}/download"
        ),
        "status_url": (
            f"{settings.api_v1_prefix}/portal/registration/{event_id}/uploads/{upload_id}"
        ),
    }
