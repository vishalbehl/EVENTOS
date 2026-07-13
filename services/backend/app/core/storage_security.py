from __future__ import annotations

import hashlib
import hmac
import time
import uuid

from app.config import settings


class StorageCapabilityError(ValueError):
    pass


def create_local_storage_capability(
    *,
    method: str,
    bucket: str,
    key: str,
    organization_id: uuid.UUID,
    expires_at: int,
) -> str:
    if not isinstance(organization_id, uuid.UUID):
        raise StorageCapabilityError("A verified organization UUID is required.")
    payload = _capability_payload(method, bucket, key, organization_id, expires_at)
    return hmac.new(
        settings.JWT_SECRET_KEY.encode("utf-8"), payload, hashlib.sha256
    ).hexdigest()


def verify_local_storage_capability(
    *,
    method: str,
    bucket: str,
    key: str,
    organization_id: uuid.UUID,
    expires_at: int,
    signature: str,
) -> None:
    if expires_at < int(time.time()):
        raise StorageCapabilityError("Storage capability has expired.")
    expected = create_local_storage_capability(
        method=method,
        bucket=bucket,
        key=key,
        organization_id=organization_id,
        expires_at=expires_at,
    )
    if not hmac.compare_digest(expected, signature):
        raise StorageCapabilityError("Invalid storage capability.")
    expected_prefix = f"{organization_id}/"
    if not key.startswith(expected_prefix):
        raise StorageCapabilityError("Storage key is outside the tenant namespace.")


def _capability_payload(
    method: str,
    bucket: str,
    key: str,
    organization_id: uuid.UUID,
    expires_at: int,
) -> bytes:
    if not method or not bucket or not key:
        raise StorageCapabilityError("Storage capability fields cannot be empty.")
    if any(value in bucket for value in ("/", "\\", "..")):
        raise StorageCapabilityError("Invalid storage bucket.")
    if key.startswith(("/", "\\")) or ".." in key.replace("\\", "/").split("/"):
        raise StorageCapabilityError("Invalid storage key.")
    return "\n".join(
        (method.upper(), bucket, key, str(organization_id), str(expires_at))
    ).encode("utf-8")
