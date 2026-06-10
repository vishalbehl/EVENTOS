import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from loguru import logger

from app.database import AsyncSessionLocal
from app.modules.identity.models.user import User
from app.modules.platform.models.organization import Organization
from app.modules.identity.services.auth_service import hash_password

from app.modules.rbac.models.rbac import Role, Permission, RolePermission

async def ensure_rbac_defaults():
    """Seed the database with standard roles and permissions."""
    async with AsyncSessionLocal() as db:
        try:
            # 1. Define Standard Permissions
            modules = ["EVENTS", "SESSIONS", "SPEAKERS", "FILES", "ROOMS", "QUEUE", "DEVICES", "USERS", "REPORTS", "POSTERS"]
            actions = ["VIEW", "CREATE", "EDIT", "DELETE", "APPROVE", "OVERRIDE", "EXPORT"]
            
            existing_perms_res = await db.execute(select(Permission.code))
            existing_perms = set(existing_perms_res.scalars().all())
            
            for mod in modules:
                for act in actions:
                    code = f"{mod}:{act}"
                    if code not in existing_perms:
                        perm = Permission(code=code, name=f"{act.capitalize()} {mod.capitalize()}", module=mod)
                        db.add(perm)
            
            # Custom Granular Registration Permissions
            custom_perms = [
                # Registration Domain
                ("PARTICIPANTS:IMPORT", "Import Participants from Excel", "PARTICIPANTS"),
                ("PARTICIPANTS:EXPORT", "Export Participants to Excel", "PARTICIPANTS"),
                # Approval Workflow
                ("REGISTRATION:VIEW_QUEUE", "View Registration Queue", "REGISTRATION"),
                ("REGISTRATION:APPROVE", "Approve Registration", "REGISTRATION"),
                ("REGISTRATION:REJECT", "Reject Registration", "REGISTRATION"),
                ("REGISTRATION:WAITLIST", "Manage Registration Waitlist", "REGISTRATION"),
                ("REGISTRATION:OVERRIDE", "Capacity Override", "REGISTRATION"),
                # Registration Config
                ("REG_CONFIG:VIEW", "View Registration Config", "REG_CONFIG"),
                ("REG_CONFIG:EDIT", "Edit Registration Config", "REG_CONFIG"),
                ("REG_CONFIG:PRICING", "Manage Registration Pricing", "REG_CONFIG"),
                ("REG_CONFIG:ROLES", "Manage Participant Roles", "REG_CONFIG"),
                ("REG_CONFIG:FORM", "Registration Form Builder", "REG_CONFIG"),
                ("REG_CONFIG:FAQ", "Configure Registration FAQs", "REG_CONFIG"),
                # Badges
                ("BADGES:VIEW", "View Badges", "BADGES"),
                ("BADGES:GENERATE", "Generate Badges", "BADGES"),
                ("BADGES:PRINT", "Print Badges", "BADGES"),
                ("BADGES:REPRINT", "Reprint Badges", "BADGES"),
                ("BADGES:TEMPLATES", "Manage Badge Templates", "BADGES"),
                ("BADGES:QUEUE", "View Badge Print Queue", "BADGES"),
                # Check-in
                ("CHECKIN:VIEW", "View Check-ins", "CHECKIN"),
                ("CHECKIN:QR", "QR Check-in Scanner", "CHECKIN"),
                ("CHECKIN:MANUAL", "Manual Check-in", "CHECKIN"),
                ("CHECKIN:UNDO", "Undo Check-in", "CHECKIN"),
                ("CHECKIN:LOGS", "View Attendance Logs", "CHECKIN"),
                # Payments
                ("PAYMENTS:VIEW", "View Payments", "PAYMENTS"),
                ("PAYMENTS:MARK_PAID", "Mark Payment as Paid", "PAYMENTS"),
                ("PAYMENTS:MARK_UNPAID", "Mark Payment as Unpaid", "PAYMENTS"),
                ("PAYMENTS:REFUND", "Issue Payment Refund", "PAYMENTS"),
                ("PAYMENTS:PRICING", "Configure Pricing Matrix", "PAYMENTS"),
                # Campaigns
                ("CAMPAIGNS:VIEW", "View Email Campaigns", "CAMPAIGNS"),
                ("CAMPAIGNS:CREATE", "Create Email Campaign", "CAMPAIGNS"),
                ("CAMPAIGNS:EDIT", "Edit Email Campaign", "CAMPAIGNS"),
                ("CAMPAIGNS:SEND", "Send Email Campaign", "CAMPAIGNS"),
                ("CAMPAIGNS:DELETE", "Delete Email Campaign", "CAMPAIGNS"),
                ("CAMPAIGNS:TEMPLATES", "Manage Campaign Templates", "CAMPAIGNS"),
                # Analytics
                ("ANALYTICS:REG_DASHBOARD", "View Registration Dashboard", "ANALYTICS"),
                ("ANALYTICS:HUB", "View Analytics Hub", "ANALYTICS"),
                ("ANALYTICS:EXPORT", "Export Analytics Reports", "ANALYTICS"),
            ]
            for code, name, mod in custom_perms:
                if code not in existing_perms:
                    perm = Permission(code=code, name=name, module=mod)
                    db.add(perm)
            
            await db.flush()
            
            # 2. Define Standard Roles
            roles_data = [
                ("Super Admin", "Full system access.", True),
                ("Event Organizer", "Manages events and teams.", False),
                ("Admin", "General administrative access.", False),
                ("Session Manager", "Manage sessions and speakers.", False),
                ("Technician", "Technical room operations.", False),
                ("Moderator", "Session flow control.", False),
                ("Speaker", "Own presentation management.", False),
                ("Viewer", "Read-only access.", False),
                ("Registration Manager", "Full registration control.", False),
                ("Registration Coordinator", "Participant operations.", False),
                ("Registration Reviewer", "Approval workflow.", False),
                ("Badge Manager", "Badge & print operations.", False),
                ("Check-in Staff", "Onsite operations.", False),
                ("Registration Viewer", "Read-only registration access.", False),
                ("Speaker Manager", "Manage speakers and eposters.", False),
                ("Room Manager", "Manage specific rooms.", False),
                ("Venue Operator", "Onsite room playback operations.", False),
            ]
            
            existing_roles_res = await db.execute(select(Role.name))
            existing_roles = set(existing_roles_res.scalars().all())
            
            for name, desc, is_sys in roles_data:
                if name not in existing_roles:
                    role = Role(name=name, description=desc, is_system_role=is_sys)
                    db.add(role)
            
            await db.flush()
            
            # 3. Assign Permissions to Roles
            res = await db.execute(select(Role))
            all_roles = {r.name: r for r in res.scalars().all()}
            
            res = await db.execute(select(Permission))
            all_perms = {p.code: p for p in res.scalars().all()}
            
            # Helper to assign
            async def assign_batch(role_name, codes):
                role = all_roles.get(role_name)
                if not role: return
                for c in codes:
                    p = all_perms.get(c)
                    if p:
                        # Check if already assigned
                        check = await db.execute(select(RolePermission).where(RolePermission.role_id == role.id, RolePermission.permission_id == p.id))
                        if not check.scalars().first():
                            db.add(RolePermission(role_id=role.id, permission_id=p.id))

            # Super Admin -> All
            if "Super Admin" in all_roles:
                await assign_batch("Super Admin", list(all_perms.keys()))
                
            # Viewer -> All VIEW
            if "Viewer" in all_roles:
                await assign_batch("Viewer", [c for c in all_perms.keys() if c.endswith(":VIEW")])

            # Event Organizer -> All except USERS:
            if "Event Organizer" in all_roles:
                eo_perms = [c for c in all_perms.keys() if not c.startswith("USERS:")]
                # Explicitly add base VIEW permissions
                eo_perms.extend(["EVENTS:VIEW", "USERS:VIEW"])
                await assign_batch("Event Organizer", eo_perms)

            # Admin -> All except USERS:DELETE and global billing
            if "Admin" in all_roles:
                admin_perms = [c for c in all_perms.keys() if c != "USERS:DELETE"]
                await assign_batch("Admin", admin_perms)

            # Session Manager -> Sessions, Speakers, Files, Posters
            if "Session Manager" in all_roles:
                sm_perms = [c for c in all_perms.keys() if c.startswith(("SESSIONS:", "SPEAKERS:", "FILES:", "POSTERS:"))]
                # Essential base VIEW permissions for navigation
                sm_perms.extend(["ROOMS:VIEW", "EVENTS:VIEW"])
                await assign_batch("Session Manager", sm_perms)

            # Technician -> Devices, Queue, Rooms, Files, Speakers, Sessions, Posters
            if "Technician" in all_roles:
                tech_perms = [c for c in all_perms.keys() if c.startswith(("DEVICES:", "QUEUE:", "ROOMS:", "FILES:", "SPEAKERS:", "SESSIONS:", "POSTERS:"))]
                tech_perms.append("EVENTS:VIEW")
                await assign_batch("Technician", tech_perms)

            # Registration Manager
            if "Registration Manager" in all_roles:
                reg_mgr_perms = [
                    "EVENTS:VIEW",
                    "PARTICIPANTS:VIEW", "PARTICIPANTS:CREATE", "PARTICIPANTS:EDIT", "PARTICIPANTS:DELETE", "PARTICIPANTS:IMPORT", "PARTICIPANTS:EXPORT",
                    "REGISTRATION:VIEW_QUEUE", "REGISTRATION:APPROVE", "REGISTRATION:REJECT", "REGISTRATION:WAITLIST", "REGISTRATION:OVERRIDE",
                    "REG_CONFIG:VIEW", "REG_CONFIG:EDIT", "REG_CONFIG:PRICING", "REG_CONFIG:ROLES", "REG_CONFIG:FORM", "REG_CONFIG:FAQ",
                    "BADGES:VIEW", "BADGES:GENERATE", "BADGES:PRINT", "BADGES:REPRINT", "BADGES:TEMPLATES", "BADGES:QUEUE",
                    "CHECKIN:VIEW", "CHECKIN:QR", "CHECKIN:MANUAL", "CHECKIN:UNDO", "CHECKIN:LOGS",
                    "PAYMENTS:VIEW", "PAYMENTS:MARK_PAID", "PAYMENTS:MARK_UNPAID", "PAYMENTS:REFUND", "PAYMENTS:PRICING",
                    "CAMPAIGNS:VIEW", "CAMPAIGNS:CREATE", "CAMPAIGNS:EDIT", "CAMPAIGNS:SEND", "CAMPAIGNS:DELETE", "CAMPAIGNS:TEMPLATES",
                    "ANALYTICS:REG_DASHBOARD", "ANALYTICS:HUB", "ANALYTICS:EXPORT",
                ]
                await assign_batch("Registration Manager", reg_mgr_perms)

            # Registration Coordinator
            if "Registration Coordinator" in all_roles:
                reg_coord_perms = [
                    "EVENTS:VIEW",
                    "PARTICIPANTS:VIEW", "PARTICIPANTS:CREATE", "PARTICIPANTS:EDIT", "PARTICIPANTS:IMPORT", "PARTICIPANTS:EXPORT",
                    "REGISTRATION:VIEW_QUEUE",
                    "REG_CONFIG:VIEW",
                    "BADGES:VIEW",
                    "CHECKIN:VIEW", "CHECKIN:LOGS",
                    "PAYMENTS:VIEW",
                    "CAMPAIGNS:VIEW", "CAMPAIGNS:CREATE", "CAMPAIGNS:EDIT", "CAMPAIGNS:SEND", "CAMPAIGNS:TEMPLATES",
                    "ANALYTICS:REG_DASHBOARD", "ANALYTICS:HUB", "ANALYTICS:EXPORT",
                ]
                await assign_batch("Registration Coordinator", reg_coord_perms)

            # Registration Reviewer
            if "Registration Reviewer" in all_roles:
                reg_rev_perms = [
                    "EVENTS:VIEW",
                    "PARTICIPANTS:VIEW", "PARTICIPANTS:EXPORT",
                    "REGISTRATION:VIEW_QUEUE", "REGISTRATION:APPROVE", "REGISTRATION:REJECT", "REGISTRATION:WAITLIST",
                    "REG_CONFIG:VIEW",
                    "ANALYTICS:REG_DASHBOARD", "ANALYTICS:HUB",
                ]
                await assign_batch("Registration Reviewer", reg_rev_perms)

            # Badge Manager
            if "Badge Manager" in all_roles:
                badge_mgr_perms = [
                    "EVENTS:VIEW",
                    "PARTICIPANTS:VIEW", "PARTICIPANTS:EXPORT",
                    "BADGES:VIEW", "BADGES:GENERATE", "BADGES:PRINT", "BADGES:REPRINT", "BADGES:TEMPLATES", "BADGES:QUEUE",
                    "CHECKIN:VIEW",
                ]
                await assign_batch("Badge Manager", badge_mgr_perms)

            # Check-in Staff
            if "Check-in Staff" in all_roles:
                checkin_perms = [
                    "EVENTS:VIEW",
                    "PARTICIPANTS:VIEW", "PARTICIPANTS:EXPORT",
                    "BADGES:VIEW",
                    "CHECKIN:VIEW", "CHECKIN:QR", "CHECKIN:MANUAL", "CHECKIN:UNDO", "CHECKIN:LOGS",
                ]
                await assign_batch("Check-in Staff", checkin_perms)

            # Registration Viewer
            if "Registration Viewer" in all_roles:
                reg_viewer_perms = [
                    "EVENTS:VIEW",
                    "PARTICIPANTS:VIEW",
                    "REG_CONFIG:VIEW",
                    "BADGES:VIEW",
                    "CHECKIN:VIEW", "CHECKIN:LOGS",
                    "PAYMENTS:VIEW",
                    "CAMPAIGNS:VIEW",
                    "ANALYTICS:REG_DASHBOARD", "ANALYTICS:HUB", "ANALYTICS:EXPORT",
                ]
                await assign_batch("Registration Viewer", reg_viewer_perms)

            # Speaker Manager
            if "Speaker Manager" in all_roles:
                spk_mgr_perms = [
                    "EVENTS:VIEW", "ROOMS:VIEW", "SESSIONS:VIEW",
                    "SPEAKERS:VIEW", "SPEAKERS:CREATE", "SPEAKERS:EDIT", "SPEAKERS:DELETE",
                    "FILES:VIEW", "FILES:CREATE", "FILES:EDIT", "FILES:DELETE", "FILES:APPROVE", "FILES:REJECT", "FILES:DOWNLOAD",
                    "POSTERS:VIEW", "POSTERS:CREATE", "POSTERS:EDIT", "POSTERS:DELETE",
                ]
                await assign_batch("Speaker Manager", spk_mgr_perms)

            # Room Manager
            if "Room Manager" in all_roles:
                rm_mgr_perms = [
                    "EVENTS:VIEW", "ROOMS:VIEW", "SESSIONS:VIEW", "SPEAKERS:VIEW", "FILES:VIEW", "POSTERS:VIEW",
                ]
                await assign_batch("Room Manager", rm_mgr_perms)

            # Venue Operator
            if "Venue Operator" in all_roles:
                vo_perms = [
                    "EVENTS:VIEW", "ROOMS:VIEW", "SESSIONS:VIEW", "SPEAKERS:VIEW", "FILES:VIEW", "POSTERS:VIEW",
                ]
                await assign_batch("Venue Operator", vo_perms)
            
            await db.commit()
            logger.info("RBAC defaults and assignments seeded.")
        except Exception as e:
            logger.error(f"Failed to seed RBAC defaults: {e}")
            await db.rollback()

async def ensure_event_settings_defaults(db: AsyncSession):
    """Scan all events and ensure they have registration and speaker theme settings seeded with defaults."""
    from app.modules.events.models.event import Event
    from app.modules.registration.models.registration_theme_setting import RegistrationThemeSetting
    from app.modules.speakers.models.speaker_theme_setting import SpeakerThemeSetting, DEFAULT_SPEAKER_TERMS, DEFAULT_SPEAKER_FAQS
    from app.modules.registration.routers.registration_portal import DEFAULT_TERMS, DEFAULT_FAQS

    result = await db.execute(select(Event))
    events = result.scalars().all()
    
    updated = False
    for event in events:
        if not event.registration_theme_setting:
            event.registration_theme_setting = RegistrationThemeSetting(
                terms_and_conditions=DEFAULT_TERMS,
                faqs=DEFAULT_FAQS
            )
            db.add(event.registration_theme_setting)
            updated = True
        else:
            if not event.registration_theme_setting.terms_and_conditions:
                event.registration_theme_setting.terms_and_conditions = DEFAULT_TERMS
                updated = True
            if not event.registration_theme_setting.faqs:
                event.registration_theme_setting.faqs = DEFAULT_FAQS
                updated = True

        if not event.speaker_theme_setting:
            event.speaker_theme_setting = SpeakerThemeSetting(
                terms_and_conditions=DEFAULT_SPEAKER_TERMS,
                faqs=DEFAULT_SPEAKER_FAQS
            )
            db.add(event.speaker_theme_setting)
            updated = True
        else:
            if not event.speaker_theme_setting.terms_and_conditions:
                event.speaker_theme_setting.terms_and_conditions = DEFAULT_SPEAKER_TERMS
                updated = True
            if not event.speaker_theme_setting.faqs:
                event.speaker_theme_setting.faqs = DEFAULT_SPEAKER_FAQS
                updated = True
                
    if updated:
        await db.commit()
        logger.info("Database default templates and FAQ/Terms settings auto-seeded/synced.")


async def ensure_plans_and_features():
    """Seed the database with default subscription plans and features."""
    from app.modules.platform.models.feature import FeatureCatalog
    from app.modules.billing.models.subscription import SubscriptionPlan, PlanFeature
    
    async with AsyncSessionLocal() as db:
        try:
            # 1. Seed Feature Catalog
            features = [
                # Registration
                {"key": "ADV_REG_APPROVALS", "name": "Advanced Registrations Approvals", "category": "Registration", "description": "Manage approval queues, waitlists, and registration queue status."},
                {"key": "ADV_BADGE_PRINTING", "name": "Advanced Badge Printing", "category": "Registration", "description": "Generate, manage, print and reprint participant badges onsite."},
                {"key": "ADV_REPORTING", "name": "Advanced Reports & Financials", "category": "Registration", "description": "Access financial transactions, custom Excel exports and analytics dashboards."},
                # Speaker Management
                {"key": "ADV_PRESENTATION_WORKFLOW", "name": "Advanced Speaker Presentation Workflow", "category": "Speaker Management", "description": "Enable speaker profile portals, uploading talk slides/videos, and administrative file approval queues."},
                {"key": "ADV_POSTERS", "name": "E-Poster & Digital Posters Management", "category": "Speaker Management", "description": "Manage digital poster uploads, categories, and interactive terminal display formats."},
                {"key": "ADV_SCIENTIFIC_PROGRAM", "name": "Scientific Session Schedule & Rooms Builder", "category": "Speaker Management", "description": "Build multi-track schedules, room configurations, and sync speaker allocations."},
                # Enterprise
                {"key": "ENT_API_ACCESS", "name": "Enterprise API Keys", "category": "Enterprise", "description": "Provision developer API keys and configure custom rate limits for external integrations."},
                {"key": "ENT_SSO", "name": "Single Sign-On (SSO) Integrations", "category": "Enterprise", "description": "Integrate third-party SAML/OIDC identity providers for single sign-on security."},
                {"key": "ENT_SPONSOR_MGMT", "name": "Sponsor Management Module", "category": "Enterprise", "description": "Manage sponsors, delegate deliverables, build interactive booths, and invoice packages."},
                {"key": "ENT_AI_TOOLS", "name": "AI Assistant & Auto-scheduling tools", "category": "Enterprise", "description": "Leverage generative AI for prompt builders, message drafts, and scheduling assistants."},
                # Addon
                {"key": "ADDON_VENUE_OPERATIONS", "name": "Onsite Venue Edge Sync & SRR Kiosks", "category": "Add-ons", "description": "Sync offline room playback devices and SRR kiosks with the platform edge database."},
            ]
            
            existing_feats_res = await db.execute(select(FeatureCatalog.key))
            existing_feats = set(existing_feats_res.scalars().all())
            
            for f_data in features:
                if f_data["key"] not in existing_feats:
                    feat = FeatureCatalog(
                        key=f_data["key"],
                        name=f_data["name"],
                        category=f_data["category"],
                        description=f_data["description"]
                    )
                    db.add(feat)
            
            await db.flush()
            
            # Fetch all features to get their IDs
            feat_res = await db.execute(select(FeatureCatalog))
            all_feats = {f.key: f for f in feat_res.scalars().all()}
            
            # 2. Seed Default Plans
            plans = [
                {
                    "name": "Starter",
                    "description": "Perfect for small events and basic registration.",
                    "max_events": 3,
                    "max_users": 3,
                    "max_registrations": 200,
                    "max_rooms": 3,
                    "storage_quota_mb": 2048, # 2 GB
                    "features": []
                },
                {
                    "name": "Professional",
                    "description": "For scaling events needing advanced workflows and badge printing.",
                    "max_events": 10,
                    "max_users": 10,
                    "max_registrations": 2000,
                    "max_rooms": 15,
                    "storage_quota_mb": 10240, # 10 GB
                    "features": [
                        "ADV_REG_APPROVALS", "ADV_BADGE_PRINTING", "ADV_REPORTING",
                        "ADV_PRESENTATION_WORKFLOW", "ADV_POSTERS", "ADV_SCIENTIFIC_PROGRAM"
                    ]
                },
                {
                    "name": "Enterprise",
                    "description": "Full control, advanced security, API access, and integrations.",
                    "max_events": 100,
                    "max_users": 50,
                    "max_registrations": 100000,
                    "max_rooms": 100,
                    "storage_quota_mb": 102400, # 100 GB
                    "features": [
                        "ADV_REG_APPROVALS", "ADV_BADGE_PRINTING", "ADV_REPORTING",
                        "ADV_PRESENTATION_WORKFLOW", "ADV_POSTERS", "ADV_SCIENTIFIC_PROGRAM",
                        "ENT_API_ACCESS", "ENT_SSO", "ENT_SPONSOR_MGMT", "ENT_AI_TOOLS"
                    ]
                }
            ]
            
            existing_plans_res = await db.execute(select(SubscriptionPlan.name))
            existing_plans = set(existing_plans_res.scalars().all())
            
            for p_data in plans:
                if p_data["name"] not in existing_plans:
                    plan = SubscriptionPlan(
                        name=p_data["name"],
                        description=p_data["description"],
                        max_events=p_data["max_events"],
                        max_users=p_data["max_users"],
                        max_registrations=p_data["max_registrations"],
                        max_rooms=p_data["max_rooms"],
                        storage_quota_mb=p_data["storage_quota_mb"],
                        is_active=True
                    )
                    db.add(plan)
                    await db.flush() # get plan.id
                    
                    # Link features
                    for f_key in p_data["features"]:
                        feat = all_feats.get(f_key)
                        if feat:
                            db.add(PlanFeature(plan_id=plan.id, feature_id=feat.id, enabled=True))
            
            await db.commit()
            logger.info("Subscription plans and features seeded.")
        except Exception as e:
            logger.error(f"Failed to seed plans and features: {e}")
            await db.rollback()


async def ensure_admin_user():
    """
    Ensures that at least one organization and one admin user exist in the database.
    Default Admin: admin@eventos.com / admin123
    """
    # Seed RBAC first
    await ensure_rbac_defaults()
    
    # Seed plans and features
    await ensure_plans_and_features()
    
    # Seed Email Templates
    try:
        from app.modules.notifications.tasks.seed_email_data import seed_templates
        await seed_templates()
    except Exception as e:
        logger.error(f"Failed to seed email templates: {e}")
    
    async with AsyncSessionLocal() as db:
        try:
            # Seed event default settings if missing
            await ensure_event_settings_defaults(db)

            # 1. Check if any organization exists
            result = await db.execute(select(Organization))
            org = result.scalars().first()

            if not org:
                logger.info("No organization found. Creating default organization...")
                org = Organization(
                    id=uuid.uuid4(),
                    name="Default Organization",
                    slug="default-org"
                )
                db.add(org)
                await db.flush()

            # 2. Check if any Super Admin exists
            result = await db.execute(select(User).where(User.role == "super_admin"))
            super_admin = result.first()

            if not super_admin:
                admin_email = "admin@eventos.com"
                logger.info(f"No Super Admin found. Creating default admin {admin_email}...")
                admin = User(
                    id=uuid.uuid4(),
                    organization_id=org.id,
                    email=admin_email,
                    password_hash=hash_password("admin123"),
                    first_name="Default",
                    last_name="Admin",
                    role="super_admin",
                    is_active=True
                )
                db.add(admin)
                await db.commit()
                logger.info(f"Created default admin: {admin_email} / admin123")
            else:
                logger.debug("At least one Super Admin already exists. Skipping default admin creation.")

        except Exception as e:
            logger.error(f"Failed to ensure admin user: {e}")
            await db.rollback()
