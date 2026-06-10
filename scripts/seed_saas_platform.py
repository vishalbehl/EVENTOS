import asyncio
import uuid
import app.main  # Ensure all SQLAlchemy models are registered
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from loguru import logger

from app.database import AsyncSessionLocal
from app.modules.billing.models.subscription import (
    SubscriptionPlan, OrganizationSubscription, FeatureCatalog, PlanFeature,
    Addon, AddonFeature, OrganizationAddon, UsageMetric, OrganizationHealth
)
from app.modules.platform.models.organization import Organization
from app.modules.identity.models.user import User
from app.modules.rbac.models.organization_member import OrganizationMember

async def seed_feature_catalog(db: AsyncSession):
    features = [
        {"key": "CORE:EVENTS", "name": "Event Management", "category": "core", "is_addon": False},
        {"key": "CORE:SESSIONS", "name": "Session Management", "category": "core", "is_addon": False},
        {"key": "CORE:SPEAKERS", "name": "Speaker Management", "category": "core", "is_addon": False},
        {"key": "CORE:REGISTRATION", "name": "Registration Portal", "category": "core", "is_addon": False},
        
        {"key": "ADV:REG_APPROVALS", "name": "Registration Approvals", "category": "advanced", "is_addon": False},
        {"key": "ADV:PRESENTATION_WORKFLOW", "name": "Presentation Approvals", "category": "advanced", "is_addon": False},
        {"key": "ADV:POSTERS", "name": "Digital Posters", "category": "advanced", "is_addon": False},
        {"key": "ADV:REPORTING", "name": "Advanced Reporting", "category": "advanced", "is_addon": False},
        
        {"key": "ENT:API_ACCESS", "name": "API Access", "category": "enterprise", "is_addon": False},
        {"key": "ENT:SSO", "name": "SSO", "category": "enterprise", "is_addon": False},
        
        {"key": "ADDON:VENUE_OPERATIONS", "name": "Venue Operations SDK", "category": "addon", "is_addon": True},
        {"key": "ADDON:AI_ASSISTANT", "name": "AI Assistant", "category": "addon", "is_addon": True},
    ]
    
    catalog_map = {}
    for f in features:
        stmt = select(FeatureCatalog).where(FeatureCatalog.key == f["key"])
        existing = (await db.execute(stmt)).scalar_one_or_none()
        if not existing:
            existing = FeatureCatalog(**f)
            db.add(existing)
        catalog_map[f["key"]] = existing
        
    await db.flush()
    return catalog_map

async def seed_saas_plans():
    """Seed dynamic Feature Catalog, Plans, and Addons."""
    async with AsyncSessionLocal() as db:
        try:
            # 1. Seed Features
            catalog_map = await seed_feature_catalog(db)
            
            # 2. Seed Addons
            venue_addon_stmt = select(Addon).where(Addon.name == "Venue Operations")
            venue_addon = (await db.execute(venue_addon_stmt)).scalar_one_or_none()
            if not venue_addon:
                venue_addon = Addon(name="Venue Operations", monthly_price=499.0)
                db.add(venue_addon)
                await db.flush()
                # Link feature
                db.add(AddonFeature(addon_id=venue_addon.id, feature_id=catalog_map["ADDON:VENUE_OPERATIONS"].id))

            # 3. Seed Plans
            plans = [
                {
                    "name": "REGISTRATION",
                    "max_events": 3,
                    "features": ["CORE:EVENTS", "CORE:SESSIONS", "CORE:SPEAKERS", "CORE:REGISTRATION"]
                },
                {
                    "name": "CONFERENCE_PROFESSIONAL",
                    "max_events": 10,
                    "features": ["CORE:EVENTS", "CORE:SESSIONS", "CORE:SPEAKERS", "CORE:REGISTRATION", "ADV:REG_APPROVALS", "ADV:PRESENTATION_WORKFLOW", "ADV:POSTERS", "ADV:REPORTING"]
                },
                {
                    "name": "ENTERPRISE",
                    "max_events": 9999,
                    "features": ["CORE:EVENTS", "CORE:SESSIONS", "CORE:SPEAKERS", "CORE:REGISTRATION", "ADV:REG_APPROVALS", "ADV:PRESENTATION_WORKFLOW", "ADV:POSTERS", "ADV:REPORTING", "ENT:API_ACCESS", "ENT:SSO"]
                }
            ]
            
            plan_objs = {}
            for p_data in plans:
                stmt = select(SubscriptionPlan).where(SubscriptionPlan.name == p_data["name"])
                plan = (await db.execute(stmt)).scalar_one_or_none()
                if not plan:
                    plan = SubscriptionPlan(name=p_data["name"], max_events=p_data["max_events"])
                    db.add(plan)
                    await db.flush()
                    
                    # Link features
                    for f_key in p_data["features"]:
                        db.add(PlanFeature(plan_id=plan.id, feature_id=catalog_map[f_key].id))
                plan_objs[p_data["name"]] = plan

            await db.commit()
            logger.info("Phase 2 SaaS Catalog, Plans, and Addons seeded.")
        except Exception as e:
            logger.error(f"Failed to seed SaaS Phase 2 models: {e}")
            await db.rollback()

async def grandfather_existing_tenants():
    """Migrate organizations to Conference Professional + Venue Operations Addon."""
    async with AsyncSessionLocal() as db:
        try:
            pro_plan = (await db.execute(select(SubscriptionPlan).where(SubscriptionPlan.name == "CONFERENCE_PROFESSIONAL"))).scalar_one_or_none()
            venue_addon = (await db.execute(select(Addon).where(Addon.name == "Venue Operations"))).scalar_one_or_none()

            org_stmt = select(Organization).outerjoin(OrganizationSubscription).where(OrganizationSubscription.id == None)
            orgs_without_sub = (await db.execute(org_stmt)).scalars().all()
            
            for org in orgs_without_sub:
                sub = OrganizationSubscription(organization_id=org.id, plan_id=pro_plan.id, status="ACTIVE")
                db.add(sub)
                db.add(UsageMetric(organization_id=org.id))
                db.add(OrganizationHealth(organization_id=org.id))
                db.add(OrganizationAddon(organization_id=org.id, addon_id=venue_addon.id))
            
            await db.commit()
            logger.info(f"Grandfathered {len(orgs_without_sub)} tenants to Pro + Venue Operations.")
        except Exception as e:
            logger.error(f"Failed to grandfather tenants: {e}")
            await db.rollback()

async def main():
    await seed_saas_plans()
    await grandfather_existing_tenants()

if __name__ == "__main__":
    asyncio.run(main())
