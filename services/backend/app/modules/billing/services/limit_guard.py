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
        # Resolve active subscription
        stmt = (
            select(SubscriptionPlan)
            .join(OrganizationSubscription, OrganizationSubscription.plan_id == SubscriptionPlan.id)
            .where(
                OrganizationSubscription.organization_id == org_id,
                OrganizationSubscription.status.in_(["ACTIVE", "TRIAL"])
            )
        )
        plan = await db.scalar(stmt)
        if not plan:
            # Fallback/Default plan (Basic)
            fallback_stmt = select(SubscriptionPlan).where(SubscriptionPlan.name == "Basic")
            plan = await db.scalar(fallback_stmt)
            
        if not plan:
            plan = SubscriptionPlan(
                name="Basic",
                max_events=1,
                max_users=2,
                max_registrations=150,
                max_speakers=30,
                max_sessions=25,
                max_rooms=5,
                max_ticket_categories=3,
                max_badge_templates=3,
                max_certificate_templates=3,
                storage_quota_mb=10240,
            )
        return plan


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
