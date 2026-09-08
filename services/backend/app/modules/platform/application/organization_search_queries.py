"""Tenant-scoped, bounded projections for organization-console search."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only

from app.modules.agenda.models import Session
from app.modules.communications.models.email_campaign import EmailCampaign
from app.modules.communications.models.email_template import EmailTemplate
from app.modules.events.models.event import Event
from app.modules.events.models.speaker import Speaker
from app.modules.identity.models.user import User
from app.modules.presentations.models.presentation_file import PresentationFile
from app.modules.rbac.models.user_assignment import UserEventAssignment
from app.modules.registration.models.participant_registration import ParticipantRegistration
from app.modules.registration.models.participant import Participant
from app.modules.registration.models.participant_role import ParticipantRole
from app.modules.registration.models.confirmation_qr import RegistrationConfirmationQR
from app.modules.registration.models.payment_transaction import PaymentTransaction
from app.modules.registration.models.import_job import ImportJob
from app.modules.venue.models.venue_sync_job import VenueSyncJob
from app.modules.presentations.models.presentations_domain_tables import PresentationProcessingJob
from app.modules.registration.models.check_in import CheckIn
from app.modules.registration.models.ticket_type import TicketType
from app.modules.registration.models.print_template import PrintTemplate
from app.modules.registration.services.confirmation_qr_service import (
    build_confirmation_image_url,
    build_confirmation_token,
)
from app.modules.integrations.models.webhook import Webhook
from app.modules.abstracts.models import AbstractSubmission


SEARCH_DOMAINS = frozenset({"events", "speakers", "sessions", "registrations", "files", "campaigns", "users"})


def _mask_email(value: object) -> str | None:
    if not isinstance(value, str) or "@" not in value:
        return None
    local, domain = value.split("@", 1)
    return f"{local[:1]}***@{domain}"


def _mask_phone(value: object) -> str | None:
    if not isinstance(value, str) or not value:
        return None
    return f"***{value[-4:]}" if len(value) >= 4 else "***"


def _sort_key(item: dict) -> tuple[datetime, str]:
    occurred_at = item["occurred_at"] or datetime.min.replace(tzinfo=timezone.utc)
    return occurred_at, str(item["id"])


def _after_cursor(column, id_column, cursor_position: tuple[datetime, uuid.UUID] | None):
    """Build a strict descending seek predicate for one search domain."""
    if cursor_position is None:
        return ()
    occurred_at, record_id = cursor_position
    return (or_(column < occurred_at, and_(column == occurred_at, id_column < record_id)),)


class OrganizationConsoleSearchQueryService:
    """Search projections with tenant/event scope enforced inside each query."""

    MAX_DOMAIN_ROWS = 101

    def __init__(self, db: AsyncSession):
        self.db = db

    async def search(
        self,
        *,
        organization_id: uuid.UUID,
        pattern: str,
        selected: set[str],
        event_id: uuid.UUID | None,
        offset: int,
        limit: int,
        include_sensitive: bool,
        cursor_position: tuple[datetime, uuid.UUID] | None = None,
    ) -> tuple[list[dict], tuple[datetime, uuid.UUID] | int | None]:
        """Return a compatibility page while bounding every domain query.

        The endpoint historically used an offset cursor.  Keep that contract,
        but fetch only the rows needed to form the requested page plus one
        look-ahead row per selected domain, with deterministic ordering.
        """
        if offset < 0:
            raise ValueError("offset must be non-negative")
        fetch_limit = min(self.MAX_DOMAIN_ROWS, limit + 1) if cursor_position else min(self.MAX_DOMAIN_ROWS, offset + limit + 1)
        event_scope = select(Event.id).where(Event.organization_id == organization_id)
        if event_id is not None:
            event_scope = event_scope.where(Event.id == event_id)

        items: list[dict] = []
        if "events" in selected:
            rows = (await self.db.execute(
                select(Event.id, Event.name, Event.short_code, Event.status, Event.updated_at)
                .where(
                    Event.organization_id == organization_id,
                    or_(Event.name.ilike(pattern), Event.short_code.ilike(pattern)),
                    *_after_cursor(Event.updated_at, Event.id, cursor_position),
                )
                .order_by(Event.updated_at.desc(), Event.id.desc())
                .limit(fetch_limit)
            )).all()
            items.extend({"domain": "events", "resource_type": "event", "id": r.id, "event_id": r.id, "title": r.name, "subtitle": r.short_code, "status": r.status, "occurred_at": r.updated_at} for r in rows)

        if "speakers" in selected:
            rows = (await self.db.execute(
                select(Speaker.id, Speaker.event_id, Speaker.first_name, Speaker.last_name, Speaker.email, Speaker.upload_status, Speaker.updated_at)
                .where(
                    Speaker.event_id.in_(event_scope), Speaker.deleted_at.is_(None),
                    or_(Speaker.first_name.ilike(pattern), Speaker.last_name.ilike(pattern), Speaker.email.ilike(pattern), Speaker.affiliation.ilike(pattern)),
                    *_after_cursor(Speaker.updated_at, Speaker.id, cursor_position),
                )
                .order_by(Speaker.updated_at.desc(), Speaker.id.desc())
                .limit(fetch_limit)
            )).all()
            items.extend({"domain": "speakers", "resource_type": "speaker", "id": r.id, "event_id": r.event_id, "title": f"{r.first_name} {r.last_name}" if include_sensitive else f"{r.first_name[:1]}*** {r.last_name[:1]}***", "subtitle": r.email if include_sensitive else _mask_email(r.email), "status": r.upload_status, "occurred_at": r.updated_at} for r in rows)

        if "sessions" in selected:
            rows = (await self.db.execute(
                select(Session.id, Session.event_id, Session.title, Session.session_code, Session.status, Session.updated_at)
                .where(
                    Session.event_id.in_(event_scope), Session.deleted_at.is_(None),
                    or_(Session.title.ilike(pattern), Session.session_code.ilike(pattern), Session.description.ilike(pattern)),
                    *_after_cursor(Session.updated_at, Session.id, cursor_position),
                )
                .order_by(Session.updated_at.desc(), Session.id.desc())
                .limit(fetch_limit)
            )).all()
            items.extend({"domain": "sessions", "resource_type": "session", "id": r.id, "event_id": r.event_id, "title": r.title, "subtitle": r.session_code, "status": r.status, "occurred_at": r.updated_at} for r in rows)

        if "registrations" in selected:
            rows = (await self.db.execute(
                select(ParticipantRegistration.id, ParticipantRegistration.event_id, ParticipantRegistration.registration_data, ParticipantRegistration.registration_status, ParticipantRegistration.submitted_at)
                .where(
                    ParticipantRegistration.event_id.in_(event_scope), ParticipantRegistration.deleted_at.is_(None),
                    or_(ParticipantRegistration.registration_data["name"].astext.ilike(pattern), ParticipantRegistration.registration_data["email"].astext.ilike(pattern)),
                    *_after_cursor(ParticipantRegistration.submitted_at, ParticipantRegistration.id, cursor_position),
                )
                .order_by(ParticipantRegistration.submitted_at.desc(), ParticipantRegistration.id.desc())
                .limit(fetch_limit)
            )).all()
            items.extend({"domain": "registrations", "resource_type": "registration", "id": r.id, "event_id": r.event_id, "title": str((r.registration_data or {}).get("name", "Registration")) if include_sensitive else f"{str((r.registration_data or {}).get('name', 'R'))[:1]}***", "subtitle": (r.registration_data or {}).get("email") if include_sensitive else _mask_email((r.registration_data or {}).get("email")), "status": r.registration_status, "occurred_at": r.submitted_at} for r in rows)

        if "files" in selected:
            rows = (await self.db.execute(
                select(PresentationFile.id, PresentationFile.event_id, PresentationFile.original_filename, PresentationFile.file_format, PresentationFile.upload_status, PresentationFile.updated_at)
                .where(
                    PresentationFile.event_id.in_(event_scope), PresentationFile.deleted_at.is_(None), PresentationFile.original_filename.ilike(pattern),
                    *_after_cursor(PresentationFile.updated_at, PresentationFile.id, cursor_position),
                )
                .order_by(PresentationFile.updated_at.desc(), PresentationFile.id.desc())
                .limit(fetch_limit)
            )).all()
            items.extend({"domain": "files", "resource_type": "presentation_file", "id": r.id, "event_id": r.event_id, "title": r.original_filename, "subtitle": r.file_format, "status": r.upload_status, "occurred_at": r.updated_at} for r in rows)

        if "campaigns" in selected:
            rows = (await self.db.execute(
                select(EmailCampaign.id, EmailCampaign.event_id, EmailCampaign.name, EmailCampaign.target_type, EmailCampaign.status, EmailCampaign.updated_at)
                .where(
                    EmailCampaign.event_id.in_(event_scope), EmailCampaign.deleted_at.is_(None), EmailCampaign.name.ilike(pattern),
                    *_after_cursor(EmailCampaign.updated_at, EmailCampaign.id, cursor_position),
                )
                .order_by(EmailCampaign.updated_at.desc(), EmailCampaign.id.desc())
                .limit(fetch_limit)
            )).all()
            items.extend({"domain": "campaigns", "resource_type": "email_campaign", "id": r.id, "event_id": r.event_id, "title": r.name, "subtitle": r.target_type, "status": r.status, "occurred_at": r.updated_at} for r in rows)

        if "users" in selected:
            rows = (await self.db.execute(
                select(UserEventAssignment.id, UserEventAssignment.event_id, UserEventAssignment.assigned_at, User.first_name, User.last_name, User.email)
                .join(User, User.id == UserEventAssignment.user_id)
                .where(
                    User.organization_id == organization_id, User.deleted_at.is_(None), UserEventAssignment.event_id.in_(event_scope),
                    or_(User.first_name.ilike(pattern), User.last_name.ilike(pattern), User.email.ilike(pattern)),
                    *_after_cursor(UserEventAssignment.assigned_at, UserEventAssignment.id, cursor_position),
                )
                .order_by(UserEventAssignment.assigned_at.desc(), UserEventAssignment.id.desc())
                .limit(fetch_limit)
            )).all()
            items.extend({"domain": "users", "resource_type": "user_event_assignment", "id": r.id, "event_id": r.event_id, "title": f"{r.first_name or ''} {r.last_name or ''}".strip() if include_sensitive else f"{(r.first_name or 'U')[:1]}***", "subtitle": r.email if include_sensitive else _mask_email(r.email), "status": "active", "occurred_at": r.assigned_at} for r in rows)

        items.sort(key=_sort_key, reverse=True)
        if cursor_position is not None:
            page = items[:limit]
            last = page[-1] if page else None
            next_cursor = (
                (last["occurred_at"], last["id"])
                if len(items) > limit and last and last.get("occurred_at")
                else None
            )
            return page, next_cursor

        page = items[offset:offset + limit]
        next_offset = offset + len(page)
        return page, next_offset if len(items) > next_offset else None


class OrganizationConsoleRegistrationQueryService:
    """Compatibility registration projection for the event workspace list."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_page(
        self,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
        limit: int,
        cursor_position: tuple[datetime, uuid.UUID] | None = None,
        registration_status: str | None = None,
    ) -> list:
        bounded_limit = min(max(limit, 1), 100)
        statement = (
            select(ParticipantRegistration)
            .options(
                load_only(
                    ParticipantRegistration.id,
                    ParticipantRegistration.event_id,
                    ParticipantRegistration.participant_id,
                    ParticipantRegistration.registration_status,
                    ParticipantRegistration.registration_data,
                    ParticipantRegistration.submitted_at,
                    ParticipantRegistration.reviewed_by,
                    ParticipantRegistration.reviewed_at,
                    ParticipantRegistration.review_notes,
                    ParticipantRegistration.waitlist_position,
                    ParticipantRegistration.rejection_reason,
                    ParticipantRegistration.approval_source,
                )
            )
            .join(Event, ParticipantRegistration.event_id == Event.id)
            .where(
                Event.organization_id == organization_id,
                ParticipantRegistration.event_id == event_id,
                ParticipantRegistration.deleted_at.is_(None),
            )
        )
        if registration_status:
            statement = statement.where(
                ParticipantRegistration.registration_status == registration_status.lower()
            )
        if cursor_position:
            submitted_at, cursor_id = cursor_position
            statement = statement.where(
                or_(
                    ParticipantRegistration.submitted_at < submitted_at,
                    and_(
                        ParticipantRegistration.submitted_at == submitted_at,
                        ParticipantRegistration.id < cursor_id,
                    ),
                )
            )
        rows = (
            await self.db.scalars(
                statement.order_by(
                    ParticipantRegistration.submitted_at.desc(),
                    ParticipantRegistration.id.desc(),
                ).limit(bounded_limit + 1)
            )
        ).all()
        return list(rows)


class OrganizationConsoleEventWorkspaceQueryService:
    """Bounded event-workspace projections used by the console read model."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_attendees(
        self,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
        include_archived: bool,
        include_sensitive: bool,
    ) -> tuple[list[dict], bool]:
        statement = (
            select(
                Participant.id,
                Participant.event_id,
                Participant.regno,
                Participant.first_name,
                Participant.last_name,
                Participant.email,
                Participant.phone,
                Participant.role_id,
                Participant.company,
                Participant.designation,
                Participant.country,
                Participant.approval_status,
                Participant.paid_status,
                Participant.source,
                Participant.custom_fields,
                Participant.registered_at,
                Participant.updated_at,
                Participant.deleted_at,
                RegistrationConfirmationQR.id.label("credential_id"),
                RegistrationConfirmationQR.credential_version,
                RegistrationConfirmationQR.status.label("qr_status"),
                ParticipantRole.name.label("role_name"),
            )
            .join(Event, Participant.event_id == Event.id)
            .outerjoin(
                RegistrationConfirmationQR,
                RegistrationConfirmationQR.participant_id == Participant.id,
            )
            .outerjoin(ParticipantRole, ParticipantRole.id == Participant.role_id)
            .where(Event.organization_id == organization_id, Participant.event_id == event_id)
        )
        if not include_archived:
            statement = statement.where(Participant.deleted_at.is_(None))
        rows = (
            await self.db.execute(
                statement.order_by(Participant.registered_at.desc(), Participant.id.desc()).limit(101)
            )
        ).mappings().all()
        items = []
        for row in rows[:100]:
            first_name = row["first_name"] or ""
            last_name = row["last_name"] or ""
            credential_id = row["credential_id"]
            credential_version = row["credential_version"] or 0
            items.append(
                {
                    "id": row["id"],
                    "registration_number": row["regno"],
                    "name": f"{first_name} {last_name}".strip() if include_sensitive else f"{first_name[:1]}*** {last_name[:1]}***",
                    "email": row["email"] if include_sensitive else _mask_email(row["email"]),
                    "phone": row["phone"] if include_sensitive else _mask_phone(row["phone"]),
                    "role": row["role_name"] or "Delegate",
                    "role_id": row["role_id"],
                    "company": row["company"] if include_sensitive else None,
                    "designation": row["designation"] if include_sensitive else None,
                    "country": row["country"],
                    "approval_status": row["approval_status"],
                    "paid_status": row["paid_status"],
                    "source": row["source"],
                    "custom_fields": row["custom_fields"] if include_sensitive else None,
                    "registered_at": row["registered_at"],
                    "updated_at": row["updated_at"],
                    "lifecycle_state": "archived" if row["deleted_at"] else "active",
                    "deleted_at": row["deleted_at"],
                    "qr_status": row["qr_status"] or "NOT_ISSUED",
                    "qr_version": credential_version,
                    "qr_image_url": (
                        build_confirmation_image_url(
                            build_confirmation_token(credential_id, credential_version)
                        )
                        if credential_id
                        else None
                    ),
                }
            )
        return items, len(rows) > 100

    async def list_speakers(
        self,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
        include_archived: bool,
        include_sensitive: bool,
    ) -> tuple[list[dict], bool]:
        statement = (
            select(
                Speaker.id,
                Speaker.event_id,
                Speaker.first_name,
                Speaker.last_name,
                Speaker.email,
                Speaker.phone,
                Speaker.designation,
                Speaker.affiliation,
                Speaker.country,
                Speaker.upload_status,
                Speaker.allow_override,
                Speaker.checked_in_at,
                Speaker.created_at,
                Speaker.updated_at,
                Speaker.deleted_at,
            )
            .join(Event, Speaker.event_id == Event.id)
            .where(Event.organization_id == organization_id, Speaker.event_id == event_id)
        )
        if not include_archived:
            statement = statement.where(Speaker.deleted_at.is_(None))
        rows = (
            await self.db.execute(
                statement.order_by(Speaker.created_at.desc(), Speaker.id.desc()).limit(101)
            )
        ).mappings().all()
        return [
            {
                "id": row["id"],
                "first_name": row["first_name"] if include_sensitive else f"{row['first_name'][:1]}***",
                "last_name": row["last_name"] if include_sensitive else f"{row['last_name'][:1]}***",
                "email": row["email"] if include_sensitive else _mask_email(row["email"]),
                "phone": row["phone"] if include_sensitive else None,
                "designation": row["designation"],
                "affiliation": row["affiliation"],
                "country": row["country"],
                "upload_status": row["upload_status"],
                "allow_override": row["allow_override"],
                "checked_in_at": row["checked_in_at"],
                "created_at": row["created_at"],
                "lifecycle_state": "archived" if row["deleted_at"] else "active",
                "deleted_at": row["deleted_at"],
            }
            for row in rows[:100]
        ], len(rows) > 100

    async def list_abstracts(
        self,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
        include_sensitive: bool,
    ) -> tuple[list[dict], bool]:
        """Return the bounded canonical abstract-submission directory."""
        rows = list(
            (
                await self.db.execute(
                    select(
                        AbstractSubmission.id,
                        AbstractSubmission.legacy_session_speaker_id,
                        AbstractSubmission.presenter_speaker_id,
                        AbstractSubmission.linked_session_id,
                        AbstractSubmission.title,
                        AbstractSubmission.body,
                        AbstractSubmission.keywords,
                        AbstractSubmission.status,
                        AbstractSubmission.version,
                        AbstractSubmission.submitted_at,
                        AbstractSubmission.decided_at,
                        Speaker.id.label("speaker_id"),
                        Speaker.first_name,
                        Speaker.last_name,
                        Speaker.email,
                        Session.id.label("session_id"),
                        Session.name.label("session_name"),
                    )
                    .select_from(AbstractSubmission)
                    .outerjoin(Speaker, Speaker.id == AbstractSubmission.presenter_speaker_id)
                    .outerjoin(Session, Session.id == AbstractSubmission.linked_session_id)
                    .where(
                        AbstractSubmission.organization_id == organization_id,
                        AbstractSubmission.event_id == event_id,
                    )
                    .order_by(
                        AbstractSubmission.submitted_at.desc().nullslast(),
                        AbstractSubmission.id,
                    )
                    .limit(101)
                )
            ).mappings()
        )
        items = []
        for row in rows[:100]:
            first_name = row["first_name"] or ""
            last_name = row["last_name"] or ""
            email = row["email"]
            items.append(
                {
                    "id": row["legacy_session_speaker_id"] or row["id"],
                    "submission_id": row["id"],
                    "speaker_id": row["speaker_id"],
                    "speaker_name": (
                        f"{first_name} {last_name}".strip()
                        if include_sensitive
                        else f"{first_name[:1]}*** {last_name[:1]}***"
                    ),
                    "speaker_email": email if include_sensitive else _mask_email(email),
                    "session_id": row["session_id"],
                    "session_name": row["session_name"],
                    "presentation_title": row["title"],
                    "abstract_text": row["body"],
                    "keywords": row["keywords"] or [],
                    "status": row["status"],
                    "version": row["version"],
                    "submitted_at": row["submitted_at"],
                    "reviewed_at": row["decided_at"],
                    "reviewed_by": None,
                    "review_notes": None,
                }
            )
        return items, len(rows) > 100

    async def list_sessions(
        self,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
        include_archived: bool,
    ) -> tuple[list[dict], bool]:
        statement = (
            select(
                Session.id,
                Session.event_id,
                Session.room_id,
                Session.session_code,
                Session.title,
                Session.session_type,
                Session.start_time,
                Session.end_time,
                Session.moderator_id,
                Session.description,
                Session.status,
                Session.deleted_at,
            )
            .join(Event, Session.event_id == Event.id)
            .where(Event.organization_id == organization_id, Session.event_id == event_id)
        )
        if not include_archived:
            statement = statement.where(Session.deleted_at.is_(None))
        rows = (
            await self.db.execute(
                statement.order_by(Session.start_time, Session.id).limit(101)
            )
        ).mappings().all()
        return [
            {
                "id": row["id"],
                "room_id": row["room_id"],
                "session_code": row["session_code"],
                "name": row["title"],
                "session_type": row["session_type"],
                "start_time": row["start_time"],
                "end_time": row["end_time"],
                "moderator_id": row["moderator_id"],
                "moderator_name": None,
                "description": row["description"],
                "status": row["status"],
                "lifecycle_state": "archived" if row["deleted_at"] else "active",
                "deleted_at": row["deleted_at"],
            }
            for row in rows[:100]
        ], len(rows) > 100

    async def list_files(
        self,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
    ) -> tuple[list[dict], bool]:
        rows = (
            await self.db.execute(
                select(
                    PresentationFile.id,
                    PresentationFile.event_id,
                    PresentationFile.speaker_id,
                    PresentationFile.session_speaker_id,
                    PresentationFile.original_filename,
                    PresentationFile.file_size_bytes,
                    PresentationFile.mime_type,
                    PresentationFile.file_format,
                    PresentationFile.version_number,
                    PresentationFile.is_current_version,
                    PresentationFile.upload_source,
                    PresentationFile.upload_status,
                    PresentationFile.approved_by,
                    PresentationFile.approved_at,
                    PresentationFile.rejection_reason,
                    PresentationFile.is_locked,
                    PresentationFile.local_sync_status,
                    PresentationFile.uploaded_at,
                )
                .join(Event, PresentationFile.event_id == Event.id)
                .where(
                    Event.organization_id == organization_id,
                    PresentationFile.event_id == event_id,
                    PresentationFile.deleted_at.is_(None),
                )
                .order_by(PresentationFile.uploaded_at.desc(), PresentationFile.id.desc())
                .limit(101)
            )
        ).mappings().all()
        return [dict(row) for row in rows[:100]], len(rows) > 100

    async def list_payments(
        self,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
        include_sensitive: bool,
    ) -> tuple[list[dict], bool]:
        rows = (
            await self.db.execute(
                select(
                    PaymentTransaction.id,
                    PaymentTransaction.event_id,
                    PaymentTransaction.registration_id,
                    PaymentTransaction.amount,
                    PaymentTransaction.currency,
                    PaymentTransaction.status,
                    PaymentTransaction.payment_method,
                    PaymentTransaction.gateway_order_id,
                    PaymentTransaction.gateway_payment_id,
                    PaymentTransaction.discount_applied,
                    PaymentTransaction.created_at,
                    PaymentTransaction.updated_at,
                )
                .join(Event, PaymentTransaction.event_id == Event.id)
                .where(Event.organization_id == organization_id, PaymentTransaction.event_id == event_id)
                .order_by(PaymentTransaction.created_at.desc(), PaymentTransaction.id.desc())
                .limit(101)
            )
        ).mappings().all()
        return [
            {
                "id": row["id"],
                "registration_id": row["registration_id"],
                "amount": row["amount"],
                "currency": row["currency"],
                "status": row["status"],
                "payment_method": row["payment_method"],
                "gateway_order_id": row["gateway_order_id"] if include_sensitive else (f"***{row['gateway_order_id'][-6:]}" if row["gateway_order_id"] else None),
                "gateway_payment_id": row["gateway_payment_id"] if include_sensitive else (f"***{row['gateway_payment_id'][-6:]}" if row["gateway_payment_id"] else None),
                "discount_applied": row["discount_applied"],
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
            }
            for row in rows[:100]
        ], len(rows) > 100

    async def list_checkins(
        self,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
    ) -> tuple[list[dict], bool]:
        rows = (
            await self.db.execute(
                select(
                    CheckIn.id,
                    CheckIn.event_id,
                    CheckIn.participant_id,
                    CheckIn.session_id,
                    CheckIn.check_in_time,
                    CheckIn.updated_at,
                )
                .join(Event, CheckIn.event_id == Event.id)
                .where(Event.organization_id == organization_id, CheckIn.event_id == event_id)
                .order_by(CheckIn.check_in_time.desc(), CheckIn.id.desc())
                .limit(101)
            )
        ).mappings().all()
        return [dict(row) for row in rows[:100]], len(rows) > 100

    async def list_rooms(
        self,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
    ) -> tuple[list[dict], bool]:
        rows = (
            await self.db.execute(
                select(
                    Room.id,
                    Room.event_id,
                    Room.name,
                    Room.code,
                    Room.room_type,
                    Room.room_coordinator,
                    Room.is_active,
                )
                .join(Event, Room.event_id == Event.id)
                .where(Event.organization_id == organization_id, Room.event_id == event_id)
                .order_by(Room.name, Room.id)
                .limit(101)
            )
        ).mappings().all()
        return [
            {
                "id": row["id"],
                "name": row["name"],
                "code": row["code"],
                "room_type": row["room_type"],
                "room_coordinator": row["room_coordinator"],
                "is_active": row["is_active"],
                "lifecycle_state": "active" if row["is_active"] else "archived",
            }
            for row in rows[:100]
        ], len(rows) > 100

    async def list_tickets(
        self,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
    ) -> tuple[list[dict], bool]:
        rows = (
            await self.db.execute(
                select(TicketType.id, TicketType.event_id, TicketType.role_name, TicketType.tier_name, TicketType.price)
                .join(Event, TicketType.event_id == Event.id)
                .where(Event.organization_id == organization_id, TicketType.event_id == event_id)
                .order_by(TicketType.role_name, TicketType.tier_name, TicketType.id)
                .limit(501)
            )
        ).mappings().all()
        return [dict(row) for row in rows[:500]], len(rows) > 500

    async def list_users(
        self,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
        include_sensitive: bool,
    ) -> tuple[list[dict], bool]:
        rows = (
            await self.db.execute(
                select(
                    UserEventAssignment.id,
                    UserEventAssignment.event_id,
                    User.id.label("user_id"),
                    User.first_name,
                    User.last_name,
                    User.email,
                    UserEventAssignment.permissions,
                    UserEventAssignment.assigned_at,
                )
                .join(Event, UserEventAssignment.event_id == Event.id)
                .join(User, User.id == UserEventAssignment.user_id)
                .where(
                    Event.organization_id == organization_id,
                    User.organization_id == organization_id,
                    UserEventAssignment.event_id == event_id,
                )
                .order_by(UserEventAssignment.assigned_at.desc(), UserEventAssignment.id.desc())
                .limit(101)
            )
        ).mappings().all()
        return [
            {
                "id": row["id"],
                "user_id": row["user_id"],
                "name": f"{row['first_name'] or ''} {row['last_name'] or ''}".strip(),
                "email": row["email"] if include_sensitive else _mask_email(row["email"]),
                "permissions": row["permissions"],
                "assigned_at": row["assigned_at"],
            }
            for row in rows[:100]
        ], len(rows) > 100

    async def list_communications(
        self,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
        include_archived: bool,
        include_sensitive: bool,
    ) -> tuple[dict, bool]:
        campaign_statement = (
            select(
                EmailCampaign.id,
                EmailCampaign.event_id,
                EmailCampaign.template_id,
                EmailCampaign.name,
                EmailCampaign.recipient_filter,
                EmailCampaign.target_type,
                EmailCampaign.scheduled_at,
                EmailCampaign.sent_at,
                EmailCampaign.status,
                EmailCampaign.total_recipients,
                EmailCampaign.sent_count,
                EmailCampaign.deleted_at,
            )
            .join(Event, EmailCampaign.event_id == Event.id)
            .where(Event.organization_id == organization_id, EmailCampaign.event_id == event_id)
        )
        if not include_archived:
            campaign_statement = campaign_statement.where(EmailCampaign.deleted_at.is_(None))
        campaigns = (
            await self.db.execute(
                campaign_statement.order_by(EmailCampaign.created_at.desc(), EmailCampaign.id.desc()).limit(101)
            )
        ).mappings().all()
        logs = (
            await self.db.execute(
                select(
                    EmailLog.id,
                    EmailLog.campaign_id,
                    EmailLog.event_id,
                    EmailLog.to_email,
                    EmailLog.subject,
                    EmailLog.status,
                    EmailLog.error_message,
                    EmailLog.opened_at,
                    EmailLog.sent_at,
                )
                .join(Event, EmailLog.event_id == Event.id)
                .where(Event.organization_id == organization_id, EmailLog.event_id == event_id)
                .order_by(EmailLog.sent_at.desc(), EmailLog.id.desc())
                .limit(101)
            )
        ).mappings().all()
        return {
            "campaigns": [
                {
                    "id": row["id"],
                    "template_id": row["template_id"],
                    "name": row["name"],
                    "recipient_filter": row["recipient_filter"],
                    "target_type": row["target_type"],
                    "scheduled_at": row["scheduled_at"],
                    "sent_at": row["sent_at"],
                    "status": row["status"],
                    "total_recipients": row["total_recipients"],
                    "sent_count": row["sent_count"],
                    "lifecycle_state": "archived" if row["deleted_at"] else "active",
                    "deleted_at": row["deleted_at"],
                }
                for row in campaigns[:100]
            ],
            "delivery_logs": [
                {
                    "id": row["id"],
                    "campaign_id": row["campaign_id"],
                    "to_email": row["to_email"] if include_sensitive else _mask_email(row["to_email"]),
                    "subject": row["subject"],
                    "status": row["status"],
                    "error_message": row["error_message"],
                    "opened_at": row["opened_at"],
                    "sent_at": row["sent_at"],
                }
                for row in logs[:100]
            ],
        }, len(campaigns) > 100 or len(logs) > 100

    async def list_templates(
        self,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
        include_archived: bool,
    ) -> tuple[dict, bool]:
        email_statement = (
            select(
                EmailTemplate.id,
                EmailTemplate.event_id,
                EmailTemplate.name,
                EmailTemplate.template_type,
                EmailTemplate.target_type,
                EmailTemplate.subject,
                EmailTemplate.body_html,
                EmailTemplate.body_text,
                EmailTemplate.is_default,
                EmailTemplate.created_at,
                EmailTemplate.deleted_at,
            )
            .join(Event, EmailTemplate.event_id == Event.id)
            .where(
                Event.organization_id == organization_id,
                EmailTemplate.event_id == event_id,
            )
        )
        print_statement = (
            select(
                PrintTemplate.id,
                PrintTemplate.event_id,
                PrintTemplate.template_name,
                PrintTemplate.template_type,
                PrintTemplate.template_data,
                PrintTemplate.updated_at,
                PrintTemplate.deleted_at,
            )
            .join(Event, PrintTemplate.event_id == Event.id)
            .where(
                Event.organization_id == organization_id,
                PrintTemplate.event_id == event_id,
            )
        )
        if not include_archived:
            email_statement = email_statement.where(EmailTemplate.deleted_at.is_(None))
            print_statement = print_statement.where(PrintTemplate.deleted_at.is_(None))
        email_rows = (
            await self.db.execute(
                email_statement.order_by(EmailTemplate.created_at.desc(), EmailTemplate.id.desc()).limit(101)
            )
        ).mappings().all()
        print_rows = (
            await self.db.execute(
                print_statement.order_by(PrintTemplate.updated_at.desc(), PrintTemplate.id.desc()).limit(101)
            )
        ).mappings().all()
        return {
            "email_templates": [
                {
                    "id": row["id"],
                    "kind": "email",
                    "name": row["name"],
                    "template_type": row["template_type"],
                    "target_type": row["target_type"],
                    "subject": row["subject"],
                    "body_html": row["body_html"],
                    "body_text": row["body_text"],
                    "is_default": row["is_default"],
                    "created_at": row["created_at"],
                    "lifecycle_state": "archived" if row["deleted_at"] else "active",
                    "deleted_at": row["deleted_at"],
                }
                for row in email_rows[:100]
            ],
            "print_templates": [
                {
                    "id": row["id"],
                    "kind": "print",
                    "template_name": row["template_name"],
                    "template_type": row["template_type"],
                    "template_data": row["template_data"],
                    "updated_at": row["updated_at"],
                    "lifecycle_state": "archived" if row["deleted_at"] else "active",
                    "deleted_at": row["deleted_at"],
                }
                for row in print_rows[:100]
            ],
        }, len(email_rows) > 100 or len(print_rows) > 100

    async def list_integrations(
        self,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
    ) -> tuple[list[dict], bool]:
        rows = (
            await self.db.execute(
                select(
                    Webhook.id,
                    Webhook.event_id,
                    Webhook.url,
                    Webhook.description,
                    Webhook.subscribed_events,
                    Webhook.status,
                    Webhook.version,
                    Webhook.created_at,
                    Webhook.updated_at,
                    Webhook.consecutive_failures,
                    Webhook.last_triggered_at,
                    Webhook.last_success_at,
                    Webhook.last_failure_reason,
                    Webhook.total_deliveries,
                    Webhook.total_failures,
                    Webhook.secret_hash,
                )
                .join(Event, Webhook.event_id == Event.id)
                .where(Event.organization_id == organization_id, Webhook.event_id == event_id)
                .order_by(Webhook.created_at.desc(), Webhook.id.desc())
                .limit(101)
            )
        ).mappings().all()
        return [
            {
                "id": row["id"],
                "url": row["url"],
                "description": row["description"],
                "subscribed_events": row["subscribed_events"],
                "status": row["status"],
                "version": row["version"],
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
                "lifecycle_state": "paused" if row["status"] == "paused" else "active",
                "consecutive_failures": row["consecutive_failures"],
                "last_triggered_at": row["last_triggered_at"],
                "last_success_at": row["last_success_at"],
                "last_failure_reason": row["last_failure_reason"],
                "total_deliveries": row["total_deliveries"],
                "total_failures": row["total_failures"],
                "secret_configured": bool(row["secret_hash"]),
            }
            for row in rows[:100]
        ], len(rows) > 100

    async def list_jobs(
        self,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
    ) -> dict:
        """Return the grouped event-jobs compatibility projection."""
        imports = (
            await self.db.execute(
                select(
                    ImportJob.id,
                    ImportJob.job_type,
                    ImportJob.filename,
                    ImportJob.status,
                    ImportJob.rows_total,
                    ImportJob.rows_imported,
                    ImportJob.rows_failed,
                    ImportJob.rows_updated,
                    ImportJob.sessions_created,
                    ImportJob.speakers_created,
                    ImportJob.rooms_created,
                    ImportJob.error_summary,
                    ImportJob.created_at,
                    ImportJob.completed_at,
                )
                .join(Event, ImportJob.event_id == Event.id)
                .where(Event.organization_id == organization_id, ImportJob.event_id == event_id)
                .order_by(ImportJob.created_at.desc(), ImportJob.id.desc())
                .limit(101)
            )
        ).mappings().all()
        sync_jobs = (
            await self.db.execute(
                select(
                    VenueSyncJob.id,
                    VenueSyncJob.file_id,
                    VenueSyncJob.sync_type,
                    VenueSyncJob.priority,
                    VenueSyncJob.status,
                    VenueSyncJob.retry_count,
                    VenueSyncJob.error_message,
                    VenueSyncJob.bytes_transferred,
                    VenueSyncJob.transfer_speed_mbps,
                    VenueSyncJob.checksum_verified,
                    VenueSyncJob.storage_provider,
                    VenueSyncJob.started_at,
                    VenueSyncJob.completed_at,
                    VenueSyncJob.created_at,
                )
                .join(Event, VenueSyncJob.event_id == Event.id)
                .where(Event.organization_id == organization_id, VenueSyncJob.event_id == event_id)
                .order_by(VenueSyncJob.created_at.desc(), VenueSyncJob.id.desc())
                .limit(101)
            )
        ).mappings().all()
        processing = (
            await self.db.execute(
                select(
                    PresentationProcessingJob.id,
                    PresentationProcessingJob.file_id,
                    PresentationProcessingJob.status,
                    PresentationProcessingJob.logs,
                    PresentationProcessingJob.created_at,
                    PresentationFile.original_filename,
                )
                .join(PresentationFile, PresentationFile.id == PresentationProcessingJob.file_id)
                .join(Event, PresentationFile.event_id == Event.id)
                .where(Event.organization_id == organization_id, PresentationFile.event_id == event_id)
                .order_by(PresentationProcessingJob.created_at.desc(), PresentationProcessingJob.id.desc())
                .limit(101)
            )
        ).mappings().all()
        import_items = [
            {
                "id": row["id"], "source": "IMPORT", "job_type": row["job_type"],
                "filename": row["filename"], "status": row["status"],
                "rows_total": row["rows_total"], "rows_imported": row["rows_imported"],
                "rows_failed": row["rows_failed"], "rows_updated": row["rows_updated"],
                "sessions_created": row["sessions_created"], "speakers_created": row["speakers_created"],
                "rooms_created": row["rooms_created"], "error_summary": row["error_summary"],
                "created_at": row["created_at"], "completed_at": row["completed_at"],
                "capabilities": {"retry": str(row["status"]).lower() in {"failed", "error"}, "cancel": False},
            }
            for row in imports[:100]
        ]
        sync_items = [
            {
                "id": row["id"], "source": "VENUE_SYNC", "file_id": row["file_id"],
                "sync_type": row["sync_type"], "priority": row["priority"], "status": row["status"],
                "retry_count": row["retry_count"], "error_message": row["error_message"],
                "bytes_transferred": row["bytes_transferred"], "transfer_speed_mbps": row["transfer_speed_mbps"],
                "checksum_verified": row["checksum_verified"], "storage_provider": row["storage_provider"],
                "started_at": row["started_at"], "completed_at": row["completed_at"], "created_at": row["created_at"],
                "capabilities": {"retry": str(row["status"]).lower() in {"failed", "error"}, "cancel": False},
            }
            for row in sync_jobs[:100]
        ]
        processing_items = [
            {
                "id": row["id"], "source": "PROCESSING", "file_id": row["file_id"],
                "filename": row["original_filename"], "status": row["status"], "logs": row["logs"],
                "created_at": row["created_at"],
                "capabilities": {"retry": False, "cancel": False, "retry_workspace": "files",
                                  "retry_resource_id": row["file_id"],
                                  "unavailable_reason": "Use RETRY_PROCESSING on the associated file."},
            }
            for row in processing[:100]
        ]
        return {
            "items": [*import_items, *sync_items, *processing_items],
            "import_jobs": import_items,
            "venue_sync_jobs": sync_items,
            "processing_jobs": processing_items,
            "has_more": any(len(rows) > 100 for rows in (imports, sync_jobs, processing)),
        }


class OrganizationConsoleAnalyticsQueryService:
    """Tenant boundary for the compatibility analytics snapshot read."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def snapshot(
        self,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
    ) -> dict:
        from app.modules.analytics.application.queries import AnalyticsDashboardQueryService
        from app.modules.analytics.services.analytics_service import build_analytics_snapshot

        event = await AnalyticsDashboardQueryService(self.db).get_event_for_scope(
            event_id=event_id,
            organization_id=organization_id,
        )
        if event is None:
            return {}
        return await build_analytics_snapshot(
            self.db,
            event.id,
            organization_id=organization_id,
        )
