"""Bounded read projections for organiser workspaces."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only
from app.schemas.cursor_pagination import CursorPage, decode_cursor, encode_cursor, bounded_page_size

from app.modules.agenda.models import Room, Session
from app.modules.events.models.event import Event
from app.modules.events.models.speaker import Speaker
from app.modules.presentations.models.presentation_file import PresentationFile
from app.modules.registration.models.participant import Participant
from app.modules.registration.models.payment_transaction import PaymentTransaction
from app.modules.venue.models.room_device import RoomDevice
from app.modules.integrations.models.integrations_domain_tables import (
    IntegrationConnection,
    IntegrationProvider,
    IntegrationWebhookDelivery,
)
from app.modules.integrations.models.webhook import Webhook
from app.modules.developer.models.developer_registry import ApiKey
from app.modules.platform.models.organization_console import (
    OrganizationLocation,
    OrganizationDocument,
    OrganizationApprovalRule,
    OrganizationAttentionState,
)
from app.modules.files.models.file import Asset
from app.modules.platform.models.organization_console import (
    CommercialAccessRequest,
    OrganizationBrandProfile,
    OrganizationNotificationChannelConfig,
    OrganizationNotificationRule,
    OrganizationSecurityPolicy,
    OrganizationTeam,
    OrganizationTeamEvent,
    OrganizationTeamMember,
)
from app.modules.platform.models.feature import FeatureCatalog
from app.modules.billing.services.entitlement_resolver import EntitlementResolver
from app.modules.billing.models.subscription import Addon, OrganizationAddon
from app.modules.billing.models.subscription import SubscriptionTransaction
from app.modules.billing.models.billing_domain_tables import Invoice, OrganizationBillingProfile, PaymentMethod
from app.modules.billing.models.org_credits import OrgCredit
from app.modules.rbac.models.organization_member import OrganizationMember
from app.modules.rbac.models.rbac import Permission, Role, RolePermission, UserRoleAssignment
from app.modules.identity.models.user import User
from app.modules.rbac.models.user_assignment import UserEventAssignment


@dataclass(frozen=True)
class OrganiserEventProjection:
    id: uuid.UUID
    name: str
    short_code: str | None
    start_date: date
    end_date: date
    venue_name: str | None
    location: str | None
    country: str | None
    timezone: str | None
    organizer_name: str | None
    status: str
    created_at: object
    updated_at: object
    registrations: int
    readiness_pct: int


class OrganiserEventQueryService:
    """Read-only, event-scoped projections for the organiser event workspace."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_events(
        self,
        *,
        organization_id: uuid.UUID,
        status_filter: str | None,
        search: str | None,
        year: int | None,
        page: int,
        page_size: int,
        today: date,
    ) -> tuple[list[OrganiserEventProjection], int, dict[str, int]]:
        conditions = [Event.organization_id == organization_id]
        if status_filter == "archived":
            conditions.append(or_(Event.status == "archived", Event.deleted_at.is_not(None)))
        else:
            conditions.append(Event.deleted_at.is_(None))
        if search:
            conditions.append(Event.name.ilike(f"%{search.strip()}%"))
        if year:
            conditions.append(func.extract("year", Event.start_date) == year)
        if status_filter == "live":
            conditions.extend([Event.status == "active", Event.start_date <= today, Event.end_date >= today])
        elif status_filter == "upcoming":
            conditions.extend([Event.start_date > today, Event.status != "archived"])
        elif status_filter == "completed":
            conditions.append((Event.status == "completed") | (Event.end_date < today))
        elif status_filter == "draft":
            conditions.append(Event.status == "draft")

        registration_count = (
            select(func.count(Participant.id))
            .where(Participant.event_id == Event.id, Participant.deleted_at.is_(None))
            .correlate(Event)
            .scalar_subquery()
        )
        sessions_total = (
            select(func.count(Session.id))
            .where(Session.event_id == Event.id)
            .correlate(Event)
            .scalar_subquery()
        )
        sessions_with_speaker = (
            select(func.count(Session.id))
            .where(Session.event_id == Event.id, Session.session_people.any())
            .correlate(Event)
            .scalar_subquery()
        )
        speakers_total = (
            select(func.count(Speaker.id))
            .where(Speaker.event_id == Event.id)
            .correlate(Event)
            .scalar_subquery()
        )
        confirmed_speakers = (
            select(func.count(Speaker.id))
            .where(Speaker.event_id == Event.id, Speaker.upload_status != "pending")
            .correlate(Event)
            .scalar_subquery()
        )
        rooms_total = (
            select(func.count(Room.id))
            .where(Room.event_id == Event.id, Room.is_active.is_(True))
            .correlate(Event)
            .scalar_subquery()
        )
        configured_rooms = (
            select(func.count(func.distinct(Room.id)))
            .join(RoomDevice, RoomDevice.room_id == Room.id)
            .where(Room.event_id == Event.id, Room.is_active.is_(True))
            .correlate(Event)
            .scalar_subquery()
        )
        current_files = (
            select(func.count(PresentationFile.id))
            .where(PresentationFile.event_id == Event.id, PresentationFile.is_current_version.is_(True))
            .correlate(Event)
            .scalar_subquery()
        )

        result = await self.db.execute(
            select(
                Event.id,
                Event.name,
                Event.short_code,
                Event.start_date,
                Event.end_date,
                Event.venue_name,
                Event.location,
                Event.country,
                Event.timezone,
                Event.organizer_name,
                Event.status,
                Event.created_at,
                Event.updated_at,
                registration_count.label("registrations"),
                sessions_total.label("sessions_total"),
                sessions_with_speaker.label("sessions_with_speaker"),
                speakers_total.label("speakers_total"),
                confirmed_speakers.label("confirmed_speakers"),
                rooms_total.label("rooms_total"),
                configured_rooms.label("configured_rooms"),
                current_files.label("current_files"),
            )
            .where(*conditions)
            .order_by(Event.start_date.desc(), Event.name, Event.id)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        rows = result.all()
        items = [
            OrganiserEventProjection(
                id=row.id,
                name=row.name,
                short_code=row.short_code,
                start_date=row.start_date,
                end_date=row.end_date,
                venue_name=row.venue_name,
                location=row.location,
                country=row.country,
                timezone=row.timezone,
                organizer_name=row.organizer_name,
                status=row.status,
                created_at=row.created_at,
                updated_at=row.updated_at,
                registrations=int(row.registrations or 0),
                readiness_pct=self._readiness_pct(row),
            )
            for row in rows
        ]

        total = int(await self.db.scalar(select(func.count(Event.id)).where(*conditions)) or 0)
        base = [Event.organization_id == organization_id, Event.deleted_at.is_(None)]
        summary_row = (
            await self.db.execute(
                select(
                    func.count(Event.id).label("total"),
                    func.sum(case((and_(Event.status == "active", Event.start_date <= today, Event.end_date >= today), 1), else_=0)).label("live"),
                    func.sum(case((and_(Event.start_date > today, Event.status != "archived"), 1), else_=0)).label("upcoming"),
                    func.sum(case((or_(Event.status == "completed", Event.end_date < today), 1), else_=0)).label("completed"),
                    func.sum(case((Event.status == "draft", 1), else_=0)).label("draft"),
                ).where(*base)
            )
        ).one()
        archived = int(await self.db.scalar(select(func.count(Event.id)).where(
            Event.organization_id == organization_id,
            or_(Event.status == "archived", Event.deleted_at.is_not(None)),
        )) or 0)
        summary = {
            "total": int(summary_row.total or 0),
            "live": int(summary_row.live or 0),
            "upcoming": int(summary_row.upcoming or 0),
            "completed": int(summary_row.completed or 0),
            "draft": int(summary_row.draft or 0),
            "archived": archived,
        }
        return items, total, summary

    @staticmethod
    def _readiness_pct(row) -> int:
        scored: list[float] = []
        if row.sessions_total:
            scored.append(int(row.sessions_with_speaker or 0) / row.sessions_total * 100)
        if row.speakers_total:
            scored.append(int(row.confirmed_speakers or 0) / row.speakers_total * 100)
        if row.rooms_total:
            scored.append(int(row.configured_rooms or 0) / row.rooms_total * 100)
        if row.current_files:
            scored.append(100)
        return round(sum(scored) / len(scored)) if scored else 0


class OrganiserIntegrationQueryService:
    """Bounded organisation-scoped integration connection projection."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_connections(
        self, *, organization_id: uuid.UUID, limit: int = 100
    ) -> list[tuple[uuid.UUID, str, bool, int]]:
        rows = (
            await self.db.execute(
                select(
                    IntegrationConnection.id,
                    IntegrationProvider.name,
                    IntegrationConnection.is_active,
                    IntegrationConnection.version,
                )
                .join(IntegrationProvider, IntegrationProvider.id == IntegrationConnection.provider_id)
                .where(IntegrationConnection.organization_id == organization_id)
                .order_by(IntegrationProvider.name, IntegrationConnection.id)
                .limit(limit)
            )
        ).all()
        return [(row.id, row.name, row.is_active, row.version) for row in rows]


class OrganiserLocationQueryService:
    """Bounded organization-scoped location projection for organiser reads."""

    MAX_PAGE_SIZE = 1000

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_locations(
        self, *, organization_id: uuid.UUID, limit: int = 100
    ) -> list[tuple[uuid.UUID, str, str, dict, str, dict, str, int]]:
        effective_limit = min(max(limit, 1), self.MAX_PAGE_SIZE)
        rows = (
            await self.db.execute(
                select(
                    OrganizationLocation.id,
                    OrganizationLocation.name,
                    OrganizationLocation.location_type,
                    OrganizationLocation.address,
                    OrganizationLocation.timezone,
                    OrganizationLocation.contact,
                    OrganizationLocation.status,
                    OrganizationLocation.version,
                )
                .where(OrganizationLocation.organization_id == organization_id)
                .order_by(OrganizationLocation.name, OrganizationLocation.id)
                .limit(effective_limit)
            )
        ).all()
        return [
            (
                row.id,
                row.name,
                row.location_type,
                row.address,
                row.timezone,
                row.contact,
                row.status,
                row.version,
            )
            for row in rows
        ]


@dataclass(frozen=True)
class OrganiserCustomFieldProjection:
    id: uuid.UUID
    field_key: str
    label: str
    field_type: str
    required: bool
    options: list[str]
    is_active: bool
    version: int
    updated_at: datetime


class OrganiserCustomFieldQueryService:
    """Bounded organization-scoped custom-field projection."""

    MAX_PAGE_SIZE = 1000

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_fields(
        self, *, organization_id: uuid.UUID, limit: int = 100
    ) -> list[OrganiserCustomFieldProjection]:
        from app.modules.platform.models.organization_console import OrganizationCustomField

        effective_limit = min(max(limit, 1), self.MAX_PAGE_SIZE)
        rows = (
            await self.db.execute(
                select(
                    OrganizationCustomField.id,
                    OrganizationCustomField.field_key,
                    OrganizationCustomField.label,
                    OrganizationCustomField.field_type,
                    OrganizationCustomField.required,
                    OrganizationCustomField.options,
                    OrganizationCustomField.is_active,
                    OrganizationCustomField.version,
                    OrganizationCustomField.updated_at,
                )
                .where(OrganizationCustomField.organization_id == organization_id)
                .order_by(OrganizationCustomField.label, OrganizationCustomField.id)
                .limit(effective_limit)
            )
        ).all()
        return [OrganiserCustomFieldProjection(*row) for row in rows]


class OrganiserDeveloperSettingsQueryService:
    """Bounded developer settings projection without per-webhook queries."""

    MAX_API_KEYS = 200
    MAX_WEBHOOKS = 200

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_settings(
        self, *, organization_id: uuid.UUID
    ) -> tuple[list[tuple], list[tuple]]:
        api_keys = (
            await self.db.execute(
                select(
                    ApiKey.id,
                    ApiKey.name,
                    ApiKey.prefix,
                    ApiKey.is_active,
                    ApiKey.expires_at,
                    ApiKey.last_used_at,
                    ApiKey.created_at,
                )
                .where(ApiKey.organization_id == organization_id)
                .order_by(ApiKey.created_at.desc(), ApiKey.id)
                .limit(self.MAX_API_KEYS)
            )
        ).all()
        latest_delivery_at = (
            select(IntegrationWebhookDelivery.delivered_at)
            .where(IntegrationWebhookDelivery.webhook_id == Webhook.id)
            .order_by(IntegrationWebhookDelivery.delivered_at.desc())
            .limit(1)
            .correlate(Webhook)
            .scalar_subquery()
        )
        latest_delivery_status = (
            select(IntegrationWebhookDelivery.response_status)
            .where(IntegrationWebhookDelivery.webhook_id == Webhook.id)
            .order_by(IntegrationWebhookDelivery.delivered_at.desc())
            .limit(1)
            .correlate(Webhook)
            .scalar_subquery()
        )
        webhooks = (
            await self.db.execute(
                select(
                    Webhook.id,
                    Webhook.event_id,
                    Event.name,
                    Webhook.url,
                    Webhook.description,
                    Webhook.subscribed_events,
                    Webhook.status,
                    Webhook.consecutive_failures,
                    Webhook.last_triggered_at,
                    Webhook.last_success_at,
                    Webhook.last_failure_reason,
                    Webhook.total_deliveries,
                    Webhook.total_failures,
                    latest_delivery_status.label("latest_delivery_status"),
                    latest_delivery_at.label("latest_delivery_at"),
                    Webhook.version,
                )
                .join(Event, Event.id == Webhook.event_id)
                .where(Event.organization_id == organization_id, Event.deleted_at.is_(None))
                .order_by(Webhook.updated_at.desc(), Webhook.id)
                .limit(self.MAX_WEBHOOKS)
            )
        ).all()
        return api_keys, webhooks


class OrganiserNotificationSettingsQueryService:
    """Bounded notification configuration projection for organiser settings."""

    MAX_ITEMS = 200

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_settings(
        self, *, organization_id: uuid.UUID
    ) -> tuple[list[tuple], list[tuple]]:
        rules = (
            await self.db.execute(
                select(
                    OrganizationNotificationRule.id,
                    OrganizationNotificationRule.name,
                    OrganizationNotificationRule.trigger_key,
                    OrganizationNotificationRule.channel,
                    OrganizationNotificationRule.is_enabled,
                    OrganizationNotificationRule.version,
                )
                .where(
                    OrganizationNotificationRule.organization_id == organization_id,
                    OrganizationNotificationRule.deleted_at.is_(None),
                )
                .order_by(OrganizationNotificationRule.name, OrganizationNotificationRule.id)
                .limit(self.MAX_ITEMS)
            )
        ).all()
        channels = (
            await self.db.execute(
                select(
                    OrganizationNotificationChannelConfig.id,
                    OrganizationNotificationChannelConfig.channel,
                    OrganizationNotificationChannelConfig.provider,
                    OrganizationNotificationChannelConfig.state,
                    OrganizationNotificationChannelConfig.last_verified_at,
                    OrganizationNotificationChannelConfig.version,
                )
                .where(
                    OrganizationNotificationChannelConfig.organization_id == organization_id,
                    OrganizationNotificationChannelConfig.deleted_at.is_(None),
                )
                .order_by(OrganizationNotificationChannelConfig.channel, OrganizationNotificationChannelConfig.id)
                .limit(self.MAX_ITEMS)
            )
        ).all()
        return rules, channels


class OrganiserSecurityBrandingQueryService:
    """Explicit organization settings projections for security and branding."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_security_policy(self, *, organization_id: uuid.UUID):
        return await self.db.execute(
            select(
                OrganizationSecurityPolicy.require_mfa,
                OrganizationSecurityPolicy.allowed_auth_methods,
                OrganizationSecurityPolicy.password_policy,
                OrganizationSecurityPolicy.session_policy,
                OrganizationSecurityPolicy.trusted_device_policy,
                OrganizationSecurityPolicy.sso_enforced,
                OrganizationSecurityPolicy.allowed_cidrs,
                OrganizationSecurityPolicy.version,
            ).where(OrganizationSecurityPolicy.organization_id == organization_id)
        )

    async def get_brand_profile(self, *, organization_id: uuid.UUID):
        return await self.db.execute(
            select(
                OrganizationBrandProfile.status,
                OrganizationBrandProfile.assets,
                OrganizationBrandProfile.tokens,
                OrganizationBrandProfile.templates,
                OrganizationBrandProfile.version,
                OrganizationBrandProfile.published_version,
            ).where(OrganizationBrandProfile.organization_id == organization_id)
        )


class OrganiserTeamQueryService:
    """Bounded team projection with batched member and event reads."""

    MAX_PAGE_SIZE = 100

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_teams(
        self,
        *,
        organization_id: uuid.UUID,
        page: int,
        page_size: int,
        search: str | None,
    ) -> tuple[list[dict], int]:
        filters = [
            OrganizationTeam.organization_id == organization_id,
            OrganizationTeam.deleted_at.is_(None),
        ]
        if search and search.strip():
            filters.append(OrganizationTeam.name.ilike(f"%{search.strip()}%"))
        total = int(await self.db.scalar(select(func.count(OrganizationTeam.id)).where(*filters)) or 0)
        team_rows = (
            await self.db.execute(
                select(
                    OrganizationTeam.id,
                    OrganizationTeam.name,
                    OrganizationTeam.description,
                    OrganizationTeam.owner_member_id,
                    OrganizationTeam.status,
                    OrganizationTeam.version,
                    OrganizationTeam.updated_at,
                )
                .where(*filters)
                .order_by(OrganizationTeam.name, OrganizationTeam.id)
                .offset((page - 1) * page_size)
                .limit(min(page_size, self.MAX_PAGE_SIZE))
            )
        ).all()
        team_ids = [row.id for row in team_rows]
        members_by_team: dict[uuid.UUID, list[dict]] = {team_id: [] for team_id in team_ids}
        events_by_team: dict[uuid.UUID, list[dict]] = {team_id: [] for team_id in team_ids}
        if team_ids:
            member_rows = (
                await self.db.execute(
                    select(
                        OrganizationTeamMember.team_id,
                        OrganizationMember.id,
                        User.first_name,
                        User.last_name,
                        User.email,
                    )
                    .join(OrganizationMember, OrganizationMember.id == OrganizationTeamMember.organization_member_id)
                    .join(User, User.id == OrganizationMember.user_id)
                    .where(
                        OrganizationTeamMember.organization_id == organization_id,
                        OrganizationTeamMember.team_id.in_(team_ids),
                    )
                    .order_by(User.last_name, User.first_name, User.email, OrganizationMember.id)
                )
            ).all()
            for row in member_rows:
                members_by_team[row.team_id].append({
                    "member_id": str(row.id),
                    "name": f"{row.first_name} {row.last_name}".strip(),
                    "email": row.email,
                })
            event_rows = (
                await self.db.execute(
                    select(
                        OrganizationTeamEvent.team_id,
                        OrganizationTeamEvent.event_id,
                        OrganizationTeamEvent.permissions,
                        Event.name,
                    )
                    .join(Event, Event.id == OrganizationTeamEvent.event_id)
                    .where(
                        OrganizationTeamEvent.organization_id == organization_id,
                        OrganizationTeamEvent.team_id.in_(team_ids),
                        Event.deleted_at.is_(None),
                    )
                    .order_by(Event.name, OrganizationTeamEvent.event_id)
                )
            ).all()
            for row in event_rows:
                events_by_team[row.team_id].append({
                    "event_id": str(row.event_id),
                    "event_name": row.name,
                    "permissions": row.permissions,
                })
        items = []
        for row in team_rows:
            members = members_by_team[row.id]
            items.append({
                "id": str(row.id),
                "name": row.name,
                "description": row.description,
                "owner_member_id": str(row.owner_member_id) if row.owner_member_id else None,
                "status": row.status,
                "version": row.version,
                "member_count": len(members),
                "members": members,
                "events": events_by_team[row.id],
                "updated_at": row.updated_at.isoformat() if row.updated_at else None,
            })
        return items, total

    async def preview_member_access_loss(
        self,
        *,
        organization_id: uuid.UUID,
        team_id: uuid.UUID,
        member_id: uuid.UUID,
    ) -> dict | None:
        """Batch the read-only impact calculation for removing a team member."""
        team = await self.db.execute(
            select(OrganizationTeam.id, OrganizationTeam.owner_member_id).where(
                OrganizationTeam.id == team_id,
                OrganizationTeam.organization_id == organization_id,
                OrganizationTeam.deleted_at.is_(None),
            )
        )
        team_row = team.one_or_none()
        member_exists = await self.db.scalar(
            select(OrganizationMember.id).where(
                OrganizationMember.id == member_id,
                OrganizationMember.organization_id == organization_id,
            )
        )
        membership_exists = await self.db.scalar(
            select(OrganizationTeamMember.id).where(
                OrganizationTeamMember.organization_id == organization_id,
                OrganizationTeamMember.team_id == team_id,
                OrganizationTeamMember.organization_member_id == member_id,
            )
        )
        if not team_row or not member_exists or not membership_exists:
            return None

        other_team_ids = list((await self.db.scalars(
            select(OrganizationTeamMember.team_id).where(
                OrganizationTeamMember.organization_id == organization_id,
                OrganizationTeamMember.organization_member_id == member_id,
                OrganizationTeamMember.team_id != team_id,
            )
        )).all())
        assignments = (await self.db.execute(
            select(OrganizationTeamEvent.event_id, OrganizationTeamEvent.permissions, Event.name)
            .join(Event, Event.id == OrganizationTeamEvent.event_id)
            .where(
                OrganizationTeamEvent.organization_id == organization_id,
                OrganizationTeamEvent.team_id == team_id,
                Event.organization_id == organization_id,
                Event.deleted_at.is_(None),
            )
        )).all()
        event_ids = [row.event_id for row in assignments]
        retained_by_event: dict[uuid.UUID, set[str]] = {event_id: set() for event_id in event_ids}
        if other_team_ids and event_ids:
            permissions = (await self.db.execute(
                select(OrganizationTeamEvent.event_id, OrganizationTeamEvent.permissions).where(
                    OrganizationTeamEvent.organization_id == organization_id,
                    OrganizationTeamEvent.event_id.in_(event_ids),
                    OrganizationTeamEvent.team_id.in_(other_team_ids),
                )
            )).all()
            for row in permissions:
                retained_by_event[row.event_id].update(
                    key for key, enabled in (row.permissions or {}).items() if enabled
                )
        impacts = []
        for assignment in assignments:
            granted = {key for key, enabled in (assignment.permissions or {}).items() if enabled}
            lost = sorted(granted - retained_by_event.get(assignment.event_id, set()))
            if lost:
                impacts.append({
                    "event_id": str(assignment.event_id),
                    "event_name": assignment.name,
                    "lost_capabilities": lost,
                })
        return {
            "team_id": str(team_row.id),
            "member_id": str(member_id),
            "requires_owner_reassignment": team_row.owner_member_id == member_id,
            "impacted_events": impacts,
        }

    async def preview_event_access_loss(
        self,
        *,
        organization_id: uuid.UUID,
        team_id: uuid.UUID,
        event_id: uuid.UUID,
    ) -> dict | None:
        """Batch the read-only impact calculation for removing a team event grant."""
        assignment = (await self.db.execute(
            select(OrganizationTeamEvent.permissions, Event.name)
            .join(Event, Event.id == OrganizationTeamEvent.event_id)
            .where(
                OrganizationTeamEvent.organization_id == organization_id,
                OrganizationTeamEvent.team_id == team_id,
                OrganizationTeamEvent.event_id == event_id,
                Event.organization_id == organization_id,
                Event.deleted_at.is_(None),
            )
        )).one_or_none()
        if assignment is None:
            return None

        member_ids = list((await self.db.scalars(
            select(OrganizationTeamMember.organization_member_id).where(
                OrganizationTeamMember.organization_id == organization_id,
                OrganizationTeamMember.team_id == team_id,
            )
        )).all())
        other_memberships = (await self.db.execute(
            select(
                OrganizationTeamMember.organization_member_id,
                OrganizationTeamMember.team_id,
            ).where(
                OrganizationTeamMember.organization_id == organization_id,
                OrganizationTeamMember.organization_member_id.in_(member_ids),
                OrganizationTeamMember.team_id != team_id,
            )
        )).all() if member_ids else []
        other_team_ids = {row.team_id for row in other_memberships}
        permissions_by_team: dict[uuid.UUID, set[str]] = {team_id: set() for team_id in other_team_ids}
        if other_team_ids:
            permission_rows = (await self.db.execute(
                select(OrganizationTeamEvent.team_id, OrganizationTeamEvent.permissions).where(
                    OrganizationTeamEvent.organization_id == organization_id,
                    OrganizationTeamEvent.event_id == event_id,
                    OrganizationTeamEvent.team_id.in_(other_team_ids),
                )
            )).all()
            for row in permission_rows:
                permissions_by_team[row.team_id].update(
                    key for key, enabled in (row.permissions or {}).items() if enabled
                )
        retained_by_member: dict[uuid.UUID, set[str]] = {member_id: set() for member_id in member_ids}
        for row in other_memberships:
            retained_by_member[row.organization_member_id].update(permissions_by_team.get(row.team_id, set()))
        granted = {key for key, enabled in (assignment.permissions or {}).items() if enabled}
        impacts = []
        for member_id in member_ids:
            lost = sorted(granted - retained_by_member.get(member_id, set()))
            if lost:
                impacts.append({"member_id": str(member_id), "lost_capabilities": lost})
        return {
            "team_id": str(team_id),
            "event_id": str(event_id),
            "event_name": assignment.name,
            "impacted_members": impacts,
        }


class OrganiserMemberQueryService:
    """Bounded organization member projection with batched event assignments."""

    MAX_PAGE_SIZE = 100

    def __init__(self, db: AsyncSession):
        self.db = db

    @staticmethod
    def _member_filters(
        *,
        organization_id: uuid.UUID,
        search: str | None,
        member_status: str | None,
    ) -> list:
        filters = [OrganizationMember.organization_id == organization_id]
        if search and search.strip():
            term = f"%{search.strip()}%"
            filters.append(
                or_(
                    User.first_name.ilike(term),
                    User.last_name.ilike(term),
                    User.email.ilike(term),
                    OrganizationMember.invite_email.ilike(term),
                )
            )
        if member_status == "active":
            filters.extend([OrganizationMember.accepted_at.is_not(None), OrganizationMember.is_active.is_(True)])
        elif member_status == "inactive":
            filters.append(OrganizationMember.is_active.is_(False))
        elif member_status == "pending":
            filters.extend([OrganizationMember.accepted_at.is_(None), OrganizationMember.is_active.is_(True)])
        elif member_status == "accepted":
            filters.append(OrganizationMember.accepted_at.is_not(None))
        return filters

    async def _serialize_rows(self, rows, *, organization_id: uuid.UUID) -> list[dict]:
        user_ids = [row.user_id for row in rows if row.user_id]
        event_ids_by_user: dict[uuid.UUID, list[str]] = {}
        if user_ids:
            assignments = (
                await self.db.execute(
                    select(UserEventAssignment.user_id, UserEventAssignment.event_id)
                    .join(Event, Event.id == UserEventAssignment.event_id)
                    .where(
                        UserEventAssignment.user_id.in_(user_ids),
                        Event.organization_id == organization_id,
                        Event.deleted_at.is_(None),
                    )
                    .order_by(UserEventAssignment.user_id, UserEventAssignment.event_id)
                )
            ).all()
            for user_id, event_id in assignments:
                event_ids_by_user.setdefault(user_id, []).append(str(event_id))
        items = []
        for row in rows:
            has_user = row.user_id is not None
            items.append({
                "id": str(row.id),
                "user_id": str(row.user_id) if has_user else None,
                "name": f"{row.first_name} {row.last_name}" if has_user else (row.invite_email or "Pending invite"),
                "email": row.email if has_user else row.invite_email,
                "org_role": row.org_role,
                "accepted_at": row.accepted_at.isoformat() if row.accepted_at else None,
                "invited_at": row.invited_at.isoformat() if row.invited_at else None,
                "is_active": row.is_active,
                "is_2fa_enabled": row.is_2fa_enabled if has_user else False,
                "last_login_at": row.last_login_at.isoformat() if has_user and row.last_login_at else None,
                "event_ids": event_ids_by_user.get(row.user_id, []) if has_user else [],
                "suspension_reason": row.suspension_reason,
                "version": row.version,
            })
        return items

    async def list_members(
        self,
        *,
        organization_id: uuid.UUID,
        page: int,
        page_size: int,
        search: str | None,
        member_status: str | None,
    ) -> tuple[list[dict], int]:
        filters = self._member_filters(
            organization_id=organization_id,
            search=search,
            member_status=member_status,
        )
        total = int(
            await self.db.scalar(
                select(func.count(OrganizationMember.id))
                .outerjoin(User, OrganizationMember.user_id == User.id)
                .where(*filters)
            )
            or 0
        )
        rows = (
            await self.db.execute(
                select(
                    OrganizationMember.id,
                    OrganizationMember.user_id,
                    OrganizationMember.org_role,
                    OrganizationMember.invite_email,
                    OrganizationMember.accepted_at,
                    OrganizationMember.invited_at,
                    OrganizationMember.is_active,
                    OrganizationMember.suspension_reason,
                    OrganizationMember.version,
                    User.first_name,
                    User.last_name,
                    User.email,
                    User.is_2fa_enabled,
                    User.last_login_at,
                )
                .outerjoin(User, OrganizationMember.user_id == User.id)
                .where(*filters)
                .order_by(OrganizationMember.invited_at.desc(), OrganizationMember.id)
                .offset((page - 1) * page_size)
                .limit(min(page_size, self.MAX_PAGE_SIZE))
            )
        ).all()
        return await self._serialize_rows(rows, organization_id=organization_id), total

    async def list_members_cursor(
        self,
        *,
        organization_id: uuid.UUID,
        cursor: str | None,
        limit: int,
        search: str | None,
        member_status: str | None,
    ) -> CursorPage[dict]:
        """Cursor page for members using the stable invited-at/id key."""
        bounded_limit = bounded_page_size(limit, default=50, maximum=self.MAX_PAGE_SIZE)
        filters = self._member_filters(
            organization_id=organization_id,
            search=search,
            member_status=member_status,
        )
        if cursor:
            position = decode_cursor(cursor)
            filters.append(
                or_(
                    OrganizationMember.invited_at < position.occurred_at,
                    and_(
                        OrganizationMember.invited_at == position.occurred_at,
                        OrganizationMember.id < position.record_id,
                    ),
                )
            )
        statement = select(
            OrganizationMember.id,
            OrganizationMember.user_id,
            OrganizationMember.org_role,
            OrganizationMember.invite_email,
            OrganizationMember.accepted_at,
            OrganizationMember.invited_at,
            OrganizationMember.is_active,
            OrganizationMember.suspension_reason,
            OrganizationMember.version,
            User.first_name,
            User.last_name,
            User.email,
            User.is_2fa_enabled,
            User.last_login_at,
        ).outerjoin(User, OrganizationMember.user_id == User.id).where(*filters)
        rows = (await self.db.execute(
            statement.order_by(
                OrganizationMember.invited_at.desc(), OrganizationMember.id.desc()
            ).limit(bounded_limit + 1)
        )).all()
        page_rows = rows[:bounded_limit]
        has_next = len(rows) > bounded_limit
        next_cursor = (
            encode_cursor(page_rows[-1].invited_at, page_rows[-1].id)
            if has_next and page_rows else None
        )
        return CursorPage(
            items=await self._serialize_rows(page_rows, organization_id=organization_id),
            next_cursor=next_cursor,
            has_next=has_next,
        )


class OrganiserEntitlementQueryService:
    """Read-only effective feature projection for the organiser console."""

    MAX_FEATURES = 1000

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_effective_features(self, *, organization_id: uuid.UUID, unrestricted: bool) -> list[dict]:
        rows = (
            await self.db.execute(
                select(
                    FeatureCatalog.id,
                    FeatureCatalog.key,
                    FeatureCatalog.name,
                    FeatureCatalog.description,
                    FeatureCatalog.category,
                    FeatureCatalog.scope_type,
                )
                .where(FeatureCatalog.is_active.is_(True))
                .order_by(
                    FeatureCatalog.category_order,
                    FeatureCatalog.feature_order,
                    FeatureCatalog.name,
                    FeatureCatalog.id,
                )
                .limit(self.MAX_FEATURES)
            )
        ).all()
        resolved = {} if unrestricted else await EntitlementResolver.resolve_org_entitlements(
            self.db, organization_id, explain=True
        )
        resolved_features = resolved.get("features", resolved) if isinstance(resolved, dict) else {}
        items = []
        for row in rows:
            effective = resolved_features.get(row.key, {}) if isinstance(resolved_features, dict) else {}
            enabled = True if unrestricted else bool(effective.get("enabled", False))
            items.append({
                "id": str(row.id),
                "key": row.key,
                "name": row.name,
                "description": row.description,
                "category": row.category or "General",
                "scope_type": row.scope_type,
                "enabled": enabled,
                "value": True if unrestricted else effective.get("value", enabled),
                "value_type": effective.get("value_type", "BOOLEAN"),
                "source_type": "INTERNAL_UNRESTRICTED" if unrestricted else effective.get("source_type", "CONTRACT_REQUIRED"),
                "source_ref": str(organization_id) if unrestricted else effective.get("source_ref"),
                "denial_reason": None if enabled else effective.get("denial_reason") or "Not included in the active entitlement contract",
                "resolution_path": None if enabled or unrestricted else "/plans-entitlements/addons",
            })
        return items


class OrganiserReportQueryService:
    """Event report projection with all per-event aggregates batched in SQL."""

    MAX_PAGE_SIZE = 100

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_dashboard_event_refs(self, *, organization_id: uuid.UUID) -> list[tuple]:
        """Load only fields needed for dashboard-wide aggregates."""
        return (
            await self.db.execute(
                select(Event.id, Event.status)
                .where(Event.organization_id == organization_id, Event.deleted_at.is_(None))
                .order_by(Event.start_date.desc(), Event.id)
            )
        ).all()

    async def list_event_reports(
        self,
        *,
        organization_id: uuid.UUID,
        page: int,
        page_size: int,
        search: str | None,
    ) -> tuple[list[dict], int]:
        conditions = [Event.organization_id == organization_id, Event.deleted_at.is_(None)]
        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(or_(Event.name.ilike(term), Event.short_code.ilike(term), Event.venue_name.ilike(term)))
        total = int(await self.db.scalar(select(func.count(Event.id)).where(*conditions)) or 0)

        registrations = select(func.count(Participant.id)).where(
            Participant.event_id == Event.id, Participant.deleted_at.is_(None)
        ).correlate(Event).scalar_subquery()
        revenue = select(func.coalesce(func.sum(PaymentTransaction.amount), 0.0)).where(
            PaymentTransaction.event_id == Event.id,
            PaymentTransaction.status.in_(["completed", "captured", "success", "paid"]),
        ).correlate(Event).scalar_subquery()
        sessions_total = select(func.count(Session.id)).where(Session.event_id == Event.id).correlate(Event).scalar_subquery()
        sessions_with_speaker = select(func.count(Session.id)).where(
            Session.event_id == Event.id, Session.session_people.any()
        ).correlate(Event).scalar_subquery()
        speakers_total = select(func.count(Speaker.id)).where(Speaker.event_id == Event.id).correlate(Event).scalar_subquery()
        confirmed_speakers = select(func.count(Speaker.id)).where(
            Speaker.event_id == Event.id, Speaker.upload_status != "pending"
        ).correlate(Event).scalar_subquery()
        rooms_total = select(func.count(Room.id)).where(
            Room.event_id == Event.id, Room.is_active.is_(True)
        ).correlate(Event).scalar_subquery()
        configured_rooms = select(func.count(func.distinct(Room.id))).join(
            RoomDevice, RoomDevice.room_id == Room.id
        ).where(Room.event_id == Event.id, Room.is_active.is_(True)).correlate(Event).scalar_subquery()
        files_total = select(func.count(PresentationFile.id)).where(
            PresentationFile.event_id == Event.id, PresentationFile.is_current_version.is_(True)
        ).correlate(Event).scalar_subquery()
        rows = (
            await self.db.execute(
                select(
                    Event.id, Event.name, Event.short_code, Event.start_date, Event.end_date,
                    Event.venue_name, Event.location, registrations.label("registrations"),
                    revenue.label("revenue"), sessions_total.label("sessions_total"),
                    sessions_with_speaker.label("sessions_with_speaker"), speakers_total.label("speakers_total"),
                    confirmed_speakers.label("confirmed_speakers"), rooms_total.label("rooms_total"),
                    configured_rooms.label("configured_rooms"), files_total.label("files_total"), Event.status,
                )
                .where(*conditions)
                .order_by(Event.start_date.desc(), Event.id)
                .offset((page - 1) * page_size)
                .limit(min(page_size, self.MAX_PAGE_SIZE))
            )
        ).all()

        def readiness(row) -> int:
            scored: list[float] = []
            if row.sessions_total:
                scored.append(int(row.sessions_with_speaker or 0) / row.sessions_total * 100)
            if row.speakers_total:
                scored.append(int(row.confirmed_speakers or 0) / row.speakers_total * 100)
            if row.rooms_total:
                scored.append(int(row.configured_rooms or 0) / row.rooms_total * 100)
            if row.files_total:
                scored.append(100)
            return round(sum(scored) / len(scored)) if scored else 0

        return [
            {
                "id": str(row.id), "name": row.name, "short_code": row.short_code,
                "dates": row.start_date.strftime("%d %b, %Y") if row.start_date == row.end_date else f"{row.start_date.strftime('%d %b, %Y')} - {row.end_date.strftime('%d %b, %Y')}",
                "venue": row.venue_name or row.location or "Venue not set",
                "registrations": int(row.registrations or 0), "revenue": float(row.revenue or 0),
                "readiness_pct": readiness(row), "status": row.status,
            }
            for row in rows
        ], total

    async def registration_revenue_trend(
        self, *, event_ids: list[uuid.UUID], today: date
    ) -> list[dict]:
        days = [today - timedelta(days=6 - index) for index in range(7)]
        start = datetime.combine(days[0], datetime.min.time(), timezone.utc)
        end = datetime.combine(today + timedelta(days=1), datetime.min.time(), timezone.utc)
        registration_rows = []
        revenue_rows = []
        if event_ids:
            registration_rows = (
                await self.db.execute(
                    select(
                        func.date(Participant.registered_at).label("day"),
                        func.count(Participant.id).label("count"),
                    )
                    .where(
                        Participant.event_id.in_(event_ids),
                        Participant.registered_at >= start,
                        Participant.registered_at < end,
                    )
                    .group_by(func.date(Participant.registered_at))
                )
            ).all()
            revenue_rows = (
                await self.db.execute(
                    select(
                        func.date(PaymentTransaction.created_at).label("day"),
                        func.coalesce(func.sum(PaymentTransaction.amount), 0.0).label("total"),
                    )
                    .where(
                        PaymentTransaction.event_id.in_(event_ids),
                        PaymentTransaction.created_at >= start,
                        PaymentTransaction.created_at < end,
                        PaymentTransaction.status.in_(["completed", "captured", "success", "paid"]),
                    )
                    .group_by(func.date(PaymentTransaction.created_at))
                )
            ).all()
        registration_by_day = {str(row.day): int(row.count or 0) for row in registration_rows}
        revenue_by_day = {str(row.day): float(row.total or 0) for row in revenue_rows}
        return [
            {
                "label": day.strftime("%a"),
                "registrations": registration_by_day.get(day.isoformat(), 0),
                "revenue": revenue_by_day.get(day.isoformat(), 0.0),
            }
            for day in days
        ]


class OrganiserDashboardQueryService:
    """Single-query organization dashboard KPI projection."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def metrics(self, *, organization_id: uuid.UUID) -> dict[str, int | float]:
        event_scope = select(Event.id).where(
            Event.organization_id == organization_id,
            Event.deleted_at.is_(None),
        )
        team_members = select(func.count(OrganizationMember.id)).where(
            OrganizationMember.organization_id == organization_id,
            OrganizationMember.user_id.is_not(None),
            OrganizationMember.is_active.is_(True),
        ).scalar_subquery()
        registrations = select(func.count(Participant.id)).where(
            Participant.event_id.in_(event_scope)
        ).scalar_subquery()
        revenue = select(func.coalesce(func.sum(PaymentTransaction.amount), 0.0)).where(
            PaymentTransaction.event_id.in_(event_scope),
            PaymentTransaction.status.in_(["completed", "captured", "success", "paid"]),
        ).scalar_subquery()
        storage = select(func.coalesce(func.sum(PresentationFile.file_size_bytes), 0)).where(
            PresentationFile.event_id.in_(event_scope),
            PresentationFile.deleted_at.is_(None),
        ).scalar_subquery()
        row = (await self.db.execute(select(
            team_members.label("team_members"),
            registrations.label("total_registrations"),
            revenue.label("total_revenue"),
            storage.label("storage_used_bytes"),
        ))).one()
        return {
            "team_members": int(row.team_members or 0),
            "total_registrations": int(row.total_registrations or 0),
            "total_revenue": float(row.total_revenue or 0.0),
            "storage_used_bytes": int(row.storage_used_bytes or 0),
        }


class OrganiserBillingQueryService:
    """Bounded, explicit billing list projections for the organiser console."""

    MAX_PAGE_SIZE = 100

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_invoice_for_download(
        self, *, organization_id: uuid.UUID, invoice_id: uuid.UUID
    ) -> Invoice | None:
        return await self.db.scalar(
            select(Invoice).options(load_only(
                Invoice.id, Invoice.invoice_number, Invoice.stripe_invoice_id,
                Invoice.issued_at, Invoice.due_date, Invoice.status,
                Invoice.amount, Invoice.gst_amount, Invoice.total_amount_inr,
                Invoice.currency,
            )).where(
                Invoice.id == invoice_id,
                Invoice.organization_id == organization_id,
            )
        )

    async def get_tax_profile(
        self, *, organization_id: uuid.UUID
    ) -> tuple[OrganizationBillingProfile | None, SubscriptionTransaction | None]:
        """Load the authoritative billing profile and a bounded legacy fallback."""
        profile = await self.db.scalar(
            select(OrganizationBillingProfile).options(load_only(
                OrganizationBillingProfile.billing_name,
                OrganizationBillingProfile.billing_email,
                OrganizationBillingProfile.billing_phone,
                OrganizationBillingProfile.gst_number,
                OrganizationBillingProfile.country,
                OrganizationBillingProfile.currency,
                OrganizationBillingProfile.version,
                OrganizationBillingProfile.updated_at,
            )).where(OrganizationBillingProfile.organization_id == organization_id)
        )
        if profile is not None:
            return profile, None

        latest = await self.db.scalar(
            select(SubscriptionTransaction).options(load_only(
                SubscriptionTransaction.billing_name,
                SubscriptionTransaction.billing_email,
                SubscriptionTransaction.billing_phone,
                SubscriptionTransaction.gst_number,
                SubscriptionTransaction.currency,
                SubscriptionTransaction.updated_at,
                SubscriptionTransaction.created_at,
            )).where(
                SubscriptionTransaction.organization_id == organization_id
            ).order_by(
                SubscriptionTransaction.created_at.desc(),
                SubscriptionTransaction.id.desc(),
            ).limit(1)
        )
        return None, latest

    @staticmethod
    def _page(page: int, page_size: int) -> tuple[int, int]:
        bounded = min(max(page_size, 1), OrganiserBillingQueryService.MAX_PAGE_SIZE)
        return max(page, 1), bounded

    async def list_invoices(
        self, *, organization_id: uuid.UUID, page: int, page_size: int, receipts_only: bool = False
    ) -> tuple[list[Invoice], int]:
        page, page_size = self._page(page, page_size)
        filters = [Invoice.organization_id == organization_id]
        if receipts_only:
            filters.append(Invoice.paid_at.is_not(None))
        total = int(await self.db.scalar(select(func.count(Invoice.id)).where(*filters)) or 0)
        rows = list((await self.db.scalars(
            select(Invoice).options(load_only(
                Invoice.id, Invoice.invoice_number, Invoice.stripe_invoice_id,
                Invoice.issued_at, Invoice.due_date, Invoice.paid_at,
                Invoice.status, Invoice.total_amount_inr, Invoice.amount,
                Invoice.gst_amount, Invoice.currency, Invoice.version,
            )).where(*filters)
            .order_by(Invoice.issued_at.desc(), Invoice.id.desc())
            .offset((page - 1) * page_size).limit(page_size)
        )).all())
        return rows, total


    async def list_transactions(
        self, *, organization_id: uuid.UUID, page: int, page_size: int
    ) -> tuple[list[SubscriptionTransaction], int]:
        page, page_size = self._page(page, page_size)
        filters = [SubscriptionTransaction.organization_id == organization_id]
        total = int(await self.db.scalar(select(func.count(SubscriptionTransaction.id)).where(*filters)) or 0)
        rows = list((await self.db.scalars(
            select(SubscriptionTransaction).options(load_only(
                SubscriptionTransaction.id, SubscriptionTransaction.provider_transaction_id,
                SubscriptionTransaction.created_at, SubscriptionTransaction.provider,
                SubscriptionTransaction.status, SubscriptionTransaction.amount,
                SubscriptionTransaction.refunded_amount, SubscriptionTransaction.currency,
                SubscriptionTransaction.reconciliation_status,
            )).where(*filters)
            .order_by(SubscriptionTransaction.created_at.desc(), SubscriptionTransaction.id.desc())
            .offset((page - 1) * page_size).limit(page_size)
        )).all())
        return rows, total

    async def list_payment_methods(
        self, *, organization_id: uuid.UUID, page: int, page_size: int
    ) -> tuple[list[PaymentMethod], int]:
        page, page_size = self._page(page, page_size)
        filters = [PaymentMethod.organization_id == organization_id]
        total = int(await self.db.scalar(select(func.count(PaymentMethod.id)).where(*filters)) or 0)
        rows = list((await self.db.scalars(
            select(PaymentMethod).options(load_only(
                PaymentMethod.id, PaymentMethod.provider, PaymentMethod.card_brand,
                PaymentMethod.card_last4, PaymentMethod.is_default,
                PaymentMethod.created_at,
            )).where(*filters)
            .order_by(PaymentMethod.is_default.desc(), PaymentMethod.created_at.desc(), PaymentMethod.id.desc())
            .offset((page - 1) * page_size).limit(page_size)
        )).all())
        return rows, total

    async def list_credits(
        self, *, organization_id: uuid.UUID, page: int, page_size: int
    ) -> tuple[list[OrgCredit], int]:
        page, page_size = self._page(page, page_size)
        filters = [OrgCredit.organization_id == organization_id]
        total = int(await self.db.scalar(select(func.count(OrgCredit.id)).where(*filters)) or 0)
        rows = list((await self.db.scalars(
            select(OrgCredit).options(load_only(
                OrgCredit.id, OrgCredit.amount_inr, OrgCredit.credit_type,
                OrgCredit.reason, OrgCredit.is_used, OrgCredit.applied_at,
                OrgCredit.expires_at,
            )).where(*filters)
            .order_by(OrgCredit.applied_at.desc(), OrgCredit.id.desc())
            .offset((page - 1) * page_size).limit(page_size)
        )).all())
        return rows, total


class OrganiserDocumentQueryService:
    """Bounded current-document projection for the organiser console."""

    MAX_PAGE_SIZE = 100

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_history(
        self, *, organization_id: uuid.UUID, document_id: uuid.UUID
    ) -> list[tuple] | None:
        """Return one document group's bounded history as an explicit projection."""
        group_id = await self.db.scalar(
            select(OrganizationDocument.document_group_id).where(
                OrganizationDocument.id == document_id,
                OrganizationDocument.organization_id == organization_id,
            )
        )
        if group_id is None:
            return None
        return (await self.db.execute(
            select(
                OrganizationDocument.id,
                OrganizationDocument.revision,
                OrganizationDocument.name,
                OrganizationDocument.verification_status,
                OrganizationDocument.is_current,
                OrganizationDocument.created_at,
                Asset.id.label("asset_id"),
                Asset.processing_status.label("asset_processing_status"),
                User.first_name,
                User.last_name,
                User.email,
            )
            .join(Asset, Asset.id == OrganizationDocument.asset_id)
            .join(User, User.id == OrganizationDocument.created_by)
            .where(
                OrganizationDocument.organization_id == organization_id,
                OrganizationDocument.document_group_id == group_id,
            )
            .order_by(OrganizationDocument.revision.desc(), OrganizationDocument.id.desc())
            .limit(self.MAX_PAGE_SIZE)
        )).all()

    async def list_current(
        self, *, organization_id: uuid.UUID, page: int, page_size: int
    ) -> tuple[list[tuple], int]:
        bounded = min(max(page_size, 1), self.MAX_PAGE_SIZE)
        page = max(page, 1)
        filters = [
            OrganizationDocument.organization_id == organization_id,
            OrganizationDocument.archived_at.is_(None),
            OrganizationDocument.is_current.is_(True),
        ]
        total = int(await self.db.scalar(
            select(func.count(OrganizationDocument.id)).where(*filters)
        ) or 0)
        rows = (await self.db.execute(
            select(
                OrganizationDocument.id,
                OrganizationDocument.document_group_id,
                OrganizationDocument.revision,
                OrganizationDocument.name,
                OrganizationDocument.document_type,
                OrganizationDocument.expires_at,
                OrganizationDocument.verification_status,
                OrganizationDocument.version,
                OrganizationDocument.updated_at,
                Asset.id.label("asset_id"),
                Asset.processing_status,
                User.first_name,
                User.last_name,
                User.email,
            )
            .join(Asset, Asset.id == OrganizationDocument.asset_id)
            .join(User, User.id == OrganizationDocument.created_by)
            .where(*filters)
            .order_by(OrganizationDocument.updated_at.desc(), OrganizationDocument.id.desc())
            .offset((page - 1) * bounded)
            .limit(bounded)
        )).all()
        return rows, total


class OrganiserApprovalRuleQueryService:
    """Bounded tenant-scoped approval-rule projection."""

    MAX_PAGE_SIZE = 100

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_rules(
        self, *, organization_id: uuid.UUID, page: int, page_size: int
    ) -> tuple[list[OrganizationApprovalRule], int]:
        bounded = min(max(page_size, 1), self.MAX_PAGE_SIZE)
        page = max(page, 1)
        filters = [
            OrganizationApprovalRule.organization_id == organization_id,
            OrganizationApprovalRule.archived_at.is_(None),
        ]
        total = int(await self.db.scalar(
            select(func.count(OrganizationApprovalRule.id)).where(*filters)
        ) or 0)
        rows = list((await self.db.scalars(
            select(OrganizationApprovalRule).options(load_only(
                OrganizationApprovalRule.id,
                OrganizationApprovalRule.name,
                OrganizationApprovalRule.domain,
                OrganizationApprovalRule.event_id,
                OrganizationApprovalRule.approver_chain,
                OrganizationApprovalRule.conditions,
                OrganizationApprovalRule.status,
                OrganizationApprovalRule.version,
            )).where(*filters)
            .order_by(OrganizationApprovalRule.name, OrganizationApprovalRule.id)
            .offset((page - 1) * bounded)
            .limit(bounded)
        )).all())
        return rows, total


class OrganiserAccessQueryService:
    """Tenant-scoped projections for organiser role and assignment screens."""

    MAX_PAGE_SIZE = 100

    def __init__(self, db: AsyncSession):
        self.db = db

    @staticmethod
    def _page(page: int, page_size: int) -> tuple[int, int]:
        return max(page, 1), min(max(page_size, 1), OrganiserAccessQueryService.MAX_PAGE_SIZE)

    async def list_roles(
        self, *, organization_id: uuid.UUID, page: int, page_size: int, search: str | None
    ) -> tuple[list[tuple], int]:
        page, page_size = self._page(page, page_size)
        filters = [
            Role.deleted_at.is_(None),
            or_(Role.organization_id == organization_id, Role.organization_id.is_(None)),
        ]
        if search and search.strip():
            term = f"%{search.strip()}%"
            filters.append(or_(Role.name.ilike(term), Role.description.ilike(term)))
        total = int(await self.db.scalar(select(func.count(Role.id)).where(*filters)) or 0)
        rows = (await self.db.execute(
            select(
                Role.id,
                Role.name,
                Role.description,
                Role.is_system_role,
                Role.version,
                func.count(UserRoleAssignment.id).label("users_count"),
            ).outerjoin(
                UserRoleAssignment,
                and_(
                    UserRoleAssignment.role_id == Role.id,
                    UserRoleAssignment.organization_id == organization_id,
                ),
            ).where(*filters)
            .group_by(Role.id)
            .order_by(Role.name.asc(), Role.id.asc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )).all()
        return rows, total

    async def list_assignments(
        self, *, organization_id: uuid.UUID, scope: str, page: int, page_size: int, search: str | None
    ) -> tuple[list[tuple], int]:
        page, page_size = self._page(page, page_size)
        filters = [
            UserRoleAssignment.organization_id == organization_id,
            Role.deleted_at.is_(None),
            or_(Role.organization_id == organization_id, Role.organization_id.is_(None)),
            UserRoleAssignment.event_id.is_not(None) if scope == "EVENT" else UserRoleAssignment.event_id.is_(None),
            or_(UserRoleAssignment.event_id.is_(None), Event.organization_id == organization_id),
        ]
        if search and search.strip():
            term = f"%{search.strip()}%"
            filters.append(or_(
                User.email.ilike(term), User.first_name.ilike(term), User.last_name.ilike(term),
                Role.name.ilike(term), Event.name.ilike(term),
            ))
        base = select(UserRoleAssignment.id).join(Role, Role.id == UserRoleAssignment.role_id).join(
            User, User.id == UserRoleAssignment.user_id
        ).outerjoin(Event, Event.id == UserRoleAssignment.event_id).where(*filters)
        total = int(await self.db.scalar(select(func.count()).select_from(base.subquery())) or 0)
        rows = (await self.db.execute(
            select(
                UserRoleAssignment.id,
                UserRoleAssignment.user_id,
                UserRoleAssignment.role_id,
                UserRoleAssignment.event_id,
                UserRoleAssignment.assigned_at,
                User.first_name.label("user_first_name"),
                User.last_name.label("user_last_name"),
                User.email.label("user_email"),
                Role.name.label("role_name"),
                Event.name.label("event_name"),
            ).join(Role, Role.id == UserRoleAssignment.role_id)
            .join(User, User.id == UserRoleAssignment.user_id)
            .outerjoin(Event, Event.id == UserRoleAssignment.event_id)
            .where(*filters)
            .order_by(UserRoleAssignment.assigned_at.desc(), UserRoleAssignment.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )).all()
        return rows, total

    async def list_roles_cursor(self, *, organization_id: uuid.UUID, cursor: str | None = None,
                                limit: int = 50, search: str | None = None) -> CursorPage[dict]:
        bounded = bounded_page_size(limit, maximum=self.MAX_PAGE_SIZE)
        filters = [Role.deleted_at.is_(None), or_(Role.organization_id == organization_id, Role.organization_id.is_(None))]
        if search and search.strip():
            term = f"%{search.strip()}%"
            filters.append(or_(Role.name.ilike(term), Role.description.ilike(term)))
        if cursor:
            position = decode_cursor(cursor)
            filters.append(or_(Role.created_at < position.occurred_at,
                               and_(Role.created_at == position.occurred_at, Role.id < position.record_id)))
        rows = (await self.db.execute(
            select(Role.id, Role.name, Role.description, Role.is_system_role, Role.version, Role.created_at,
                   func.count(UserRoleAssignment.id).label("users_count"))
            .outerjoin(UserRoleAssignment, and_(UserRoleAssignment.role_id == Role.id,
                                                UserRoleAssignment.organization_id == organization_id))
            .where(*filters).group_by(Role.id).order_by(Role.created_at.desc(), Role.id.desc()).limit(bounded + 1)
        )).all()
        page_rows = rows[:bounded]
        items = [{"id": str(row.id), "name": row.name, "description": row.description,
                  "is_system_role": row.is_system_role, "users_count": row.users_count,
                  "scope": "Global" if row.is_system_role else "Organisation", "status": "Active",
                  "version": row.version} for row in page_rows]
        has_next = len(rows) > bounded
        next_cursor = encode_cursor(page_rows[-1].created_at, page_rows[-1].id) if has_next and page_rows else None
        return CursorPage(items=items, next_cursor=next_cursor, has_next=has_next)

    async def list_assignments_cursor(self, *, organization_id: uuid.UUID, scope: str,
                                       cursor: str | None = None, limit: int = 50,
                                       search: str | None = None) -> CursorPage[dict]:
        bounded = bounded_page_size(limit, maximum=self.MAX_PAGE_SIZE)
        filters = [UserRoleAssignment.organization_id == organization_id, Role.deleted_at.is_(None),
                   or_(Role.organization_id == organization_id, Role.organization_id.is_(None)),
                   UserRoleAssignment.event_id.is_not(None) if scope == "EVENT" else UserRoleAssignment.event_id.is_(None),
                   or_(UserRoleAssignment.event_id.is_(None), Event.organization_id == organization_id)]
        if search and search.strip():
            term = f"%{search.strip()}%"
            filters.append(or_(User.email.ilike(term), User.first_name.ilike(term), User.last_name.ilike(term),
                               Role.name.ilike(term), Event.name.ilike(term)))
        if cursor:
            position = decode_cursor(cursor)
            filters.append(or_(UserRoleAssignment.assigned_at < position.occurred_at,
                               and_(UserRoleAssignment.assigned_at == position.occurred_at,
                                    UserRoleAssignment.id < position.record_id)))
        rows = (await self.db.execute(
            select(UserRoleAssignment.id, UserRoleAssignment.user_id, UserRoleAssignment.role_id,
                   UserRoleAssignment.event_id, UserRoleAssignment.assigned_at,
                   User.first_name.label("user_first_name"), User.last_name.label("user_last_name"),
                   User.email.label("user_email"), Role.name.label("role_name"), Event.name.label("event_name"))
            .join(Role, Role.id == UserRoleAssignment.role_id).join(User, User.id == UserRoleAssignment.user_id)
            .outerjoin(Event, Event.id == UserRoleAssignment.event_id).where(*filters)
            .order_by(UserRoleAssignment.assigned_at.desc(), UserRoleAssignment.id.desc()).limit(bounded + 1)
        )).all()
        page_rows = rows[:bounded]
        items = [{"id": str(row.id), "user_id": str(row.user_id),
                  "user_name": f"{row.user_first_name} {row.user_last_name}".strip(), "user_email": row.user_email,
                  "role_id": str(row.role_id), "role_name": row.role_name, "scope": scope,
                  "event_id": str(row.event_id) if row.event_id else None, "event_name": row.event_name,
                  "assigned_at": row.assigned_at.isoformat()} for row in page_rows]
        has_next = len(rows) > bounded
        next_cursor = encode_cursor(page_rows[-1].assigned_at, page_rows[-1].id) if has_next and page_rows else None
        return CursorPage(items=items, next_cursor=next_cursor, has_next=has_next)

    async def effective_preview(
        self, *, organization_id: uuid.UUID, user_id: uuid.UUID, role_id: uuid.UUID, event_id: uuid.UUID | None
    ) -> dict[str, Any]:
        member_id = await self.db.scalar(select(OrganizationMember.id).where(
            OrganizationMember.organization_id == organization_id,
            OrganizationMember.user_id == user_id,
            OrganizationMember.is_active.is_(True),
        ))
        role = await self.db.execute(select(Role.id, Role.name).where(
            Role.id == role_id,
            Role.deleted_at.is_(None),
            or_(Role.organization_id == organization_id, Role.organization_id.is_(None)),
        ))
        role_row = role.one_or_none()
        event_exists = True
        if event_id:
            event_exists = bool(await self.db.scalar(select(Event.id).where(
                Event.id == event_id,
                Event.organization_id == organization_id,
                Event.deleted_at.is_(None),
            )))
        proposed = set((await self.db.scalars(
            select(Permission.code).join(RolePermission, RolePermission.permission_id == Permission.id).where(
                RolePermission.role_id == role_id
            )
        )).all())
        assignment_filters = [
            UserRoleAssignment.organization_id == organization_id,
            UserRoleAssignment.user_id == user_id,
        ]
        assignment_filters.append(
            or_(UserRoleAssignment.event_id.is_(None), UserRoleAssignment.event_id == event_id)
            if event_id else UserRoleAssignment.event_id.is_(None)
        )
        existing = set((await self.db.scalars(
            select(Permission.code).join(RolePermission, RolePermission.permission_id == Permission.id)
            .join(UserRoleAssignment, UserRoleAssignment.role_id == RolePermission.role_id)
            .where(*assignment_filters)
        )).all())
        duplicate = bool(await self.db.scalar(select(UserRoleAssignment.id).where(
            UserRoleAssignment.organization_id == organization_id,
            UserRoleAssignment.user_id == user_id,
            UserRoleAssignment.role_id == role_id,
            UserRoleAssignment.event_id == event_id if event_id else UserRoleAssignment.event_id.is_(None),
        )))
        return {
            "member_found": bool(member_id),
            "role_name": role_row.name if role_row else None,
            "role_found": bool(role_row),
            "event_found": event_exists,
            "proposed": proposed,
            "existing": existing,
            "duplicate": duplicate,
        }


class OrganiserAttentionQueryService:
    """Bounded needs-attention candidate projection with event aggregates."""

    MAX_EVENTS = 25

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_event_target(
        self,
        *,
        event_id: uuid.UUID,
        organization_id: uuid.UUID | None = None,
    ) -> tuple | None:
        """Load only the event identity needed by the attention projection."""
        statement = select(Event.id, Event.organization_id, Event.deleted_at).where(
            Event.id == event_id
        )
        if organization_id is not None:
            statement = statement.where(Event.organization_id == organization_id)
        return (await self.db.execute(statement.limit(1))).one_or_none()

    async def get_candidate(
        self, *, organization_id: uuid.UUID, event_id: uuid.UUID
    ) -> tuple | None:
        """Load one event's attention counters in a single bounded projection."""
        sessions_without_rooms = select(func.count(Session.id)).where(
            Session.event_id == Event.id, Session.room_id.is_(None)
        ).correlate(Event).scalar_subquery()
        pending_speakers = select(func.count(Speaker.id)).where(
            Speaker.event_id == Event.id, Speaker.upload_status == "pending"
        ).correlate(Event).scalar_subquery()
        pending_registrations = select(func.count(Participant.id)).where(
            Participant.event_id == Event.id,
            Participant.approval_status.in_(["PENDING_REVIEW", "Pending"]),
        ).correlate(Event).scalar_subquery()
        payment_pending = select(func.count(PaymentTransaction.id)).where(
            PaymentTransaction.event_id == Event.id,
            PaymentTransaction.status.in_(["pending", "failed"]),
        ).correlate(Event).scalar_subquery()
        total_rooms = select(func.count(Room.id)).where(
            Room.event_id == Event.id, Room.is_active.is_(True)
        ).correlate(Event).scalar_subquery()
        return (await self.db.execute(
            select(
                Event.id,
                Event.updated_at,
                sessions_without_rooms.label("sessions_without_rooms"),
                pending_speakers.label("pending_speakers"),
                pending_registrations.label("pending_registrations"),
                payment_pending.label("payment_pending"),
                total_rooms.label("total_rooms"),
            ).where(
                Event.id == event_id,
                Event.organization_id == organization_id,
                Event.deleted_at.is_(None),
            )
        )).one_or_none()

    async def list_candidates(self, *, organization_id: uuid.UUID) -> list[tuple]:
        sessions_without_rooms = select(func.count(Session.id)).where(
            Session.event_id == Event.id, Session.room_id.is_(None)
        ).correlate(Event).scalar_subquery()
        pending_speakers = select(func.count(Speaker.id)).where(
            Speaker.event_id == Event.id, Speaker.upload_status == "pending"
        ).correlate(Event).scalar_subquery()
        pending_registrations = select(func.count(Participant.id)).where(
            Participant.event_id == Event.id,
            Participant.approval_status.in_(["PENDING_REVIEW", "Pending"]),
        ).correlate(Event).scalar_subquery()
        payment_pending = select(func.count(PaymentTransaction.id)).where(
            PaymentTransaction.event_id == Event.id,
            PaymentTransaction.status.in_(["pending", "failed"]),
        ).correlate(Event).scalar_subquery()
        total_rooms = select(func.count(Room.id)).where(
            Room.event_id == Event.id, Room.is_active.is_(True)
        ).correlate(Event).scalar_subquery()
        return (
            await self.db.execute(
                select(
                    Event.id,
                    Event.updated_at,
                    sessions_without_rooms.label("sessions_without_rooms"),
                    pending_speakers.label("pending_speakers"),
                    pending_registrations.label("pending_registrations"),
                    payment_pending.label("payment_pending"),
                    total_rooms.label("total_rooms"),
                )
                .where(
                    Event.organization_id == organization_id,
                    Event.deleted_at.is_(None),
                    Event.status != "archived",
                )
                .order_by(Event.start_date, Event.id)
                .limit(self.MAX_EVENTS)
            )
        ).all()

    async def list_task_states(
        self,
        *,
        organization_id: uuid.UUID,
        task_keys: list[str],
        limit: int = 100,
    ) -> list[tuple]:
        """Load attention state and owner display fields in one bounded projection."""
        if not task_keys:
            return []
        bounded_limit = max(1, min(int(limit), 100))
        return (
            await self.db.execute(
                select(
                    OrganizationAttentionState.task_key,
                    OrganizationAttentionState.status,
                    OrganizationAttentionState.snoozed_until,
                    OrganizationAttentionState.version,
                    OrganizationAttentionState.owner_user_id,
                    User.id.label("owner_id"),
                    User.first_name,
                    User.last_name,
                    User.email,
                )
                .select_from(OrganizationAttentionState)
                .outerjoin(User, User.id == OrganizationAttentionState.owner_user_id)
                .where(
                    OrganizationAttentionState.organization_id == organization_id,
                    OrganizationAttentionState.task_key.in_(task_keys),
                )
                .order_by(
                    OrganizationAttentionState.task_key.asc(),
                    OrganizationAttentionState.version.desc(),
                )
                .limit(bounded_limit)
            )
        ).all()


@dataclass(frozen=True)
class OrganiserAddonProjection:
    id: uuid.UUID
    key: str
    name: str
    short_description: str | None
    description: str | None
    addon_type: str
    included_in_plan: str | None
    price_inr: object
    final_price: object


@dataclass(frozen=True)
class OrganiserOrganizationAddonProjection:
    id: uuid.UUID
    addon_id: uuid.UUID
    status: str
    expires_at: datetime | None
    quantity: int
    event_id: uuid.UUID | None
    activation_id: uuid.UUID | None


class OrganiserAddonQueryService:
    """Explicit bounded projections for organization add-on status reads."""

    MAX_CATALOGUE = 500
    MAX_ASSIGNMENTS = 2000
    MAX_REQUESTS = 500

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_status_data(
        self, *, organization_id: uuid.UUID
    ) -> tuple[list[OrganiserAddonProjection], list[OrganiserOrganizationAddonProjection], list[list[str]]]:
        addons = (
            await self.db.execute(
                select(
                    Addon.id, Addon.key, Addon.name, Addon.short_description,
                    Addon.description, Addon.addon_type, Addon.included_in_plan,
                    Addon.price_inr, Addon.final_price,
                )
                .where(Addon.is_active.is_(True))
                .order_by(Addon.name, Addon.id)
                .limit(self.MAX_CATALOGUE)
            )
        ).all()
        assignments = (
            await self.db.execute(
                select(
                    OrganizationAddon.id, OrganizationAddon.addon_id,
                    OrganizationAddon.status, OrganizationAddon.expires_at,
                    OrganizationAddon.quantity, OrganizationAddon.event_id,
                    OrganizationAddon.activation_id,
                )
                .where(OrganizationAddon.organization_id == organization_id)
                .order_by(OrganizationAddon.updated_at.desc(), OrganizationAddon.id)
                .limit(self.MAX_ASSIGNMENTS)
            )
        ).all()
        requests = (
            await self.db.execute(
                select(CommercialAccessRequest.requested_addon_keys)
                .where(
                    CommercialAccessRequest.organization_id == organization_id,
                    CommercialAccessRequest.status.in_(["PENDING", "APPROVED"]),
                )
                .order_by(CommercialAccessRequest.updated_at.desc(), CommercialAccessRequest.id)
                .limit(self.MAX_REQUESTS)
            )
        ).all()
        return (
            [OrganiserAddonProjection(*row) for row in addons],
            [OrganiserOrganizationAddonProjection(*row) for row in assignments],
            [list(row.requested_addon_keys or []) for row in requests],
        )
