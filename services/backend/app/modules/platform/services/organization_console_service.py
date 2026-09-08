"""Authoritative aggregates for the Super Admin organization console."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.analytics.models.usage import OrganizationUsage, UsageEvent
from app.modules.billing.models.subscription import OrganizationSubscription
from app.modules.events.models.event import Event
from app.modules.communications.models.channel_delivery import (
    CommunicationDeliveryBatch,
)
from app.modules.identity.models.security_event import SecurityEvent
from app.modules.identity.models.user import User
from app.modules.platform.models.health import OrganizationHealth
from app.modules.platform.models.organization import Organization
from app.modules.platform.models.organization_console import (
    OrganizationBrandProfile,
    OrganizationInsightSnapshot,
    OrganizationLifecycleJob,
    OrganizationLocation,
    OrganizationNotificationChannelConfig,
    OrganizationNotificationRule,
    OrganizationSecurityPolicy,
    OrganizationTrustedDevice,
)
from app.modules.platform.schemas.organization_console import (
    AttentionItem,
    ConsoleMetric,
    DomainAvailability,
    HealthFactor,
    OrganizationConsoleSummary,
    OrganizationDomainSnapshot,
)
from app.modules.rbac.models.organization_member import OrganizationMember
from app.modules.platform.application.queries import OrganizationConsoleQueryService


class OrganizationConsoleService:
    DOMAIN_KEYS = {
        "members", "security", "branding", "billing", "locations", "integrations",
        "api-webhooks", "notifications", "storage", "audit",
        "activity", "insights", "advanced", "operations",
    }

    def __init__(self, db: AsyncSession):
        self.db = db

    async def require_organization(self, organization_id: uuid.UUID) -> Organization:
        organization = await self.db.get(Organization, organization_id)
        if not organization:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
        return organization

    async def summary(self, organization_id: uuid.UUID) -> OrganizationConsoleSummary:
        org = await self.require_organization(organization_id)
        now = datetime.now(timezone.utc)

        usage = await self.db.get(OrganizationUsage, organization_id)
        stored_health = await self.db.get(OrganizationHealth, organization_id)
        subscription = await self.db.scalar(
            select(OrganizationSubscription)
            .where(OrganizationSubscription.organization_id == organization_id)
            .options(selectinload(OrganizationSubscription.plan))
            .order_by(OrganizationSubscription.created_at.desc())
            .limit(1)
        )
        counts = await OrganizationConsoleQueryService(self.db).counts(organization_id=organization_id)
        member_count = counts.member_count
        team_count = counts.team_count
        event_count = counts.event_count
        active_event_count = counts.active_event_count
        active_user_count = counts.active_user_count
        mfa_user_count = counts.mfa_user_count
        location_count = counts.location_count
        connection_count = counts.connection_count
        api_key_count = counts.api_key_count
        open_security_events = counts.open_security_events
        freshness = usage.last_calculated_at if usage else None
        storage_bytes = int(usage.storage_used_bytes if usage else 0)
        registrations = int(usage.total_registrations_count if usage else 0)
        metrics = [
            ConsoleMetric(key="events", label="Events", value=event_count, source="events.events", freshness_at=now),
            ConsoleMetric(key="active_events", label="Active events", value=active_event_count, source="events.events", freshness_at=now),
            # Keep the public source identifier stable for existing console consumers;
            # the authoritative model is OrganizationMember in the migrated access schema.
            ConsoleMetric(key="members", label="Members", value=member_count, source="rbac.organization_members", freshness_at=now),
            ConsoleMetric(key="active_users", label="Active users", value=active_user_count, source="identity.users", freshness_at=now),
            ConsoleMetric(key="teams", label="Teams", value=team_count, source="command_center_access.teams", freshness_at=now),
            ConsoleMetric(key="locations", label="Locations", value=location_count, source="platform.organization_locations", freshness_at=now),
            ConsoleMetric(key="storage", label="Storage used", value=storage_bytes, unit="bytes", source="analytics.organization_usage", freshness_at=freshness, available=usage is not None),
            ConsoleMetric(key="registrations", label="Registrations", value=registrations, source="analytics.organization_usage", freshness_at=freshness, available=usage is not None),
            ConsoleMetric(key="integrations", label="Connected integrations", value=connection_count, source="integrations.connections", freshness_at=now),
            ConsoleMetric(key="api_keys", label="Active API keys", value=api_key_count, source="developer.developer_api_keys", freshness_at=now),
        ]

        mfa_score = round((mfa_user_count / active_user_count) * 100) if active_user_count else None
        factors = [
            HealthFactor(key="security", label="Security", score=mfa_score, status=self._factor_status(mfa_score), evidence=f"{mfa_user_count} of {active_user_count} active users have MFA" if active_user_count else "No active users to measure"),
            HealthFactor(key="user_activity", label="User activity", score=100 if active_user_count else None, status="HEALTHY" if active_user_count else "NOT_MEASURED", evidence=f"{active_user_count} active users" if active_user_count else "No active user records"),
            HealthFactor(key="integrations", label="Integrations", score=100 if connection_count else None, status="HEALTHY" if connection_count else "NOT_MEASURED", evidence=f"{connection_count} active connections" if connection_count else "No integration connections configured"),
            HealthFactor(key="backups", label="Backups", score=None, status="NOT_MEASURED", evidence="No authoritative backup execution provider is configured"),
        ]
        measured = [factor.score for factor in factors if factor.score is not None]
        calculated_health = round(sum(measured) / len(measured)) if measured else None
        health_score = stored_health.health_score if stored_health and stored_health.last_calculated_at else calculated_health
        health_status = self._health_status(health_score)
        attention: list[AttentionItem] = []
        if active_user_count and mfa_user_count < active_user_count:
            attention.append(AttentionItem(key="mfa-gap", severity="WARNING", title="MFA coverage incomplete", detail=f"{active_user_count - mfa_user_count} active users do not have MFA enabled.", destination=f"/organizations/{organization_id}?view=security"))
        if open_security_events:
            attention.append(AttentionItem(key="security-events", severity="CRITICAL", title="Security events require review", detail=f"{open_security_events} high or critical events are recorded.", destination=f"/organizations/{organization_id}?view=security"))
        if not subscription and not org.is_internal_unrestricted:
            attention.append(AttentionItem(key="subscription", severity="WARNING", title="No subscription is recorded", detail="Commercial entitlements cannot be resolved without a subscription record.", destination=f"/organizations/{organization_id}?view=billing"))

        executive_summary = self._executive_summary(org.name, active_event_count, active_user_count, mfa_score, connection_count, open_security_events, subscription)
        availability = {
            "overview": DomainAvailability(available=True, configured=True, freshness_at=now),
            "members": DomainAvailability(available=True, configured=member_count > 0, freshness_at=now),
            "security": DomainAvailability(available=True, configured=active_user_count > 0, freshness_at=now),
            "branding": DomainAvailability(available=True, configured=counts.branding_profile_count > 0, freshness_at=now),
            "billing": DomainAvailability(available=True, configured=subscription is not None, freshness_at=now),
            "locations": DomainAvailability(available=True, configured=location_count > 0, freshness_at=now),
            "integrations": DomainAvailability(available=True, configured=connection_count > 0, freshness_at=now),
            "api-webhooks": DomainAvailability(available=True, configured=api_key_count > 0, freshness_at=now),
            "notifications": DomainAvailability(available=True, configured=counts.notification_channel_count > 0, freshness_at=now),
            "storage": DomainAvailability(available=usage is not None, configured=usage is not None, reason=None if usage else "Usage aggregation has not produced an organization snapshot.", freshness_at=freshness),
            "audit": DomainAvailability(available=True, configured=True, freshness_at=now),
            "activity": DomainAvailability(available=True, configured=True, freshness_at=now),
            "insights": DomainAvailability(available=True, configured=True, freshness_at=now),
            "advanced": DomainAvailability(available=True, configured=True, freshness_at=now),
        }
        return OrganizationConsoleSummary(
            generated_at=now,
            organization={"id": str(org.id), "name": org.name, "slug": org.slug, "logo_url": org.logo_url, "is_active": org.is_active, "is_internal_unrestricted": org.is_internal_unrestricted, "created_at": org.created_at, "country": org.country, "timezone": org.timezone, "currency": org.currency},
            subscription={"id": str(subscription.id), "status": subscription.status, "plan_id": str(subscription.plan_id), "plan_name": subscription.plan.name if subscription.plan else "Unknown", "current_period_end": subscription.current_period_end} if subscription else None,
            metrics=metrics, health_score=health_score, health_status=health_status,
            health_factors=factors, attention=attention, availability=availability,
            executive_summary=executive_summary,
        )

    async def domain_snapshot(self, organization_id: uuid.UUID, domain: str) -> OrganizationDomainSnapshot:
        await self.require_organization(organization_id)
        if domain not in self.DOMAIN_KEYS:
            raise HTTPException(status_code=404, detail="Organization console domain not found")
        now = datetime.now(timezone.utc)
        data: dict = {}
        available = DomainAvailability(available=True, configured=True, freshness_at=now)

        if domain == "locations":
            rows = (await self.db.execute(select(OrganizationLocation).where(OrganizationLocation.organization_id == organization_id).order_by(OrganizationLocation.name))).scalars().all()
            data = {"items": [self._model_dict(row) for row in rows], "total": len(rows)}
            available.configured = bool(rows)
        elif domain == "branding":
            row = await self.db.scalar(select(OrganizationBrandProfile).where(OrganizationBrandProfile.organization_id == organization_id))
            data = {"profile": self._model_dict(row) if row else None, "published": bool(row and row.published_version)}
            available.configured = row is not None
        elif domain == "security":
            policy = await self.db.scalar(select(OrganizationSecurityPolicy).where(OrganizationSecurityPolicy.organization_id == organization_id))
            devices = (await self.db.execute(select(OrganizationTrustedDevice).where(OrganizationTrustedDevice.organization_id == organization_id, OrganizationTrustedDevice.revoked_at.is_(None)).order_by(OrganizationTrustedDevice.last_seen_at.desc()).limit(100))).scalars().all()
            events = (await self.db.execute(select(SecurityEvent).where(SecurityEvent.organization_id == organization_id).order_by(SecurityEvent.occurred_at.desc()).limit(50))).scalars().all()
            data = {"policy": self._model_dict(policy) if policy else None, "trusted_devices": [self._model_dict(row) for row in devices], "security_events": [self._model_dict(row, exclude={"evidence", "request_metadata"}) for row in events]}
            available.configured = policy is not None
        elif domain == "notifications":
            rules = (await self.db.execute(select(OrganizationNotificationRule).where(OrganizationNotificationRule.organization_id == organization_id, OrganizationNotificationRule.deleted_at.is_(None)).order_by(OrganizationNotificationRule.name))).scalars().all()
            channels = (await self.db.execute(select(OrganizationNotificationChannelConfig).where(OrganizationNotificationChannelConfig.organization_id == organization_id, OrganizationNotificationChannelConfig.deleted_at.is_(None)).order_by(OrganizationNotificationChannelConfig.channel))).scalars().all()
            delivery_batches = (await self.db.execute(select(CommunicationDeliveryBatch).where(CommunicationDeliveryBatch.organization_id == organization_id).order_by(CommunicationDeliveryBatch.created_at.desc()).limit(100))).scalars().all()
            data = {
                "rules": [self._model_dict(row) for row in rules],
                "channels": [{**self._model_dict(row, exclude={"secret_reference"}), "secret_reference_present": bool(row.secret_reference)} for row in channels],
                "delivery_batches": [self._model_dict(row, exclude={"content_ciphertext", "idempotency_key", "request_hash"}) for row in delivery_batches],
            }
            available.configured = bool(channels)
        elif domain == "insights":
            summary = await self.summary(organization_id)
            snapshots = (await self.db.execute(select(OrganizationInsightSnapshot).where(OrganizationInsightSnapshot.organization_id == organization_id).order_by(OrganizationInsightSnapshot.created_at.desc()).limit(20))).scalars().all()
            data = {"current": {"source_mode": "DETERMINISTIC", "summary": summary.executive_summary, "generated_at": summary.generated_at, "health_factors": [factor.model_dump() for factor in summary.health_factors]}, "history": [self._model_dict(row) for row in snapshots], "ai_enrichment": {"available": False, "reason": "No approved AI enrichment provider is configured for this organization."}}
        elif domain == "advanced":
            jobs = (await self.db.execute(select(OrganizationLifecycleJob).where(OrganizationLifecycleJob.organization_id == organization_id).order_by(OrganizationLifecycleJob.created_at.desc()).limit(100))).scalars().all()
            data = {"jobs": [self._model_dict(row) for row in jobs], "deletion_blocked": False, "deletion_block_reason": None}
        elif domain == "operations":
            jobs = (await self.db.execute(text("""
                SELECT j.id::text, j.event_id::text, e.name event_name, 'IMPORT' job_type, j.status, j.filename label, j.created_at, j.completed_at, CASE WHEN lower(j.status)='failed' THEN j.error_summary ELSE NULL END error_detail, NULL::integer retry_count
                FROM registration.import_jobs j JOIN events.events e ON e.id=j.event_id WHERE e.organization_id=:org_id
                UNION ALL
                SELECT j.id::text, j.event_id::text, e.name, 'VENUE_SYNC', j.status, j.sync_type, j.created_at, j.completed_at, CASE WHEN lower(j.status)='failed' THEN to_jsonb(j.error_message) ELSE NULL END, j.retry_count
                FROM venue.sync_jobs j JOIN events.events e ON e.id=j.event_id WHERE e.organization_id=:org_id
                UNION ALL
                SELECT j.id::text, f.event_id::text, e.name, 'PRESENTATION_PROCESSING', j.status, f.original_filename, j.created_at, NULL, CASE WHEN upper(j.status)='FAILED' THEN to_jsonb(j.logs) ELSE NULL END, NULL::integer
                FROM presentations.processing_jobs j JOIN presentations.files f ON f.id=j.file_id JOIN events.events e ON e.id=f.event_id WHERE e.organization_id=:org_id
                ORDER BY created_at DESC LIMIT 200
            """), {"org_id": organization_id})).mappings().all()
            connections = (await self.db.execute(text("SELECT c.id::text, p.name provider_name, c.is_active, c.version FROM integrations.connections c JOIN integrations.providers p ON p.id=c.provider_id WHERE c.organization_id=:org_id ORDER BY p.name"), {"org_id": organization_id})).mappings().all()
            failures = [dict(row) for row in jobs if str(row["status"]).lower() == "failed"]
            data = {"jobs": [dict(row) for row in jobs], "failures": failures, "provider_connections": [dict(row) for row in connections], "global_policy_owner": "Operations Console", "maintenance_mode": {"available": False, "reason": "No authoritative organization maintenance-mode policy is configured."}, "incident_timeline": {"available": False, "reason": "Organization incident records are not linked to a durable incident provider."}}
            available.configured = bool(jobs or connections)
        else:
            data, available = await self._legacy_domain_snapshot(organization_id, domain, now)

        return OrganizationDomainSnapshot(domain=domain, generated_at=now, availability=available, data=data)

    async def _legacy_domain_snapshot(self, organization_id: uuid.UUID, domain: str, now: datetime):
        if domain == "members":
            rows = (await self.db.execute(text("""SELECT m.id, m.user_id, COALESCE(u.email, m.invite_email) email, u.first_name, u.last_name, u.role, m.is_active, COALESCE(u.is_2fa_enabled, false) is_2fa_enabled, u.last_login_at, m.org_role, m.accepted_at, m.invited_at, COALESCE((SELECT jsonb_agg(a.event_id::text ORDER BY a.event_id::text) FROM access.user_event_assignments a JOIN events.events e ON e.id=a.event_id WHERE a.user_id=m.user_id AND e.organization_id=m.organization_id), '[]'::jsonb) event_ids FROM organizer_access.organization_members m LEFT JOIN identity.users u ON u.id=m.user_id WHERE m.organization_id=:org_id ORDER BY m.invited_at DESC LIMIT 100"""), {"org_id": organization_id})).mappings().all()
            return {"items": [dict(row) for row in rows], "total": len(rows)}, DomainAvailability(available=True, configured=bool(rows), freshness_at=now)
        if domain == "billing":
            rows = (await self.db.execute(text("SELECT id, status, plan_id, trial_ends_at, current_period_end, cancel_at_period_end, created_at FROM commerce.organization_subscriptions WHERE organization_id=:org_id ORDER BY created_at DESC"), {"org_id": organization_id})).mappings().all()
            invoices = (await self.db.execute(text("SELECT COUNT(*) count, COALESCE(SUM(amount),0) total FROM commerce.invoices WHERE organization_id=:org_id"), {"org_id": organization_id})).mappings().one()
            invoice_rows = (await self.db.execute(text("""SELECT i.id, i.event_id, i.invoice_number, i.amount, i.gst_amount, i.total_amount_inr, i.currency, i.status, i.due_date, i.paid_at, i.issued_at, i.version, COALESCE((SELECT jsonb_agg(jsonb_build_object('id', li.id, 'description', li.description, 'amount', li.amount, 'quantity', li.quantity) ORDER BY li.id) FROM commerce.invoice_items li WHERE li.invoice_id=i.id), '[]'::jsonb) items FROM commerce.invoices i WHERE i.organization_id=:org_id ORDER BY i.issued_at DESC LIMIT 100"""), {"org_id": organization_id})).mappings().all()
            payments = (await self.db.execute(text("""SELECT id, invoice_id, subscription_id, plan_name, amount, refunded_amount, currency, status, provider, provider_transaction_id, reconciliation_status, reconciled_at, created_at, version FROM commerce.subscription_transactions WHERE organization_id=:org_id ORDER BY created_at DESC LIMIT 100"""), {"org_id": organization_id})).mappings().all()
            methods = (await self.db.execute(text("""SELECT id, provider, card_brand, card_last4, is_default, created_at FROM commerce.payment_methods WHERE organization_id=:org_id ORDER BY is_default DESC, created_at DESC LIMIT 25"""), {"org_id": organization_id})).mappings().all()
            freshness = max([row["issued_at"] for row in invoice_rows if row["issued_at"]] + [row["created_at"] for row in payments if row["created_at"]] + [now])
            return {"subscriptions": [dict(row) for row in rows], "invoices": {**dict(invoices), "items": [dict(row) for row in invoice_rows]}, "payments": [dict(row) for row in payments], "payment_methods": [dict(row) for row in methods], "global_policy_owner": "Revenue Console"}, DomainAvailability(available=True, configured=bool(rows or invoice_rows or payments), freshness_at=freshness)
        if domain == "integrations":
            rows = (await self.db.execute(text("SELECT c.id, c.provider_id, c.is_active, c.version, p.name provider_name FROM integrations.connections c JOIN integrations.providers p ON p.id=c.provider_id WHERE c.organization_id=:org_id"), {"org_id": organization_id})).mappings().all()
            providers = (await self.db.execute(text("SELECT id, name, description FROM integrations.providers ORDER BY name"))).mappings().all()
            return {"connections": [dict(row) for row in rows], "providers": [dict(row) for row in providers], "global_policy_owner": "Developer Console"}, DomainAvailability(available=True, configured=bool(rows), freshness_at=now)
        if domain == "api-webhooks":
            keys = (await self.db.execute(text("SELECT id, name, prefix, is_active, expires_at, last_used_at, created_at FROM developer.developer_api_keys WHERE organization_id=:org_id ORDER BY created_at DESC"), {"org_id": organization_id})).mappings().all()
            hooks = (await self.db.execute(text("SELECT w.id, w.url, w.status, w.consecutive_failures, w.last_success_at, w.total_deliveries, w.total_failures FROM integrations.webhooks w JOIN events.events e ON e.id=w.event_id WHERE e.organization_id=:org_id ORDER BY w.created_at DESC"), {"org_id": organization_id})).mappings().all()
            deliveries = (await self.db.execute(text("""SELECT d.id, d.webhook_id, d.response_status, d.delivered_at FROM integrations.webhook_deliveries d JOIN integrations.webhooks w ON w.id=d.webhook_id JOIN events.events e ON e.id=w.event_id WHERE e.organization_id=:org_id ORDER BY d.delivered_at DESC LIMIT 100"""), {"org_id": organization_id})).mappings().all()
            api_usage = (await self.db.execute(text("""SELECT endpoint, SUM(call_count)::bigint call_count, MAX(recorded_at) last_recorded_at FROM analytics.api_usage WHERE organization_id=:org_id GROUP BY endpoint ORDER BY call_count DESC LIMIT 100"""), {"org_id": organization_id})).mappings().all()
            freshness = max([row["delivered_at"] for row in deliveries] + [row["last_recorded_at"] for row in api_usage if row["last_recorded_at"]] + [now])
            return {"api_keys": [dict(row) for row in keys], "webhooks": [dict(row) for row in hooks], "deliveries": [dict(row) for row in deliveries], "api_usage": [dict(row) for row in api_usage], "global_policy_owner": "Developer Console"}, DomainAvailability(available=True, configured=bool(keys or hooks), freshness_at=freshness)
        if domain == "storage":
            usage = await self.db.get(OrganizationUsage, organization_id)
            return {"storage_bytes": int(usage.storage_used_bytes) if usage else None, "calculated_at": usage.last_calculated_at if usage else None, "backups": {"available": False, "reason": "No authoritative backup execution provider is configured."}}, DomainAvailability(available=usage is not None, configured=usage is not None, reason=None if usage else "Usage aggregation has not produced a snapshot.", freshness_at=usage.last_calculated_at if usage else None)
        if domain in {"audit", "activity"}:
            rows = (await self.db.execute(text("SELECT id, actor_user_id, resource_type, resource_id, action_type, occurred_at, is_sensitive FROM command_center_audit.logs WHERE organization_id=:org_id ORDER BY occurred_at DESC LIMIT 100"), {"org_id": organization_id})).mappings().all()
            return {"items": [dict(row) for row in rows], "total": len(rows), "next_cursor": None}, DomainAvailability(available=True, configured=True, freshness_at=rows[0]["occurred_at"] if rows else now)
        raise HTTPException(status_code=404, detail="Organization console domain not found")

    async def _exists(self, model, organization_id: uuid.UUID) -> bool:
        return bool(await self.db.scalar(select(func.count(model.id)).where(model.organization_id == organization_id)))

    @staticmethod
    def _model_dict(row, exclude: set[str] | None = None) -> dict:
        if row is None:
            return {}
        excluded = exclude or set()
        return {column.name: getattr(row, column.name) for column in row.__table__.columns if column.name not in excluded}

    @staticmethod
    def _factor_status(score: int | None) -> str:
        if score is None:
            return "NOT_MEASURED"
        if score >= 85:
            return "HEALTHY"
        if score >= 60:
            return "ATTENTION"
        return "CRITICAL"

    @classmethod
    def _health_status(cls, score: int | None) -> str:
        return cls._factor_status(score)

    @staticmethod
    def _executive_summary(name: str, active_events: int, active_users: int, mfa_score: int | None, integrations: int, security_events: int, subscription) -> str:
        event_text = f"{active_events} active event{'s' if active_events != 1 else ''}"
        user_text = f"{active_users} active user{'s' if active_users != 1 else ''}"
        mfa_text = f"MFA coverage is {mfa_score}%" if mfa_score is not None else "MFA coverage is not measurable"
        plan_text = f"the {subscription.plan.name} plan" if subscription and subscription.plan else "no recorded subscription"
        risk_text = f"{security_events} high-priority security event{'s' if security_events != 1 else ''} require review" if security_events else "no high-priority security events are recorded"
        return f"{name} currently has {event_text}, {user_text}, and {integrations} connected integration{'s' if integrations != 1 else ''}. It is operating on {plan_text}. {mfa_text}, and {risk_text}."
