"""Revision-keyed cache support for resolved capabilities.

Revision rows are updated by SQLAlchemy in the same database transaction as
commercial, restriction, flag, metering, and authoritative-domain changes.
Redis entries therefore become unreachable immediately after commit without a
best-effort cross-system delete. If Redis is unavailable, resolution continues
from PostgreSQL; cached values are never used without first reading the current
database revision vector.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select, tuple_
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session
from sqlalchemy import event as sqlalchemy_event

from app.core.cache_keys import TenantCacheKey
from app.modules.platform.models.organization_console import CapabilityRevision


GLOBAL_SCOPE_ID = uuid.UUID(int=0)
_PENDING_KEY = "capability_revision_scopes"
_LISTENERS_REGISTERED = False


def _scope(scope_type: str, scope_id: uuid.UUID | None, organization_id: uuid.UUID | None = None):
    return (scope_type, scope_id or GLOBAL_SCOPE_ID, organization_id)


def _changed(session: Session, instance: object) -> bool:
    return instance in session.new or instance in session.deleted or session.is_modified(instance, include_collections=True)


def _revision_scopes(session: Session) -> set[tuple[str, uuid.UUID, uuid.UUID | None]]:
    # Imports are local to keep model initialization acyclic.
    from app.modules.analytics.models.analytics_domain_tables import ApiUsageMetric
    from app.modules.billing.models.event_activation import EventActivation
    from app.modules.billing.models.licensing import EventEntitlementSnapshotSet
    from app.modules.billing.models.subscription import Addon, AddonFeature, OrganizationAddon, OrganizationSubscription, PlanFeature, SubscriptionPlan
    from app.modules.events.models.event import Event
    from app.modules.agenda.models import Room
    from app.modules.agenda.models import Session as EventSession
    from app.modules.events.models.speaker import Speaker
    from app.modules.identity.models.user import User
    from app.modules.integrations.models.integrations_domain_tables import IntegrationConnection
    from app.modules.platform.models.feature import FeatureCatalog
    from app.modules.platform.models.organization import Organization
    from app.modules.platform.models.organization_console import CapabilityRestriction, EntitlementOverrideRequest, EventCommercialContract, OrganizationNotificationChannelConfig, UsageCounterEpoch, UsageLedgerEntry, UsageReservation
    from app.modules.platform.models.platform_domain_tables import FeatureFlag, PlatformFlagDefinition, PlatformFlagOverride
    from app.modules.presentations.models.presentation_file import PresentationFile
    from app.modules.registration.models.participant import Participant
    from app.modules.registration.models.participant_registration import ParticipantRegistration
    from app.modules.registration.models.print_template import PrintTemplate

    global_models = (FeatureCatalog, PlatformFlagDefinition, PlatformFlagOverride, PlanFeature, AddonFeature, SubscriptionPlan, Addon)
    org_models = (Organization, FeatureFlag, OrganizationSubscription, OrganizationAddon, OrganizationNotificationChannelConfig, User, IntegrationConnection, ApiUsageMetric)
    event_models = (Event, EventCommercialContract, EventActivation, EventEntitlementSnapshotSet, Speaker, EventSession, Room, Participant, ParticipantRegistration, PresentationFile, PrintTemplate)
    metered_models = (UsageLedgerEntry, UsageReservation, UsageCounterEpoch)

    scopes: set[tuple[str, uuid.UUID, uuid.UUID | None]] = set()
    for instance in {*session.new, *session.dirty, *session.deleted}:
        if isinstance(instance, CapabilityRevision) or not _changed(session, instance):
            continue
        if isinstance(instance, global_models):
            scopes.add(_scope("GLOBAL", GLOBAL_SCOPE_ID))
        if isinstance(instance, org_models):
            organization_id = getattr(instance, "organization_id", None) or getattr(instance, "id", None)
            if isinstance(organization_id, uuid.UUID):
                scopes.add(_scope("ORGANIZATION", organization_id, organization_id))
        if isinstance(instance, event_models):
            event_id = getattr(instance, "event_id", None) or (getattr(instance, "id", None) if isinstance(instance, Event) else None)
            organization_id = getattr(instance, "organization_id", None)
            if isinstance(event_id, uuid.UUID):
                scopes.add(_scope("EVENT", event_id, organization_id if isinstance(organization_id, uuid.UUID) else None))
            if isinstance(organization_id, uuid.UUID):
                scopes.add(_scope("ORGANIZATION", organization_id, organization_id))
        if isinstance(instance, (EntitlementOverrideRequest, CapabilityRestriction, *metered_models)):
            organization_id = getattr(instance, "organization_id", None)
            event_id = getattr(instance, "event_id", None)
            if isinstance(event_id, uuid.UUID):
                scopes.add(_scope("EVENT", event_id, organization_id if isinstance(organization_id, uuid.UUID) else None))
            elif isinstance(organization_id, uuid.UUID):
                scopes.add(_scope("ORGANIZATION", organization_id, organization_id))
            else:
                scopes.add(_scope("GLOBAL", GLOBAL_SCOPE_ID))
    return scopes


def register_capability_revision_listeners() -> None:
    global _LISTENERS_REGISTERED
    if _LISTENERS_REGISTERED:
        return
    _LISTENERS_REGISTERED = True

    @sqlalchemy_event.listens_for(Session, "before_flush")
    def collect_capability_scopes(session: Session, _flush_context, _instances) -> None:
        scopes = _revision_scopes(session)
        if scopes:
            session.info.setdefault(_PENDING_KEY, set()).update(scopes)

    @sqlalchemy_event.listens_for(Session, "after_flush_postexec")
    def persist_capability_scopes(session: Session, _flush_context) -> None:
        scopes = session.info.pop(_PENDING_KEY, set())
        if not scopes:
            return
        now = datetime.now(timezone.utc)
        connection = session.connection()
        for scope_type, scope_id, organization_id in scopes:
            statement = insert(CapabilityRevision).values(
                id=uuid.uuid4(),
                scope_type=scope_type,
                scope_id=scope_id,
                organization_id=organization_id,
                revision=1,
                updated_at=now,
            ).on_conflict_do_update(
                constraint="uq_capability_revision_scope",
                set_={
                    "revision": CapabilityRevision.revision + 1,
                    "organization_id": organization_id,
                    "updated_at": now,
                },
            )
            connection.execute(statement)


class CapabilityCacheService:
    TTL_SECONDS = 300

    @staticmethod
    def has_pending_changes(db: AsyncSession) -> bool:
        session = db.sync_session
        return bool(session.new or session.dirty or session.deleted or session.info.get(_PENDING_KEY))

    @staticmethod
    async def revision_token(db: AsyncSession, organization_id: uuid.UUID, event_id: uuid.UUID | None = None) -> str:
        requested = [("GLOBAL", GLOBAL_SCOPE_ID), ("ORGANIZATION", organization_id)]
        if event_id:
            requested.append(("EVENT", event_id))
        rows = (await db.execute(
            select(CapabilityRevision.scope_type, CapabilityRevision.scope_id, CapabilityRevision.revision)
            .where(tuple_(CapabilityRevision.scope_type, CapabilityRevision.scope_id).in_(requested))
        )).all()
        revisions = {(scope_type, scope_id): revision for scope_type, scope_id, revision in rows}
        material = [(scope_type, str(scope_id), int(revisions.get((scope_type, scope_id), 0))) for scope_type, scope_id in requested]
        return hashlib.sha256(json.dumps(material, separators=(",", ":")).encode()).hexdigest()[:24]

    @staticmethod
    def _key(organization_id: uuid.UUID, event_id: uuid.UUID | None, revision: str, environment: str, user_id: uuid.UUID | None) -> str:
        subject = str(user_id or GLOBAL_SCOPE_ID)
        if event_id:
            return TenantCacheKey.event(event_id, "capabilities", environment.lower(), subject, revision, organization_id=organization_id)
        return TenantCacheKey.build("capabilities", "organization", environment.lower(), subject, revision, organization_id=organization_id)

    @staticmethod
    async def get(db: AsyncSession, organization_id: uuid.UUID, event_id: uuid.UUID | None, environment: str, user_id: uuid.UUID | None) -> tuple[str, dict[str, Any] | None]:
        revision = await CapabilityCacheService.revision_token(db, organization_id, event_id)
        if CapabilityCacheService.has_pending_changes(db):
            return revision, None
        try:
            from app.redis import redis_client
            raw = await asyncio.wait_for(redis_client.get(CapabilityCacheService._key(organization_id, event_id, revision, environment, user_id)), timeout=0.5)
            return revision, json.loads(raw) if raw else None
        except Exception:
            return revision, None

    @staticmethod
    async def put(organization_id: uuid.UUID, event_id: uuid.UUID | None, revision: str, environment: str, user_id: uuid.UUID | None, value: dict[str, Any]) -> None:
        try:
            from app.redis import redis_client
            payload = json.dumps(value, sort_keys=True, default=str, separators=(",", ":"))
            await asyncio.wait_for(redis_client.set(CapabilityCacheService._key(organization_id, event_id, revision, environment, user_id), payload, ex=CapabilityCacheService.TTL_SECONDS), timeout=0.5)
        except Exception:
            return
