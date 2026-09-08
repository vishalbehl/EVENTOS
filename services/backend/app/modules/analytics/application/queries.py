"""Projection-backed analytics queries with explicit tenant boundaries."""
from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from pydantic import BaseModel, ConfigDict
from sqlalchemy import Date, and_, case, distinct, func, literal, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.analytics.models.event_registration_summary import EventRegistrationSummary
from app.modules.analytics.models.event_attendance_summary import EventAttendanceSummary
from app.modules.analytics.models.event_payment_summary import EventPaymentSummary
from app.modules.analytics.models.event_speaker_summary import EventSpeakerSummary
from app.modules.analytics.models.usage import OrganizationUsage
from app.modules.audit.models.audit_domain_tables import DataExport
from app.modules.billing.models.subscription import (
    ActivityTimeline,
    OrganizationSubscription,
    RevenueMetric,
    SubscriptionTransaction,
)
from app.modules.communications.models.email_campaign import EmailCampaign
from app.modules.communications.models.email_log import EmailLog
from app.modules.agenda.models import Room, Session
from app.modules.agenda.models import SessionPerson as SessionSpeaker
from app.modules.events.models.capacity_rule import CapacityRule
from app.modules.events.models.event import Event
from app.modules.events.models.speaker import Speaker
from app.modules.presentations.models.file_validation import FileValidation
from app.modules.presentations.models.presentation_file import PresentationFile
from app.modules.presentations.models.poster import Poster
from app.modules.registration.models.participant import Participant
from app.modules.registration.models.participant_role import ParticipantRole
from app.modules.venue.models.room_device import RoomDevice
from app.modules.venue.models.srr_checkin import SRRCheckin
from app.modules.venue.models.venue_sync_job import VenueSyncJob
from app.modules.speakers.constants.speaker_types import UPLOAD_REQUIRED_CODES
from app.modules.platform.models.organization import Organization
from app.modules.identity.models.user import User as IdentityUser
from app.modules.support.models.ticket import SupportTicket


class EventRegistrationSummaryProjection(BaseModel):
    """Stable read model for an event registration summary projection."""

    model_config = ConfigDict(from_attributes=True)

    event_id: uuid.UUID
    organization_id: uuid.UUID
    participant_count: int
    approved_participant_count: int
    paid_participant_count: int
    registration_count: int
    approved_registration_count: int
    waitlisted_registration_count: int
    completed_payment_count: int
    completed_payment_total: Decimal
    registration_status_counts: dict
    freshness_at: datetime
    rebuild_status: str
    last_error: str | None = None


class EventRegistrationSummaryQueryService:
    """Read one bounded projection without writing or owning a transaction."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_for_event(
        self,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
    ) -> EventRegistrationSummaryProjection | None:
        statement = select(
            EventRegistrationSummary.event_id,
            EventRegistrationSummary.organization_id,
            EventRegistrationSummary.participant_count,
            EventRegistrationSummary.approved_participant_count,
            EventRegistrationSummary.paid_participant_count,
            EventRegistrationSummary.registration_count,
            EventRegistrationSummary.approved_registration_count,
            EventRegistrationSummary.waitlisted_registration_count,
            EventRegistrationSummary.completed_payment_count,
            EventRegistrationSummary.completed_payment_total,
            EventRegistrationSummary.registration_status_counts,
            EventRegistrationSummary.freshness_at,
            EventRegistrationSummary.rebuild_status,
            EventRegistrationSummary.last_error,
        ).where(
            EventRegistrationSummary.organization_id == organization_id,
            EventRegistrationSummary.event_id == event_id,
        )
        row = (await self.db.execute(statement)).mappings().one_or_none()
        return EventRegistrationSummaryProjection.model_validate(row) if row else None


class EventAttendanceSummaryProjection(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    event_id: uuid.UUID
    organization_id: uuid.UUID
    registered_participant_count: int
    checked_in_participant_count: int
    checkin_count: int
    session_count: int
    freshness_at: datetime
    rebuild_status: str
    last_error: str | None = None


class EventAttendanceSummaryQueryService:
    """Read one tenant-scoped attendance projection without writing."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_for_event(
        self, *, organization_id: uuid.UUID, event_id: uuid.UUID
    ) -> EventAttendanceSummaryProjection | None:
        statement = select(
            EventAttendanceSummary.event_id,
            EventAttendanceSummary.organization_id,
            EventAttendanceSummary.registered_participant_count,
            EventAttendanceSummary.checked_in_participant_count,
            EventAttendanceSummary.checkin_count,
            EventAttendanceSummary.session_count,
            EventAttendanceSummary.freshness_at,
            EventAttendanceSummary.rebuild_status,
            EventAttendanceSummary.last_error,
        ).where(
            EventAttendanceSummary.organization_id == organization_id,
            EventAttendanceSummary.event_id == event_id,
        )
        row = (await self.db.execute(statement)).mappings().one_or_none()
        return EventAttendanceSummaryProjection.model_validate(row) if row else None


class EventPaymentSummaryProjection(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    event_id: uuid.UUID
    organization_id: uuid.UUID
    transaction_count: int
    completed_count: int
    refunded_count: int
    gross_total: Decimal
    completed_total: Decimal
    refunded_total: Decimal
    freshness_at: datetime
    rebuild_status: str
    last_error: str | None = None


class EventPaymentSummaryQueryService:
    """Read one tenant-scoped payment projection without writing."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_for_event(
        self, *, organization_id: uuid.UUID, event_id: uuid.UUID
    ) -> EventPaymentSummaryProjection | None:
        statement = select(
            EventPaymentSummary.event_id,
            EventPaymentSummary.organization_id,
            EventPaymentSummary.transaction_count,
            EventPaymentSummary.completed_count,
            EventPaymentSummary.refunded_count,
            EventPaymentSummary.gross_total,
            EventPaymentSummary.completed_total,
            EventPaymentSummary.refunded_total,
            EventPaymentSummary.freshness_at,
            EventPaymentSummary.rebuild_status,
            EventPaymentSummary.last_error,
        ).where(
            EventPaymentSummary.organization_id == organization_id,
            EventPaymentSummary.event_id == event_id,
        )
        row = (await self.db.execute(statement)).mappings().one_or_none()
        return EventPaymentSummaryProjection.model_validate(row) if row else None


class EventSpeakerSummaryProjection(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    event_id: uuid.UUID
    organization_id: uuid.UUID
    speaker_count: int
    checked_in_count: int
    uploaded_count: int
    approved_count: int
    assigned_speaker_count: int
    current_file_count: int
    approved_file_count: int
    freshness_at: datetime
    rebuild_status: str
    last_error: str | None = None


class EventSpeakerSummaryQueryService:
    """Read one tenant-scoped speaker projection without writing."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_for_event(
        self, *, organization_id: uuid.UUID, event_id: uuid.UUID
    ) -> EventSpeakerSummaryProjection | None:
        statement = select(
            EventSpeakerSummary.event_id,
            EventSpeakerSummary.organization_id,
            EventSpeakerSummary.speaker_count,
            EventSpeakerSummary.checked_in_count,
            EventSpeakerSummary.uploaded_count,
            EventSpeakerSummary.approved_count,
            EventSpeakerSummary.assigned_speaker_count,
            EventSpeakerSummary.current_file_count,
            EventSpeakerSummary.approved_file_count,
            EventSpeakerSummary.freshness_at,
            EventSpeakerSummary.rebuild_status,
            EventSpeakerSummary.last_error,
        ).where(
            EventSpeakerSummary.organization_id == organization_id,
            EventSpeakerSummary.event_id == event_id,
        )
        row = (await self.db.execute(statement)).mappings().one_or_none()
        return EventSpeakerSummaryProjection.model_validate(row) if row else None


class OrganizationUsageProjection(BaseModel):
    """Explicit read projection for the authoritative organization usage snapshot."""

    model_config = ConfigDict(from_attributes=True)

    organization_id: uuid.UUID
    active_events_count: int
    active_users_count: int
    total_registrations_count: int
    storage_used_bytes: int
    last_calculated_at: datetime


class OrganizationUsageQueryService:
    """Read organization usage without committing or loading an ORM graph."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get(
        self, *, organization_id: uuid.UUID
    ) -> OrganizationUsageProjection | None:
        statement = select(
            OrganizationUsage.organization_id,
            OrganizationUsage.active_events_count,
            OrganizationUsage.active_users_count,
            OrganizationUsage.total_registrations_count,
            OrganizationUsage.storage_used_bytes,
            OrganizationUsage.last_calculated_at,
        ).where(OrganizationUsage.organization_id == organization_id)
        row = (await self.db.execute(statement)).mappings().one_or_none()
        return OrganizationUsageProjection.model_validate(row) if row else None


class AnalyticsExportProjection(BaseModel):
    """Explicit tenant-scoped projection used by export status and downloads."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organization_id: uuid.UUID
    event_id: uuid.UUID | None
    status: str
    export_type: str
    file_format: str
    storage_key: str | None
    expires_at: datetime | None
    completed_at: datetime | None
    failure_reason: str | None
    created_at: datetime


class AnalyticsExportQueryService:
    """Read export metadata without loading the ORM row or owning a transaction."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_for_event(
        self,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
        export_id: uuid.UUID,
    ) -> AnalyticsExportProjection | None:
        statement = select(
            DataExport.id,
            DataExport.organization_id,
            DataExport.event_id,
            DataExport.status,
            DataExport.export_type,
            DataExport.file_format,
            DataExport.storage_key,
            DataExport.expires_at,
            DataExport.completed_at,
            DataExport.failure_reason,
            DataExport.created_at,
        ).where(
            DataExport.id == export_id,
            DataExport.organization_id == organization_id,
            DataExport.event_id == event_id,
        )
        row = (await self.db.execute(statement)).mappings().one_or_none()
        return AnalyticsExportProjection.model_validate(row) if row else None


class AnalyticsDashboardQueryService:
    """Read the event readiness summary with batched, explicit aggregates."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_event_for_scope(
        self,
        *,
        event_id: uuid.UUID,
        organization_id: uuid.UUID | None,
        is_platform_admin: bool = False,
    ) -> Event | None:
        """Load an event only after applying the caller's tenant boundary."""
        filters = [Event.id == event_id, Event.deleted_at.is_(None)]
        if not is_platform_admin:
            filters.append(Event.organization_id == organization_id)
        return await self.db.scalar(select(Event).where(*filters))

    async def summary(self, *, event: Event) -> dict:
        event_id = event.id
        sessions = list((await self.db.scalars(
            select(Session)
            .where(Session.event_id == event_id)
            .options(
                selectinload(Session.session_speakers)
                .selectinload(SessionSpeaker.speaker)
                .selectinload(Speaker.presentation_files)
            )
        )).all())

        total_sessions = len(sessions)
        ready_sessions = 0
        for session in sessions:
            if not session.session_speakers:
                continue
            if all(
                speaker_slot.is_confirmed
                and any(file.is_current_version for file in speaker_slot.speaker.presentation_files)
                for speaker_slot in session.session_speakers
            ):
                ready_sessions += 1

        # Keep all independent event counters in one round trip. The scalar
        # subqueries avoid join multiplication between participants, files,
        # rooms, and speaker assignments.
        total_speakers = select(func.count(Speaker.id)).where(
            Speaker.event_id == event_id
        ).scalar_subquery()
        confirmed_speakers = select(func.count(distinct(Speaker.id))).select_from(Speaker).outerjoin(
            SessionSpeaker, SessionSpeaker.speaker_id == Speaker.id
        ).where(
            Speaker.event_id == event_id,
            or_(Speaker.checked_in_at.is_not(None), SessionSpeaker.is_confirmed.is_(True)),
        ).scalar_subquery()
        registrations = select(func.count(Participant.id)).where(
            Participant.event_id == event_id,
            or_(Participant.paid_status == "Paid", Participant.approval_status == "Approved"),
        ).scalar_subquery()
        capacity = select(func.coalesce(func.max(CapacityRule.capacity), 500)).where(
            CapacityRule.event_id == event_id,
            CapacityRule.session_id.is_(None),
            CapacityRule.room_id.is_(None),
        ).scalar_subquery()
        total_files = select(func.count(PresentationFile.id)).where(
            PresentationFile.event_id == event_id,
            PresentationFile.is_current_version.is_(True),
        ).scalar_subquery()
        approved_files = select(func.count(PresentationFile.id)).select_from(PresentationFile).join(
            FileValidation, FileValidation.file_id == PresentationFile.id
        ).where(
            PresentationFile.event_id == event_id,
            PresentationFile.is_current_version.is_(True),
            func.lower(FileValidation.overall_result) == "pass",
        ).scalar_subquery()
        total_rooms = select(func.count(Room.id)).where(
            Room.event_id == event_id, Room.is_active.is_(True)
        ).scalar_subquery()
        configured_rooms = select(func.count(distinct(Room.id))).select_from(Room).join(
            RoomDevice, RoomDevice.room_id == Room.id
        ).where(
            Room.event_id == event_id, Room.is_active.is_(True)
        ).scalar_subquery()

        row = (await self.db.execute(select(
            total_speakers.label("total_speakers"),
            confirmed_speakers.label("confirmed_speakers"),
            registrations.label("registrations"),
            capacity.label("capacity"),
            total_files.label("total_files"),
            approved_files.label("approved_files"),
            total_rooms.label("total_rooms"),
            configured_rooms.label("configured_rooms"),
        ))).one()
        values = row._mapping

        def pct(value: int, total: int) -> float:
            return round(value / total * 100, 1) if total > 0 else 0.0

        total_sp = int(values["total_speakers"] or 0)
        conf_sp = int(values["confirmed_speakers"] or 0)
        total_reg = int(values["registrations"] or 0)
        cap = int(values["capacity"] or 500)
        total_file_count = int(values["total_files"] or 0)
        pass_file_count = int(values["approved_files"] or 0)
        total_room_count = int(values["total_rooms"] or 0)
        configured_room_count = int(values["configured_rooms"] or 0)

        return {
            "event_id": event_id,
            "is_live": event.start_date <= date.today() <= event.end_date,
            "scorecards": {
                "sessions_ready": {"ready": ready_sessions, "total": total_sessions, "pct": pct(ready_sessions, total_sessions)},
                "speakers_confirmed": {"ready": conf_sp, "total": total_sp, "pct": pct(conf_sp, total_sp)},
                "registrations": {"ready": total_reg, "total": cap, "pct": pct(total_reg, cap)},
                "files_validated": {"ready": pass_file_count, "total": total_file_count, "pct": pct(pass_file_count, total_file_count)},
                "rooms_configured": {"ready": configured_room_count, "total": total_room_count, "pct": pct(configured_room_count, total_room_count)},
            },
        }

    async def registrations_timeline(self, *, event: Event) -> list[dict]:
        """Return a bounded 30-day registration timeline plus forecast rows."""
        now = datetime.now(timezone.utc)
        today = date.today()
        thirty_days_ago = now - timedelta(days=30)

        baseline = (await self.db.execute(select(
            func.count(Participant.id).label("total"),
            func.sum(case((Participant.paid_status == "Paid", 1), else_=0)).label("paid"),
            func.sum(case((Participant.approval_status == "Approved", 1), else_=0)).label("approved"),
        ).where(
            Participant.event_id == event.id,
            Participant.registered_at < thirty_days_ago,
        ))).one()
        cumulative_registered = int(baseline.total or 0)
        cumulative_paid = int(baseline.paid or 0)
        cumulative_approved = int(baseline.approved or 0)

        daily_rows = (await self.db.execute(select(
            func.cast(Participant.registered_at, Date).label("reg_date"),
            func.count(Participant.id).label("total"),
            func.sum(case((Participant.paid_status == "Paid", 1), else_=0)).label("paid"),
            func.sum(case((Participant.approval_status == "Approved", 1), else_=0)).label("approved"),
        ).where(
            Participant.event_id == event.id,
            Participant.registered_at >= thirty_days_ago,
        ).group_by(
            func.cast(Participant.registered_at, Date)
        ).order_by("reg_date"))).all()
        daily_data = {row.reg_date: row for row in daily_rows}

        timeline = []
        for index in range(30):
            day = today - timedelta(days=29 - index)
            row = daily_data.get(day)
            if row:
                cumulative_registered += int(row.total or 0)
                cumulative_paid += int(row.paid or 0)
                cumulative_approved += int(row.approved or 0)
            timeline.append({
                "date": day.strftime("%b %d"),
                "registered": cumulative_registered,
                "paid": cumulative_paid,
                "approved": cumulative_approved,
                "is_forecast": False,
            })

        average_daily_rate = sum(int(row.total or 0) for row in daily_rows) / 30.0
        if event.start_date > today:
            forecast_days = min((event.start_date - today).days, 30)
            for offset in range(1, forecast_days + 1):
                forecast_date = today + timedelta(days=offset)
                timeline.append({
                    "date": forecast_date.strftime("%b %d"),
                    "registered": int(cumulative_registered + average_daily_rate * offset),
                    "paid": int(cumulative_paid + (average_daily_rate * 0.8) * offset),
                    "approved": int(cumulative_approved + (average_daily_rate * 0.85) * offset),
                    "is_forecast": True,
                })
        return timeline

    async def roles_breakdown(self, *, event_id: uuid.UUID) -> list[dict]:
        """Return bounded role counts for one verified event."""
        rows = (await self.db.execute(
            select(
                ParticipantRole.name,
                func.count(Participant.id).label("value"),
            )
            .join(Participant, Participant.role_id == ParticipantRole.id)
            .where(Participant.event_id == event_id)
            .group_by(ParticipantRole.name)
            .order_by(ParticipantRole.name)
        )).all()
        return [{"name": row.name, "value": int(row.value or 0)} for row in rows]

    async def pending_actions(self, *, event: Event) -> list[dict]:
        """Build the organizer action queue from one event-scoped aggregate read."""
        event_id = event.id
        five_days_ago = datetime.now(timezone.utc) - timedelta(days=5)
        no_speaker_sessions = select(func.count(Session.id)).where(
            Session.event_id == event_id,
            ~Session.session_speakers.any(),
        ).scalar_subquery()
        unconfirmed_speakers = select(func.count(distinct(Speaker.id))).select_from(Speaker).join(
            SessionSpeaker, SessionSpeaker.speaker_id == Speaker.id
        ).where(
            Speaker.event_id == event_id,
            Speaker.created_at < five_days_ago,
            SessionSpeaker.is_confirmed.is_(False),
        ).scalar_subquery()
        pending_files = select(func.count(PresentationFile.id)).where(
            PresentationFile.event_id == event_id,
            PresentationFile.is_current_version.is_(True),
            PresentationFile.upload_status.in_(("processing", "pending_validation")),
        ).scalar_subquery()
        pending_reviews = select(func.count(Participant.id)).where(
            Participant.event_id == event_id,
            Participant.approval_status.in_(("PENDING_REVIEW", "Pending")),
        ).scalar_subquery()
        missing_files = select(func.count(Speaker.id)).where(
            Speaker.event_id == event_id,
            Speaker.upload_status == "pending",
        ).scalar_subquery()

        row = (await self.db.execute(select(
            no_speaker_sessions.label("no_speakers"),
            unconfirmed_speakers.label("unconfirmed_speakers"),
            pending_files.label("pending_files"),
            pending_reviews.label("pending_reviews"),
            missing_files.label("missing_files"),
        ))).one()._mapping
        approaching_deadline = bool(
            event.upload_deadline
            and event.upload_deadline > datetime.now(timezone.utc)
            and (event.upload_deadline - datetime.now(timezone.utc)).days <= 7
        )
        missing_count = int(row["missing_files"] or 0) if approaching_deadline else 0
        return [
            {"type": "no_speakers", "message": "Sessions without speakers assigned", "count": int(row["no_speakers"] or 0), "action_link": f"/events/{event_id}/speaker/sessions"},
            {"type": "unconfirmed_speakers", "message": "Speakers invited but not confirmed (>5 days)", "count": int(row["unconfirmed_speakers"] or 0), "action_link": f"/events/{event_id}/speaker/speakers"},
            {"type": "pending_files", "message": "Files uploaded but not validated", "count": int(row["pending_files"] or 0), "action_link": f"/events/{event_id}/speaker/files"},
            {"type": "pending_reviews", "message": "Registrations in PENDING_REVIEW state", "count": int(row["pending_reviews"] or 0), "action_link": f"/events/{event_id}/registration/review"},
            {"type": "missing_files", "message": "Speakers without files uploaded (deadline approaching)", "count": missing_count, "action_link": f"/events/{event_id}/speaker/files"},
        ]

    async def recent_activity(self, *, event_id: uuid.UUID) -> list[dict]:
        """Bucket recent registrations, uploads, and check-ins by hour."""
        now = datetime.now(timezone.utc)
        one_day_ago = now - timedelta(hours=24)
        registrations = list((await self.db.scalars(select(Participant.registered_at).where(
            Participant.event_id == event_id,
            Participant.registered_at >= one_day_ago,
        ))).all())
        uploads = list((await self.db.scalars(select(PresentationFile.uploaded_at).where(
            PresentationFile.event_id == event_id,
            PresentationFile.uploaded_at >= one_day_ago,
        ))).all())
        checked_ins = list((await self.db.scalars(select(Speaker.checked_in_at).where(
            Speaker.event_id == event_id,
            Speaker.checked_in_at >= one_day_ago,
        ))).all())

        activity = []
        for index in range(24):
            bucket_start = (now - timedelta(hours=23 - index)).replace(
                minute=0, second=0, microsecond=0
            )
            bucket_end = bucket_start + timedelta(hours=1)
            activity.append({
                "hour": bucket_start.strftime("%H:00"),
                "registrations": sum(1 for value in registrations if bucket_start <= value < bucket_end),
                "files": sum(1 for value in uploads if bucket_start <= value < bucket_end),
                "speakers": sum(1 for value in checked_ins if bucket_start <= value < bucket_end),
            })
        return activity

    async def upcoming_deadlines(self, *, event: Event) -> list[dict]:
        """Build the bounded event deadline projection without router logic."""
        now = datetime.now(timezone.utc)
        deadlines: list[dict] = []

        if event.upload_deadline:
            deadlines.append({
                "name": "Speaker Upload Deadline",
                "date": event.upload_deadline.strftime("%b %d, %Y"),
                "days_remaining": (event.upload_deadline - now).days,
            })
        else:
            deadlines.append({
                "name": "Speaker Upload Deadline",
                "date": "Not Configured",
                "days_remaining": -1,
            })

        for name, days_before in (
            ("Speaker Registration Closes", 5),
            ("AV Systems On-Site Dry Run", 1),
        ):
            deadline_date = event.start_date - timedelta(days=days_before)
            deadline_at = datetime.combine(
                deadline_date, datetime.min.time(), tzinfo=timezone.utc
            )
            deadlines.append({
                "name": name,
                "date": deadline_date.strftime("%b %d, %Y"),
                "days_remaining": (deadline_at - now).days,
            })
        return deadlines

    async def superadmin_overview(self) -> dict:
        """Read platform KPIs with one explicit aggregate projection."""
        now = datetime.now(timezone.utc)
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        thirty_days_ago = now - timedelta(days=30)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        previous_month_end = month_start - timedelta(seconds=1)

        latest_txn = select(
            SubscriptionTransaction.organization_id,
            func.max(SubscriptionTransaction.created_at).label("latest_at"),
        ).where(
            SubscriptionTransaction.status == "SUCCESS",
        ).group_by(SubscriptionTransaction.organization_id).subquery()
        previous_latest_txn = select(
            SubscriptionTransaction.organization_id,
            func.max(SubscriptionTransaction.created_at).label("latest_at"),
        ).where(
            SubscriptionTransaction.status == "SUCCESS",
            SubscriptionTransaction.created_at <= previous_month_end,
        ).group_by(SubscriptionTransaction.organization_id).subquery()

        def latest_total(subquery):
            return select(func.coalesce(func.sum(SubscriptionTransaction.amount), 0.0)).select_from(
                SubscriptionTransaction
            ).join(
                subquery,
                and_(
                    SubscriptionTransaction.organization_id == subquery.c.organization_id,
                    SubscriptionTransaction.created_at == subquery.c.latest_at,
                ),
            ).where(
                SubscriptionTransaction.status == "SUCCESS",
            ).scalar_subquery()

        total_orgs = select(func.count(Organization.id)).scalar_subquery()
        active_orgs = select(func.count(Organization.id)).where(
            Organization.is_active.is_(True)
        ).scalar_subquery()
        trial_orgs = select(func.count(Organization.id)).where(
            Organization.plan == "trial"
        ).scalar_subquery()
        suspended_orgs = select(func.count(Organization.id)).where(
            Organization.is_active.is_(False)
        ).scalar_subquery()
        total_users = select(func.count(IdentityUser.id)).where(
            IdentityUser.deleted_at.is_(None)
        ).scalar_subquery()
        active_users_30d = select(func.count(IdentityUser.id)).where(
            IdentityUser.deleted_at.is_(None),
            IdentityUser.last_login_at >= thirty_days_ago,
        ).scalar_subquery()
        total_events = select(func.count(Event.id)).where(
            Event.deleted_at.is_(None)
        ).scalar_subquery()
        events_this_month = select(func.count(Event.id)).where(
            Event.deleted_at.is_(None),
            Event.created_at >= month_start,
        ).scalar_subquery()
        tickets_open = select(func.count(SupportTicket.id)).where(
            SupportTicket.status == "OPEN"
        ).scalar_subquery()
        cancelled = select(func.count(OrganizationSubscription.id)).where(
            OrganizationSubscription.status == "CANCELLED"
        ).scalar_subquery()
        active_subscriptions = select(func.count(OrganizationSubscription.id)).where(
            OrganizationSubscription.status.in_(["ACTIVE", "TRIAL"])
        ).scalar_subquery()
        churn_denominator = cancelled + active_subscriptions

        try:
            row = (await self.db.execute(select(
                total_orgs.label("total_orgs"),
                active_orgs.label("active_orgs"),
                trial_orgs.label("trial_orgs"),
                suspended_orgs.label("suspended_orgs"),
                total_users.label("total_users"),
                active_users_30d.label("active_users_30d"),
                total_events.label("total_events"),
                events_this_month.label("events_this_month"),
                tickets_open.label("tickets_open"),
                latest_total(latest_txn).label("mrr"),
                latest_total(previous_latest_txn).label("mrr_prev_month"),
                select(func.coalesce(func.sum(SubscriptionTransaction.amount), 0.0)).where(
                    SubscriptionTransaction.status == "SUCCESS",
                    SubscriptionTransaction.created_at >= today_start,
                ).scalar_subquery().label("revenue_today"),
                cancelled.label("cancelled"),
                active_subscriptions.label("active_subscriptions"),
            ))).one()._mapping
        except Exception:
            # Keep the existing super-admin contract resilient when an optional
            # platform table is unavailable during an incremental deployment.
            return {
                "total_orgs": 0, "active_orgs": 0, "trial_orgs": 0,
                "suspended_orgs": 0, "total_users": 0, "total_events": 0,
                "events_this_month": 0, "tickets_open": 0, "mrr": 0.0,
                "arr": 0.0, "mrr_prev_month": 0.0, "active_users_30d": 0,
                "churn_rate": 0.0, "revenue_today": 0.0,
            }

        mrr = float(row["mrr"] or 0.0)
        denominator = int(row["cancelled"] or 0) + int(row["active_subscriptions"] or 0)
        churn_rate = round(int(row["cancelled"] or 0) / denominator * 100, 2) if denominator else 0.0
        return {
            "total_orgs": int(row["total_orgs"] or 0),
            "active_orgs": int(row["active_orgs"] or 0),
            "trial_orgs": int(row["trial_orgs"] or 0),
            "suspended_orgs": int(row["suspended_orgs"] or 0),
            "total_users": int(row["total_users"] or 0),
            "total_events": int(row["total_events"] or 0),
            "events_this_month": int(row["events_this_month"] or 0),
            "tickets_open": int(row["tickets_open"] or 0),
            "mrr": mrr,
            "arr": mrr * 12,
            "mrr_prev_month": float(row["mrr_prev_month"] or 0.0),
            "active_users_30d": int(row["active_users_30d"] or 0),
            "churn_rate": churn_rate,
            "revenue_today": float(row["revenue_today"] or 0.0),
        }

    async def superadmin_activity_feed(self, *, limit: int) -> list[dict]:
        """Read the authoritative platform activity timeline with bounded fields."""
        bounded_limit = max(1, min(limit, 100))
        rows = (await self.db.execute(
            select(
                ActivityTimeline.id,
                ActivityTimeline.organization_id,
                ActivityTimeline.action_type,
                ActivityTimeline.metadata_data,
                ActivityTimeline.timestamp,
            ).order_by(
                ActivityTimeline.timestamp.desc(), ActivityTimeline.id.desc()
            ).limit(bounded_limit)
        )).mappings().all()
        result: list[dict] = []
        for row in rows:
            metadata = row["metadata_data"] if isinstance(row["metadata_data"], dict) else {}
            result.append({
                "id": str(row["id"]),
                "entity_type": "organization",
                "entity_id": str(row["organization_id"]),
                "activity_type": row["action_type"],
                "title": row["action_type"].replace("_", " ").title(),
                "description": str(metadata.get("reason") or row["action_type"]),
                "icon": None,
                "metadata": metadata,
                "created_at": row["timestamp"],
            })
        return result

    async def superadmin_mrr_history(self, *, months: int) -> list[dict]:
        """Read MRR history from projections, with a bounded transaction fallback."""
        bounded_months = max(1, min(months, 36))
        metric_rows = (await self.db.execute(select(
            RevenueMetric.period,
            func.sum(RevenueMetric.mrr).label("mrr"),
            func.sum(RevenueMetric.arr).label("arr"),
        ).group_by(
            RevenueMetric.period
        ).order_by(
            RevenueMetric.period.desc()
        ).limit(bounded_months))).all()
        if metric_rows:
            rows = reversed(metric_rows)
            return [self._mrr_point(row.period, row.mrr, row.arr) for row in rows]

        cutoff = datetime.now(timezone.utc) - timedelta(days=bounded_months * 31)
        transaction_rows = (await self.db.execute(select(
            func.to_char(SubscriptionTransaction.created_at, "YYYY-MM").label("period"),
            func.sum(SubscriptionTransaction.amount).label("total"),
        ).where(
            SubscriptionTransaction.status == "SUCCESS",
            SubscriptionTransaction.created_at >= cutoff,
        ).group_by(text("period")).order_by(text("period")))).all()
        return [
            self._mrr_point(row.period, row.total, (row.total or 0) * 12)
            for row in transaction_rows
        ]

    async def room_readiness(self, *, event_id: uuid.UUID) -> list[dict]:
        """Return room readiness from one bounded grouped projection."""
        ready_statuses = ["valid", "approved", "pending_validation", "processing", "uploaded"]
        rows = (await self.db.execute(
            select(
                Room.id.label("room_id"),
                Room.name.label("room_name"),
                func.count(distinct(Session.id)).label("session_count"),
                func.count(distinct(SessionSpeaker.id)).label("speaker_slots"),
                func.count(distinct(PresentationFile.id)).label("files_ready"),
            )
            .select_from(Room)
            .outerjoin(Session, and_(Session.room_id == Room.id, Session.event_id == event_id))
            .outerjoin(SessionSpeaker, SessionSpeaker.session_id == Session.id)
            .outerjoin(
                PresentationFile,
                and_(
                    PresentationFile.session_speaker_id == SessionSpeaker.id,
                    PresentationFile.is_current_version.is_(True),
                    PresentationFile.upload_status.in_(ready_statuses),
                ),
            )
            .where(Room.event_id == event_id, Room.is_active.is_(True))
            .group_by(Room.id, Room.name)
            .order_by(Room.name, Room.id)
            .limit(500)
        )).all()
        result: list[dict] = []
        for row in rows:
            slots = int(row.speaker_slots or 0)
            files_ready = int(row.files_ready or 0)
            result.append({
                "room_id": str(row.room_id),
                "room_name": row.room_name,
                "session_count": int(row.session_count or 0),
                "speaker_slots": slots,
                "files_ready": files_ready,
                "readiness_pct": round(files_ready / slots * 100, 1) if slots else 0.0,
            })
        return result

    async def room_heatmap(self, *, event_id: uuid.UUID) -> list[dict]:
        """Return the dashboard heatmap contract from the bounded room projection."""
        rows = await self.room_readiness(event_id=event_id)
        return [
            {
                "room_name": row["room_name"],
                "readiness_pct": row["readiness_pct"],
                "total_sessions": row["session_count"],
                "ready_sessions": int(row["session_count"] * (row["readiness_pct"] / 100))
                if row["session_count"] > 0 else 0,
            }
            for row in rows
        ]

    async def overview(self, *, event_id: uuid.UUID, coverage_data: dict | None = None) -> dict:
        """Return dashboard overview counters with two bounded projections."""
        scalar = lambda statement: statement.scalar_subquery()
        row = (await self.db.execute(select(
            scalar(select(func.count()).select_from(Room).where(
                Room.event_id == event_id, Room.is_active.is_(True)
            )).label("total_rooms"),
            scalar(select(func.count()).select_from(Session).where(
                Session.event_id == event_id
            )).label("total_sessions"),
            scalar(select(func.count()).select_from(Speaker).where(
                Speaker.event_id == event_id
            )).label("total_speakers"),
        ))).mappings().one()

        status_rows = (await self.db.execute(union_all(
            select(
                literal("file").label("kind"),
                PresentationFile.upload_status.label("status"),
                func.count().label("count"),
            ).where(
                PresentationFile.event_id == event_id,
                PresentationFile.is_current_version.is_(True),
            ).group_by(PresentationFile.upload_status),
            select(
                literal("poster").label("kind"),
                Poster.status.label("status"),
                func.count().label("count"),
            ).where(Poster.event_id == event_id).group_by(Poster.status),
        ))).mappings().all()
        file_counts = {r["status"]: int(r["count"] or 0) for r in status_rows if r["kind"] == "file"}
        poster_counts = {r["status"]: int(r["count"] or 0) for r in status_rows if r["kind"] == "poster"}

        files_approved = poster_counts.get("approved", 0) + file_counts.get("approved", 0)
        files_rejected = poster_counts.get("rejected", 0) + file_counts.get("rejected", 0)
        files_uploaded = (
            sum(file_counts.get(s, 0) for s in ("processing", "pending_validation", "valid", "approved", "rejected", "uploaded"))
            + sum(poster_counts.get(s, 0) for s in ("submitted", "under_review", "approved", "rejected"))
        )
        files_pending = (
            sum(file_counts.get(s, 0) for s in ("processing", "pending_validation", "valid", "invalid"))
            + sum(poster_counts.get(s, 0) for s in ("submitted", "under_review"))
        )
        coverage = coverage_data or {}
        return {
            "total_rooms": int(row["total_rooms"] or 0),
            "total_sessions": int(row["total_sessions"] or 0),
            "total_speakers": int(row["total_speakers"] or 0),
            "total_files": sum(file_counts.values()) + sum(poster_counts.values()),
            "files_uploaded": files_uploaded,
            "files_approved": files_approved,
            "files_pending": files_pending,
            "files_rejected": files_rejected,
            "sessions_ready": coverage.get("complete", 0),
            "talks_pending_upload": coverage.get("talks_pending_upload", 0),
        }

    async def email_stats(self, *, event_id: uuid.UUID) -> dict:
        """Return event email delivery counters with one grouped projection."""
        row = (await self.db.execute(
            select(
                func.count(EmailLog.id).label("total"),
                func.count(EmailLog.id).filter(EmailLog.status == "delivered").label("delivered"),
                func.count(EmailLog.id).filter(EmailLog.status == "bounced").label("bounced"),
                func.count(EmailLog.id).filter(EmailLog.status == "failed").label("failed"),
                func.count(EmailLog.id).filter(EmailLog.opened_at.is_not(None)).label("opened"),
            )
            .select_from(EmailLog)
            .join(EmailCampaign, EmailCampaign.id == EmailLog.campaign_id)
            .where(EmailCampaign.event_id == event_id)
        )).mappings().one()

        total = int(row["total"] or 0)
        delivered = int(row["delivered"] or 0)
        opened = int(row["opened"] or 0)
        return {
            "total_sent": total,
            "delivered": delivered,
            "bounced": int(row["bounced"] or 0),
            "failed": int(row["failed"] or 0),
            "opened": opened,
            "open_rate_pct": round(opened / delivered * 100, 1) if delivered > 0 else 0.0,
            "delivery_rate_pct": round(delivered / total * 100, 1) if total > 0 else 0.0,
        }

    async def email_campaign_analytics(
        self,
        *,
        event_id: uuid.UUID,
        target_type: str,
    ) -> dict:
        """Return campaign and delivery aggregates without loading campaign rows."""
        campaign_row = (await self.db.execute(
            select(
                func.count(EmailCampaign.id).label("campaigns"),
                func.coalesce(func.sum(EmailCampaign.total_recipients), 0).label("recipients"),
                func.coalesce(func.sum(EmailCampaign.sent_count), 0).label("sent"),
            ).where(
                EmailCampaign.event_id == event_id,
                EmailCampaign.target_type == target_type,
            )
        )).mappings().one()

        log_source = Participant if target_type == "participant" else Speaker
        log_owner = EmailLog.participant_id if target_type == "participant" else EmailLog.speaker_id
        log_row = (await self.db.execute(
            select(
                func.count(EmailLog.id).filter(EmailLog.status.in_(["failed", "bounced"])).label("failed"),
                func.count(EmailLog.id).filter(EmailLog.opened_at.is_not(None)).label("opened"),
            )
            .select_from(EmailLog)
            .join(log_source, log_owner == log_source.id)
            .where(log_source.event_id == event_id)
        )).mappings().one()

        total_recipients = int(campaign_row["recipients"] or 0)
        total_sent = int(campaign_row["sent"] or 0)
        opened_count = int(log_row["opened"] or 0)
        return {
            "total_campaigns": int(campaign_row["campaigns"] or 0),
            "total_recipients": total_recipients,
            "total_sent": total_sent,
            "failed_count": int(log_row["failed"] or 0),
            "opened_count": opened_count,
            "success_rate": round(total_sent / total_recipients * 100, 1) if total_recipients > 0 else 0.0,
            "open_rate": round(opened_count / total_sent * 100, 1) if total_sent > 0 else 0.0,
        }

    async def upload_funnel(self, *, event_id: uuid.UUID) -> dict:
        """Return speaker upload funnel counters from one grouped projection."""
        rows = (await self.db.execute(
            select(Speaker.upload_status, func.count().label("count"))
            .where(Speaker.event_id == event_id)
            .group_by(Speaker.upload_status)
        )).all()
        counts = {row.upload_status: int(row.count or 0) for row in rows}
        total = sum(counts.values())

        def pct(value: int) -> float:
            return round(value / total * 100, 1) if total > 0 else 0.0

        pending = counts.get("pending", 0)
        uploaded = counts.get("uploaded", 0)
        replaced = counts.get("replaced", 0)
        approved = counts.get("approved", 0)
        rejected = counts.get("rejected", 0)
        uploaded_total = uploaded + replaced + approved + rejected
        approval_rate = round(approved / uploaded_total * 100, 1) if uploaded_total > 0 else 0.0
        return {
            "invited": total,
            "total_speakers": total,
            "pending": pending,
            "uploaded": uploaded_total,
            "approved": approved,
            "rejected": rejected,
            "pending_pct": pct(pending),
            "uploaded_pct": pct(uploaded_total),
            "upload_rate_pct": pct(uploaded_total),
            "approved_pct": pct(approved),
            "approval_rate_pct": approval_rate,
            "rejected_pct": pct(rejected),
            "completion_rate": pct(approved),
        }

    async def file_format_distribution(self, *, event_id: uuid.UUID) -> list[dict]:
        """Return current presentation-file counts grouped by format."""
        rows = (await self.db.execute(
            select(PresentationFile.file_format, func.count().label("count"))
            .where(
                PresentationFile.event_id == event_id,
                PresentationFile.is_current_version.is_(True),
            )
            .group_by(PresentationFile.file_format)
            .order_by(func.count().desc())
        )).all()
        return [{"format": row.file_format, "count": int(row.count or 0)} for row in rows]

    async def daily_upload_history(self, *, event_id: uuid.UUID) -> list[dict]:
        """Return upload counts grouped by day for the existing chart contract."""
        rows = (await self.db.execute(
            select(
                func.date_trunc("day", PresentationFile.created_at).label("day"),
                func.count().label("count"),
            )
            .where(
                PresentationFile.event_id == event_id,
                PresentationFile.is_current_version.is_(True),
            )
            .group_by("day")
            .order_by("day")
        )).all()
        return [
            {"label": row.day.strftime("%d %b"), "value": float(row.count)}
            for row in rows
            if row.day
        ]

    async def venue_sync_stats(self, *, event_id: uuid.UUID) -> dict:
        """Return the latest venue synchronization state using explicit columns."""
        row = (await self.db.execute(
            select(
                VenueSyncJob.created_at,
                VenueSyncJob.status,
                VenueSyncJob.completed_at,
            )
            .where(VenueSyncJob.event_id == event_id)
            .order_by(VenueSyncJob.created_at.desc(), VenueSyncJob.id.desc())
            .limit(1)
        )).mappings().one_or_none()
        if row is None:
            return {"last_sync": None, "status": "never_synced"}
        return {
            "last_sync": row["created_at"].isoformat() if row["created_at"] else None,
            "status": row["status"],
            "files_synced": None,
            "completed_at": row["completed_at"].isoformat() if row["completed_at"] else None,
        }

    async def srr_stats(self, *, event_id: uuid.UUID) -> dict:
        """Return SRR totals and active check-ins with one aggregate projection."""
        row = (await self.db.execute(
            select(
                func.count(SRRCheckin.id).label("total"),
                func.count(SRRCheckin.id).filter(SRRCheckin.checked_out_at.is_(None)).label("active"),
                func.count(SRRCheckin.id).filter(SRRCheckin.checkin_method == "qr_scan").label("qr_scan"),
                func.count(SRRCheckin.id).filter(SRRCheckin.checkin_method == "manual").label("manual"),
                func.count(SRRCheckin.id).filter(SRRCheckin.checkin_method == "token").label("token"),
            )
            .where(SRRCheckin.event_id == event_id)
        )).mappings().one()
        by_method = {
            "qr_scan": int(row["qr_scan"] or 0),
            "manual": int(row["manual"] or 0),
            "token": int(row["token"] or 0),
        }
        return {
            "total_checkins": int(row["total"] or 0),
            "currently_active": int(row["active"] or 0),
            "by_method": by_method,
            "qr_scan": by_method["qr_scan"],
            "manual": by_method["manual"],
            "token": by_method["token"],
        }

    async def session_coverage(self, *, event_id: uuid.UUID) -> dict:
        """Return bounded session/file coverage without loading full ORM graphs."""
        total_rows = (await self.db.execute(
            select(SessionSpeaker.session_id, func.count().label("total_slots"))
            .join(Session, Session.id == SessionSpeaker.session_id)
            .where(Session.event_id == event_id)
            .group_by(SessionSpeaker.session_id)
        )).all()
        total_slots = {row.session_id: int(row.total_slots or 0) for row in total_rows}

        file_rows = (await self.db.execute(
            select(PresentationFile.session_speaker_id)
            .join(SessionSpeaker, SessionSpeaker.id == PresentationFile.session_speaker_id)
            .join(Session, Session.id == SessionSpeaker.session_id)
            .where(
                Session.event_id == event_id,
                PresentationFile.is_current_version.is_(True),
                PresentationFile.upload_status.in_(["valid", "approved", "pending_validation", "processing", "uploaded"]),
            )
            .group_by(PresentationFile.session_speaker_id)
        )).all()
        has_file = {row.session_speaker_id for row in file_rows}

        slot_rows = (await self.db.execute(
            select(SessionSpeaker.session_id, SessionSpeaker.id, SessionSpeaker.role)
            .join(Session, Session.id == SessionSpeaker.session_id)
            .where(Session.event_id == event_id)
        )).all()
        session_slots: dict[uuid.UUID, list[uuid.UUID]] = {}
        pending_talks_count = 0
        for row in slot_rows:
            session_slots.setdefault(row.session_id, []).append(row.id)
            if row.id not in has_file and (
                row.role is None
                or row.role in UPLOAD_REQUIRED_CODES
                or row.role in ["Speaker", "KEY", "INV", "ORL", "Oral Presenter", "Keynote Speaker", "Invited Speaker"]
            ):
                pending_talks_count += 1

        complete = partial = missing = 0
        for session_id, slots in session_slots.items():
            filled = sum(1 for slot_id in slots if slot_id in has_file)
            if filled == len(slots):
                complete += 1
            elif filled > 0:
                partial += 1
            else:
                missing += 1

        pending_eposters = await self.db.scalar(
            select(func.count(Poster.id)).where(
                Poster.event_id == event_id,
                Poster.status == "pending",
            )
        ) or 0
        session_rows = (await self.db.execute(
            select(
                Session.id,
                Session.name,
                Session.session_code,
                Session.start_time,
                Room.name.label("room_name"),
            )
            .outerjoin(Room, Room.id == Session.room_id)
            .where(Session.event_id == event_id)
        )).all()

        session_details = []
        for row in session_rows:
            slots = session_slots.get(row.id, [])
            total_speakers = len(slots)
            files_approved = sum(1 for slot_id in slots if slot_id in has_file)
            session_details.append({
                "session_id": str(row.id),
                "session_name": row.name,
                "session_code": row.session_code or "",
                "room_name": row.room_name,
                "start_time": row.start_time.isoformat() if row.start_time else None,
                "total_speakers": total_speakers,
                "files_approved": files_approved,
                "files_pending": total_speakers - files_approved,
                "readiness_pct": round(files_approved / total_speakers * 100, 1) if total_speakers else 0.0,
            })
        session_details.sort(key=lambda item: item["start_time"] or "9999-12-31T00:00:00+00:00")
        total = len(session_slots)
        return {
            "total_sessions": total,
            "complete": complete,
            "partial": partial,
            "missing": missing,
            "coverage_pct": round(complete / total * 100, 1) if total else 0.0,
            "talks_pending_upload": pending_talks_count + int(pending_eposters),
            "sessions": session_details,
        }

    @staticmethod
    def _mrr_point(period: str, mrr: object, arr: object) -> dict:
        try:
            year, month = int(period[:4]), int(period[5:7])
            label = date(year, month, 1).strftime("%b %Y")
        except (TypeError, ValueError, IndexError):
            label = period
        return {
            "month": label,
            "period": period,
            "mrr": float(mrr or 0.0),
            "arr": float(arr or 0.0),
        }
