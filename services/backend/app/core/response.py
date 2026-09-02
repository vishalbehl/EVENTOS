from __future__ import annotations

from typing import Any, Generic, TypeVar
from pydantic import BaseModel, Field

T = TypeVar("T")


class ProblemDetails(BaseModel):
    code: str
    message: str
    details: dict[str, Any] = Field(default_factory=dict)


class ResponseMeta(BaseModel):
    request_id: str | None = None
    next_cursor: str | None = None
    freshness_at: str | None = None


class ResponseEnvelope(BaseModel, Generic[T]):
    data: T | None = None
    meta: ResponseMeta = Field(default_factory=ResponseMeta)
    error: ProblemDetails | None = None

    @classmethod
    def success(
        cls, data: T, *, request_id: str | None = None,
        next_cursor: str | None = None, freshness_at: str | None = None,
    ) -> "ResponseEnvelope[T]":
        return cls(
            data=data,
            meta=ResponseMeta(
                request_id=request_id,
                next_cursor=next_cursor,
                freshness_at=freshness_at,
            ),
        )

    @classmethod
    def failure(
        cls, code: str, message: str, *, request_id: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> "ResponseEnvelope[T]":
        return cls(
            meta=ResponseMeta(request_id=request_id),
            error=ProblemDetails(code=code, message=message, details=details or {}),
        )
