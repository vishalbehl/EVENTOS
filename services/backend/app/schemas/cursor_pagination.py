from __future__ import annotations

import base64
import json
import uuid
from datetime import datetime
from typing import Generic, TypeVar

from fastapi import HTTPException, status
from pydantic import BaseModel, computed_field


T = TypeVar("T")
MAX_CURSOR_LENGTH = 512


class CursorPage(BaseModel, Generic[T]):
    items: list[T]
    next_cursor: str | None = None
    has_next: bool = False

    @computed_field
    @property
    def has_more(self) -> bool:
        """Plan terminology without breaking existing ``has_next`` clients."""
        return self.has_next


def bounded_page_size(value: int | None, *, default: int = 20, maximum: int = 100) -> int:
    """Normalize API page sizes so one request cannot create an unbounded read."""
    if value is None:
        return default
    if value < 1 or value > maximum:
        raise HTTPException(status_code=400, detail={"code": "INVALID_PAGE_SIZE", "message": f"Page size must be between 1 and {maximum}."})
    return value


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
        if not isinstance(value, str) or not value or len(value) > MAX_CURSOR_LENGTH:
            raise ValueError("cursor length is invalid")
        padded = value + "=" * (-len(value) % 4)
        if len(padded) > MAX_CURSOR_LENGTH + 3:
            raise ValueError("cursor payload is invalid")
        payload = json.loads(base64.urlsafe_b64decode(padded.encode("ascii")))
        return CursorPosition.model_validate(payload)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_CURSOR", "message": "The pagination cursor is invalid or expired."},
        ) from exc
