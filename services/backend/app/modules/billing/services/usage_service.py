import uuid
from typing import Any, Dict, Iterable, List

from sqlalchemy import distinct, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.analytics.models.usage import OrganizationUsage
from app.modules.communications.models.email_log import EmailLog
from app.modules.events.models.room import Room
from app.modules.events.models.session import Session
from app.modules.events.models.speaker import Speaker
from app.modules.presentations.models.poster import Poster
from app.modules.presentations.models.presentation_file import PresentationFile
from app.modules.rbac.models.rbac import UserAccessNode
from app.modules.rbac.models.user_assignment import UserEventAssignment
from app.modules.registration.models.participant import Participant
from app.modules.registration.models.participant_role import ParticipantRole
from app.modules.registration.models.print_template import PrintTemplate


class UsageService:
    LIVE_COUNT = "LIVE_COUNT"
    LEDGER = "LEDGER"
    METER = "METER"

    METRIC_STRATEGIES = {
        "max_registrations": LIVE_COUNT,
        "max_speakers": LIVE_COUNT,
        "max_sessions": LIVE_COUNT,
        "max_rooms": LIVE_COUNT,
        "max_event_team_members": LIVE_COUNT,
        "max_ticket_categories": LIVE_COUNT,
        "max_badge_templates": LIVE_COUNT,
        "max_certificate_templates": LIVE_COUNT,
        "max_emails_per_event": LEDGER,
        "storage_quota_mb": METER,
    }

    @staticmethod
    async def get_event_metric(db: AsyncSession, event_id: uuid.UUID, metric_key: str) -> int:
        if metric_key == "max_registrations":
            return int(
                await db.scalar(select(func.count(Participant.id)).where(Participant.event_id == event_id, Participant.deleted_at.is_(None)))
                or 0
            )
        if metric_key == "max_speakers":
            return int(
                await db.scalar(select(func.count(Speaker.id)).where(Speaker.event_id == event_id, Speaker.deleted_at.is_(None)))
                or 0
            )
        if metric_key == "max_sessions":
            return int(
                await db.scalar(select(func.count(Session.id)).where(Session.event_id == event_id, Session.deleted_at.is_(None)))
                or 0
            )
        if metric_key == "max_rooms":
            return int(await db.scalar(select(func.count(Room.id)).where(Room.event_id == event_id)) or 0)
        if metric_key == "max_ticket_categories":
            return int(await db.scalar(select(func.count(ParticipantRole.id)).where(ParticipantRole.event_id == event_id)) or 0)
        if metric_key == "max_badge_templates":
            return int(
                await db.scalar(
                    select(func.count(PrintTemplate.id)).where(
                        PrintTemplate.event_id == event_id, PrintTemplate.template_type == "badge"
                    )
                )
                or 0
            )
        if metric_key == "max_certificate_templates":
            return int(
                await db.scalar(
                    select(func.count(PrintTemplate.id)).where(
                        PrintTemplate.event_id == event_id, PrintTemplate.template_type == "certificate"
                    )
                )
                or 0
            )
        if metric_key == "max_emails_per_event":
            return int(
                await db.scalar(
                    select(func.count(EmailLog.id)).where(
                        EmailLog.event_id == event_id,
                        EmailLog.status.in_(["queued", "sent", "delivered"]),
                    )
                )
                or 0
            )
        if metric_key == "storage_quota_mb":
            presentation_bytes = await db.scalar(
                select(func.coalesce(func.sum(PresentationFile.file_size_bytes), 0)).where(PresentationFile.event_id == event_id)
            )
            poster_bytes = await db.scalar(
                select(func.coalesce(func.sum(Poster.file_size_bytes), 0)).where(Poster.event_id == event_id)
            )
            total_bytes = int(presentation_bytes or 0) + int(poster_bytes or 0)
            return total_bytes // (1024 * 1024)
        if metric_key == "max_event_team_members":
            event_nodes = (
                select(distinct(UserAccessNode.user_id))
                .where(
                    or_(
                        (UserAccessNode.node_type == "EVENT") & (UserAccessNode.node_id == event_id),
                        UserAccessNode.user_id.in_(
                            select(UserEventAssignment.user_id).where(UserEventAssignment.event_id == event_id)
                        ),
                    )
                )
            )
            return int(await db.scalar(select(func.count()).select_from(event_nodes.subquery())) or 0)
        return 0

    @staticmethod
    async def get_event_usage_bundle(
        db: AsyncSession, event_id: uuid.UUID, metric_keys: Iterable[str]
    ) -> Dict[str, int]:
        usage: Dict[str, int] = {}
        for metric_key in metric_keys:
            usage[metric_key] = await UsageService.get_event_metric(db, event_id, metric_key)
        return usage

    @staticmethod
    async def get_event_usage(db: AsyncSession, event_id: uuid.UUID) -> Dict[str, int]:
        return await UsageService.get_event_usage_bundle(db, event_id, UsageService.METRIC_STRATEGIES.keys())

    @staticmethod
    async def has_meaningful_usage(db: AsyncSession, event_id: uuid.UUID) -> bool:
        usage = await UsageService.get_event_usage(db, event_id)
        return any(
            usage.get(metric, 0) > 0
            for metric in ("max_registrations", "max_speakers", "max_sessions", "max_rooms", "max_emails_per_event")
        )

    @staticmethod
    async def get_transfer_eligibility(
        db: AsyncSession, event_id: uuid.UUID, policies: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        usage = await UsageService.get_event_usage(db, event_id)
        event_started = 1 if usage.get("max_registrations", 0) > 0 else 0
        effective_metrics = {
            **usage,
            "registration_count": usage.get("max_registrations", 0),
            "email_sent_count": usage.get("max_emails_per_event", 0),
            "speaker_count": usage.get("max_speakers", 0),
            "session_count": usage.get("max_sessions", 0),
            "room_count": usage.get("max_rooms", 0),
            "storage_mb": usage.get("storage_quota_mb", 0),
            "certificate_issued_count": 0,
            "event_started": event_started,
        }
        decisions = []
        strongest_action = "ALLOW"
        for policy in policies:
            metric_value = effective_metrics.get(policy["metric_key"], 0)
            threshold = policy.get("threshold_value")
            matched = False
            if policy["operator"] == ">=" and threshold is not None:
                matched = metric_value >= threshold
            elif policy["operator"] == ">" and threshold is not None:
                matched = metric_value > threshold
            elif policy["operator"] == "=":
                matched = metric_value == threshold
            if matched:
                action = policy["action"]
                decisions.append({"metric_key": policy["metric_key"], "value": metric_value, "action": action})
                if action == "LOCK_TRANSFER":
                    strongest_action = "LOCK_TRANSFER"
                elif action == "REVIEW_REQUIRED" and strongest_action != "LOCK_TRANSFER":
                    strongest_action = "REVIEW_REQUIRED"
        return {"action": strongest_action, "usage": usage, "decisions": decisions}

    @staticmethod
    async def get_org_storage_bytes(db: AsyncSession, organization_id: uuid.UUID) -> int:
        usage = await db.get(OrganizationUsage, organization_id)
        return int(usage.storage_used_bytes if usage else 0)
