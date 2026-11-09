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
from app.modules.registration.models.portal_theme_setting import PortalThemeSetting
from app.modules.registration.models.payment_transaction import PaymentTransaction
from app.modules.registration.models.check_in import CheckIn
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
from app.modules.billing.models.billing_domain_tables import Invoice, OrganizationBillingProfile, PaymentMethod
from app.modules.billing.models.cloud_commercial import CommercialAllocation
from app.modules.billing.models.org_credits import OrgCredit
from app.modules.rbac.models.organization_member import OrganizationMember
from app.modules.rbac.services.invitations import invitation_state
from app.modules.rbac.models.rbac import Permission, Role, RolePermission, UserRoleAssignment
from app.modules.identity.models.user import User
from app.modules.rbac.models.user_assignment import UserEventAssignment


@dataclass(frozen=True)
class OrganiserEventProjection:
    id: uuid.UUID
    name: str
    short_code: str | None
    version: int
    start_date: date
    end_date: date
    venue_name: str | None
    location: str | None
    country: str | None
    timezone: str | None
    organizer_name: str | None
    banner_url: str | None
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
        access_predicate=None,
    ) -> tuple[list[OrganiserEventProjection], int, dict[str, int]]:
        conditions = [Event.organization_id == organization_id]
        if access_predicate is not None:
            conditions.append(access_predicate)
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
                Event.version,
                Event.start_date,
                Event.end_date,
                Event.venue_name,
                Event.location,
                Event.country,
                Event.timezone,
                Event.organizer_name,
                PortalThemeSetting.banner_url,
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
            .outerjoin(PortalThemeSetting, PortalThemeSetting.event_id == Event.id)
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
                version=int(getattr(row, "version", 1) or 1),
                start_date=row.start_date,
                end_date=row.end_date,
                venue_name=row.venue_name,
                location=row.location,
                country=row.country,
                timezone=row.timezone,
                organizer_name=row.organizer_name,
                banner_url=row.banner_url,
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
        if access_predicate is not None:
            base.append(access_predicate)
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
            *([access_predicate] if access_predicate is not None else []),
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
                        OrganizationMember.organization_id == organization_id,
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
                        OrganizationTeamEvent.authorization_version,
                        Event.name,
                    )
                    .join(Event, Event.id == OrganizationTeamEvent.event_id)
                    .where(
                        OrganizationTeamEvent.organization_id == organization_id,
                        OrganizationTeamEvent.team_id.in_(team_ids),
                        Event.organization_id == organization_id,
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
                    "authorization_version": row.authorization_version,
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
        from app.modules.organiser.application.member_projection import member_event_assignments
        event_ids_by_user = await member_event_assignments(self.db, organization_id, user_ids)
        items = []
        for row in rows:
            has_user = row.user_id is not None
            items.append({
                "id": str(row.id),
                "user_id": str(row.user_id) if has_user else None,
                "name": f"{row.first_name} {row.last_name}" if has_user else (row.invite_email or "Pending invite"),
                "first_name": row.first_name if has_user else None,
                "last_name": row.last_name if has_user else None,
                "email": row.email if has_user else row.invite_email,
                "org_role": row.org_role,
                "accepted_at": row.accepted_at.isoformat() if row.accepted_at else None,
                "invited_at": row.invited_at.isoformat() if row.invited_at else None,
                "invite_expires_at": row.invite_expires_at.isoformat() if row.invite_expires_at else None,
                "invitation_state": invitation_state(row),
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
        if not 1 <= page_size <= self.MAX_PAGE_SIZE or page < 1:
            from fastapi import HTTPException
            raise HTTPException(422, detail={"code": "INVALID_PAGE_SIZE"})
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
                    OrganizationMember.invite_expires_at,
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
            OrganizationMember.invite_expires_at,
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
                "resolution_path": None if enabled or unrestricted else "/commercial/capacity",
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
        self, *, organization_id: uuid.UUID, today: date
    ) -> list[dict]:
        days = [today - timedelta(days=6 - index) for index in range(7)]
        start = datetime.combine(days[0], datetime.min.time(), timezone.utc)
        end = datetime.combine(today + timedelta(days=1), datetime.min.time(), timezone.utc)
        registration_rows = (
            await self.db.execute(
                select(
                    func.date(Participant.registered_at).label("day"),
                    func.count(Participant.id).label("count"),
                )
                .join(Event, Event.id == Participant.event_id)
                .where(
                    Event.organization_id == organization_id,
                    Event.deleted_at.is_(None),
                    Participant.deleted_at.is_(None),
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
                .join(Event, Event.id == PaymentTransaction.event_id)
                .where(
                    Event.organization_id == organization_id,
                    Event.deleted_at.is_(None),
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

    async def session_distribution(self, *, organization_id: uuid.UUID) -> list[dict]:
        """Return a bounded five-day session-format distribution for charts."""
        rows = (
            await self.db.execute(
                select(
                    func.date(Session.start_time).label("day"),
                    func.sum(case((func.lower(Session.session_type).like("%poster%"), 1), else_=0)).label("poster"),
                    func.sum(case((func.lower(Session.session_type).not_like("%poster%"), 1), else_=0)).label("oral"),
                )
                .join(Event, Event.id == Session.event_id)
                .where(
                    Event.organization_id == organization_id,
                    Event.deleted_at.is_(None),
                    Session.deleted_at.is_(None),
                )
                .group_by(func.date(Session.start_time))
                .order_by(func.date(Session.start_time).desc())
                .limit(5)
            )
        ).all()
        return [
            {"label": row.day.strftime("%d %b"), "oral": int(row.oral or 0), "poster": int(row.poster or 0)}
            for row in reversed(rows)
        ]

    async def metrics(self, *, organization_id: uuid.UUID) -> dict[str, int | float | dict]:
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
            Participant.event_id.in_(event_scope), Participant.deleted_at.is_(None)
        ).scalar_subquery()
        total_events = select(func.count(Event.id)).where(
            Event.organization_id == organization_id, Event.deleted_at.is_(None)
        ).scalar_subquery()
        active_events = select(func.count(Event.id)).where(
            Event.organization_id == organization_id,
            Event.deleted_at.is_(None),
            func.lower(Event.status).not_in(["archived", "completed", "cancelled"]),
        ).scalar_subquery()
        sessions = select(func.count(Session.id)).where(
            Session.event_id.in_(event_scope), Session.deleted_at.is_(None)
        ).scalar_subquery()
        speakers = select(func.count(Speaker.id)).where(
            Speaker.event_id.in_(event_scope), Speaker.deleted_at.is_(None)
        ).scalar_subquery()
        checkins = select(func.count(CheckIn.id)).where(
            CheckIn.event_id.in_(event_scope),
            func.lower(CheckIn.status).in_(["success", "checked_in", "active"]),
        ).scalar_subquery()
        approved = select(func.count(Participant.id)).where(
            Participant.event_id.in_(event_scope), Participant.deleted_at.is_(None),
            func.lower(Participant.approval_status).in_(["approved", "accepted"]),
        ).scalar_subquery()
        pending = select(func.count(Participant.id)).where(
            Participant.event_id.in_(event_scope), Participant.deleted_at.is_(None),
            func.lower(Participant.approval_status).in_(["pending", "submitted", "under_review"]),
        ).scalar_subquery()
        waitlisted = select(func.count(Participant.id)).where(
            Participant.event_id.in_(event_scope), Participant.deleted_at.is_(None),
            func.lower(Participant.approval_status).in_(["waitlisted", "waitlist"]),
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
            total_events.label("total_events"),
            active_events.label("active_events"),
            registrations.label("total_registrations"),
            sessions.label("total_sessions"),
            speakers.label("total_speakers"),
            checkins.label("total_checkins"),
            approved.label("approved_registrations"),
            pending.label("pending_registrations"),
            waitlisted.label("waitlisted_registrations"),
            revenue.label("total_revenue"),
            storage.label("storage_used_bytes"),
        ))).one()
        return {
            "team_members": int(row.team_members or 0),
            "total_events": int(row.total_events or 0),
            "active_events": int(row.active_events or 0),
            "total_registrations": int(row.total_registrations or 0),
            "total_sessions": int(row.total_sessions or 0),
            "total_speakers": int(row.total_speakers or 0),
            "total_checkins": int(row.total_checkins or 0),
            "registration_overview": {
                "approved": int(row.approved_registrations or 0),
                "pending": int(row.pending_registrations or 0),
                "waitlisted": int(row.waitlisted_registrations or 0),
                "other": max(0, int(row.total_registrations or 0) - int(row.approved_registrations or 0) - int(row.pending_registrations or 0) - int(row.waitlisted_registrations or 0)),
            },
            "total_revenue": float(row.total_revenue or 0.0),
            "storage_used_bytes": int(row.storage_used_bytes or 0),
        }


class OrganiserBillingQueryService:
    """Bounded, explicit billing list projections for the organiser console."""

    MAX_PAGE_SIZE = 100

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_organization_email_usage(self, *, organization_id: uuid.UUID) -> dict[str, int]:
        """Return committed organisation-email credits for the active workspace plan."""
        now = datetime.now(timezone.utc)
        row = (
            await self.db.execute(
                select(
                    func.coalesce(func.sum(CommercialAllocation.quantity_total), 0).label("allowed"),
                    func.coalesce(
                        func.sum(
                            CommercialAllocation.quantity_consumed
                            + CommercialAllocation.quantity_reserved
                        ),
                        0,
                    ).label("used"),
                )
                .where(
                    CommercialAllocation.organization_id == organization_id,
                    CommercialAllocation.event_id.is_(None),
                    CommercialAllocation.entitlement_key == "organization_email_credits",
                    CommercialAllocation.status == "ACTIVE",
                    CommercialAllocation.valid_from <= now,
                    or_(
                        CommercialAllocation.valid_until.is_(None),
                        CommercialAllocation.valid_until > now,
                    ),
                )
            )
        ).one()
        return {"used": int(row.used or 0), "allowed": int(row.allowed or 0)}

    async def get_invoice_for_download(
        self, *, organization_id: uuid.UUID, invoice_id: uuid.UUID
    ) -> Invoice | None:
        return await self.db.scalar(
            select(Invoice).options(load_only(
                Invoice.id, Invoice.organization_id, Invoice.event_id,
                Invoice.invoice_number, Invoice.stripe_invoice_id,
                Invoice.issued_at, Invoice.due_date, Invoice.paid_at,
                Invoice.status, Invoice.amount, Invoice.gst_amount,
                Invoice.total_amount_inr, Invoice.currency, Invoice.version,
            )).where(
                Invoice.id == invoice_id,
                Invoice.organization_id == organization_id,
            )
        )

    async def get_tax_profile(
        self, *, organization_id: uuid.UUID
    ) -> tuple[OrganizationBillingProfile | None, None]:
        """Load the authoritative billing profile."""
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

        return None, None

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
    ) -> tuple[list[Invoice], int]:
        page, page_size = self._page(page, page_size)
        filters = [Invoice.organization_id == organization_id, Invoice.paid_at.is_not(None)]
        total = int(await self.db.scalar(select(func.count(Invoice.id)).where(*filters)) or 0)
        rows = list((await self.db.scalars(
            select(Invoice).options(load_only(
                Invoice.id, Invoice.stripe_invoice_id, Invoice.issued_at,
                Invoice.status, Invoice.total_amount_inr, Invoice.amount,
                Invoice.currency, Invoice.paid_at,
            )).where(*filters)
            .order_by(Invoice.issued_at.desc(), Invoice.id.desc())
            .offset((page - 1) * page_size).limit(page_size)
        )).all())
        return rows, total

    async def list_payment_methods(
        self, *, organization_id: uuid.UUID, page: int, page_size: int
    ) -> tuple[list[PaymentMethod], int]:
        page, page_size = self._page(page, page_size)
        filters = [PaymentMethod.organization_id == organization_id, PaymentMethod.retired_at.is_(None)]
        total = int(await self.db.scalar(select(func.count(PaymentMethod.id)).where(*filters)) or 0)
        rows = list((await self.db.scalars(
            select(PaymentMethod).options(load_only(
                PaymentMethod.id, PaymentMethod.provider, PaymentMethod.card_brand,
                PaymentMethod.card_last4, PaymentMethod.is_default,
                PaymentMethod.expires_month, PaymentMethod.expires_year,
                PaymentMethod.version, PaymentMethod.created_at,
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
    """Compatibility projections using explicit subject and resource ownership.

    Core projections do not assume a member's identity home tenant is its only
    membership. Caller holds the shared scoped access-administration guard.
    """
    MAX_PAGE_SIZE = 100

    def __init__(self, db: AsyncSession):
        self.db = db

    @staticmethod
    def _page(page, page_size):
        return max(page, 1), min(max(page_size, 1), 100)

    @staticmethod
    def _roles(organization_id):
        r = Role.__table__.c
        return and_(r.deleted_at.is_(None), or_(r.organization_id == organization_id,
            and_(r.organization_id.is_(None), r.is_system_role.is_(True), r.name != "Super Admin")))

    @staticmethod
    def _accepted_subject(organization_id):
        a, m, u = UserRoleAssignment.__table__.c, OrganizationMember.__table__.c, User.__table__.c
        return select(m.id).select_from(OrganizationMember.__table__.join(User.__table__, u.id == m.user_id)).where(
            m.organization_id == organization_id, m.user_id == a.user_id, m.is_active.is_(True),
            m.accepted_at.is_not(None), u.is_active.is_(True), u.deleted_at.is_(None)
        ).correlate(UserRoleAssignment.__table__).exists()

    async def _role_rows(self, organization_id, filters, *, limit, offset=0):
        r, a = Role.__table__.c, UserRoleAssignment.__table__.c
        page = select(r.id, r.name, r.description, r.is_system_role, r.version, r.created_at).where(
            self._roles(organization_id), *filters).order_by(r.created_at.desc(), r.id.desc()).offset(offset).limit(limit).subquery()
        statement = select(*page.c, func.count(func.distinct(a.user_id)).label("users_count")).select_from(page.outerjoin(
            UserRoleAssignment.__table__, and_(a.role_id == page.c.id, a.organization_id == organization_id,
                a.revoked_at.is_(None), self._accepted_subject(organization_id))
        )).group_by(*page.c).order_by(page.c.created_at.desc(), page.c.id.desc())
        return (await self.db.execute(statement)).all()

    @staticmethod
    def _search_roles(search):
        r = Role.__table__.c
        return [func.lower(r.name).startswith(search.strip().lower(), autoescape=True)] if search and search.strip() else []

    async def list_roles(self, *, organization_id, page, page_size, search):
        page, page_size = self._page(page, page_size)
        filters = self._search_roles(search)
        total = int(await self.db.scalar(select(func.count()).select_from(Role.__table__).where(
            self._roles(organization_id), *filters)) or 0)
        return await self._role_rows(organization_id, filters, limit=page_size, offset=(page - 1) * page_size), total

    async def list_roles_cursor(self, *, organization_id, cursor=None, limit=50, search=None):
        size = bounded_page_size(limit, maximum=100)
        r = Role.__table__.c
        filters = self._search_roles(search)
        if cursor:
            position = decode_cursor(cursor)
            filters.append(or_(r.created_at < position.occurred_at,
                and_(r.created_at == position.occurred_at, r.id < position.record_id)))
        rows = await self._role_rows(organization_id, filters, limit=size + 1)
        items = [{"id": str(row.id), "name": row.name, "description": row.description,
            "is_system_role": row.is_system_role, "version": row.version, "users_count": row.users_count,
            "scope": "Template" if row.is_system_role else "Organisation", "status": "Active"} for row in rows[:size]]
        next_cursor = encode_cursor(rows[size - 1].created_at, rows[size - 1].id) if len(rows) > size else None
        return CursorPage(items=items, next_cursor=next_cursor, has_next=len(rows) > size)

    def _assignments(self, organization_id, actor_id, scope, search):
        from app.modules.rbac.services.event_scope import visible_event_predicate
        a, r, u, e = (model.__table__.c for model in (UserRoleAssignment, Role, User, Event))
        filters = [a.organization_id == organization_id, a.revoked_at.is_(None),
            self._roles(organization_id), self._accepted_subject(organization_id),
            a.event_id.is_not(None) if scope == "EVENT" else a.event_id.is_(None),
            or_(a.event_id.is_(None), select(Event.id).where(Event.id == a.event_id,
                Event.deleted_at.is_(None), visible_event_predicate(actor_id, organization_id)
            ).correlate(UserRoleAssignment.__table__).exists())]
        if search and search.strip():
            prefix = search.strip().lower()
            filters.append(or_(*(func.lower(column).startswith(prefix, autoescape=True)
                for column in (u.email, u.first_name, u.last_name, r.name, e.name))))
        statement = select(a.id, a.user_id, a.role_id, a.event_id, a.assigned_at, a.version,
            u.first_name.label("user_first_name"), u.last_name.label("user_last_name"),
            u.email.label("user_email"), r.name.label("role_name"), e.name.label("event_name")).select_from(
                UserRoleAssignment.__table__.join(Role.__table__, r.id == a.role_id)
                .join(User.__table__, u.id == a.user_id).outerjoin(Event.__table__, e.id == a.event_id)).where(*filters)
        return statement

    async def list_assignments(self, *, organization_id, actor_id, scope, page, page_size, search):
        page, size = self._page(page, page_size)
        a = UserRoleAssignment.__table__.c
        base = self._assignments(organization_id, actor_id, scope, search)
        total = int(await self.db.scalar(select(func.count()).select_from(base.subquery())) or 0)
        rows = (await self.db.execute(base.order_by(a.assigned_at.desc(), a.id.desc())
            .offset((page - 1) * size).limit(size))).all()
        return rows, total

    async def list_assignments_cursor(self, *, organization_id, actor_id, scope, cursor=None, limit=50, search=None):
        size = bounded_page_size(limit, maximum=100)
        a = UserRoleAssignment.__table__.c
        statement = self._assignments(organization_id, actor_id, scope, search)
        if cursor:
            position = decode_cursor(cursor)
            statement = statement.where(or_(a.assigned_at < position.occurred_at,
                and_(a.assigned_at == position.occurred_at, a.id < position.record_id)))
        rows = (await self.db.execute(statement.order_by(a.assigned_at.desc(), a.id.desc()).limit(size + 1))).all()
        items = [{"id": str(row.id), "user_id": str(row.user_id),
            "user_name": " ".join(filter(None, [row.user_first_name, row.user_last_name])), "user_email": row.user_email,
            "role_id": str(row.role_id), "role_name": row.role_name, "scope": scope,
            "event_id": str(row.event_id) if row.event_id else None, "event_name": row.event_name,
            "assigned_at": row.assigned_at.isoformat(), "version": row.version} for row in rows[:size]]
        next_cursor = encode_cursor(rows[size - 1].assigned_at, rows[size - 1].id) if len(rows) > size else None
        return CursorPage(items=items, next_cursor=next_cursor, has_next=len(rows) > size)


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
