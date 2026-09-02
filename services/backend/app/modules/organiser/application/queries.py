"""Bounded read projections for organiser workspaces."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

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
from app.modules.platform.models.organization_console import OrganizationLocation
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
from app.modules.rbac.models.organization_member import OrganizationMember
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


class OrganiserMemberQueryService:
    """Bounded organization member projection with batched event assignments."""

    MAX_PAGE_SIZE = 100

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_members(
        self,
        *,
        organization_id: uuid.UUID,
        page: int,
        page_size: int,
        search: str | None,
        member_status: str | None,
    ) -> tuple[list[dict], int]:
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
        return items, total


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


class OrganiserAttentionQueryService:
    """Bounded needs-attention candidate projection with event aggregates."""

    MAX_EVENTS = 25

    def __init__(self, db: AsyncSession):
        self.db = db

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
