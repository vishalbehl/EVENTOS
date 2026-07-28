from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.billing.services.entitlement_resolver import EntitlementResolver
from app.modules.billing.services.event_entitlement_service import EventEntitlementService
from app.modules.billing.services.usage_service import UsageService
from app.modules.events.models.event import Event
from app.modules.identity.models.user import User


class LimitGuard:
    @staticmethod
    async def _raise_limit(
        *,
        limit_key: str,
        activation_id: str | None,
        grant_id: str | None,
        grant_consumption_id: str | None,
        plan_name: str,
        allowed: int | None,
        used: int,
        source_type: str | None,
        reason: str,
    ) -> None:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "code": "PLAN_LIMIT_EXCEEDED",
                "limit_key": limit_key,
                "activation_id": activation_id,
                "grant_id": grant_id,
                "grant_consumption_id": grant_consumption_id,
                "plan_name": plan_name,
                "allowed": allowed,
                "used": used,
                "remaining": None if allowed is None else max(allowed - used, 0),
                "source_type": source_type,
                "reason": reason,
            },
        )

    @staticmethod
    async def _check_event_limit(db: AsyncSession, org_id: UUID, event_id: UUID, limit_key: str, label: str) -> None:
        # Serialize every finite event-resource creation on the stable event
        # row. The caller keeps this lock until its mutation commits, so two
        # concurrent requests cannot both observe the same remaining slot.
        event = await db.scalar(select(Event).where(Event.id == event_id, Event.organization_id == org_id).with_for_update())
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")

        resolved = await EventEntitlementService.resolve(db, org_id, event_id, explain=True)
        if not resolved["limits"]:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail={"code": "EVENT_NOT_ACTIVATED", "detail": "This event is not activated for plan-based access."},
            )
        limit = resolved["limits"].get(limit_key)
        if not limit or limit["limit_value"] is None:
            return
        used = await UsageService.get_effective_event_metric(db, event_id, limit_key)
        if used >= int(limit["limit_value"]):
            activation = resolved.get("activation")
            plan_name = activation.subscription.plan.name if activation and activation.subscription and activation.subscription.plan else "Unknown"
            await LimitGuard._raise_limit(
                limit_key=limit_key,
                activation_id=str(activation.id) if activation else None,
                grant_id=str(activation.grant_id) if activation and activation.grant_id else None,
                grant_consumption_id=str(activation.grant_consumption_id) if activation and activation.grant_consumption_id else None,
                plan_name=plan_name,
                allowed=int(limit["limit_value"]),
                used=used,
                source_type=limit["source_type"],
                reason=f"{label} limit of {limit['limit_value']} reached for this event.",
            )

    @staticmethod
    async def check_speakers(db: AsyncSession, org_id: UUID, event_id: UUID):
        await LimitGuard._check_event_limit(db, org_id, event_id, "max_speakers", "Speaker")

    @staticmethod
    async def check_sessions(db: AsyncSession, org_id: UUID, event_id: UUID):
        await LimitGuard._check_event_limit(db, org_id, event_id, "max_sessions", "Session")

    @staticmethod
    async def check_registrations(db: AsyncSession, org_id: UUID, event_id: UUID):
        await LimitGuard._check_event_limit(db, org_id, event_id, "max_registrations", "Registration")

    @staticmethod
    async def check_rooms(db: AsyncSession, org_id: UUID, event_id: UUID):
        await LimitGuard._check_event_limit(db, org_id, event_id, "max_rooms", "Room")

    @staticmethod
    async def check_ticket_categories(db: AsyncSession, org_id: UUID, event_id: UUID):
        await LimitGuard._check_event_limit(db, org_id, event_id, "max_ticket_categories", "Ticket category")

    @staticmethod
    async def check_badge_templates(db: AsyncSession, org_id: UUID, event_id: UUID):
        await LimitGuard._check_event_limit(db, org_id, event_id, "max_badge_templates", "Badge template")

    @staticmethod
    async def check_certificate_templates(db: AsyncSession, org_id: UUID, event_id: UUID):
        await LimitGuard._check_event_limit(db, org_id, event_id, "max_certificate_templates", "Certificate template")

    @staticmethod
    async def check_event_team_members(db: AsyncSession, org_id: UUID, event_id: UUID):
        await LimitGuard._check_event_limit(db, org_id, event_id, "max_event_team_members", "Event team member")

    @staticmethod
    async def check_event_email_headroom(db: AsyncSession, org_id: UUID, event_id: UUID, additional: int = 1):
        await db.scalar(select(Event.id).where(Event.id == event_id, Event.organization_id == org_id).with_for_update())
        resolved = await EventEntitlementService.resolve(db, org_id, event_id, explain=True)
        limit = resolved["limits"].get("max_emails_per_event")
        if not limit or limit["limit_value"] is None:
            return
        used = await UsageService.get_effective_event_metric(db, event_id, "max_emails_per_event")
        allowed = int(limit["limit_value"])
        if used + additional > allowed:
            activation = resolved.get("activation")
            plan_name = activation.subscription.plan.name if activation and activation.subscription and activation.subscription.plan else "Unknown"
            await LimitGuard._raise_limit(
                limit_key="max_emails_per_event",
                activation_id=str(activation.id) if activation else None,
                grant_id=str(activation.grant_id) if activation and activation.grant_id else None,
                grant_consumption_id=str(activation.grant_consumption_id) if activation and activation.grant_consumption_id else None,
                plan_name=plan_name,
                allowed=allowed,
                used=used,
                source_type=limit["source_type"],
                reason=f"Email allowance of {allowed} per event has been reached.",
            )

    @staticmethod
    async def check_storage_headroom(db: AsyncSession, org_id: UUID, event_id: UUID, additional_bytes: int):
        await db.scalar(select(Event.id).where(Event.id == event_id, Event.organization_id == org_id).with_for_update())
        resolved = await EventEntitlementService.resolve(db, org_id, event_id, explain=True)
        if not resolved["availability"]["available"]:
            raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail={"code": "EVENT_NOT_ACTIVATED", "detail": "This event has no immutable entitlement snapshot."})
        limit = resolved["limits"].get("storage_quota_mb")
        if not limit or limit.get("limit_value") is None:
            return
        used_bytes = await UsageService.get_effective_event_metric(db, event_id, "storage_bytes")
        allowed_bytes = int(limit["limit_value"]) * 1024 * 1024
        if used_bytes + additional_bytes > allowed_bytes:
            activation = resolved.get("activation")
            plan_name = activation.subscription.plan.name if activation and activation.subscription and activation.subscription.plan else "Unknown"
            await LimitGuard._raise_limit(limit_key="storage_quota_mb", activation_id=str(activation.id) if activation else None, grant_id=str(activation.grant_id) if activation and activation.grant_id else None, grant_consumption_id=str(activation.grant_consumption_id) if activation and activation.grant_consumption_id else None, plan_name=plan_name, allowed=allowed_bytes, used=used_bytes, source_type=limit.get("source_type"), reason=f"Storage allowance of {limit['limit_value']} MB would be exceeded by this upload.")

    @staticmethod
    async def check_users(db: AsyncSession, org_id: UUID):
        from app.modules.platform.models.organization import Organization
        await db.scalar(select(Organization.id).where(Organization.id == org_id).with_for_update())
        limit = await EntitlementResolver.get_org_limit(db, org_id, "max_users")
        if limit is None:
            return
        current_count = await db.scalar(
            select(func.count(User.id)).where(User.organization_id == org_id, User.deleted_at.is_(None))
        )
        if (current_count or 0) >= limit:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail={
                    "code": "PLAN_LIMIT_EXCEEDED",
                    "limit_key": "max_users",
                    "allowed": limit,
                    "used": int(current_count or 0),
                    "remaining": max(limit - int(current_count or 0), 0),
                    "detail": f"User limit of {limit} exceeded for your organization.",
                    "reason": f"User limit of {limit} exceeded for your organization.",
                },
            )

    @staticmethod
    async def check_events(db: AsyncSession, org_id: UUID):
        from app.modules.platform.models.organization import Organization
        await db.scalar(select(Organization.id).where(Organization.id == org_id).with_for_update())
        max_events = await EntitlementResolver.get_org_limit(db, org_id, "max_events")
        if max_events is None:
            return
        current_count = await db.scalar(
            select(func.count(Event.id)).where(Event.organization_id == org_id, Event.deleted_at.is_(None))
        )
        if (current_count or 0) >= max_events:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail={
                    "code": "PLAN_LIMIT_EXCEEDED",
                    "limit_key": "max_events",
                    "allowed": max_events,
                    "used": int(current_count or 0),
                    "remaining": max(max_events - int(current_count or 0), 0),
                    "detail": f"Event limit of {max_events} exceeded for your organization.",
                    "reason": f"Event limit of {max_events} exceeded for your organization.",
                },
            )
