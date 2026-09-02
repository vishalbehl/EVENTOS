"""Explicit, bounded query services for organization-console reads."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.events.models.event import Event
from app.modules.identity.models.security_event import SecurityEvent
from app.modules.identity.models.user import User
from app.modules.platform.models.organization_console import OrganizationLocation
from app.modules.platform.models.organization import Organization
from app.modules.platform.models.health import OrganizationHealth
from app.modules.analytics.models.usage import OrganizationUsage
from app.modules.billing.models.subscription import (
    OrganizationSubscription,
    OrganizationAddon,
    Addon,
    PlanFeature,
    OrganizationFeature,
    ActivityTimeline,
    SubscriptionPlan,
    RevenueMetric,
)
from app.modules.platform.models.feature import FeatureCatalog
from app.modules.billing.services.entitlement_resolver import EntitlementResolver
from app.modules.rbac.models.organization_member import OrganizationMember
from app.modules.registration.models.participant import Participant
from app.modules.registration.models.payment_transaction import PaymentTransaction
from app.modules.platform.models.maintenance_window import MaintenanceWindow
from app.modules.platform.models.platform_domain_tables import GlobalAnnouncement


@dataclass(frozen=True)
class OrganizationConsoleCounts:
    """Small projection used by the organization-console summary."""

    member_count: int
    event_count: int
    active_event_count: int
    active_user_count: int
    mfa_user_count: int
    location_count: int
    open_security_events: int


@dataclass(frozen=True)
class OrganizationEventProjection:
    """Explicit organization event row used by the platform event list."""

    id: uuid.UUID
    name: str
    short_code: str | None
    status: str
    start_date: object | None
    end_date: object | None
    registration_count: int


@dataclass(frozen=True)
class PlatformCoreDashboardMetrics:
    """Independent platform KPIs loaded in one aggregate projection."""

    total_orgs: int
    active_orgs: int
    trial_orgs: int
    total_users: int
    total_events: int
    total_active_events_usage: int
    total_regs: int
    total_storage: int
    mrr_current: float
    active_users_30d: int
    cancelled_this_month: int
    active_last_month: int
    events_this_month: int
    revenue_today: float


class PlatformCoreDashboardQueryService:
    """Read-only platform KPI projection; no transaction ownership or writes."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def metrics(
        self, *, current_period: str, month_start: datetime, thirty_days_ago: datetime
    ) -> PlatformCoreDashboardMetrics:
        scalar = lambda statement: statement.scalar_subquery()
        row = (
            await self.db.execute(
                select(
                    scalar(select(func.count(Organization.id))).label("total_orgs"),
                    scalar(select(func.count(Organization.id)).where(Organization.is_active.is_(True))).label("active_orgs"),
                    scalar(select(func.count(OrganizationSubscription.id)).where(OrganizationSubscription.status == "TRIAL")).label("trial_orgs"),
                    scalar(select(func.count(User.id))).label("total_users"),
                    scalar(select(func.count(Event.id))).label("total_events"),
                    scalar(select(func.coalesce(func.sum(OrganizationUsage.active_events_count), 0))).label("total_active_events_usage"),
                    scalar(select(func.coalesce(func.sum(OrganizationUsage.total_registrations_count), 0))).label("total_regs"),
                    scalar(select(func.coalesce(func.sum(OrganizationUsage.storage_used_bytes), 0))).label("total_storage"),
                    scalar(select(func.coalesce(func.sum(RevenueMetric.mrr), 0)).where(RevenueMetric.period == current_period)).label("mrr_current"),
                    scalar(select(func.count(User.id)).where(User.last_login_at >= thirty_days_ago)).label("active_users_30d"),
                    scalar(select(func.count(OrganizationSubscription.id)).where(
                        OrganizationSubscription.status == "CANCELLED",
                        OrganizationSubscription.updated_at >= month_start,
                    )).label("cancelled_this_month"),
                    scalar(select(func.count(OrganizationSubscription.id)).where(
                        OrganizationSubscription.status == "ACTIVE",
                        OrganizationSubscription.created_at <= month_start,
                    )).label("active_last_month"),
                    scalar(select(func.count(Event.id)).where(Event.created_at >= month_start)).label("events_this_month"),
                    scalar(select(func.coalesce(func.sum(PaymentTransaction.amount), 0)).where(
                        func.date(PaymentTransaction.created_at) == func.current_date(),
                        func.lower(PaymentTransaction.status) == "completed",
                    )).label("revenue_today"),
                )
            )
        ).mappings().one()
        return PlatformCoreDashboardMetrics(
            total_orgs=int(row["total_orgs"] or 0),
            active_orgs=int(row["active_orgs"] or 0),
            trial_orgs=int(row["trial_orgs"] or 0),
            total_users=int(row["total_users"] or 0),
            total_events=int(row["total_events"] or 0),
            total_active_events_usage=int(row["total_active_events_usage"] or 0),
            total_regs=int(row["total_regs"] or 0),
            total_storage=int(row["total_storage"] or 0),
            mrr_current=float(row["mrr_current"] or 0),
            active_users_30d=int(row["active_users_30d"] or 0),
            cancelled_this_month=int(row["cancelled_this_month"] or 0),
            active_last_month=int(row["active_last_month"] or 0),
            events_this_month=int(row["events_this_month"] or 0),
            revenue_today=float(row["revenue_today"] or 0),
        )


class OrganizationConsoleQueryService:
    """Read-only organization aggregates; callers own no hidden writes."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def counts(self, *, organization_id: uuid.UUID) -> OrganizationConsoleCounts:
        def count_for(model, *conditions):
            return select(func.count(model.id)).where(
                model.organization_id == organization_id, *conditions
            ).scalar_subquery()

        row = (
            await self.db.execute(
                select(
                    count_for(OrganizationMember).label("member_count"),
                    count_for(Event, Event.deleted_at.is_(None)).label("event_count"),
                    count_for(Event, Event.deleted_at.is_(None), Event.status == "active").label("active_event_count"),
                    count_for(User, User.deleted_at.is_(None), User.is_active.is_(True)).label("active_user_count"),
                    count_for(User, User.deleted_at.is_(None), User.is_active.is_(True), User.is_2fa_enabled.is_(True)).label("mfa_user_count"),
                    count_for(OrganizationLocation, OrganizationLocation.status == "ACTIVE").label("location_count"),
                    select(func.count(SecurityEvent.id)).where(
                        SecurityEvent.organization_id == organization_id,
                        SecurityEvent.risk_level.in_(["HIGH", "CRITICAL"]),
                    ).scalar_subquery().label("open_security_events"),
                )
            )
        ).mappings().one()
        return OrganizationConsoleCounts(**{key: int(row[key] or 0) for key in row.keys()})

    async def events_with_registration_counts(
        self, *, organization_id: uuid.UUID
    ) -> list[OrganizationEventProjection]:
        """Return one bounded aggregate read with no ORM graph loading."""
        rows = (
            await self.db.execute(
                select(
                    Event.id,
                    Event.name,
                    Event.short_code,
                    Event.status,
                    Event.start_date,
                    Event.end_date,
                    func.count(Participant.id).label("registration_count"),
                )
                .outerjoin(Participant, Participant.event_id == Event.id)
                .where(Event.organization_id == organization_id)
                .group_by(Event.id)
                .order_by(Event.start_date.desc().nullslast(), Event.id)
                .execution_options(skip_tenant_filter=True)
            )
        ).all()
        return [
            OrganizationEventProjection(
                id=row.id,
                name=row.name,
                short_code=row.short_code,
                status=row.status,
                start_date=row.start_date,
                end_date=row.end_date,
                registration_count=int(row.registration_count or 0),
            )
            for row in rows
        ]

    async def organization_list(self, *, skip: int = 0, limit: int = 100) -> list[dict]:
        """Return a bounded organization list using batched enrichment reads."""
        rows = (
            await self.db.execute(
                select(Organization, OrganizationHealth, OrganizationUsage)
                .outerjoin(OrganizationHealth, Organization.id == OrganizationHealth.organization_id)
                .outerjoin(OrganizationUsage, Organization.id == OrganizationUsage.organization_id)
                .order_by(Organization.created_at.desc(), Organization.id)
                .offset(skip)
                .limit(limit)
            )
        ).all()
        if not rows:
            return []

        organization_ids = [organization.id for organization, _, _ in rows]
        subscriptions = list((await self.db.scalars(
            select(OrganizationSubscription)
            .options(selectinload(OrganizationSubscription.plan))
            .where(OrganizationSubscription.organization_id.in_(organization_ids))
            .order_by(OrganizationSubscription.created_at.desc())
        )).all())
        subscription_by_org: dict[uuid.UUID, OrganizationSubscription] = {}
        for subscription in subscriptions:
            current = subscription_by_org.get(subscription.organization_id)
            preferred = subscription.status in {"ACTIVE", "TRIAL"}
            current_preferred = current is not None and current.status in {"ACTIVE", "TRIAL"}
            if current is None or (preferred and not current_preferred):
                subscription_by_org[subscription.organization_id] = subscription

        user_rows = (await self.db.execute(
            select(User.organization_id, func.count(User.id))
            .where(User.organization_id.in_(organization_ids))
            .group_by(User.organization_id)
        )).all()
        users_by_org = {organization_id: int(count or 0) for organization_id, count in user_rows}
        owner_rows = (await self.db.scalars(
            select(User)
            .where(User.organization_id.in_(organization_ids))
            .order_by(User.created_at.asc())
        )).all()
        owner_by_org: dict[uuid.UUID, User] = {}
        preferred_by_org: dict[uuid.UUID, User] = {}
        for user in owner_rows:
            owner_by_org.setdefault(user.organization_id, user)
            if user.role in {"owner", "admin", "super_admin"}:
                preferred_by_org.setdefault(user.organization_id, user)

        result = []
        for organization, health, usage in rows:
            subscription = subscription_by_org.get(organization.id)
            owner = preferred_by_org.get(organization.id) or owner_by_org.get(organization.id)
            result.append({
                "id": organization.id,
                "name": organization.name,
                "slug": organization.slug,
                "plan": subscription.plan.name if subscription and subscription.plan else "NONE",
                "status": subscription.status if subscription else "TRIAL",
                "health_score": health.health_score if health else None,
                "health_status": health.status if health else "NOT_MEASURED",
                "created_at": organization.created_at,
                "events_count": usage.active_events_count if usage else 0,
                "users_count": users_by_org.get(organization.id, 0),
                "created_by": f"{owner.first_name} {owner.last_name}" if owner else "—",
                "mrr": None,
            })
        return result

    async def organization_detail(self, *, organization_id: uuid.UUID) -> dict | None:
        organization = await self.db.scalar(select(Organization).where(Organization.id == organization_id))
        if organization is None:
            return None
        subscription = await self.db.scalar(
            select(OrganizationSubscription)
            .options(selectinload(OrganizationSubscription.plan))
            .where(OrganizationSubscription.organization_id == organization_id)
            .order_by(OrganizationSubscription.status.in_(["ACTIVE", "TRIAL"]).desc(), OrganizationSubscription.created_at.desc())
            .limit(1)
        )
        health = await self.db.scalar(select(OrganizationHealth).where(OrganizationHealth.organization_id == organization_id))
        max_events = await EntitlementResolver.get_limit(self.db, organization_id, "max_events")
        max_users = await EntitlementResolver.get_limit(self.db, organization_id, "max_users")
        storage_quota_mb = await EntitlementResolver.get_limit(self.db, organization_id, "storage_quota_mb")
        limits = (max_events, max_users, storage_quota_mb)
        availability = "AVAILABLE" if all(value is not None for value in limits) else "UNAVAILABLE" if all(value is None for value in limits) else "PARTIAL"
        return {
            "id": organization.id, "name": organization.name, "slug": organization.slug,
            "domain": organization.custom_domain, "created_at": organization.created_at,
            "max_events": max_events, "max_users": max_users,
            "max_storage_gb": storage_quota_mb / 1024 if storage_quota_mb is not None else None,
            "commercial": {"source": "CANONICAL_ENTITLEMENT_RESOLVER", "availability": availability,
                           "limits": {"max_events": max_events, "max_users": max_users, "storage_quota_mb": storage_quota_mb}},
            "country": organization.country, "timezone": organization.timezone,
            "subscription": {"plan": subscription.plan.name if subscription and subscription.plan else None,
                              "status": subscription.status if subscription else "NOT_CONFIGURED",
                              "current_period_end": subscription.current_period_end if subscription else None,
                              "stripe_customer_id": subscription.stripe_customer_id if subscription else None},
            "health": {"score": health.health_score if health else None,
                       "status": health.status if health else "NOT_MEASURED",
                       "warnings": health.warnings if health else []},
        }

    async def organization_features(self, *, organization_id: uuid.UUID) -> list[dict]:
        subscription = await self.db.scalar(select(OrganizationSubscription).where(OrganizationSubscription.organization_id == organization_id).order_by(OrganizationSubscription.created_at.desc()).limit(1))
        plan_feature_keys: set[str] = set()
        if subscription and subscription.plan_id:
            plan_feature_keys = set((await self.db.scalars(select(FeatureCatalog.key).join(PlanFeature).where(PlanFeature.plan_id == subscription.plan_id, PlanFeature.enabled.is_(True)))).all())
        overrides = {row.feature_id: row.is_enabled for row in (await self.db.scalars(select(OrganizationFeature).where(OrganizationFeature.organization_id == organization_id))).all()}
        catalog = list((await self.db.scalars(select(FeatureCatalog))).all())
        return [{"id": str(feature.id), "key": feature.key, "name": feature.name, "description": feature.description,
                 "category": feature.category, "plan_enabled": feature.key in plan_feature_keys,
                 "override_enabled": overrides.get(feature.id),
                 "is_enabled": overrides.get(feature.id) if feature.id in overrides else feature.key in plan_feature_keys} for feature in catalog]

    async def organization_addons(self, *, organization_id: uuid.UUID) -> list[dict]:
        rows = (await self.db.execute(select(OrganizationAddon, Addon).join(Addon).where(OrganizationAddon.organization_id == organization_id))).all()
        return [{"addon_id": addon.id, "name": addon.name, "status": organization_addon.status, "purchased_at": organization_addon.purchased_at} for organization_addon, addon in rows]

    async def organization_usage(self, *, organization_id: uuid.UUID) -> dict:
        usage = await self.db.get(OrganizationUsage, organization_id)
        if not usage:
            return {"active_events_count": 0, "active_users_count": 0, "total_registrations_count": 0, "storage_used_bytes": 0}
        return {"active_events_count": usage.active_events_count, "active_users_count": usage.active_users_count,
                "total_registrations_count": usage.total_registrations_count, "storage_used_bytes": usage.storage_used_bytes,
                "last_calculated_at": usage.last_calculated_at}

    async def organization_timeline(self, *, organization_id: uuid.UUID, limit: int = 50) -> list[dict]:
        rows = (await self.db.scalars(select(ActivityTimeline).where(ActivityTimeline.organization_id == organization_id).order_by(ActivityTimeline.timestamp.desc()).limit(min(max(limit, 1), 100)))).all()
        return [{"id": row.id, "action_type": row.action_type, "actor_id": row.actor_id, "timestamp": row.timestamp, "metadata": row.metadata_data} for row in rows]

    async def payment_events(self, *, limit: int = 10) -> list[dict]:
        """Return a bounded global billing activity projection for platform admins."""
        bounded_limit = max(1, min(limit, 100))
        rows = (await self.db.execute(
            select(
                ActivityTimeline.id,
                ActivityTimeline.organization_id,
                Organization.name.label("organization_name"),
                ActivityTimeline.action_type,
                ActivityTimeline.timestamp,
                ActivityTimeline.metadata_data,
            ).join(
                Organization, Organization.id == ActivityTimeline.organization_id
            ).order_by(
                ActivityTimeline.timestamp.desc(), ActivityTimeline.id.desc()
            ).limit(bounded_limit)
        )).mappings().all()
        return [{
            "id": str(row["id"]),
            "organization_id": str(row["organization_id"]),
            "organization_name": row["organization_name"],
            "action_type": row["action_type"],
            "timestamp": row["timestamp"].isoformat(),
            "metadata": row["metadata_data"] if isinstance(row["metadata_data"], dict) else {},
        } for row in rows]


class PlatformCommunicationsQueryService:
    """Read-only, bounded platform announcement and maintenance queries."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_announcements(self, *, is_active: bool | None = None) -> list[GlobalAnnouncement]:
        statement = select(GlobalAnnouncement).order_by(GlobalAnnouncement.created_at.desc(), GlobalAnnouncement.id)
        if is_active is not None:
            statement = statement.where(GlobalAnnouncement.is_active.is_(is_active))
        return list((await self.db.scalars(statement.limit(100))).all())


class PlatformCommercialCatalogQueryService:
    """Read-only platform catalogue projections for super-admin screens."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_subscription_plans(self, *, mrr_period: str) -> list[dict]:
        plans = list(
            (
                await self.db.scalars(
                    select(SubscriptionPlan)
                    .order_by(SubscriptionPlan.display_order.asc())
                    .limit(200)
                )
            ).all()
        )
        if not plans:
            return []
        plan_ids = [plan.id for plan in plans]
        subscriber_rows = (
            await self.db.execute(
                select(
                    OrganizationSubscription.plan_id,
                    func.count(OrganizationSubscription.id),
                )
                .where(
                    OrganizationSubscription.plan_id.in_(plan_ids),
                    OrganizationSubscription.status.in_(["ACTIVE", "TRIAL"]),
                )
                .group_by(OrganizationSubscription.plan_id)
            )
        ).all()
        mrr_rows = (
            await self.db.execute(
                select(
                    OrganizationSubscription.plan_id,
                    func.coalesce(func.sum(RevenueMetric.mrr), 0),
                )
                .join(
                    RevenueMetric,
                    RevenueMetric.organization_id
                    == OrganizationSubscription.organization_id,
                )
                .where(
                    OrganizationSubscription.plan_id.in_(plan_ids),
                    RevenueMetric.period == mrr_period,
                )
                .group_by(OrganizationSubscription.plan_id)
            )
        ).all()
        subscribers = {plan_id: int(count or 0) for plan_id, count in subscriber_rows}
        mrr = {plan_id: float(value or 0) for plan_id, value in mrr_rows}
        return [
            {
                "id": plan.id,
                "name": plan.name,
                "tagline": plan.tagline,
                "description": plan.description,
                "billing_model": plan.billing_model,
                "currency": plan.currency,
                "price_per_event": float(plan.price_per_event) if plan.price_per_event is not None else None,
                "price_display": plan.price_display,
                "max_events": plan.max_events,
                "max_users": plan.max_users,
                "max_registrations": plan.max_registrations,
                "max_speakers": plan.max_speakers,
                "max_sessions": plan.max_sessions,
                "max_rooms": plan.max_rooms,
                "max_ticket_categories": plan.max_ticket_categories,
                "max_badge_templates": plan.max_badge_templates,
                "max_certificate_templates": plan.max_certificate_templates,
                "max_emails_per_event": plan.max_emails_per_event,
                "storage_quota_mb": plan.storage_quota_mb,
                "display_order": plan.display_order,
                "is_popular": plan.is_popular,
                "color_hex": plan.color_hex,
                "is_active": plan.is_active,
                "version": plan.version,
                "lifecycle_status": plan.lifecycle_status,
                "effective_at": plan.effective_at,
                "retired_at": plan.retired_at,
                "created_at": plan.created_at,
                "subscribers_count": subscribers.get(plan.id, 0),
                "mrr": mrr.get(plan.id, 0.0),
            }
            for plan in plans
        ]

    async def features_matrix(self) -> list[dict]:
        features = list(
            (
                await self.db.scalars(
                    select(FeatureCatalog)
                    .where(FeatureCatalog.is_active.is_(True))
                    .order_by(
                        FeatureCatalog.category_order.asc(),
                        FeatureCatalog.feature_order.asc(),
                    )
                    .limit(1000)
                )
            ).all()
        )
        categories: dict[str, dict] = {}
        for feature in features:
            category = feature.category or "GENERAL"
            group = categories.setdefault(
                category,
                {
                    "category": category,
                    "category_name": category.replace("_", " ").title(),
                    "features": [],
                },
            )
            group["features"].append(
                {
                    "key": feature.key,
                    "name": feature.name,
                    "description": feature.description,
                    "value_type": feature.value_type,
                    "scope_type": feature.scope_type,
                    "enforcement_mode": feature.enforcement_mode,
                    "default_value": feature.default_value,
                    "allowed_values": feature.allowed_values or [],
                    "unit": feature.unit,
                    "period": feature.period,
                    "version": feature.version,
                }
            )
        return list(categories.values())

    async def get_announcement(self, *, announcement_id: uuid.UUID) -> GlobalAnnouncement | None:
        return await self.db.get(GlobalAnnouncement, announcement_id)

    async def list_maintenance_windows(self, *, status: str | None = None) -> list[MaintenanceWindow]:
        statement = select(MaintenanceWindow).order_by(MaintenanceWindow.starts_at.desc(), MaintenanceWindow.id)
        if status:
            statement = statement.where(MaintenanceWindow.status == status)
        return list((await self.db.scalars(statement.limit(100))).all())
