"""Explicit, bounded query services for organization-console reads."""

from __future__ import annotations

import uuid
import base64
import binascii
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import Float, case, cast, func, literal, or_, select, text, union_all
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import load_only, selectinload

from app.modules.agenda.models import Room, Session
from app.modules.events.models.event import Event
from app.modules.events.models.speaker import Speaker
from app.modules.identity.models.security_event import SecurityEvent
from app.modules.identity.models.user import User
from app.modules.identity.models.refresh_token import RefreshToken
from app.schemas.cursor_pagination import CursorPage, decode_cursor, encode_cursor
from app.modules.platform.models.organization_console import (
    OrganizationLocation,
    OrganizationBrandProfile,
    OrganizationNotificationChannelConfig,
    OrganizationTeam,
    OrganizationLifecycleJob,
    OrganizationFinancialAdjustment,
    PrivilegedAccessSession,
    CapabilityRestriction,
    EntitlementOverrideRequest,
    EventCommercialContract,
    OrganizationComplianceControl,
    OrganizationComplianceEvidence,
    UsageLedgerEntry,
    UsageReconciliationRun,
    CapabilityDiagnosticEvent,
    EntitlementShadowComparison,
)
from app.modules.platform.models.organization import Organization
from app.modules.platform.models.health import OrganizationHealth
from app.modules.analytics.models.usage import OrganizationUsage
from app.modules.billing.models.commercial_support import (
    OrganizationFeature,
    ActivityTimeline,
    RevenueMetric,
)
from app.modules.billing.models.cloud_commercial import (
    CommercialAccount,
    CommercialAccountWorkspace,
    CommercialOffer,
    CommercialOfferVersion,
    CommercialOfferEntitlement,
    CommercialContract,
    CommercialContractItem,
)
from app.modules.billing.models.licensing import EntitlementGrant
from app.modules.billing.models.event_activation import EventActivation
from app.modules.billing.models.billing_domain_tables import InvoiceItem
from app.modules.billing.models.payment_gateway import PaymentGateway
from app.modules.platform.models.feature import FeatureCatalog
from app.modules.billing.services.entitlement_resolver import EntitlementResolver
from app.modules.rbac.models.organization_member import OrganizationMember
from app.modules.registration.models.participant import Participant
from app.modules.registration.models.payment_transaction import PaymentTransaction
from app.modules.registration.models.participant_registration import ParticipantRegistration
from app.modules.presentations.models.presentation_file import PresentationFile
from app.modules.audit.models.audit_domain_tables import DataExport
from app.modules.presentations.models.presentations_domain_tables import PresentationProcessingJob
from app.modules.registration.models.import_job import ImportJob
from app.modules.venue.models.venue_sync_job import VenueSyncJob
from app.modules.platform.models.maintenance_window import MaintenanceWindow
from app.modules.platform.models.platform_domain_tables import GlobalAnnouncement, TenantLimit
from app.modules.platform.models.platform_domain_tables import FeatureFlag, PlatformFlagDefinition, PlatformFlagOverride
from app.modules.integrations.models.integrations_domain_tables import IntegrationConnection
from app.modules.developer.models.developer_registry import ApiKey
from app.modules.audit.models.audit_domain_tables import ImpersonationLog
from app.modules.audit.models.audit_domain_tables import DataExport
from app.modules.support.models.ticket import SupportTicket
from app.config import settings


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
    team_count: int
    connection_count: int
    api_key_count: int
    branding_profile_count: int
    notification_channel_count: int


class PlatformUserQueryService:
    """Bounded, cursor-ordered platform user projections."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def cursor_page(
        self,
        *,
        cursor: str | None = None,
        limit: int = 20,
        search: str | None = None,
        role: str | None = None,
        organization_id: uuid.UUID | None = None,
        two_fa_enabled: bool | None = None,
        is_active: bool | None = None,
    ) -> CursorPage[dict]:
        bounded_limit = max(1, min(limit, 100))
        filters = [User.deleted_at.is_(None)]
        if search and search.strip():
            needle = f"%{search.strip()}%"
            filters.append(or_(
                User.email.ilike(needle),
                User.first_name.ilike(needle),
                User.last_name.ilike(needle),
            ))
        if role:
            filters.append(or_(User.role == role, User.platform_role == role))
        if organization_id:
            filters.append(User.organization_id == organization_id)
        if two_fa_enabled is not None:
            filters.append(User.is_2fa_enabled == two_fa_enabled)
        if is_active is not None:
            filters.append(User.is_active == is_active)
        if cursor:
            position = decode_cursor(cursor)
            filters.append(or_(
                User.created_at < position.occurred_at,
                (User.created_at == position.occurred_at) & (User.id < position.record_id),
            ))

        rows = list((await self.db.execute(
            select(
                User.id, User.first_name, User.last_name, User.email,
                User.role, User.platform_role, User.organization_id,
                User.is_active, User.is_2fa_enabled, User.last_login_at,
                User.created_at, User.version,
            )
            .where(*filters)
            .order_by(User.created_at.desc(), User.id.desc())
            .limit(bounded_limit + 1)
        )).mappings().all())
        page_rows = rows[:bounded_limit]
        user_ids = [row["id"] for row in page_rows]
        org_ids = [row["organization_id"] for row in page_rows if row["organization_id"]]
        session_counts: dict[uuid.UUID, int] = {}
        risk_scores: dict[uuid.UUID, int] = {}
        org_names: dict[uuid.UUID, str] = {}
        if user_ids:
            session_rows = (await self.db.execute(
                select(RefreshToken.user_id, func.count().label("count"))
                .where(
                    RefreshToken.user_id.in_(user_ids),
                    RefreshToken.is_revoked.is_(False),
                    RefreshToken.expires_at > datetime.now(timezone.utc),
                )
                .group_by(RefreshToken.user_id)
            )).all()
            session_counts = {row.user_id: int(row.count) for row in session_rows}
            risk_rows = (await self.db.execute(
                select(
                    SecurityEvent.user_id,
                    func.sum(case(
                        (SecurityEvent.risk_level == "CRITICAL", 40),
                        (SecurityEvent.risk_level == "HIGH", 20),
                        (SecurityEvent.risk_level == "MEDIUM", 10),
                        else_=2,
                    )).label("risk_score"),
                )
                .where(
                    SecurityEvent.user_id.in_(user_ids),
                    SecurityEvent.occurred_at >= datetime.now(timezone.utc) - timedelta(days=30),
                )
                .group_by(SecurityEvent.user_id)
            )).all()
            risk_scores = {row.user_id: min(int(row.risk_score or 0), 100) for row in risk_rows}
        if org_ids:
            org_rows = (await self.db.execute(
                select(Organization.id, Organization.name).where(Organization.id.in_(org_ids))
            )).all()
            org_names = {row.id: row.name for row in org_rows}
        items = [
            {
                **dict(row),
                "organization_name": org_names.get(row["organization_id"], "—"),
                "active_sessions": session_counts.get(row["id"], 0),
                "risk_score": risk_scores.get(row["id"], 0),
            }
            for row in page_rows
        ]
        next_cursor = (
            encode_cursor(page_rows[-1]["created_at"], page_rows[-1]["id"])
            if len(rows) > bounded_limit and page_rows else None
        )
        return CursorPage(items=items, next_cursor=next_cursor, has_next=bool(next_cursor))

    async def offset_page(
        self,
        *,
        skip: int = 0,
        limit: int = 20,
        search: str | None = None,
        role: str | None = None,
        organization_id: uuid.UUID | None = None,
        two_fa_enabled: bool | None = None,
        is_active: bool | None = None,
    ) -> dict:
        """Serve the legacy global-user response from bounded projections."""
        bounded_skip = max(0, skip)
        bounded_limit = max(1, min(limit, 100))
        filters = [User.deleted_at.is_(None)]
        if search and search.strip():
            needle = f"%{search.strip()}%"
            filters.append(or_(User.email.ilike(needle), User.first_name.ilike(needle), User.last_name.ilike(needle)))
        if role:
            filters.append(or_(User.role == role, User.platform_role == role))
        if organization_id:
            filters.append(User.organization_id == organization_id)
        if two_fa_enabled is not None:
            filters.append(User.is_2fa_enabled == two_fa_enabled)
        if is_active is not None:
            filters.append(User.is_active == is_active)

        total = int(await self.db.scalar(select(func.count(User.id)).where(*filters)) or 0)
        rows = list((await self.db.execute(
            select(User.id, User.first_name, User.last_name, User.email, User.role,
                   User.platform_role, User.organization_id, User.is_active,
                   User.is_2fa_enabled, User.last_login_at, User.created_at, User.version)
            .where(*filters)
            .order_by(User.created_at.desc(), User.id.desc())
            .offset(bounded_skip)
            .limit(bounded_limit)
        )).mappings().all())
        user_ids = [row["id"] for row in rows]
        org_ids = [row["organization_id"] for row in rows if row["organization_id"]]
        session_counts: dict[uuid.UUID, int] = {}
        risk_scores: dict[uuid.UUID, int] = {}
        org_names: dict[uuid.UUID, str] = {}
        if user_ids:
            session_rows = (await self.db.execute(
                select(RefreshToken.user_id, func.count().label("count"))
                .where(RefreshToken.user_id.in_(user_ids), RefreshToken.is_revoked.is_(False),
                       RefreshToken.expires_at > datetime.now(timezone.utc))
                .group_by(RefreshToken.user_id)
            )).all()
            session_counts = {row.user_id: int(row.count) for row in session_rows}
            risk_rows = (await self.db.execute(
                select(SecurityEvent.user_id, func.sum(case(
                    (SecurityEvent.risk_level == "CRITICAL", 40),
                    (SecurityEvent.risk_level == "HIGH", 20),
                    (SecurityEvent.risk_level == "MEDIUM", 10), else_=2,
                )).label("risk_score"))
                .where(SecurityEvent.user_id.in_(user_ids),
                       SecurityEvent.occurred_at >= datetime.now(timezone.utc) - timedelta(days=30))
                .group_by(SecurityEvent.user_id)
            )).all()
            risk_scores = {row.user_id: min(int(row.risk_score or 0), 100) for row in risk_rows}
        if org_ids:
            org_rows = (await self.db.execute(
                select(Organization.id, Organization.name).where(Organization.id.in_(org_ids))
            )).all()
            org_names = {row.id: row.name for row in org_rows}
        items = [{
            "id": str(row["id"]), "first_name": row["first_name"], "last_name": row["last_name"],
            "email": row["email"], "role": row["role"], "platform_role": row["platform_role"],
            "version": row["version"],
            "organization_id": str(row["organization_id"]) if row["organization_id"] else None,
            "organization_name": org_names.get(row["organization_id"], "—"),
            "is_active": row["is_active"], "is_2fa_enabled": row["is_2fa_enabled"],
            "last_login": row["last_login_at"].isoformat() if row["last_login_at"] else None,
            "created_at": row["created_at"].isoformat(),
            "active_sessions": session_counts.get(row["id"], 0), "risk_score": risk_scores.get(row["id"], 0),
        } for row in rows]
        summary = {
            "total_users": int(await self.db.scalar(select(func.count(User.id)).where(User.deleted_at.is_(None))) or 0),
            "active_users": int(await self.db.scalar(select(func.count(User.id)).where(User.deleted_at.is_(None), User.is_active.is_(True))) or 0),
            "two_fa_enabled": int(await self.db.scalar(select(func.count(User.id)).where(User.deleted_at.is_(None), User.is_2fa_enabled.is_(True))) or 0),
            "total_admins": int(await self.db.scalar(select(func.count(User.id)).where(User.deleted_at.is_(None), User.platform_role.in_(("SUPER_ADMIN", "FINANCE_ADMIN", "SUPPORT_ADMIN")))) or 0),
            "active_impersonations": int(await self.db.scalar(select(func.count(ImpersonationLog.id)).where(ImpersonationLog.terminated_at.is_(None))) or 0),
        }
        return {"items": items, "total": total, "summary": summary}


@dataclass(frozen=True)
class CommercialExportRead:
    """Explicit tenant-scoped projection used by commercial report reads."""

    id: uuid.UUID
    organization_id: uuid.UUID
    export_type: str
    status: str
    file_format: str
    created_at: datetime
    completed_at: datetime | None
    expires_at: datetime | None
    failure_reason: str | None
    storage_key: str | None


class PlatformReportQueryService:
    """Read-only, bounded commercial-export projections."""

    def __init__(self, db: AsyncSession):
        self.db = db

    @staticmethod
    def _columns():
        return (
            DataExport.id,
            DataExport.organization_id,
            DataExport.export_type,
            DataExport.status,
            DataExport.file_format,
            DataExport.created_at,
            DataExport.completed_at,
            DataExport.expires_at,
            DataExport.failure_reason,
            DataExport.storage_key,
        )

    async def list_commercial_exports(
        self,
        *,
        organization_id: uuid.UUID,
        export_type: str | None = None,
        limit: int = 50,
    ) -> list[CommercialExportRead]:
        bounded_limit = max(1, min(limit, 100))
        filters = [
            DataExport.organization_id == organization_id,
            DataExport.source_type == "commercial_report",
        ]
        if export_type:
            filters.append(DataExport.export_type == export_type)
        rows = (await self.db.execute(
            select(*self._columns())
            .where(*filters)
            .order_by(DataExport.created_at.desc(), DataExport.id.desc())
            .limit(bounded_limit)
        )).mappings().all()
        return [CommercialExportRead(**dict(row)) for row in rows]

    async def get_commercial_export(
        self,
        *,
        organization_id: uuid.UUID,
        export_id: uuid.UUID,
    ) -> CommercialExportRead | None:
        row = (await self.db.execute(
            select(*self._columns()).where(
                DataExport.id == export_id,
                DataExport.organization_id == organization_id,
                DataExport.source_type == "commercial_report",
            )
        )).mappings().one_or_none()
        return CommercialExportRead(**dict(row)) if row else None


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
        row = (await self.db.execute(select(
            scalar(select(func.count(Organization.id))).label("total_orgs"),
            scalar(select(func.count(Organization.id)).where(Organization.is_active.is_(True))).label("active_orgs"),
            scalar(select(func.count(CommercialContract.id)).where(
                CommercialContract.status == "PENDING_PAYMENT"
            )).label("trial_orgs"),
            scalar(select(func.count(User.id))).label("total_users"),
            scalar(select(func.count(Event.id))).label("total_events"),
            scalar(select(func.coalesce(func.sum(OrganizationUsage.active_events_count), 0))).label("total_active_events_usage"),
            scalar(select(func.coalesce(func.sum(OrganizationUsage.total_registrations_count), 0))).label("total_regs"),
            scalar(select(func.coalesce(func.sum(OrganizationUsage.storage_used_bytes), 0))).label("total_storage"),
            scalar(select(func.coalesce(func.sum(RevenueMetric.mrr), 0)).where(
                RevenueMetric.period == current_period
            )).label("mrr_current"),
            scalar(select(func.count(User.id)).where(User.last_login_at >= thirty_days_ago)).label("active_users_30d"),
            scalar(select(func.count(CommercialContract.id)).where(
                CommercialContract.status == "CANCELLED",
                CommercialContract.updated_at >= month_start,
            )).label("cancelled_this_month"),
            scalar(select(func.count(CommercialContract.id)).where(
                CommercialContract.status == "ACTIVE",
                CommercialContract.created_at <= month_start,
            )).label("active_last_month"),
            scalar(select(func.count(Event.id)).where(Event.created_at >= month_start)).label("events_this_month"),
            scalar(select(func.coalesce(func.sum(PaymentTransaction.amount), 0)).where(
                func.date(PaymentTransaction.created_at) == func.current_date(),
                func.lower(PaymentTransaction.status) == "completed",
            )).label("revenue_today"),
        ))).mappings().one()
        return PlatformCoreDashboardMetrics(**{
            "total_orgs": int(row["total_orgs"] or 0),
            "active_orgs": int(row["active_orgs"] or 0),
            "trial_orgs": int(row["trial_orgs"] or 0),
            "total_users": int(row["total_users"] or 0),
            "total_events": int(row["total_events"] or 0),
            "total_active_events_usage": int(row["total_active_events_usage"] or 0),
            "total_regs": int(row["total_regs"] or 0),
            "total_storage": int(row["total_storage"] or 0),
            "mrr_current": float(row["mrr_current"] or 0),
            "active_users_30d": int(row["active_users_30d"] or 0),
            "cancelled_this_month": int(row["cancelled_this_month"] or 0),
            "active_last_month": int(row["active_last_month"] or 0),
            "events_this_month": int(row["events_this_month"] or 0),
            "revenue_today": float(row["revenue_today"] or 0),
        })

    async def revenue_metrics(self, *, months: int = 12) -> list[dict]:
        rows = (await self.db.execute(select(
            RevenueMetric.period,
            func.sum(RevenueMetric.mrr).label("total_mrr"),
            func.sum(RevenueMetric.arr).label("total_arr"),
            func.sum(RevenueMetric.add_on_revenue).label("total_addon"),
        ).group_by(RevenueMetric.period).order_by(RevenueMetric.period.desc()).limit(
            max(1, min(months, 24))
        ))).all()
        return [{
            "period": row.period,
            "mrr": float(row.total_mrr or 0),
            "arr": float(row.total_arr or 0),
            "addon_revenue": float(row.total_addon or 0),
        } for row in reversed(rows)]

    async def open_support_ticket_count(self) -> int:
        return int(await self.db.scalar(select(func.count(SupportTicket.id)).where(
            ~func.upper(SupportTicket.status).in_(("RESOLVED", "CLOSED"))
        )) or 0)

    async def daily_payment_revenue(self, *, since: datetime) -> dict[object, float]:
        rows = (await self.db.execute(select(
            func.date(PaymentTransaction.created_at).label("day"),
            func.coalesce(func.sum(PaymentTransaction.amount), 0).label("revenue"),
        ).where(
            PaymentTransaction.created_at >= since,
            func.lower(PaymentTransaction.status) == "completed",
        ).group_by(func.date(PaymentTransaction.created_at)).order_by(
            func.date(PaymentTransaction.created_at).asc()
        ))).all()
        return {row.day: float(row.revenue or 0) for row in rows}

    async def top_organizations_by_mrr(self, *, period: str, limit: int = 5) -> list[dict]:
        rows = (await self.db.execute(text("""
            SELECT rm.organization_id, o.name AS organization_name,
                   SUM(rm.mrr) AS mrr, COALESCE(MAX(co.display_name), 'Unassigned') AS offer_name
            FROM commerce.revenue_metrics rm
            JOIN platform.organizations o ON o.id = rm.organization_id
            LEFT JOIN commerce.billing_accounts ca ON ca.owner_organization_id = rm.organization_id
            LEFT JOIN commerce.plan_contracts cc ON cc.commercial_account_id = ca.id
            LEFT JOIN commerce.contract_items ci ON ci.contract_id = cc.id
            LEFT JOIN commerce.plans co ON co.id = ci.offer_id
            WHERE rm.period = :period
            GROUP BY rm.organization_id, o.name
            ORDER BY SUM(rm.mrr) DESC, rm.organization_id
            LIMIT :limit
        """), {"period": period, "limit": max(1, min(limit, 20))})).mappings().all()
        return [{
            "org_id": str(row["organization_id"]),
            "org_name": row["organization_name"],
            "mrr": float(row["mrr"] or 0),
            "offer_name": row["offer_name"],
        } for row in rows]

    async def contract_status_counts(self) -> dict[str, int]:
        rows = (await self.db.execute(select(
            CommercialContract.status, func.count(CommercialContract.id)
        ).group_by(CommercialContract.status))).all()
        return {str(status or "").upper(): int(count or 0) for status, count in rows}

    async def recent_billing_activity(self, *, limit: int = 10) -> list[dict]:
        rows = (await self.db.execute(select(
            ActivityTimeline.action_type,
            ActivityTimeline.metadata_data,
            ActivityTimeline.timestamp,
            Organization.name.label("organization_name"),
            Organization.id.label("organization_id"),
        ).join(
            Organization, Organization.id == ActivityTimeline.organization_id
        ).order_by(ActivityTimeline.timestamp.desc(), ActivityTimeline.id.desc()).limit(
            max(1, min(limit, 50))
        ))).all()
        return [{
            "org_id": str(row.organization_id),
            "org_name": row.organization_name,
            "action": row.action_type,
            "amount": float(row.metadata_data.get("amount")) if isinstance(row.metadata_data, dict) and row.metadata_data.get("amount") is not None else None,
            "occurred_at": row.timestamp.isoformat(),
        } for row in rows]

    async def contracts_expiring(self, *, before: datetime, limit: int = 100) -> list[dict]:
        rows = (await self.db.execute(text("""
            SELECT ca.owner_organization_id AS organization_id, o.name AS organization_name,
                   COALESCE(MAX(co.display_name), 'Commercial contract') AS offer_name,
                   cc.ends_at
            FROM commerce.plan_contracts cc
            JOIN commerce.billing_accounts ca ON ca.id = cc.commercial_account_id
            JOIN platform.organizations o ON o.id = ca.owner_organization_id
            LEFT JOIN commerce.contract_items ci ON ci.contract_id = cc.id
            LEFT JOIN commerce.plans co ON co.id = ci.offer_id
            WHERE cc.status IN ('ACTIVE', 'PENDING_PAYMENT')
              AND cc.ends_at IS NOT NULL
              AND cc.ends_at <= :before
            GROUP BY ca.owner_organization_id, o.name, cc.id, cc.ends_at
            ORDER BY cc.ends_at ASC
            LIMIT :limit
        """), {"before": before, "limit": max(1, min(limit, 200))})).mappings().all()
        today = datetime.now(timezone.utc).date()
        return [{
            "org_id": str(row["organization_id"]),
            "org_name": row["organization_name"],
            "offer_name": row["offer_name"],
            "contract_ends_at": row["ends_at"].isoformat(),
            "days_remaining": max(0, (row["ends_at"].date() - today).days),
        } for row in rows]

    async def seven_day_trends(self, *, since: datetime) -> dict[str, dict[object, float]]:
        trends = {"orgs": {}, "users": {}, "events": {}, "mrr": {}}
        for model, key, value in (
            (Organization, "orgs", Organization.id),
            (User, "users", User.id),
            (Event, "events", Event.id),
        ):
            rows = (await self.db.execute(select(
                func.date(model.created_at).label("day"), func.count(value).label("count")
            ).where(model.created_at >= since).group_by(func.date(model.created_at)))).all()
            trends[key] = {row.day: float(row.count or 0) for row in rows}
        rows = (await self.db.execute(select(
            func.date(RevenueMetric.created_at).label("day"),
            func.coalesce(func.sum(RevenueMetric.mrr), 0).label("mrr"),
        ).where(RevenueMetric.created_at >= since).group_by(func.date(
            RevenueMetric.created_at
        )))).all()
        trends["mrr"] = {row.day: float(row.mrr or 0) for row in rows}
        return trends

    async def payment_gateway_health(self) -> dict[str, list]:
        try:
            gateways = list((await self.db.scalars(select(PaymentGateway).options(load_only(
                PaymentGateway.id, PaymentGateway.gateway_name, PaymentGateway.provider,
                PaymentGateway.mode, PaymentGateway.is_active, PaymentGateway.success_rate_30d,
                PaymentGateway.transactions_mtd, PaymentGateway.volume_mtd_inr,
                PaymentGateway.last_health_check, PaymentGateway.health_status,
            )).order_by(PaymentGateway.gateway_name.asc()).limit(50))).all())
            return {
                "items": [{
                    "id": str(gateway.id), "name": gateway.gateway_name,
                    "provider": gateway.provider, "mode": gateway.mode,
                    "is_active": gateway.is_active,
                    "success_rate": float(gateway.success_rate_30d or 100),
                    "transactions_count": gateway.transactions_mtd,
                    "volume_mtd_inr": float(gateway.volume_mtd_inr or 0),
                    "last_checked_at": gateway.last_health_check.isoformat() if gateway.last_health_check else None,
                    "health_status": gateway.health_status,
                } for gateway in gateways],
                "trend": [],
            }
        except Exception:
            return {"items": [], "trend": []}

    async def revenue_analytics(self, *, period: str = "12m") -> dict:
        months = max(1, min(24, int(period[:-1]) if period[:-1].isdigit() else 12))
        rows = (await self.db.execute(text("""
            SELECT period, SUM(mrr) AS mrr, SUM(arr) AS arr, SUM(add_on_revenue) AS addons
            FROM commerce.revenue_metrics
            GROUP BY period ORDER BY period DESC LIMIT :months
        """), {"months": months})).mappings().all()
        breakdown = [{
            "period": row["period"], "Basic": 0, "Pro": float(row["mrr"] or 0),
            "Professional": 0, "Enterprise": 0, "Addons": float(row["addons"] or 0),
            "total_mrr": float(row["mrr"] or 0), "total_arr": float(row["arr"] or 0),
        } for row in reversed(rows)]
        current = breakdown[-1]["total_mrr"] if breakdown else 0
        previous = breakdown[-2]["total_mrr"] if len(breakdown) > 1 else current
        return {
            "metrics": {
                "mrr": current, "arr": current * 12,
                "net_new_mrr": max(0, current - previous),
                "churn_mrr": max(0, previous - current),
                "expansion_mrr": 0,
                "arpu": 0,
            },
            "mrr_breakdown": breakdown,
            "country_revenue": [],
            "upgrades_downgrades": [],
            "cohort_retention": [],
            "mrr_by_month": [{
                "period": item["period"], "mrr": item["total_mrr"], "arr": item["total_arr"]
            } for item in breakdown],
            "mrr_by_plan": [],
            "upgrades_this_month": 0,
            "downgrades_this_month": 0,
            "arpu_inr": 0,
            "summary": {"mrr": current, "arr": current * 12, "net_new_mrr": max(0, current - previous), "churned_mrr": max(0, previous - current), "expansion_mrr": 0},
        }













class PlatformOperationsQueryService:
    """Bounded, read-only operational database telemetry."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def queue_stats(self) -> list[dict]:
        """Return bounded broker telemetry for the known application queues."""
        import redis.asyncio as aioredis
        client = aioredis.from_url(settings.REDIS_URL)
        queues = ("default", "files", "sync", "notifications", "imports", "reports", "webhooks", "maintenance")
        try:
            now = datetime.now(timezone.utc).isoformat()
            rows = []
            for queue in queues:
                depth = int(await client.llen(queue))
                rows.append({
                    "name": queue, "depth": depth,
                    "status": "HEALTHY" if depth < 100 else "DEGRADED" if depth < 500 else "OVERLOADED",
                    "oldest_message_age_seconds": None, "dead_letter_depth": None,
                    "worker_status": "UNVERIFIED", "freshness_at": now,
                })
            return rows
        finally:
            await client.aclose()

    async def database_stats(self) -> dict:
        conn = (await self.db.execute(text("""
            SELECT count(*) AS total,
                   count(*) FILTER (WHERE state = 'active') AS active,
                   count(*) FILTER (WHERE state = 'idle') AS idle,
                   count(*) FILTER (WHERE wait_event_type = 'Lock') AS waiting
            FROM pg_stat_activity WHERE datname = current_database()
        """))).mappings().one()
        slow_queries: list[dict] = []
        stats_available = False
        try:
            has_stats = bool(await self.db.scalar(text("""
                SELECT EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'pg_stat_statements')
            """)))
            if has_stats:
                stats_available = True
                rows = (await self.db.execute(text("""
                    SELECT query, round(mean_exec_time::numeric, 2) AS avg_ms, calls
                    FROM pg_stat_statements
                    WHERE mean_exec_time > 100
                    ORDER BY mean_exec_time DESC LIMIT 10
                """))).mappings().all()
                slow_queries = [{
                    "query": str(row["query"])[:120],
                    "avg_ms": float(row["avg_ms"] or 0),
                    "calls": int(row["calls"] or 0),
                } for row in rows]
        except Exception:
            stats_available = False
        tables = (await self.db.execute(text("""
            SELECT schemaname || '.' || tablename AS table_name,
                   pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) AS size,
                   pg_total_relation_size(schemaname || '.' || tablename) AS size_bytes
            FROM pg_tables
            WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
            ORDER BY size_bytes DESC LIMIT 10
        """))).mappings().all()
        cache_ratio = await self.db.scalar(text("""
            SELECT round(sum(heap_blks_hit) / nullif(sum(heap_blks_hit) + sum(heap_blks_read), 0) * 100, 2)
            FROM pg_statio_user_tables
        """)) or 0
        db_size = await self.db.scalar(text("SELECT pg_database_size(current_database())")) or 0
        dead_tuples = await self.db.scalar(text("SELECT SUM(n_dead_tup) FROM pg_stat_user_tables")) or 0
        revision = None
        if await self.db.scalar(text("SELECT to_regclass('public.alembic_version') IS NOT NULL")):
            revision = await self.db.scalar(text("SELECT version_num FROM public.alembic_version LIMIT 1"))
        rls = (await self.db.execute(text("""
            SELECT COUNT(*) FILTER (WHERE relrowsecurity) AS enabled,
                   COUNT(*) FILTER (WHERE relforcerowsecurity) AS forced
            FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE c.relkind = 'r' AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        """))).mappings().one()
        return {
            "connections": {
                "total": int(conn["total"] or 0), "active": int(conn["active"] or 0),
                "idle": int(conn["idle"] or 0), "waiting": int(conn["waiting"] or 0),
            },
            "slow_queries": slow_queries,
            "slow_query_stats_available": stats_available,
            "table_sizes": [{"name": row["table_name"], "size": row["size"], "bytes": row["size_bytes"]} for row in tables],
            "cache_hit_ratio": float(cache_ratio), "database_size_bytes": db_size,
            "dead_tuples": int(dead_tuples),
            "migration": {"current_revision": revision, "expected_revision": None,
                           "status": "UNVERIFIED" if revision is None else "OBSERVED"},
            "rls": {"enabled_tables": int(rls["enabled"] or 0), "forced_tables": int(rls["forced"] or 0), "status": "OBSERVED"},
            "backup": {"status": "UNVERIFIED", "latest_backup_at": None, "latest_restore_test_at": None},
            "freshness_at": datetime.now(timezone.utc).isoformat(),
        }

    async def background_jobs(
        self, *, status: str | None = None, queue: str | None = None,
        organization_id: uuid.UUID | None = None, event_id: uuid.UUID | None = None,
        source: str | None = None, skip: int = 0, limit: int = 50,
    ) -> dict:
        """Aggregate supported job families without allowing an unbounded source read."""
        bounded_skip = max(0, int(skip))
        bounded_limit = max(1, min(int(limit), 100))
        sources = [
            ("registration.import_jobs", "registration_import", """
                SELECT j.id::text AS id, j.id::text AS job_id,
                       e.organization_id::text AS organization_id, j.event_id::text AS event_id,
                       j.status, j.created_at AS started_at, j.completed_at AS finished_at,
                       ('registration.import.' || COALESCE(j.job_type, 'schedule')) AS task_name,
                       'imports' AS queue, NULL::text AS error_message
                FROM registration.import_jobs j JOIN events.events e ON e.id = j.event_id
                ORDER BY j.created_at DESC, j.id DESC LIMIT 500"""),
            ("search.search_jobs", "search_index", """
                SELECT id::text AS id, id::text AS job_id, organization_id::text AS organization_id,
                       NULL::text AS event_id, status, created_at AS started_at, finished_at,
                       'search.reindex' AS task_name, 'search' AS queue,
                       CASE WHEN error_code IS NULL THEN NULL ELSE 'Failure detail available' END AS error_message
                FROM search.search_jobs ORDER BY created_at DESC, id DESC LIMIT 500"""),
            ("presentations.processing_jobs", "presentation_processing", """
                SELECT j.id::text AS id, j.id::text AS job_id, e.organization_id::text AS organization_id,
                       f.event_id::text AS event_id, j.status, j.created_at AS started_at,
                       NULL::timestamptz AS finished_at, 'presentation.processing' AS task_name,
                       'presentations' AS queue,
                       CASE WHEN j.logs IS NULL THEN NULL ELSE 'Failure detail available' END AS error_message
                FROM presentations.processing_jobs j
                JOIN presentations.files f ON f.id = j.file_id JOIN events.events e ON e.id = f.event_id
                ORDER BY j.created_at DESC, j.id DESC LIMIT 500"""),
            ("registration.badge_print_jobs", "badge_print", """
                SELECT j.id::text AS id, j.id::text AS job_id, e.organization_id::text AS organization_id,
                       p.event_id::text AS event_id, j.status, j.queued_at AS started_at,
                       j.printed_at AS finished_at, 'badge.print' AS task_name, 'badges' AS queue,
                       NULL::text AS error_message
                FROM registration.badge_print_jobs j JOIN registration.badges b ON b.id = j.badge_id
                JOIN registration.participants p ON p.id = b.participant_id JOIN events.events e ON e.id = p.event_id
                ORDER BY j.queued_at DESC, j.id DESC LIMIT 500"""),
            ("venue.sync_jobs", "venue_sync", """
                SELECT j.id::text AS id, j.id::text AS job_id, e.organization_id::text AS organization_id,
                       j.event_id::text AS event_id, j.status, COALESCE(j.started_at, j.created_at) AS started_at,
                       j.completed_at AS finished_at, ('venue.sync.' || COALESCE(j.sync_type, 'download')) AS task_name,
                       'venue-sync' AS queue,
                       CASE WHEN j.error_message IS NULL THEN NULL ELSE 'Failure detail available' END AS error_message
                FROM venue.sync_jobs j JOIN events.events e ON e.id = j.event_id
                ORDER BY j.created_at DESC, j.id DESC LIMIT 500"""),
        ]

        def normalize(raw: str | None) -> str:
            value = (raw or "queued").lower()
            if value in {"uploaded", "validating", "validated", "pending", "queued", "scheduled"}:
                return "queued"
            if value in {"importing", "indexing", "processing", "in_progress", "running"}:
                return "running"
            if value in {"completed", "success", "succeeded"}:
                return "success"
            if value == "retrying":
                return value
            if value in {"failed", "scan_failed", "upload_failed", "processing_failed"}:
                return "failed"
            return value

        items: list[dict] = []
        unavailable: list[dict] = []
        for table, source_name, query in sources:
            exists = bool(await self.db.scalar(text("SELECT to_regclass(:table_name)"), {"table_name": table}))
            if not exists:
                unavailable.append({"source": source_name, "reason": f"{table} is not present in this database."})
                continue
            try:
                rows = (await self.db.execute(text(query))).mappings().all()
                for row in rows:
                    normalized = normalize(row.get("status"))
                    started = row.get("started_at")
                    finished = row.get("finished_at")
                    duration = max((finished - started).total_seconds(), 0.0) if started and finished else None
                    items.append({
                        "id": row["id"], "job_id": row["job_id"],
                        "organization_id": row.get("organization_id"), "event_id": row.get("event_id"),
                        "status": normalized, "raw_status": row.get("status"),
                        "started_at": started.isoformat() if started else None,
                        "finished_at": finished.isoformat() if finished else None,
                        "duration_seconds": duration, "task_name": row.get("task_name"),
                        "queue": row.get("queue"), "source": source_name,
                        "error_message": row.get("error_message") if normalized == "failed" else None,
                        "capabilities": {
                            "retry": source_name == "search_index" and normalized == "failed",
                            "cancel": source_name == "search_index" and normalized == "queued",
                        },
                    })
            except Exception as exc:
                unavailable.append({"source": source_name, "reason": f"Could not read {table}: {exc.__class__.__name__}"})

        if queue and queue != "ALL":
            items = [item for item in items if item["queue"] == queue]
        if source:
            items = [item for item in items if item["source"] == source]
        if organization_id:
            items = [item for item in items if item["organization_id"] == str(organization_id)]
        if event_id:
            items = [item for item in items if item["event_id"] == str(event_id)]
        if status:
            normalized_filter = normalize(status)
            items = [item for item in items if item["status"] == normalized_filter]
        items.sort(key=lambda item: (item.get("started_at") or "", item.get("id") or ""), reverse=True)
        total = len(items)
        recent_cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
        def recent(item: dict, field: str) -> bool:
            value = item.get(field)
            return bool(value and datetime.fromisoformat(value) >= recent_cutoff)
        completed = [item for item in items if item["status"] == "success"]
        failed = [item for item in items if item["status"] == "failed"]
        terminal = len(completed) + len(failed)
        durations = [item["duration_seconds"] * 1000 for item in items if item["duration_seconds"] is not None]
        summary = {
            "running": sum(item["status"] == "running" for item in items),
            "pending": sum(item["status"] == "queued" for item in items),
            "queued": sum(item["status"] == "queued" for item in items),
            "completed_24h": sum(recent(item, "finished_at") for item in completed),
            "failed_24h": sum(recent(item, "started_at") for item in failed),
            "success_rate": round(len(completed) / terminal * 100, 2) if terminal else 0.0,
            "avg_duration_ms": round(sum(durations) / len(durations), 2) if durations else 0.0,
            "total_jobs": total,
            "active_jobs": sum(item["status"] in {"queued", "running", "retrying"} for item in items),
            "total_executions": total, "succeeded": len(completed), "failed": len(failed),
            "retrying": sum(item["status"] == "retrying" for item in items),
            "unavailable_sources": unavailable,
        }
        return {
            "items": items[bounded_skip:bounded_skip + bounded_limit], "summary": summary,
            "total": total, "skip": bounded_skip, "limit": bounded_limit,
            "unavailable_sources": unavailable,
        }


class PlatformFinancialQueryService:
    """Read-only, bounded financial configuration projections."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def tax_configuration(self) -> dict[str, list]:
        tax_rules: list[dict] = []
        pricing_rules: list[dict] = []
        distribution: list[dict] = []
        try:
            rows = (await self.db.execute(text("""
                SELECT id, name, tax_type, rate, state_region, is_active
                FROM pricing.tax_rules
                ORDER BY name ASC, id ASC
                LIMIT 500
            """))).mappings().all()
            tax_rules = [{
                "id": str(row["id"]), "name": row["name"],
                "tax_type": row["tax_type"], "rate": float(row["rate"] or 0),
                "state_region": row["state_region"],
                "is_active": row["is_active"],
            } for row in rows]
        except Exception:
            pass
        try:
            rows = (await self.db.execute(text("""
                SELECT id, name, value, is_active
                FROM pricing.pricing_rules
                ORDER BY name ASC, id ASC
                LIMIT 500
            """))).mappings().all()
            pricing_rules = [{
                "id": str(row["id"]), "name": row["name"],
                "value": float(row["value"] or 0), "is_active": row["is_active"],
            } for row in rows]
        except Exception:
            pass
        try:
            rows = (await self.db.execute(text("""
                SELECT COALESCE(tax_type, 'GST') AS type,
                       COALESCE(SUM(gst_amount), 0) AS value
                FROM commerce.invoices
                GROUP BY tax_type
                ORDER BY type ASC
                LIMIT 100
            """))).mappings().all()
            distribution = [{
                "type": row["type"], "value": float(row["value"] or 0)
            } for row in rows]
        except Exception:
            pass
        return {
            "tax_rules": tax_rules,
            "pricing_rules": pricing_rules,
            "tax_summary_distribution": distribution,
        }

    async def payment_transactions(
        self,
        *,
        skip: int = 0,
        limit: int = 50,
        status: str | None = None,
    ) -> dict:
        """Return a bounded payment-transaction page for platform admins."""
        bounded_skip = max(int(skip), 0)
        bounded_limit = max(1, min(int(limit), 100))
        status_clause = " WHERE t.status = :status" if status else ""
        params = {
            "status": status,
            "skip": bounded_skip,
            "limit": bounded_limit,
        }
        items: list[dict] = []
        total = 0
        try:
            rows = (await self.db.execute(text("""
                SELECT t.id, t.organization_id, o.name AS org_name,
                       t.amount, t.gateway_name, t.status, t.created_at
                FROM registration.payment_transactions t
                LEFT JOIN platform.organizations o ON t.organization_id = o.id
            """ + status_clause + """
                ORDER BY t.created_at DESC, t.id DESC
                LIMIT :limit OFFSET :skip
            """), params)).mappings().all()
            items = [{
                "id": str(row["id"]),
                "organization_id": str(row["organization_id"]),
                "org_name": row["org_name"] or "Unknown Org",
                "amount_inr": float(row["amount"] or 0),
                "gateway": row["gateway_name"] or "RAZORPAY",
                "status": str(row["status"]).upper(),
                "created_at": row["created_at"].isoformat(),
            } for row in rows]
            total = int(await self.db.scalar(text(
                "SELECT count(*) FROM registration.payment_transactions" +
                (" WHERE status = :status" if status else "")
            ), {"status": status} if status else {}) or 0)
        except Exception:
            pass
        return {
            "items": items,
            "total": total,
            "summary": {
                "total_count": total,
                "completed_count": sum(item["status"] == "COMPLETED" for item in items),
                "failed_count": sum(item["status"] == "FAILED" for item in items),
                "refunded_count": sum(item["status"] == "REFUNDED" for item in items),
            },
        }

    async def financial_audit_trail(
        self,
        *,
        skip: int = 0,
        limit: int = 50,
        organization_id: str | None = None,
        activity_type: str | None = None,
    ) -> dict:
        """Return a bounded, filtered financial-audit page."""
        bounded_skip = max(int(skip), 0)
        bounded_limit = max(1, min(int(limit), 100))
        clauses = []
        params: dict = {
            "skip": bounded_skip, "limit": bounded_limit,
            "organization_id": organization_id,
            "activity_type": activity_type,
        }
        if organization_id:
            clauses.append("a.organization_id = :organization_id")
        if activity_type:
            clauses.append("a.activity_type = :activity_type")
        where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
        items: list[dict] = []
        total = 0
        try:
            rows = (await self.db.execute(text("""
                SELECT a.id, a.organization_id, o.name AS org_name,
                       u.email AS performed_by_name, a.activity_type,
                       a.amount, a.occurred_at
                FROM commerce.financial_audit_trail a
                LEFT JOIN platform.organizations o ON a.organization_id = o.id
                LEFT JOIN identity.users u ON a.performed_by = u.id
            """ + where + """
                ORDER BY a.occurred_at DESC, a.id DESC
                LIMIT :limit OFFSET :skip
            """), params)).mappings().all()
            items = [{
                "id": str(row["id"]),
                "organization_id": str(row["organization_id"])
                if row["organization_id"] else None,
                "org_name": row["org_name"] or "Platform Wide",
                "performed_by_name": row["performed_by_name"] or "System",
                "activity_type": row["activity_type"],
                "amount": float(row["amount"]) if row["amount"] is not None else None,
                "occurred_at": row["occurred_at"].isoformat(),
            } for row in rows]
            count_where = where.replace("a.", "")
            count_params = {
                "organization_id": organization_id,
                "activity_type": activity_type,
            }
            total = int(await self.db.scalar(text(
                "SELECT count(*) FROM commerce.financial_audit_trail" +
                (" WHERE organization_id = :organization_id" if organization_id else "") +
                ((" AND " if organization_id else " WHERE ") +
                 "activity_type = :activity_type" if activity_type else "")
            ), count_params) or 0)
        except Exception:
            pass
        return {"items": items, "total": total}


class OrganizationLifecycleQueryService:
    """Read-only, bounded lifecycle-job queries for the organization console."""

    _COLUMNS = (
        OrganizationLifecycleJob.id,
        OrganizationLifecycleJob.organization_id,
        OrganizationLifecycleJob.target_organization_id,
        OrganizationLifecycleJob.job_type,
        OrganizationLifecycleJob.status,
        OrganizationLifecycleJob.dry_run_manifest,
        OrganizationLifecycleJob.result_metadata,
        OrganizationLifecycleJob.approvals,
        OrganizationLifecycleJob.reason,
        OrganizationLifecycleJob.requested_by,
        OrganizationLifecycleJob.failure_reason,
        OrganizationLifecycleJob.manifest_checksum,
        OrganizationLifecycleJob.attempt_count,
        OrganizationLifecycleJob.version,
        OrganizationLifecycleJob.started_at,
        OrganizationLifecycleJob.created_at,
        OrganizationLifecycleJob.updated_at,
        OrganizationLifecycleJob.completed_at,
    )

    def __init__(self, db: AsyncSession):
        self.db = db

    def _statement(self):
        return select(OrganizationLifecycleJob).options(
            load_only(*self._COLUMNS)
        )

    async def list(self, *, organization_id: uuid.UUID, status_filter: str | None = None, limit: int = 100):
        bounded_limit = max(1, min(int(limit), 100))
        statement = self._statement().where(
            OrganizationLifecycleJob.organization_id == organization_id
        )
        if status_filter:
            statement = statement.where(
                OrganizationLifecycleJob.status == status_filter.upper()
            )
        return list((await self.db.scalars(statement.order_by(
            OrganizationLifecycleJob.created_at.desc(),
            OrganizationLifecycleJob.id.desc(),
        ).limit(bounded_limit))).all())

    async def get(self, *, organization_id: uuid.UUID, job_id: uuid.UUID):
        return await self.db.scalar(self._statement().where(
            OrganizationLifecycleJob.id == job_id,
            OrganizationLifecycleJob.organization_id == organization_id,
        ))


class FinancialAdjustmentQueryService:
    """Read-only, bounded financial-adjustment history for an organization."""

    _COLUMNS = (
        OrganizationFinancialAdjustment.id,
        OrganizationFinancialAdjustment.organization_id,
        OrganizationFinancialAdjustment.event_id,
        OrganizationFinancialAdjustment.adjustment_type,
        OrganizationFinancialAdjustment.amount,
        OrganizationFinancialAdjustment.currency,
        OrganizationFinancialAdjustment.reason,
        OrganizationFinancialAdjustment.case_reference,
        OrganizationFinancialAdjustment.status,
        OrganizationFinancialAdjustment.version,
        OrganizationFinancialAdjustment.requested_by,
        OrganizationFinancialAdjustment.approved_by,
        OrganizationFinancialAdjustment.effective_at,
        OrganizationFinancialAdjustment.expires_at,
        OrganizationFinancialAdjustment.created_at,
        OrganizationFinancialAdjustment.decided_at,
    )

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list(self, *, organization_id: uuid.UUID, limit: int = 100) -> list[dict]:
        bounded_limit = max(1, min(int(limit), 100))
        statement = select(OrganizationFinancialAdjustment).options(
            load_only(*self._COLUMNS)
        ).where(
            OrganizationFinancialAdjustment.organization_id == organization_id
        ).order_by(
            OrganizationFinancialAdjustment.created_at.desc(),
            OrganizationFinancialAdjustment.id.desc(),
        ).limit(bounded_limit)
        rows = (await self.db.scalars(statement)).all()
        return [{
            "id": row.id, "event_id": row.event_id,
            "adjustment_type": row.adjustment_type, "amount": row.amount,
            "currency": row.currency, "reason": row.reason,
            "case_reference": row.case_reference, "status": row.status,
            "version": row.version, "requested_by": row.requested_by,
            "approved_by": row.approved_by, "effective_at": row.effective_at,
            "expires_at": row.expires_at, "created_at": row.created_at,
            "decided_at": row.decided_at,
        } for row in rows]


class PrivilegedAccessQueryService:
    """Read-only privileged-access history limited to its requesting actor."""

    _COLUMNS = (
        PrivilegedAccessSession.id,
        PrivilegedAccessSession.organization_id,
        PrivilegedAccessSession.actor_user_id,
        PrivilegedAccessSession.case_reference,
        PrivilegedAccessSession.field_categories,
        PrivilegedAccessSession.expires_at,
        PrivilegedAccessSession.revoked_at,
        PrivilegedAccessSession.created_at,
    )

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list(self, *, organization_id: uuid.UUID, actor_user_id: uuid.UUID, now: datetime, limit: int = 20) -> list[dict]:
        bounded_limit = max(1, min(int(limit), 100))
        statement = select(PrivilegedAccessSession).options(
            load_only(*self._COLUMNS)
        ).where(
            PrivilegedAccessSession.organization_id == organization_id,
            PrivilegedAccessSession.actor_user_id == actor_user_id,
        ).order_by(
            PrivilegedAccessSession.created_at.desc(),
            PrivilegedAccessSession.id.desc(),
        ).limit(bounded_limit)
        rows = (await self.db.scalars(statement)).all()
        return [{
            "id": row.id, "field_categories": row.field_categories,
            "case_reference": row.case_reference, "created_at": row.created_at,
            "expires_at": row.expires_at, "revoked_at": row.revoked_at,
            "active": row.revoked_at is None and row.expires_at > now,
        } for row in rows]


class OrganizationExportQueryService:
    """Read-only organization-console export history."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list(self, *, organization_id: uuid.UUID, limit: int = 25) -> list[DataExport]:
        bounded_limit = max(1, min(int(limit), 100))
        statement = select(DataExport).options(load_only(
            DataExport.id, DataExport.organization_id, DataExport.event_id,
            DataExport.status, DataExport.request_metadata,
            DataExport.created_at, DataExport.completed_at,
            DataExport.expires_at, DataExport.failure_reason,
        )).where(
            DataExport.organization_id == organization_id,
            DataExport.source_type == "organization_console_export",
        ).order_by(
            DataExport.created_at.desc(), DataExport.id.desc()
        ).limit(bounded_limit)
        return list((await self.db.scalars(statement)).all())


class CapabilityRestrictionQueryService:
    """Read-only, tenant-scoped capability restriction history."""

    _COLUMNS = tuple(getattr(CapabilityRestriction, name) for name in (
        "id", "organization_id", "event_id", "capability_key",
        "restriction_type", "reason_code", "reason", "case_reference",
        "status", "effective_at", "expires_at", "requested_by",
        "approved_by", "revoked_at", "revoked_by", "revocation_status",
        "revocation_reason", "revocation_case_reference",
        "revocation_requested_by", "revocation_approved_by",
        "revocation_requested_at", "idempotency_key", "version", "created_at",
    ))

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list(
        self,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID | None = None,
        status_filter: str | None = None,
        limit: int = 100,
    ) -> list[dict]:
        bounded_limit = max(1, min(int(limit), 100))
        statement = select(CapabilityRestriction).options(
            load_only(*self._COLUMNS)
        ).where(CapabilityRestriction.organization_id == organization_id)
        if event_id is not None:
            statement = statement.where(CapabilityRestriction.event_id == event_id)
        if status_filter:
            statement = statement.where(
                CapabilityRestriction.status == status_filter.upper()
            )
        rows = (await self.db.scalars(statement.order_by(
            CapabilityRestriction.created_at.desc(),
            CapabilityRestriction.id.desc(),
        ).limit(bounded_limit))).all()
        return [
            {column.key: getattr(row, column.key) for column in self._COLUMNS}
            for row in rows
        ]


class EntitlementOverrideQueryService:
    """Read-only, tenant-scoped entitlement override request history."""

    _COLUMNS = tuple(getattr(EntitlementOverrideRequest, name) for name in (
        "id", "organization_id", "event_id", "entitlement_key", "operation",
        "requested_value", "reason", "case_reference", "status",
        "requested_by", "approved_by", "effective_at", "expires_at",
        "version", "created_at", "decided_at", "revocation_status",
        "revocation_reason", "revocation_case_reference",
        "revocation_requested_by", "revocation_approved_by",
        "revocation_requested_at", "revoked_at", "revoked_by",
    ))

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list(
        self,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID | None = None,
        status_filter: str | None = None,
        limit: int = 50,
    ) -> list[dict]:
        bounded_limit = max(1, min(int(limit), 100))
        statement = select(EntitlementOverrideRequest).options(
            load_only(*self._COLUMNS)
        ).where(EntitlementOverrideRequest.organization_id == organization_id)
        if event_id is not None:
            statement = statement.where(EntitlementOverrideRequest.event_id == event_id)
        if status_filter:
            statement = statement.where(
                EntitlementOverrideRequest.status == status_filter.upper()
            )
        rows = (await self.db.scalars(statement.order_by(
            EntitlementOverrideRequest.created_at.desc(),
            EntitlementOverrideRequest.id.desc(),
        ).limit(bounded_limit))).all()
        return [
            {column.key: getattr(row, column.key) for column in self._COLUMNS}
            for row in rows
        ]


class EventContractQueryService:
    """Read-only, bounded event commercial-contract history."""

    _COLUMNS = tuple(getattr(EventCommercialContract, name) for name in (
        "id", "organization_id", "event_id", "version", "status", "plan_key",
        "plan_version", "currency", "entitlements", "hard_ceilings", "addons",
        "source", "effective_at", "ends_at", "created_at",
    ))

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list(self, *, organization_id: uuid.UUID, event_id: uuid.UUID, limit: int = 100) -> list[dict]:
        bounded_limit = max(1, min(int(limit), 100))
        statement = select(EventCommercialContract).options(
            load_only(*self._COLUMNS)
        ).where(
            EventCommercialContract.organization_id == organization_id,
            EventCommercialContract.event_id == event_id,
        ).order_by(
            EventCommercialContract.version.desc(),
            EventCommercialContract.id.desc(),
        ).limit(bounded_limit)
        rows = (await self.db.scalars(statement)).all()
        return [
            {column.key: getattr(row, column.key) for column in self._COLUMNS}
            for row in rows
        ]


class ComplianceEvidenceQueryService:
    """Read-only compliance evidence history scoped to its organization/control."""

    _COLUMNS = tuple(getattr(OrganizationComplianceEvidence, name) for name in (
        "id", "organization_id", "control_id", "evidence_type",
        "storage_reference", "checksum_sha256", "classification", "collected_at",
        "expires_at", "reviewer_user_id", "created_at",
    ))

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_for_control(
        self, *, organization_id: uuid.UUID, control_id: uuid.UUID, limit: int = 100
    ) -> tuple[bool, list[dict]]:
        control_exists = await self.db.scalar(select(OrganizationComplianceControl.id).where(
            OrganizationComplianceControl.id == control_id,
            OrganizationComplianceControl.organization_id == organization_id,
        ))
        if control_exists is None:
            return False, []
        bounded_limit = max(1, min(int(limit), 100))
        statement = select(OrganizationComplianceEvidence).options(
            load_only(*self._COLUMNS)
        ).where(
            OrganizationComplianceEvidence.organization_id == organization_id,
            OrganizationComplianceEvidence.control_id == control_id,
        ).order_by(
            OrganizationComplianceEvidence.collected_at.desc(),
            OrganizationComplianceEvidence.id.desc(),
        ).limit(bounded_limit)
        rows = (await self.db.scalars(statement)).all()
        return True, [
            {column.key: getattr(row, column.key) for column in self._COLUMNS}
            for row in rows
        ]


class UsageQueryService:
    """Read-only usage-key and reconciliation queries for the console."""

    _RECONCILIATION_COLUMNS = (
        UsageReconciliationRun.id,
        UsageReconciliationRun.organization_id,
        UsageReconciliationRun.event_id,
        UsageReconciliationRun.metric_key,
        UsageReconciliationRun.drift,
        UsageReconciliationRun.status,
        UsageReconciliationRun.source,
        UsageReconciliationRun.reconciled_at,
    )

    def __init__(self, db: AsyncSession):
        self.db = db

    async def metric_keys(
        self, *, organization_id: uuid.UUID, event_id: uuid.UUID | None
    ) -> list[tuple[str, str]]:
        statement = select(
            UsageLedgerEntry.metric_key,
            UsageLedgerEntry.unit,
        ).where(
            UsageLedgerEntry.organization_id == organization_id,
            UsageLedgerEntry.event_id == event_id
            if event_id is not None
            else UsageLedgerEntry.event_id.is_(None),
        ).distinct().order_by(
            UsageLedgerEntry.metric_key.asc(),
            UsageLedgerEntry.unit.asc(),
        )
        return list((await self.db.execute(statement)).all())

    async def latest_reconciliation(
        self, *, organization_id: uuid.UUID, event_id: uuid.UUID, metric_key: str
    ) -> UsageReconciliationRun | None:
        statement = select(UsageReconciliationRun).options(
            load_only(*self._RECONCILIATION_COLUMNS)
        ).where(
            UsageReconciliationRun.organization_id == organization_id,
            UsageReconciliationRun.event_id == event_id,
            UsageReconciliationRun.metric_key == metric_key,
        ).order_by(
            UsageReconciliationRun.reconciled_at.desc(),
            UsageReconciliationRun.id.desc(),
        ).limit(1)
        return await self.db.scalar(statement)


class CapabilityDiagnosticsQueryService:
    """Read-only database projections used by capability diagnostics."""

    _EVENT_COLUMNS = (
        CapabilityDiagnosticEvent.id,
        CapabilityDiagnosticEvent.organization_id,
        CapabilityDiagnosticEvent.event_id,
        CapabilityDiagnosticEvent.actor_user_id,
        CapabilityDiagnosticEvent.event_type,
        CapabilityDiagnosticEvent.severity,
        CapabilityDiagnosticEvent.reason_code,
        CapabilityDiagnosticEvent.capability_key,
        CapabilityDiagnosticEvent.operation_key,
        CapabilityDiagnosticEvent.limit_key,
        CapabilityDiagnosticEvent.source,
        CapabilityDiagnosticEvent.request_id,
        CapabilityDiagnosticEvent.correlation_id,
        CapabilityDiagnosticEvent.metadata_json,
        CapabilityDiagnosticEvent.occurred_at,
    )
    _FLAG_COLUMNS = (
        PlatformFlagDefinition.id,
        PlatformFlagDefinition.flag_key,
        PlatformFlagDefinition.owner_team,
        PlatformFlagDefinition.rollout_percentage,
        PlatformFlagDefinition.updated_at,
        PlatformFlagDefinition.expires_at,
        PlatformFlagDefinition.is_active,
    )

    def __init__(self, db: AsyncSession):
        self.db = db

    async def events(self, *, organization_id: uuid.UUID, since: datetime,
                     event_type: str | None, reason_code: str | None,
                     limit: int) -> list[CapabilityDiagnosticEvent]:
        bounded_limit = max(1, min(int(limit), 200))
        statement = select(CapabilityDiagnosticEvent).options(
            load_only(*self._EVENT_COLUMNS)
        ).where(
            CapabilityDiagnosticEvent.organization_id == organization_id,
            CapabilityDiagnosticEvent.occurred_at >= since,
        )
        if event_type:
            statement = statement.where(
                CapabilityDiagnosticEvent.event_type == event_type.upper()
            )
        if reason_code:
            statement = statement.where(
                CapabilityDiagnosticEvent.reason_code == reason_code
            )
        return list((await self.db.scalars(statement.order_by(
            CapabilityDiagnosticEvent.occurred_at.desc(),
            CapabilityDiagnosticEvent.id.desc(),
        ).limit(bounded_limit))).all())

    async def counts(self, *, organization_id: uuid.UUID, since: datetime):
        base = (
            CapabilityDiagnosticEvent.organization_id == organization_id,
            CapabilityDiagnosticEvent.occurred_at >= since,
        )
        type_counts = dict((await self.db.execute(select(
            CapabilityDiagnosticEvent.event_type,
            func.count(CapabilityDiagnosticEvent.id),
        ).where(*base).group_by(CapabilityDiagnosticEvent.event_type))).all())
        reason_counts = dict((await self.db.execute(select(
            CapabilityDiagnosticEvent.reason_code,
            func.count(CapabilityDiagnosticEvent.id),
        ).where(*base, CapabilityDiagnosticEvent.reason_code.is_not(None)).group_by(
            CapabilityDiagnosticEvent.reason_code
        ))).all())
        return type_counts, reason_counts

    async def rollout_flags(self, *, organization_id: uuid.UUID) -> list[FeatureFlag]:
        return list((await self.db.scalars(select(FeatureFlag).options(load_only(
            FeatureFlag.flag_key, FeatureFlag.is_enabled,
        )).where(
            FeatureFlag.organization_id == organization_id,
            FeatureFlag.flag_key.in_([
                "organizer_console_entitlement_shadow",
                "organizer_console_entitlement_enforce",
            ]),
        ))).all())

    async def latest_comparison_at(self, *, organization_id: uuid.UUID):
        return await self.db.scalar(select(func.max(
            EntitlementShadowComparison.compared_at
        )).where(EntitlementShadowComparison.organization_id == organization_id))

    async def latest_reconciliation_at(self, *, organization_id: uuid.UUID):
        return await self.db.scalar(select(func.max(
            UsageReconciliationRun.reconciled_at
        )).where(UsageReconciliationRun.organization_id == organization_id))

    async def active_catalogue_keys(self) -> set[str]:
        return set((await self.db.scalars(select(FeatureCatalog.key).where(
            FeatureCatalog.is_active.is_(True)
        ))).all())

    async def flag_definitions(self) -> list[PlatformFlagDefinition]:
        return list((await self.db.scalars(select(PlatformFlagDefinition).options(
            load_only(*self._FLAG_COLUMNS)
        ).order_by(
            PlatformFlagDefinition.updated_at.asc(),
            PlatformFlagDefinition.id.asc(),
        ))).all())

    async def override_counts(self, *, organization_id: uuid.UUID) -> dict:
        rows = (await self.db.execute(select(
            PlatformFlagOverride.flag_id,
            func.count(PlatformFlagOverride.id),
        ).where(or_(
            PlatformFlagOverride.organization_id == organization_id,
            PlatformFlagOverride.organization_id.is_(None),
        )).group_by(PlatformFlagOverride.flag_id))).all()
        return dict(rows)


class OrganizationConsoleQueryService:
    """Read-only organization aggregates; callers own no hidden writes."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def event_overview_counts(
        self,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
    ) -> dict[str, int]:
        """Load all event overview counters in one tenant-scoped projection."""
        def count_for(model):
            return (
                select(func.count(model.id))
                .where(model.event_id == Event.id)
                .correlate(Event)
                .scalar_subquery()
            )

        row = (
            await self.db.execute(
                select(
                    count_for(ParticipantRegistration).label("registrations"),
                    count_for(Speaker).label("speakers"),
                    count_for(Session).label("sessions"),
                    count_for(Room).label("rooms"),
                    count_for(PresentationFile).label("files"),
                    count_for(PaymentTransaction).label("payments"),
                )
                .select_from(Event)
                .where(Event.id == event_id, Event.organization_id == organization_id)
            )
        ).mappings().one()
        return {key: int(row[key] or 0) for key in row.keys()}

    async def event_settings(
        self,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
    ) -> dict | None:
        """Return the compatibility event-settings projection for one tenant."""
        row = (
            await self.db.execute(
                select(
                    Event.id,
                    Event.name,
                    Event.short_code,
                    Event.status,
                    Event.tagline,
                    Event.description,
                    Event.location,
                    Event.venue_name,
                    Event.country,
                    Event.state,
                    Event.organizer_name,
                    Event.organizer_details,
                    Event.start_date,
                    Event.end_date,
                    Event.timezone,
                    Event.upload_deadline,
                    Event.max_file_size_mb,
                    Event.allowed_formats,
                    Event.currency,
                    Event.map_link,
                    Event.venue_images,
                    Event.venue_details,
                    Event.speaker_settings,
                    Event.registration_settings,
                    Event.branding_settings,
                    Event.updated_at,
                    Event.version,
                )
                .where(Event.id == event_id, Event.organization_id == organization_id,
                       Event.deleted_at.is_(None))
            )
        ).mappings().first()
        if row is None:
            return None
        from app.modules.events.services.settings_policy import (
            public_settings, REGISTRATION_FIELDS, SPEAKER_FIELDS, BRANDING_FIELDS,
        )
        result = dict(row)
        for field, catalogue in (("registration_settings", REGISTRATION_FIELDS),
                                 ("speaker_settings", SPEAKER_FIELDS),
                                 ("branding_settings", BRANDING_FIELDS)):
            result[field] = public_settings(result.get(field) or {}, catalogue)
        return result

    async def event_operations_failures(
        self,
        *,
        organization_id: uuid.UUID,
        event_id: uuid.UUID,
    ) -> dict[str, int]:
        """Return event operations failure counters in one scoped projection."""
        processing_count = (
            select(func.count(PresentationProcessingJob.id))
            .join(PresentationFile, PresentationFile.id == PresentationProcessingJob.file_id)
            .where(
                PresentationFile.event_id == Event.id,
                func.lower(PresentationProcessingJob.status).in_(("failed", "error")),
            )
            .correlate(Event)
            .scalar_subquery()
        )
        row = (
            await self.db.execute(
                select(
                    select(func.count(ImportJob.id))
                    .where(
                        ImportJob.event_id == Event.id,
                        func.lower(ImportJob.status).in_(("failed", "error")),
                    )
                    .correlate(Event)
                    .scalar_subquery()
                    .label("import_jobs"),
                    select(func.count(VenueSyncJob.id))
                    .where(
                        VenueSyncJob.event_id == Event.id,
                        func.lower(VenueSyncJob.status).in_(("failed", "error")),
                    )
                    .correlate(Event)
                    .scalar_subquery()
                    .label("venue_sync_jobs"),
                    processing_count.label("processing_jobs"),
                )
                .select_from(Event)
                .where(Event.id == event_id, Event.organization_id == organization_id)
            )
        ).mappings().one()
        return {key: int(row[key] or 0) for key in row.keys()}

    async def list_events(
        self,
        *,
        organization_id: uuid.UUID,
        include_archived: bool = False,
        limit: int = 100,
    ) -> list[dict]:
        """Return the console event directory as an explicit bounded projection."""
        bounded_limit = min(max(limit, 1), 200)
        filters = [Event.organization_id == organization_id]
        if not include_archived:
            filters.extend(
                (
                    Event.deleted_at.is_(None),
                    ~func.lower(Event.status).in_(["archived", "cancelled"]),
                )
            )
        rows = (
            await self.db.execute(
                select(
                    Event.id,
                    Event.organization_id,
                    Event.name,
                    Event.short_code,
                    Event.status,
                    Event.location,
                    Event.venue_name,
                    Event.country,
                    Event.state,
                    Event.start_date,
                    Event.end_date,
                    Event.timezone,
                    Event.currency,
                    Event.is_maintenance,
                    Event.is_read_only,
                    Event.created_at,
                    Event.updated_at,
                )
                .where(*filters)
                .order_by(Event.start_date.desc().nullslast(), Event.id.desc())
                .limit(bounded_limit)
            )
        ).mappings().all()
        return [dict(row) for row in rows]

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
                    count_for(OrganizationTeam, OrganizationTeam.deleted_at.is_(None)).label("team_count"),
                    count_for(IntegrationConnection, IntegrationConnection.is_active.is_(True)).label("connection_count"),
                    count_for(ApiKey, ApiKey.is_active.is_(True)).label("api_key_count"),
                    count_for(OrganizationBrandProfile).label("branding_profile_count"),
                    count_for(
                        OrganizationNotificationChannelConfig,
                        OrganizationNotificationChannelConfig.deleted_at.is_(None),
                    ).label("notification_channel_count"),
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
        rows = (await self.db.execute(select(
            Organization, OrganizationHealth, OrganizationUsage
        ).outerjoin(
            OrganizationHealth, Organization.id == OrganizationHealth.organization_id
        ).outerjoin(
            OrganizationUsage, Organization.id == OrganizationUsage.organization_id
        ).order_by(Organization.created_at.desc(), Organization.id).offset(
            max(0, skip)
        ).limit(max(1, min(limit, 100)) ))).all()
        result = []
        for organization, health, usage in rows:
            account = await self.db.scalar(select(CommercialAccount).where(
                CommercialAccount.owner_organization_id == organization.id
            ))
            contract = await self.db.scalar(select(CommercialContract).where(
                CommercialContract.commercial_account_id == account.id
            ).order_by(CommercialContract.created_at.desc()).limit(1)) if account else None
            owner = await self.db.scalar(select(User).where(
                User.organization_id == organization.id
            ).order_by(User.created_at.asc()).limit(1))
            result.append({
                "id": organization.id,
                "name": organization.name,
                "slug": organization.slug,
                "offer_name": contract.contract_type if contract else "NONE",
                "status": contract.status if contract else "NOT_CONFIGURED",
                "health_score": health.health_score if health else None,
                "health_status": health.status if health else "NOT_MEASURED",
                "created_at": organization.created_at,
                "events_count": usage.active_events_count if usage else 0,
                "users_count": usage.active_users_count if usage else 0,
                "created_by": f"{owner.first_name} {owner.last_name}" if owner else "—",
                "mrr": None,
            })
        return result


    async def organization_detail(self, *, organization_id: uuid.UUID) -> dict | None:
        organization = await self.db.scalar(select(Organization).where(Organization.id == organization_id))
        if organization is None:
            return None
        account = await self.db.scalar(select(CommercialAccount).where(
            CommercialAccount.owner_organization_id == organization_id
        ))
        contract = await self.db.scalar(select(CommercialContract).where(
            CommercialContract.commercial_account_id == account.id
        ).order_by(CommercialContract.created_at.desc()).limit(1)) if account else None
        health = await self.db.scalar(select(OrganizationHealth).where(
            OrganizationHealth.organization_id == organization_id
        ))
        limits = (
            await EntitlementResolver.get_limit(self.db, organization_id, "max_events"),
            await EntitlementResolver.get_limit(self.db, organization_id, "max_users"),
            await EntitlementResolver.get_limit(self.db, organization_id, "storage_quota_mb"),
        )
        availability = "AVAILABLE" if all(value is not None for value in limits) else "UNAVAILABLE" if all(value is None for value in limits) else "PARTIAL"
        return {
            "id": organization.id, "name": organization.name, "slug": organization.slug,
            "domain": organization.custom_domain, "created_at": organization.created_at,
            "commercial": {
                "source": "CANONICAL_ENTITLEMENT_RESOLVER",
                "availability": availability,
                "account_type": account.account_type if account else None,
                "contract_id": str(contract.id) if contract else None,
                "contract_status": contract.status if contract else None,
                "limits": {"max_events": limits[0], "max_users": limits[1], "storage_quota_mb": limits[2]},
            },
            "country": organization.country, "timezone": organization.timezone,
            "contract": {
                "id": str(contract.id), "type": contract.contract_type,
                "status": contract.status, "starts_at": contract.starts_at,
                "ends_at": contract.ends_at, "billing_interval": contract.billing_interval,
                "currency": contract.currency,
            } if contract else None,
            "health": {
                "score": health.health_score if health else None,
                "status": health.status if health else "NOT_MEASURED",
                "warnings": health.warnings if health else [],
            },
        }


    async def organization_features(self, *, organization_id: uuid.UUID) -> list[dict]:
        overrides = {
            row.feature_id: row.is_enabled
            for row in (await self.db.scalars(select(OrganizationFeature).where(
                OrganizationFeature.organization_id == organization_id
            ))).all()
        }
        features = list((await self.db.scalars(select(FeatureCatalog).where(
            FeatureCatalog.is_active.is_(True)
        ).order_by(FeatureCatalog.category_order.asc(), FeatureCatalog.feature_order.asc()).limit(1000))).all())
        return [{
            "id": str(feature.id),
            "key": feature.key,
            "name": feature.name,
            "description": feature.description,
            "category": feature.category,
            "plan_enabled": False,
            "override_enabled": overrides.get(feature.id),
            "is_enabled": overrides.get(feature.id, False),
        } for feature in features]


    async def organization_feature_overrides(self, *, organization_id: uuid.UUID) -> list[dict]:
        overrides = {
            row.feature_id: row.is_enabled
            for row in (await self.db.scalars(select(OrganizationFeature).where(
                OrganizationFeature.organization_id == organization_id
            ))).all()
        }
        features = list((await self.db.scalars(select(FeatureCatalog).where(
            FeatureCatalog.is_active.is_(True)
        ).order_by(FeatureCatalog.category_order.asc(), FeatureCatalog.feature_order.asc()).limit(1000))).all())
        return [{
            "feature_id": str(feature.id),
            "feature_key": feature.key,
            "feature_name": feature.name,
            "category": feature.category,
            "description": feature.description,
            "offer_default": False,
            "override": overrides.get(feature.id),
            "effective_value": overrides.get(feature.id, False),
        } for feature in features]


    async def organization_domains(self, *, organization_id: uuid.UUID) -> list[dict]:
        """Return the bounded domain list for one organization."""
        rows = list((await self.db.scalars(select(OrganizationDomain).options(
            load_only(
                OrganizationDomain.id, OrganizationDomain.organization_id,
                OrganizationDomain.domain, OrganizationDomain.is_verified,
                OrganizationDomain.created_at,
            )
        ).where(
            OrganizationDomain.organization_id == organization_id
        ).order_by(
            OrganizationDomain.created_at.desc(), OrganizationDomain.id.desc()
        ).limit(100))).all())
        return [{
            "id": row.id,
            "domain": row.domain,
            "is_verified": row.is_verified,
            "created_at": row.created_at,
        } for row in rows]

    async def organization_limits(self, *, organization_id: uuid.UUID) -> dict[str, int]:
        """Return explicit tenant limit overrides as a bounded mapping."""
        rows = (await self.db.execute(select(
            TenantLimit.limit_key, TenantLimit.limit_value
        ).where(
            TenantLimit.organization_id == organization_id
        ).order_by(
            TenantLimit.limit_key.asc(), TenantLimit.id.asc()
        ).limit(200))).all()
        return {str(key): int(value) for key, value in rows}



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

    async def organization_dossier(self, *, organization_id: uuid.UUID) -> dict | None:
        organization = await self.db.scalar(select(Organization).where(Organization.id == organization_id))
        if organization is None:
            return None

        now = datetime.now(timezone.utc)
        account = await self.db.scalar(select(CommercialAccount).where(
            CommercialAccount.owner_organization_id == organization_id
        ))
        contracts = []
        if account:
            contract_rows = list((await self.db.scalars(select(CommercialContract).where(
                CommercialContract.commercial_account_id == account.id
            ).order_by(CommercialContract.created_at.desc()).limit(100))).all())
            for contract in contract_rows:
                items = list((await self.db.execute(select(
                    CommercialContractItem.offer_id,
                    CommercialContractItem.offer_version_id,
                    CommercialContractItem.quantity,
                    CommercialOffer.code,
                    CommercialOffer.display_name,
                ).join(
                    CommercialOffer, CommercialOffer.id == CommercialContractItem.offer_id
                ).where(
                    CommercialContractItem.contract_id == contract.id
                ))).all())
                contracts.append({
                    "id": str(contract.id),
                    "contract_type": contract.contract_type,
                    "status": contract.status,
                    "billing_interval": contract.billing_interval,
                    "currency": contract.currency,
                    "starts_at": contract.starts_at,
                    "ends_at": contract.ends_at,
                    "auto_renew": contract.auto_renew,
                    "cancel_at_period_end": contract.cancel_at_period_end,
                    "items": [{
                        "offer_id": str(offer_id),
                        "offer_code": code,
                        "display_name": display_name,
                        "offer_version_id": str(version_id),
                        "quantity": quantity,
                    } for offer_id, version_id, quantity, code, display_name in items],
                })

        grants = list((await self.db.scalars(select(EntitlementGrant).where(
            EntitlementGrant.organization_id == organization_id
        ).order_by(EntitlementGrant.created_at.desc()).limit(200))).all())
        actual_events = int(await self.db.scalar(select(func.count(Event.id)).where(
            Event.organization_id == organization_id
        )) or 0)
        activation_rows = (await self.db.execute(select(
            EventActivation.status, func.count(EventActivation.id)
        ).where(EventActivation.organization_id == organization_id).group_by(
            EventActivation.status
        ))).all()
        activation_counts = {str(status).upper(): int(count) for status, count in activation_rows}
        overrides = list((await self.db.scalars(select(OrganizationFeature).where(
            OrganizationFeature.organization_id == organization_id
        ).limit(2000))).all())
        features = list((await self.db.scalars(select(FeatureCatalog).where(
            FeatureCatalog.is_active.is_(True)
        ).order_by(FeatureCatalog.category_order.asc(), FeatureCatalog.feature_order.asc()).limit(1000))).all())
        override_map = {row.feature_id: row for row in overrides}
        capabilities = [{
            "id": str(feature.id),
            "key": feature.key,
            "name": feature.name,
            "category": feature.category,
            "description": feature.description,
            "enabled": bool(override_map.get(feature.id) and override_map[feature.id].is_enabled),
            "source": "override" if feature.id in override_map else "none",
            "expires_at": override_map[feature.id].expires_at if feature.id in override_map else None,
            "reason": override_map[feature.id].reason if feature.id in override_map else None,
        } for feature in features]
        usage = await self.db.scalar(select(OrganizationUsage).where(
            OrganizationUsage.organization_id == organization_id
        ))
        health = await self.db.scalar(select(OrganizationHealth).where(
            OrganizationHealth.organization_id == organization_id
        ))
        member_count = int(await self.db.scalar(select(func.count(
            OrganizationMember.id
        )).where(OrganizationMember.organization_id == organization_id)) or 0)
        owner = await self.db.scalar(select(User).where(
            User.organization_id == organization_id
        ).order_by(User.created_at.asc(), User.id.asc()).limit(1))
        invoice_summary = (await self.db.execute(text("""
            SELECT COUNT(*) AS invoice_count, COALESCE(SUM(amount), 0) AS invoiced_total
            FROM commerce.invoices WHERE organization_id = :organization_id
        """), {"organization_id": organization_id})).one()
        contract_payload = contracts[0] if contracts else None
        return {
            "generated_at": now,
            "profile": {
                "id": str(organization.id), "name": organization.name,
                "slug": organization.slug, "logo_url": organization.logo_url,
                "is_active": organization.is_active,
                "is_platform_org": organization.is_platform_org,
                "billing_email": organization.billing_email,
                "custom_domain": organization.custom_domain,
                "country": organization.country, "timezone": organization.timezone,
                "currency": organization.currency, "language": organization.language,
                "portal_name": organization.portal_name,
                "organization_type": organization.organization_type,
                "industry": organization.industry,
                "enabled_modules": organization.enabled_modules or [],
                "onboarding_completed": organization.onboarding_completed,
                "onboarding_step": organization.onboarding_step,
                "created_at": organization.created_at,
                "updated_at": organization.updated_at,
                "suspended_at": organization.suspended_at,
                "suspension_reason": organization.suspension_reason,
            },
            "owner": {
                "id": str(owner.id),
                "name": f"{owner.first_name or ''} {owner.last_name or ''}".strip(),
                "email": owner.email,
            } if owner else None,
            "health": {
                "score": health.health_score if health else None,
                "status": health.status if health else "NOT_MEASURED",
                "warnings": health.warnings if health else [],
            },
            "commercial_account": {
                "id": str(account.id),
                "account_type": account.account_type,
                "status": account.status,
                "currency": account.currency,
                "country": account.country,
            } if account else None,
            "contract": contract_payload,
            "contracts": contracts,
            "event_entitlement": {
                "actual_events": actual_events,
                "activations": activation_counts,
            },
            "grants": [{
                "id": str(grant.id), "type": grant.grant_type,
                "source": grant.source_type, "status": grant.status,
                "total": grant.quantity_total, "consumed": grant.quantity_consumed,
                "reserved": grant.quantity_reserved, "valid_until": grant.valid_until,
            } for grant in grants],
            "capabilities": capabilities,
            "addons": [],
            "usage": {
                "active_events": usage.active_events_count if usage else 0,
                "active_users": usage.active_users_count if usage else 0,
                "registrations": usage.total_registrations_count if usage else 0,
                "storage_bytes": usage.storage_used_bytes if usage else 0,
                "calculated_at": usage.last_calculated_at if usage else None,
            },
            "people": {"members": member_count},
            "billing": {
                "invoice_count": int(invoice_summary.invoice_count),
                "invoiced_total": float(invoice_summary.invoiced_total),
                "currency": account.currency if account else "INR",
            },
            "availability": {
                "profile": True, "commercial": True, "entitlements": True,
                "capabilities": True, "events": True, "people": True, "billing": True,
            },
        }


    async def public_branding_sources(
        self, *, host: str | None = None, slug: str | None = None
    ):
        """Load only published-branding source rows for one public lookup."""
        filters = [Organization.is_active.is_(True)]
        if host is not None:
            filters.append(func.lower(Organization.custom_domain) == host)
        else:
            filters.append(Organization.slug == slug)
        organization = await self.db.scalar(select(Organization).options(load_only(
            Organization.id, Organization.slug, Organization.name,
            Organization.is_active,
        )).where(*filters).limit(1))
        if organization is None:
            return None, None
        profile = await self.db.scalar(select(OrganizationBrandProfile).options(
            load_only(
                OrganizationBrandProfile.organization_id,
                OrganizationBrandProfile.status,
                OrganizationBrandProfile.version,
                OrganizationBrandProfile.published_version,
                OrganizationBrandProfile.templates,
                OrganizationBrandProfile.tokens,
                OrganizationBrandProfile.assets,
            )
        ).where(
            OrganizationBrandProfile.organization_id == organization.id,
            OrganizationBrandProfile.status == "PUBLISHED",
            OrganizationBrandProfile.published_version == OrganizationBrandProfile.version,
        ).limit(1))
        return organization, profile

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
    """Read-only projections for the canonical cloud commercial model."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_invoices(
        self,
        *,
        status: str | None = None,
        organization_id: uuid.UUID | None = None,
        search: str | None = None,
        skip: int = 0,
        limit: int = 20,
    ) -> dict:
        bounded_skip = max(int(skip), 0)
        bounded_limit = max(1, min(int(limit), 100))
        params = {
            "status": status,
            "organization_id": organization_id,
            "search_pattern": f"%{search}%" if search else None,
            "skip": bounded_skip,
            "limit": bounded_limit,
        }
        base = """
            FROM commerce.invoices i
            JOIN platform.organizations o ON o.id = i.organization_id
            LEFT JOIN LATERAL (
                SELECT description FROM commerce.invoice_items ii
                WHERE ii.invoice_id = i.id
                ORDER BY ii.id ASC LIMIT 1
            ) first_item ON TRUE
            WHERE (:status IS NULL OR i.status = :status)
              AND (:organization_id IS NULL OR i.organization_id = :organization_id)
              AND (:search_pattern IS NULL OR o.name ILIKE :search_pattern
                   OR COALESCE(first_item.description, '') ILIKE :search_pattern)
        """
        try:
            total = int(await self.db.scalar(text("SELECT COUNT(*) " + base), params) or 0)
            rows = (await self.db.execute(text("""
                SELECT i.id, i.organization_id, o.name AS org_name,
                       first_item.description AS offer_name, i.amount, i.currency,
                       i.status, i.due_date, i.paid_at, i.created_at,
                       i.gst_amount, i.total_amount_inr, i.invoice_number, i.event_id,
                       i.commercial_contract_id
                """ + base + """
                ORDER BY i.created_at DESC, i.id DESC
                OFFSET :skip LIMIT :limit
            """), params)).mappings().all()
            items = []
            for row in rows:
                amount = float(row["amount"] or 0)
                gst = float(row["gst_amount"] or 0)
                total_amount = float(row["total_amount_inr"] or 0) or amount + gst
                items.append({
                    "id": str(row["id"]),
                    "invoice_number": row["invoice_number"] or f"INV-{str(row['id'])[:8].upper()}",
                    "organization_id": str(row["organization_id"]),
                    "org_name": row["org_name"],
                    "offer_name": row["offer_name"] or "Commercial contract",
                    "amount_inr": amount,
                    "gst_amount": gst,
                    "total_amount_inr": total_amount,
                    "currency": row["currency"] or "INR",
                    "status": row["status"],
                    "due_date": row["due_date"].isoformat() if row["due_date"] else None,
                    "paid_at": row["paid_at"].isoformat() if row["paid_at"] else None,
                    "event_id": str(row["event_id"]) if row["event_id"] else None,
                    "commercial_contract_id": str(row["commercial_contract_id"]) if row["commercial_contract_id"] else None,
                    "created_at": row["created_at"].isoformat() if row["created_at"] else None,
                })
            summary = (await self.db.execute(text("""
                SELECT
                    COALESCE(SUM(amount), 0) AS total_value_inr,
                    COALESCE(SUM(CASE WHEN status = 'PAID' THEN amount ELSE 0 END), 0) AS paid_inr,
                    COALESCE(SUM(CASE WHEN status IN ('PENDING', 'UNPAID') THEN amount ELSE 0 END), 0) AS pending_inr,
                    COALESCE(SUM(CASE WHEN status = 'OVERDUE' THEN amount ELSE 0 END), 0) AS overdue_inr,
                    COUNT(*) AS total_count,
                    COUNT(*) FILTER (WHERE status = 'PAID') AS paid_count,
                    COUNT(*) FILTER (WHERE status = 'OVERDUE') AS overdue_count,
                    AVG(EXTRACT(EPOCH FROM (paid_at - created_at)) / 86400.0) AS avg_collection_days
                FROM commerce.invoices
                WHERE (:organization_id IS NULL OR organization_id = :organization_id)
            """), {"organization_id": organization_id})).one()
            return {
                "items": items,
                "total": total,
                "summary": {
                    "total_value_inr": float(summary.total_value_inr or 0),
                    "paid_inr": float(summary.paid_inr or 0),
                    "pending_inr": float(summary.pending_inr or 0),
                    "overdue_inr": float(summary.overdue_inr or 0),
                    "total_count": int(summary.total_count or 0),
                    "paid_count": int(summary.paid_count or 0),
                    "overdue_count": int(summary.overdue_count or 0),
                    "avg_collection_days": float(summary.avg_collection_days or 0),
                },
            }
        except Exception:
            return {
                "items": [], "total": 0,
                "summary": {
                    "total_value_inr": 0, "paid_inr": 0, "pending_inr": 0,
                    "overdue_inr": 0, "total_count": 0, "paid_count": 0,
                    "overdue_count": 0, "avg_collection_days": 0,
                },
            }

    async def invoice_items(self, *, invoice_id: uuid.UUID) -> list[dict]:
        rows = list((await self.db.scalars(select(InvoiceItem).options(load_only(
            InvoiceItem.id, InvoiceItem.invoice_id, InvoiceItem.description,
            InvoiceItem.amount, InvoiceItem.quantity, InvoiceItem.commercial_offer_code,
            InvoiceItem.commercial_offer_version_id, InvoiceItem.tax_rate,
            InvoiceItem.tax_amount,
        )).where(
            InvoiceItem.invoice_id == invoice_id
        ).order_by(InvoiceItem.id.asc()).limit(500))).all())
        return [{
            "id": str(item.id),
            "description": item.description,
            "amount": float(item.amount or 0),
            "quantity": item.quantity or 1,
            "offer_code": item.commercial_offer_code,
            "offer_version_id": str(item.commercial_offer_version_id) if item.commercial_offer_version_id else None,
            "tax_rate": float(item.tax_rate or 0),
            "tax_amount": float(item.tax_amount or 0),
        } for item in rows]

    async def contract_health_summary(self) -> dict[str, int]:
        rows = (await self.db.execute(select(
            CommercialContract.status,
            func.count(CommercialContract.id),
        ).group_by(CommercialContract.status))).all()
        counts = {str(status): int(count or 0) for status, count in rows}
        return {
            "ACTIVE": counts.get("ACTIVE", 0),
            "PENDING_PAYMENT": counts.get("PENDING_PAYMENT", 0),
            "CANCELLED": counts.get("CANCELLED", 0),
            "EXPIRED": counts.get("EXPIRED", 0),
            "AMENDMENT_PENDING": counts.get("AMENDMENT_PENDING", 0),
        }

    async def list_addons(self) -> list[dict]:
        """List capacity offers from the canonical commercial catalogue."""
        offers = list((await self.db.scalars(select(CommercialOffer).where(
            CommercialOffer.product_family == "CAPACITY_ADDON",
            CommercialOffer.lifecycle_status != "RETIRED",
        ).order_by(CommercialOffer.display_order.asc(), CommercialOffer.code.asc()).limit(200))).all())
        return [{
            "id": offer.id,
            "key": offer.code,
            "code": offer.code,
            "name": offer.name,
            "display_name": offer.display_name,
            "description": offer.description,
            "product_family": offer.product_family,
            "scope_type": offer.scope_type,
            "is_quote_only": offer.is_quote_only,
            "lifecycle_status": offer.lifecycle_status,
            "display_order": offer.display_order,
        } for offer in offers]

    async def list_features(self) -> list[dict]:
        features = list((await self.db.scalars(select(FeatureCatalog).where(
            FeatureCatalog.is_active.is_(True)
        ).order_by(
            FeatureCatalog.category_order.asc(),
            FeatureCatalog.feature_order.asc(),
            FeatureCatalog.name.asc(),
            FeatureCatalog.id.asc(),
        ).limit(1000))).all())
        return [{
            "id": feature.id,
            "key": feature.key,
            "name": feature.name,
            "description": feature.description,
            "category": feature.category,
            "category_order": feature.category_order,
            "feature_order": feature.feature_order,
            "is_active": feature.is_active,
            "value_type": feature.value_type,
            "scope_type": feature.scope_type,
            "default_value": feature.default_value,
            "allowed_values": feature.allowed_values or [],
            "unit": feature.unit,
            "period": feature.period,
            "enforcement_mode": feature.enforcement_mode,
            "version": feature.version,
            "portal_routes": feature.portal_routes or [],
            "backend_operations": feature.backend_operations or [],
            "required_permissions": feature.required_permissions or [],
            "metric_key": feature.metric_key,
            "dependencies": feature.dependencies or [],
            "conflicts": feature.conflicts or [],
            "owner_console": feature.owner_console,
            "owner_team": feature.owner_team,
            "risk_level": feature.risk_level,
            "lifecycle_status": feature.lifecycle_status,
            "replacement_key": feature.replacement_key,
        } for feature in features]

    async def addon_template_versions(
        self,
        *,
        addon_id: uuid.UUID,
        cursor: str | None = None,
        limit: int = 25,
    ) -> dict | None:
        del addon_id, cursor, limit
        return {"items": [], "next_cursor": None}

    async def get_announcement(self, *, announcement_id: uuid.UUID) -> GlobalAnnouncement | None:
        return await self.db.get(GlobalAnnouncement, announcement_id)

    async def list_maintenance_windows(self, *, status: str | None = None) -> list[MaintenanceWindow]:
        statement = select(MaintenanceWindow).order_by(MaintenanceWindow.starts_at.desc(), MaintenanceWindow.id)
        if status:
            statement = statement.where(MaintenanceWindow.status == status)
        return list((await self.db.scalars(statement.limit(100))).all())
