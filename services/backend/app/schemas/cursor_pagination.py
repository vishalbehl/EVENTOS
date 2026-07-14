from __future__ import annotations

import base64
import json
import uuid
from datetime import datetime
from typing import Generic, TypeVar

from fastapi import HTTPException, status
from pydantic import BaseModel


T = TypeVar("T")


class CursorPage(BaseModel, Generic[T]):
    items: list[T]
    next_cursor: str | None = None
    has_next: bool = False


class CursorPosition(BaseModel):
    occurred_at: datetime
    record_id: uuid.UUID


def encode_cursor(occurred_at: datetime, record_id: uuid.UUID) -> str:
    payload = json.dumps(
        {"occurred_at": occurred_at.isoformat(), "record_id": str(record_id)},
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return base64.urlsafe_b64encode(payload).decode("ascii").rstrip("=")


def decode_cursor(value: str) -> CursorPosition:
    try:
        padded = value + "=" * (-len(value) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded.encode("ascii")))
        return CursorPosition.model_validate(payload)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_CURSOR", "message": "The pagination cursor is invalid or expired."},
        ) from exc
