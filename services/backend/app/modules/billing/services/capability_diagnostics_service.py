from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.modules.platform.models.organization_console import CapabilityDiagnosticEvent


class CapabilityDiagnosticsService:
    EVENT_TYPES = {
        "GATE_DENIAL",
        "RESOLUTION_FAILURE",
        "SHADOW_DIVERGENCE",
        "METERING_DRIFT",
        "LEGACY_RESOLVER_CALL",
        "UNKNOWN_FEATURE_KEY",
        "UNGATED_CONTROL",
        "STALE_FLAG",
    }
    _REDACTED_KEYS = {
        "authorization",
        "cookie",
        "password",
        "secret",
        "token",
        "credential",
        "payload",
        "body",
    }

    @staticmethod
    def _safe_metadata(metadata: dict[str, Any] | None) -> dict[str, Any]:
        if not metadata:
            return {}

        def sanitize(value: Any, *, key: str = "", depth: int = 0) -> Any:
            normalized = key.lower()
            if normalized and any(
                part in normalized for part in CapabilityDiagnosticsService._REDACTED_KEYS
            ):
                return "[REDACTED]"
            if depth >= 5:
                return "[TRUNCATED]"
            if isinstance(value, (str, int, float, bool)) or value is None:
                return value
            if isinstance(value, (uuid.UUID, datetime)):
                return str(value)
            if isinstance(value, dict):
                return {
                    str(nested_key): sanitize(
                        nested_value,
                        key=str(nested_key),
                        depth=depth + 1,
                    )
                    for nested_key, nested_value in list(value.items())[:100]
                }
            if isinstance(value, (list, tuple, set)):
                return [
                    sanitize(item, depth=depth + 1)
                    for item in list(value)[:50]
                ]
            return str(value)

        return {
            str(key): sanitize(value, key=str(key))
            for key, value in list(metadata.items())[:100]
        }

    @staticmethod
    def add(
        db: AsyncSession,
        *,
        event_type: str,
        source: str,
        organization_id: uuid.UUID | None = None,
        event_id: uuid.UUID | None = None,
        actor_user_id: uuid.UUID | None = None,
        severity: str = "INFO",
        reason_code: str | None = None,
        capability_key: str | None = None,
        operation_key: str | None = None,
        limit_key: str | None = None,
        request_id: str | None = None,
        correlation_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> CapabilityDiagnosticEvent:
        normalized_type = event_type.upper()
        if normalized_type not in CapabilityDiagnosticsService.EVENT_TYPES:
            raise ValueError(f"Unsupported capability diagnostic event type: {event_type}")
        row = CapabilityDiagnosticEvent(
            organization_id=organization_id,
            event_id=event_id,
            actor_user_id=actor_user_id,
            event_type=normalized_type,
            severity=severity.upper(),
            reason_code=reason_code,
            capability_key=capability_key,
            operation_key=operation_key,
            limit_key=limit_key,
            source=source,
            request_id=request_id,
            correlation_id=correlation_id,
            metadata_json=CapabilityDiagnosticsService._safe_metadata(metadata),
            occurred_at=datetime.now(timezone.utc),
        )
        db.add(row)
        return row

    @staticmethod
    async def record_isolated(**kwargs: Any) -> None:
        """Persist a denied/failed request after its domain transaction rolls back."""
        event_type = str(kwargs.get("event_type") or "RESOLUTION_FAILURE").upper()
        log = logger.bind(
            diagnostic_type=event_type,
            reason_code=kwargs.get("reason_code"),
            capability_key=kwargs.get("capability_key"),
            operation_key=kwargs.get("operation_key"),
            organization_id=str(kwargs.get("organization_id") or ""),
            event_id=str(kwargs.get("event_id") or ""),
        )
        try:
            async with AsyncSessionLocal() as session:
                CapabilityDiagnosticsService.add(session, **kwargs)
                await session.commit()
            log.warning("Capability diagnostic recorded")
        except Exception as exc:
            # Observability must never convert a stable authorization denial
            # into a 500 response.
            log.warning("Capability diagnostic persistence failed: {}", exc)
