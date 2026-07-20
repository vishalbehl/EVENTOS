"""Create an idempotent, development-only organization dossier showcase.

Run from services/backend:
    .venv/Scripts/python.exe ops/seed_organization_dossier_demo.py
"""
from __future__ import annotations

import asyncio
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from sqlalchemy import select, text

import app.models  # noqa: F401 - register the complete ORM relationship graph
from app.config import settings
from app.database import AsyncSessionLocal
from app.modules.billing.models.licensing import EntitlementGrant
from app.modules.billing.models.subscription import (
    Addon, OrganizationAddon, OrganizationFeature, OrganizationSubscription,
    PlanFeature, SubscriptionPlan,
)
from app.modules.events.models.event import Event
from app.modules.identity.models.user import User
from app.modules.platform.models.feature import FeatureCatalog
from app.modules.platform.models.organization import Organization
from app.modules.rbac.models.organization_member import OrganizationMember

SLUG = "northstar-events-demo"


async def seed() -> None:
    if settings.environment == "production":
        raise SystemExit("Refusing to create demonstration data in production.")

    async with AsyncSessionLocal() as db:
        org = await db.scalar(select(Organization).where(Organization.slug == SLUG))
        if not org:
            org = Organization(
                name="Northstar Events Demo", slug=SLUG, billing_email="billing@northstar.demo",
                custom_domain="events.northstar.demo", country="IN", timezone="Asia/Kolkata",
                onboarding_completed=True, onboarding_step=7, organization_type="Event Agency",
                industry="Technology & Enterprise", expected_events_per_year="12-24",
                average_attendees_per_event="1,000-5,000", primary_goal="Run multi-venue conferences",
                language="English", portal_name="Northstar Command", currency="INR (₹)",
                enabled_modules=["registration", "speaker_management", "srr", "analytics", "venue_operations"],
            )
            db.add(org)
            await db.flush()

        owner = await db.scalar(select(User).where(User.email == "maya@northstar.demo"))
        if not owner:
            owner = User(organization_id=org.id, email="maya@northstar.demo", first_name="Maya", last_name="Rao", role="owner", is_active=True, is_2fa_enabled=True)
            db.add(owner)
            await db.flush()
        membership = await db.scalar(select(OrganizationMember).where(OrganizationMember.organization_id == org.id, OrganizationMember.user_id == owner.id))
        if not membership:
            db.add(OrganizationMember(organization_id=org.id, user_id=owner.id, org_role="owner", accepted_at=datetime.now(timezone.utc)))

        plan = await db.scalar(select(SubscriptionPlan).where(SubscriptionPlan.name == "NORTHSTAR ENTERPRISE DEMO"))
        if not plan:
            plan = SubscriptionPlan(name="NORTHSTAR ENTERPRISE DEMO", tagline="Enterprise event operations", description="Development-only dossier showcase plan", max_events=12, max_users=75, max_registrations=10000, max_speakers=500, max_sessions=300, max_rooms=40, storage_quota_mb=102400, currency="INR", price_per_event=175000, billing_model="PER_EVENT", is_active=True)
            db.add(plan)
            await db.flush()
        subscription = await db.scalar(select(OrganizationSubscription).where(OrganizationSubscription.organization_id == org.id, OrganizationSubscription.plan_id == plan.id))
        if not subscription:
            subscription = OrganizationSubscription(organization_id=org.id, plan_id=plan.id, status="ACTIVE", current_period_end=datetime.now(timezone.utc) + timedelta(days=270), status_reason="Development showcase subscription")
            db.add(subscription)
            await db.flush()
        grant = await db.scalar(select(EntitlementGrant).where(EntitlementGrant.organization_id == org.id, EntitlementGrant.source_ref == "northstar-demo-plan"))
        if not grant:
            db.add(EntitlementGrant(organization_id=org.id, subscription_id=subscription.id, grant_type="EVENT_UNIT", unit_type="EVENT", source_type="PLAN", source_ref="northstar-demo-plan", quantity_total=12, quantity_consumed=3, quantity_reserved=2, valid_until=subscription.current_period_end, metadata_json={"seed": "organization-dossier"}))

        features = (await db.execute(select(FeatureCatalog).order_by(FeatureCatalog.created_at).limit(8))).scalars().all()
        for feature in features[:5]:
            if not await db.scalar(select(PlanFeature).where(PlanFeature.plan_id == plan.id, PlanFeature.feature_id == feature.id)):
                db.add(PlanFeature(plan_id=plan.id, feature_id=feature.id, enabled=True))
        if len(features) > 5:
            override = await db.scalar(select(OrganizationFeature).where(OrganizationFeature.organization_id == org.id, OrganizationFeature.feature_id == features[5].id))
            if not override:
                db.add(OrganizationFeature(organization_id=org.id, feature_id=features[5].id, is_enabled=True, override_by=owner.id, effective_from=datetime.now(timezone.utc), expires_at=datetime.now(timezone.utc) + timedelta(days=90), reason="Extended for Northstar annual summit"))
        if len(features) > 6:
            override = await db.scalar(select(OrganizationFeature).where(OrganizationFeature.organization_id == org.id, OrganizationFeature.feature_id == features[6].id))
            if not override:
                db.add(OrganizationFeature(organization_id=org.id, feature_id=features[6].id, is_enabled=False, override_by=owner.id, effective_from=datetime.now(timezone.utc), reason="Disabled during security review"))

        addons = (await db.execute(select(Addon).where(Addon.is_active == True).limit(3))).scalars().all()
        if not addons:
            demo_addon = Addon(
                name="Northstar Premium Venue Operations",
                key="northstar-premium-venue-operations-demo",
                description="Development showcase add-on with SRR, venue staffing and hardware support.",
                addon_type="VENUE",
                short_description="Premium on-site operations package",
                scope_type="ORG_SCOPED",
                consumption_model="NON_CONSUMABLE",
                billing_unit="PER_EVENT",
                price_unit="event",
                final_price=85000,
                price_inr=85000,
                hardware_spec=[{"name": "SRR workstation", "quantity": 4}, {"name": "Confidence monitor", "quantity": 6}],
                staff_spec=[{"role": "SRR manager", "quantity": 1}, {"role": "Presentation technician", "quantity": 3}],
                inclusions=["On-site setup", "Show-day technical support", "Daily readiness report"],
                is_active=True,
            )
            db.add(demo_addon)
            await db.flush()
            addons = [demo_addon]
        for index, addon in enumerate(addons):
            existing = await db.scalar(select(OrganizationAddon).where(OrganizationAddon.organization_id == org.id, OrganizationAddon.addon_id == addon.id))
            if not existing:
                db.add(OrganizationAddon(organization_id=org.id, addon_id=addon.id, status="ACTIVE", quantity=index + 1, unit_price_snapshot=addon.final_price or addon.price_inr or 0, currency="INR", subscription_id=subscription.id, assignment_reason="Development dossier showcase", assigned_by=owner.id, expires_at=subscription.current_period_end))

        for index, (name, code, status) in enumerate((("Northstar Leadership Forum", "NSDLF26", "active"), ("Northstar Product Summit", "NSDPS26", "draft"), ("Northstar Partner Exchange", "NSDPX25", "completed"))):
            if not await db.scalar(select(Event).where(Event.short_code == code)):
                db.add(Event(organization_id=org.id, created_by=owner.id, name=name, short_code=code, location="Bengaluru", venue_name="Northstar Convention Centre", country="India", organizer_name="Northstar Events", start_date=date.today() + timedelta(days=60 * (index + 1)), end_date=date.today() + timedelta(days=60 * (index + 1) + 2), status=status, timezone="Asia/Kolkata"))

        invoice_exists = await db.scalar(text("SELECT id FROM billing.invoices WHERE organization_id = :org_id AND stripe_invoice_id = :reference"), {"org_id": org.id, "reference": "demo_northstar_001"})
        if not invoice_exists:
            await db.execute(text("""
                INSERT INTO billing.invoices
                    (id, organization_id, amount, currency, status, stripe_invoice_id, issued_at, due_date, paid_at, version, updated_at)
                VALUES
                    (gen_random_uuid(), :org_id, 619500, 'INR', 'PAID', :reference, now() - interval '21 days', now() - interval '7 days', now() - interval '14 days', 1, now())
            """), {"org_id": org.id, "reference": "demo_northstar_001"})

        await db.commit()
        print(f"Created/updated demo organization: {org.id}")
        print(f"Open: /organizations/{org.id}")


if __name__ == "__main__":
    asyncio.run(seed())
