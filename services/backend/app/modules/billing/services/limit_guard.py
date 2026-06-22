from uuid import UUID
from fastapi import HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.billing.models.subscription import OrganizationSubscription, SubscriptionPlan
from app.modules.events.models.speaker import Speaker
from app.modules.events.models.session import Session
from app.modules.registration.models.participant import Participant
from app.modules.events.models.room import Room
from app.modules.identity.models.user import User
from app.modules.registration.models.participant_role import ParticipantRole
from app.modules.events.models.event import Event

class LimitGuard:
    @staticmethod
    async def get_plan_for_org(db: AsyncSession, org_id: UUID) -> SubscriptionPlan:
        # Check if organization slug is "eventxos"
        from app.modules.platform.models.organization import Organization
        from app.modules.billing.services.entitlement_resolver import EntitlementResolver
        
        org_res = await db.execute(select(Organization).where(Organization.id == org_id))
        org = org_res.scalar_one_or_none()
        if org and org.slug == "eventxos":
            return SubscriptionPlan(
                name="Supervisor",
                max_events=None,
                max_users=None,
                max_registrations=None,
                max_speakers=None,
                max_sessions=None,
                max_rooms=None,
                max_ticket_categories=None,
                max_badge_templates=None,
                max_certificate_templates=None,
                storage_quota_mb=999999999,
            )

        # Retrieve limits dynamically from EntitlementResolver
        max_events = await EntitlementResolver.get_limit(db, org_id, "max_events")
        max_users = await EntitlementResolver.get_limit(db, org_id, "max_users")
        max_registrations = await EntitlementResolver.get_limit(db, org_id, "max_registrations")
        max_speakers = await EntitlementResolver.get_limit(db, org_id, "max_speakers")
        max_sessions = await EntitlementResolver.get_limit(db, org_id, "max_sessions")
        max_rooms = await EntitlementResolver.get_limit(db, org_id, "max_rooms")
        max_ticket_categories = await EntitlementResolver.get_limit(db, org_id, "max_ticket_categories")
        max_badge_templates = await EntitlementResolver.get_limit(db, org_id, "max_badge_templates")
        max_certificate_templates = await EntitlementResolver.get_limit(db, org_id, "max_certificate_templates")
        storage_quota_mb = await EntitlementResolver.get_limit(db, org_id, "storage_quota_mb")

        # Resolve active subscription plan name for representation
        sub = await EntitlementResolver.get_active_subscription(db, org_id)
        plan_name = sub.plan.name if sub and sub.plan else "Basic"

        return SubscriptionPlan(
            name=plan_name,
            max_events=max_events,
            max_users=max_users,
            max_registrations=max_registrations,
            max_speakers=max_speakers,
            max_sessions=max_sessions,
            max_rooms=max_rooms,
            max_ticket_categories=max_ticket_categories,
            max_badge_templates=max_badge_templates,
            max_certificate_templates=max_certificate_templates,
            storage_quota_mb=storage_quota_mb or 10240,
        )


    @classmethod
    async def check_speakers(cls, db: AsyncSession, org_id: UUID, event_id: UUID):
        plan = await cls.get_plan_for_org(db, org_id)
        if plan.max_speakers is None:
            return
        
        current_count = await db.scalar(
            select(func.count(Speaker.id)).where(
                Speaker.event_id == event_id,
                Speaker.deleted_at.is_(None)
            )
        )
        if (current_count or 0) >= plan.max_speakers:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail={
                    "code": "PLAN_LIMIT_EXCEEDED",
                    "error": "PLAN_LIMIT_EXCEEDED",
                    "detail": f"Speaker limit of {plan.max_speakers} exceeded for your plan. Please upgrade."
                }
            )

    @classmethod
    async def check_sessions(cls, db: AsyncSession, org_id: UUID, event_id: UUID):
        plan = await cls.get_plan_for_org(db, org_id)
        if plan.max_sessions is None:
            return
        
        current_count = await db.scalar(
            select(func.count(Session.id)).where(
                Session.event_id == event_id,
                Session.deleted_at.is_(None)
            )
        )
        if (current_count or 0) >= plan.max_sessions:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail={
                    "code": "PLAN_LIMIT_EXCEEDED",
                    "error": "PLAN_LIMIT_EXCEEDED",
                    "detail": f"Session limit of {plan.max_sessions} exceeded for your plan. Please upgrade."
                }
            )

    @classmethod
    async def check_registrations(cls, db: AsyncSession, org_id: UUID, event_id: UUID):
        plan = await cls.get_plan_for_org(db, org_id)
        if plan.max_registrations is None:
            return
        
        current_count = await db.scalar(
            select(func.count(Participant.id)).where(
                Participant.event_id == event_id,
                Participant.deleted_at.is_(None)
            )
        )
        if (current_count or 0) >= plan.max_registrations:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail={
                    "code": "PLAN_LIMIT_EXCEEDED",
                    "error": "PLAN_LIMIT_EXCEEDED",
                    "detail": f"Registration limit of {plan.max_registrations} exceeded for your plan. Please upgrade."
                }
            )

    @classmethod
    async def check_rooms(cls, db: AsyncSession, org_id: UUID, event_id: UUID):
        plan = await cls.get_plan_for_org(db, org_id)
        if plan.max_rooms is None:
            return
        
        current_count = await db.scalar(
            select(func.count(Room.id)).where(
                Room.event_id == event_id
            )
        )
        if (current_count or 0) >= plan.max_rooms:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail={
                    "code": "PLAN_LIMIT_EXCEEDED",
                    "error": "PLAN_LIMIT_EXCEEDED",
                    "detail": f"Room limit of {plan.max_rooms} exceeded for your plan. Please upgrade."
                }
            )

    @classmethod
    async def check_users(cls, db: AsyncSession, org_id: UUID):
        plan = await cls.get_plan_for_org(db, org_id)
        if plan.max_users is None:
            return
        
        current_count = await db.scalar(
            select(func.count(User.id)).where(
                User.organization_id == org_id,
                User.deleted_at.is_(None)
            )
        )
        if (current_count or 0) >= plan.max_users:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail={
                    "code": "PLAN_LIMIT_EXCEEDED",
                    "error": "PLAN_LIMIT_EXCEEDED",
                    "detail": f"User limit of {plan.max_users} exceeded for your plan. Please upgrade."
                }
            )

    @classmethod
    async def check_ticket_categories(cls, db: AsyncSession, org_id: UUID, event_id: UUID):
        plan = await cls.get_plan_for_org(db, org_id)
        if plan.max_ticket_categories is None:
            return
        
        current_count = await db.scalar(
            select(func.count(ParticipantRole.id)).where(
                ParticipantRole.event_id == event_id
            )
        )
        if (current_count or 0) >= plan.max_ticket_categories:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail={
                    "code": "PLAN_LIMIT_EXCEEDED",
                    "error": "PLAN_LIMIT_EXCEEDED",
                    "detail": f"Ticket category limit of {plan.max_ticket_categories} exceeded for your plan. Please upgrade."
                }
            )

    @classmethod
    async def check_events(cls, db: AsyncSession, org_id: UUID):
        plan = await cls.get_plan_for_org(db, org_id)
        if plan.max_events is None:
            return
        
        current_count = await db.scalar(
            select(func.count(Event.id)).where(
                Event.organization_id == org_id,
                Event.deleted_at.is_(None)
            )
        )
        if (current_count or 0) >= plan.max_events:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail={
                    "code": "PLAN_LIMIT_EXCEEDED",
                    "error": "PLAN_LIMIT_EXCEEDED",
                    "detail": f"Event limit of {plan.max_events} exceeded for your plan. Please upgrade."
                }
            )
