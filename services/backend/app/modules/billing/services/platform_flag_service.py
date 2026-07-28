from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.platform.models.platform_domain_tables import PlatformFlagDefinition, PlatformFlagOverride


class PlatformFlagService:
    @staticmethod
    def _included(flag_key: str, subject: str, percentage: int) -> bool:
        if percentage >= 100:
            return True
        if percentage <= 0:
            return False
        bucket = int(hashlib.sha256(f"{flag_key}:{subject}".encode()).hexdigest()[:8], 16) % 100
        return bucket < percentage

    @staticmethod
    async def evaluate(
        db: AsyncSession,
        *,
        organization_id: uuid.UUID | None,
        event_id: uuid.UUID | None = None,
        user_id: uuid.UUID | None = None,
        application: str = "ORGANIZER_PORTAL",
        environment: str = "ALL",
        at: datetime | None = None,
    ) -> dict[str, dict[str, Any]]:
        now = at or datetime.now(timezone.utc)
        definitions = (await db.scalars(select(PlatformFlagDefinition).where(
            PlatformFlagDefinition.is_active.is_(True),
            PlatformFlagDefinition.application.in_([application, "ALL"]),
            PlatformFlagDefinition.environment.in_([environment, "ALL"]),
            or_(PlatformFlagDefinition.starts_at.is_(None), PlatformFlagDefinition.starts_at <= now),
            or_(PlatformFlagDefinition.expires_at.is_(None), PlatformFlagDefinition.expires_at > now),
        ))).all()
        if not definitions:
            return {}
        overrides = (await db.scalars(select(PlatformFlagOverride).where(
            PlatformFlagOverride.flag_id.in_([row.id for row in definitions]),
            PlatformFlagOverride.status == "APPROVED",
            or_(PlatformFlagOverride.starts_at.is_(None), PlatformFlagOverride.starts_at <= now),
            or_(PlatformFlagOverride.expires_at.is_(None), PlatformFlagOverride.expires_at > now),
            or_(PlatformFlagOverride.organization_id.is_(None), PlatformFlagOverride.organization_id == organization_id),
            or_(PlatformFlagOverride.event_id.is_(None), PlatformFlagOverride.event_id == event_id),
            or_(PlatformFlagOverride.user_id.is_(None), PlatformFlagOverride.user_id == user_id),
        ))).all()
        by_flag: dict[uuid.UUID, list[PlatformFlagOverride]] = {}
        for row in overrides:
            by_flag.setdefault(row.flag_id, []).append(row)
        subject = str(user_id or event_id or organization_id or "GLOBAL")
        result: dict[str, dict[str, Any]] = {}
        specificity = {"GLOBAL": 0, "ORGANIZATION": 1, "EVENT": 2, "USER": 3}
        for definition in definitions:
            candidates = sorted(by_flag.get(definition.id, []), key=lambda row: (specificity.get(row.scope_type, 0), row.created_at), reverse=True)
            # Kill switches are deny controls: any applicable approved TRUE
            # wins, including a global emergency stop. A narrower FALSE may
            # never reopen access beneath a broader active kill switch.
            if definition.flag_type == "KILL_SWITCH":
                denying = [row for row in candidates if row.value.get("value") is True]
                selected = denying[0] if denying else (candidates[0] if candidates else None)
            else:
                selected = candidates[0] if candidates else None
            value = dict(selected.value if selected else definition.default_value)
            percentage = selected.rollout_percentage if selected and selected.rollout_percentage is not None else definition.rollout_percentage
            included = PlatformFlagService._included(definition.flag_key, subject, percentage)
            if not included and definition.value_type == "BOOLEAN":
                value = {"value": False}
            result[definition.flag_key] = {
                "value": value.get("value"),
                "included": included,
                "flag_type": definition.flag_type,
                "target_capabilities": definition.target_capabilities,
                "source": "OVERRIDE" if selected else "DEFAULT",
                "source_id": str(selected.id if selected else definition.id),
                "expires_at": (selected.expires_at if selected else definition.expires_at),
            }
        return result
