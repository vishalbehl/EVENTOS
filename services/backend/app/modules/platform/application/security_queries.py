"""Explicit read projections for the platform security feed."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.identity.models.security_event import SecurityEvent
from app.modules.identity.models.user import User


class PlatformSecurityEventQueryService:
    """Bounded security-event reads with no transaction ownership."""

    MAX_PAGE_SIZE = 200

    def __init__(self, db: AsyncSession):
        self.db = db

    async def dashboard_feed(
        self,
        *,
        severity: str | None,
        event_type: str | None,
        skip: int,
        limit: int,
    ) -> dict[str, Any]:
        bounded = max(1, min(limit, self.MAX_PAGE_SIZE))
        offset = max(0, skip)
        filters = []
        if severity:
            filters.append(SecurityEvent.risk_level == severity)
        if event_type:
            filters.append(SecurityEvent.event_type == event_type)

        total = int(
            await self.db.scalar(
                select(func.count(SecurityEvent.id)).where(*filters)
            )
            or 0
        )

        summary_rows = (
            await self.db.execute(
                select(SecurityEvent.risk_level, func.count(SecurityEvent.id))
                .where(SecurityEvent.occurred_at >= datetime.now(timezone.utc) - timedelta(hours=24))
                .group_by(SecurityEvent.risk_level)
            )
        ).all()
        severity_counts = {str(level or ""): int(count or 0) for level, count in summary_rows}

        trend_rows = (
            await self.db.execute(
                select(
                    func.date(SecurityEvent.occurred_at).label("day"),
                    SecurityEvent.risk_level,
                    func.count(SecurityEvent.id).label("count"),
                )
                .where(SecurityEvent.occurred_at >= datetime.now(timezone.utc) - timedelta(days=7))
                .group_by(func.date(SecurityEvent.occurred_at), SecurityEvent.risk_level)
                .order_by(func.date(SecurityEvent.occurred_at).asc(), SecurityEvent.risk_level.asc())
            )
        ).all()
        trend: dict[str, dict[str, Any]] = {}
        for row in trend_rows:
            day = str(row.day)
            bucket = trend.setdefault(
                day,
                {"day": day, "low": 0, "medium": 0, "high": 0, "critical": 0},
            )
            level = str(row.risk_level or "").lower()
            if level in {"low", "medium", "high", "critical"}:
                bucket[level] = int(row.count or 0)

        rows = (
            await self.db.execute(
                select(
                    SecurityEvent.id,
                    SecurityEvent.event_type,
                    SecurityEvent.risk_level,
                    SecurityEvent.severity_score,
                    SecurityEvent.user_id,
                    User.email.label("user_email"),
                    SecurityEvent.ip_address,
                    SecurityEvent.geo_metadata,
                    SecurityEvent.action_taken,
                    SecurityEvent.correlation_id,
                    SecurityEvent.occurred_at,
                )
                .outerjoin(User, User.id == SecurityEvent.user_id)
                .where(*filters)
                .order_by(SecurityEvent.occurred_at.desc(), SecurityEvent.id.desc())
                .offset(offset)
                .limit(bounded + 1)
            )
        ).mappings().all()
        page = rows[:bounded]
        return {
            "severity_summary": {
                "CRITICAL": severity_counts.get("CRITICAL", 0),
                "HIGH": severity_counts.get("HIGH", 0),
                "MEDIUM": severity_counts.get("MEDIUM", 0),
                "LOW": severity_counts.get("LOW", 0),
                "total_24h": sum(severity_counts.values()),
            },
            "trend": sorted(trend.values(), key=lambda item: item["day"]),
            "items": [
                {
                    "id": str(row["id"]),
                    "event_type": row["event_type"],
                    "risk_level": row["risk_level"],
                    "severity_score": row["severity_score"],
                    "user_email": row["user_email"],
                    "ip_address": str(row["ip_address"]) if row["ip_address"] is not None else None,
                    "geo_metadata": row["geo_metadata"],
                    "action_taken": row["action_taken"],
                    "correlation_id": str(row["correlation_id"]) if row["correlation_id"] else None,
                    "occurred_at": row["occurred_at"].isoformat(),
                }
                for row in page
            ],
            "total": total,
            "has_next": len(rows) > bounded,
        }
