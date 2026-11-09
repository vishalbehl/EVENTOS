import app.models  # noqa: F401
import uuid
import json
from sqlalchemy import select, delete, update, text, func
from sqlalchemy.ext.asyncio import AsyncSession
from loguru import logger

from app.database import AsyncSessionLocal
from app.config import settings
from app.modules.identity.models.user import User
from app.modules.platform.models.organization import Organization
from app.modules.identity.services.auth_service import hash_password

from app.modules.rbac.models.rbac import Role, Permission, RolePermission

LEGACY_NON_ENFORCED_FEATURE_KEYS = {
    "FEAT_24x7_SUPPORT",
    "FEAT_EMAIL_SUPPORT",
    "FEAT_OFFICE_HOURS_SUPPORT",
    "FEAT_PRIORITY_SUPPORT",
}

try:
    import bcrypt

    if not hasattr(bcrypt, "__about__"):
        class MockAbout:
            __version__ = getattr(bcrypt, "__version__", "4.0.0")

        bcrypt.__about__ = MockAbout
except ImportError:
    pass

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
                ("BADGES:EXPORT", "Export Badge Manifests", "BADGES"),
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
                ("ANNOUNCEMENTS:VIEW", "View Event Announcements", "CAMPAIGNS"),
                ("ANNOUNCEMENTS:EDIT", "Manage Event Announcements", "CAMPAIGNS"),
                # Developer capabilities
                ("DEVELOPER:API_USE", "Use Developer APIs", "DEVELOPER"),
                ("DEVELOPER:WEBHOOKS_MANAGE", "Manage Webhooks", "DEVELOPER"),
                ("DEVELOPER:INTEGRATIONS_MANAGE", "Manage Integrations", "DEVELOPER"),
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
                ("Event Organizer", "Manages events and teams.", True),
                ("Admin", "General administrative access.", True),
                ("Session Manager", "Manage sessions and speakers.", True),
                ("Technician", "Technical room operations.", True),
                ("Moderator", "Session flow control.", True),
                ("Speaker", "Own presentation management.", True),
                ("Viewer", "Read-only access.", True),
                ("Registration Manager", "Full registration control.", True),
                ("Registration Coordinator", "Participant operations.", True),
                ("Registration Reviewer", "Approval workflow.", True),
                ("Badge Manager", "Badge & print operations.", True),
                ("Check-in Staff", "Onsite operations.", True),
                ("Registration Viewer", "Read-only registration access.", True),
                ("Speaker Manager", "Manage speakers and eposters.", True),
                ("Room Manager", "Manage specific rooms.", True),
                ("Venue Operator", "Onsite room playback operations.", True),
            ]
            
            existing_roles_res = await db.execute(select(Role).where(Role.organization_id.is_(None)))
            existing_roles = {role.name: role for role in existing_roles_res.scalars().all()}
            
            for name, desc, is_sys in roles_data:
                if name not in existing_roles:
                    role = Role(name=name, description=desc, is_system_role=is_sys)
                    db.add(role)
                else:
                    existing_roles[name].is_system_role = is_sys
            
            await db.flush()
            
            # 3. Assign Permissions to Roles
            res = await db.execute(select(Role).where(Role.organization_id.is_(None)))
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
    """Scan all events and ensure they have unified portal theme settings and participant roles seeded with defaults."""
    from app.modules.events.models.event import Event
    from app.modules.registration.models.portal_theme_setting import PortalThemeSetting
    from app.modules.registration.routers.registration_portal import DEFAULT_TERMS, DEFAULT_FAQS
    from app.modules.registration.models.participant_role import ParticipantRole
    from app.modules.registration.routers.participant_roles import seed_default_roles

    result = await db.execute(select(Event))
    events = result.scalars().all()
    
    updated = False
    for event in events:
        # 1. Ensure event participant roles are seeded
        roles_count = await db.scalar(
            select(func.count(ParticipantRole.id)).where(ParticipantRole.event_id == event.id)
        )
        if not roles_count:
            logger.info(f"Auto-seeding default participant roles for event: {event.id} ({event.name})")
            await seed_default_roles(event.id, db, commit=False)
            updated = True

        # 2. Ensure portal theme settings
        if not event.portal_theme_setting:
            event.portal_theme_setting = PortalThemeSetting(
                theme_color="#6366F1",
                primary_color="#6366F1",
                secondary_color="#8B5CF6",
                theme_preset="dark-luxury",
                svg_pattern="glow-wave",
                dark_mode_default=True,
                terms_and_conditions=DEFAULT_TERMS,
                faqs=DEFAULT_FAQS,
            )
            db.add(event.portal_theme_setting)
            updated = True
        else:
            if not event.portal_theme_setting.terms_and_conditions:
                event.portal_theme_setting.terms_and_conditions = DEFAULT_TERMS
                updated = True
            if not event.portal_theme_setting.faqs:
                event.portal_theme_setting.faqs = DEFAULT_FAQS
                updated = True
                
    if updated:
        await db.commit()
        logger.info("Database default templates, participant roles, and FAQ/Terms settings auto-seeded/synced.")


async def ensure_plans_and_features():
    """Synchronize only the code-owned capability catalogue.

    Cloud pricing is managed exclusively through the versioned commercial
    catalogue. Startup never creates or mutates commercial offers, prices,
    allocations, contracts, or capacity add-ons.
    """
    from app.modules.billing.services.capability_service import CapabilityService

    async with AsyncSessionLocal() as db:
        await CapabilityService.sync_catalogue(db)
        await db.commit()
        logger.info("Canonical capability catalogue synchronized.")
async def ensure_admin_user():
    """
    Seed local development defaults and verify production bootstrap state.

    Production never creates a privileged account with a known password. The
    first super administrator must be provisioned through an audited one-off
    identity bootstrap process.
    """
    import app.models  # noqa: F401

    # Seed plans and features
    await ensure_plans_and_features()
    # Seed RBAC system roles and permissions
    await ensure_rbac_defaults()
    
    async with AsyncSessionLocal() as db:
        try:
            # Seed event default settings if missing
            await ensure_event_settings_defaults(db)

            await db.execute(
                text(
                    """
                    UPDATE platform.organizations
                    SET name = 'Eventos',
                        slug = 'Eventos',
                        is_platform_org = true
                    WHERE slug = 'default-org'
                    """
                )
            )

            org_id = await db.scalar(text("""
                SELECT id
                FROM platform.organizations
                WHERE lower(slug) = 'eventos' OR is_platform_org = true
                ORDER BY CASE WHEN lower(slug) = 'eventos' THEN 0 ELSE 1 END, created_at, id
                LIMIT 1
            """))
            if not org_id:
                org_id = uuid.uuid4()
                logger.info("No organization found. Creating default organization Eventos...")
                await db.execute(
                    text(
                        """
                        INSERT INTO platform.organizations (
                            id, name, slug, is_platform_org,
                            is_internal_unrestricted, event_count, primary_color,
                            secondary_color,
                            country, timezone, is_active, onboarding_completed,
                            language, date_format, time_format, currency,
                            onboarding_step, onboarding_draft, created_at, updated_at
                        )
                        VALUES (
                            :id, 'Eventos', 'Eventos', true,
                            true, 0, '#6366f1', '#8b5cf6',
                            'IN', 'Asia/Kolkata', true, true,
                            'English', 'DD/MM/YYYY', '24 Hour', 'INR (₹)',
                            0, '{}'::jsonb, now(), now()
                        )
                        """
                    ),
                    {"id": org_id},
                )

            # Startup validation keeps the durable bypass exclusive to the
            # canonical seed tenant. Clear any copied/invalid marker before
            # enabling Eventos so the partial unique index is never contested.
            invalid_unrestricted = await db.execute(
                text(
                    """
                    UPDATE platform.organizations
                    SET is_internal_unrestricted = false
                    WHERE lower(slug) != 'eventos'
                      AND is_internal_unrestricted = true
                    """
                )
            )
            if invalid_unrestricted.rowcount:
                logger.warning(
                    "Cleared is_internal_unrestricted from {} non-Eventos organization(s).",
                    invalid_unrestricted.rowcount,
                )
            await db.execute(
                text(
                    """
                    UPDATE platform.organizations
                    SET is_platform_org = true,
                        is_internal_unrestricted = true,
                        onboarding_completed = true
                    WHERE lower(slug) = 'eventos' OR is_platform_org = true
                    """
                )
            )
                    
            # 2. Check if any Super Admin exists
            super_admin = await db.scalar(
                text("SELECT id FROM identity.users WHERE role = 'super_admin' LIMIT 1")
            )

            if not super_admin:
                if settings.is_production:
                    logger.warning(
                        "No super administrator exists. Production startup will not create "
                        "a default privileged credential; run the audited identity bootstrap."
                    )
                    await db.commit()
                else:
                    admin_email = "admin@eventos.com"
                    logger.info(f"No Super Admin found. Creating local development admin {admin_email}...")
                    created_admin_id = uuid.uuid4()
                    await db.execute(
                        text(
                            """
                            INSERT INTO identity.users (
                                id, organization_id, email, password_hash,
                                first_name, last_name, role, is_active,
                                is_platform_admin, is_2fa_enabled,
                                notification_preferences, created_at
                            )
                            VALUES (
                                :id, :organization_id, :email, :password_hash,
                                'Default', 'Admin', 'super_admin', true,
                                true, false,
                                CAST(:notification_preferences AS jsonb), now()
                            )
                            """
                        ),
                        {
                            "id": created_admin_id,
                            "organization_id": org_id,
                            "email": admin_email,
                            "password_hash": hash_password("admin123"),
                            "notification_preferences": json.dumps({
                                "email_alerts": True,
                                "security_alerts": True,
                                "marketing": False,
                            }),
                        },
                    )
                    await db.commit()
                    super_admin = created_admin_id
                    logger.info("Created local development admin account.")
            else:
                logger.debug("At least one Super Admin already exists. Skipping default admin creation.")
                await db.commit()

            if super_admin:
                from app.core.tenant_context import TenantContextGuard
                from app.modules.rbac.services.default_teams import ensure_default_organization_teams

                async with TenantContextGuard.scoped(db, org_id):
                    await ensure_default_organization_teams(
                        db,
                        org_id,
                        created_by=super_admin,
                    )
                await db.commit()

        except Exception as e:
            logger.error(f"Failed to ensure admin user: {e}")
            await db.rollback()
            if settings.is_production:
                raise


async def ensure_system_template_defaults():
    """Install the small, code-owned platform template set on a fresh database.

    This deliberately creates only platform defaults.  Organization and event
    templates are user-owned and must be created through their normal APIs;
    startup must never manufacture copies for every tenant or event.
    """
    import app.models  # noqa: F401
    from app.modules.identity.models.user import User
    from app.modules.notifications.tasks.seed_email_data import seed_templates
    from app.modules.registration.application.queries import FormBuilderQueryService
    from app.modules.templates.models import WebsiteTemplate, WebsiteTemplateDraft
    from app.modules.website_builder.router import _checksum, _default_platform_template_document

    # The email seeder owns both its stable-key upsert and initial published
    # version.  Keep it separate from the following transaction so a failure
    # cannot leave a website/form half-created while rolling back email data.
    await seed_templates()

    async with AsyncSessionLocal() as db:
        try:
            # FormBuilderQueryService owns the canonical standard registration
            # form document.  It is idempotent and creates it only if the
            # global system template set is absent.
            await FormBuilderQueryService(db)._ensure_global_templates()

            template = await db.scalar(
                select(WebsiteTemplate).where(
                    WebsiteTemplate.template_type == "WEBSITE",
                    WebsiteTemplate.slug == "master-event-website",
                    WebsiteTemplate.is_system.is_(True),
                )
            )
            if template is None:
                default_admin = await db.scalar(
                    select(User).where(User.email == "admin@eventos.com")
                )
                if default_admin is None:
                    raise RuntimeError(
                        "Cannot seed the platform website template without admin@eventos.com"
                    )
                template = WebsiteTemplate(
                    id=uuid.uuid4(),
                    name="Master Event Website Template",
                    slug="master-event-website",
                    description="Global master website template for event websites.",
                    template_type="WEBSITE",
                    status="DRAFT",
                    visibility="PUBLIC",
                    is_system=True,
                    is_marketplace=False,
                    created_by=default_admin.id,
                    updated_by=default_admin.id,
                )
                db.add(template)
                await db.flush()

            draft = await db.scalar(
                select(WebsiteTemplateDraft).where(
                    WebsiteTemplateDraft.template_id == template.id
                )
            )
            if draft is None:
                document = _default_platform_template_document()
                db.add(
                    WebsiteTemplateDraft(
                        id=uuid.uuid4(),
                        template_id=template.id,
                        document=document,
                        schema_version=1,
                        checksum=_checksum(document),
                        optimistic_version=1,
                    )
                )

            await db.commit()
            logger.info("Platform email, website, and form defaults verified.")
        except Exception:
            await db.rollback()
            raise


async def ensure_agenda_rooms_schema():
    """Record that the canonical room schema is migration-owned.

    Schema changes are deliberately not attempted during application startup.
    Deployments must run Alembic before starting API or worker containers.
    """
    logger.debug("Room schema validation is migration-owned; no startup DDL executed.")


async def ensure_agenda_types_defaults():
    """Auto-populate all types tables in agenda schema (room_types, session_types, agenda_roles, track_types)."""
    async with AsyncSessionLocal() as db:
        try:
            # 1. Room Types
            await db.execute(
                text("""
                INSERT INTO agenda.room_types (id, name, code, description, is_system, is_active, created_at, updated_at)
                SELECT gen_random_uuid(), defaults.name, defaults.code, defaults.description, true, true, now(), now()
                FROM (VALUES
                    ('Main Hall / Auditorium', 'MAIN_HALL', 'Primary conference hall for keynotes and plenary sessions'),
                    ('Auditorium', 'AUDITORIUM', 'Large lecture auditorium with tiered seating'),
                    ('Plenary Hall', 'PLENARY_HALL', 'Dedicated plenary and general assembly hall'),
                    ('Breakout Room', 'BREAKOUT', 'Medium-sized room for parallel tracks and interactive sessions'),
                    ('Workshop / Hands-on Lab', 'WORKSHOP', 'Equipped room for training, workshops, and practical demos'),
                    ('Boardroom / Meeting Room', 'BOARDROOM', 'Executive meeting and committee room'),
                    ('Meeting Room', 'MEETING_ROOM', 'Flexible meeting room for committees and working groups'),
                    ('Seminar Room', 'SEMINAR_ROOM', 'Seminar room for focused presentations and discussion'),
                    ('Training Room', 'TRAINING_ROOM', 'Training room with configurable teaching layout'),
                    ('Classroom', 'CLASSROOM', 'Classroom-style learning space'),
                    ('Laboratory', 'LABORATORY', 'Specialized technical or scientific laboratory'),
                    ('Poster Exhibition Area', 'POSTER', 'Exhibition area for scientific posters and ePosters'),
                    ('Exhibition Hall', 'EXHIBITION', 'Exhibitor booths, demonstrations, and sponsor displays'),
                    ('Networking Lounge', 'NETWORKING_LOUNGE', 'Informal networking and hospitality area'),
                    ('Registration Desk', 'REGISTRATION', 'Attendee registration, help desk, and badge collection'),
                    ('Dining Area', 'DINING', 'Meal service and dining area'),
                    ('Banquet Hall', 'BANQUET', 'Formal dinner, reception, or awards venue'),
                    ('Press Room', 'PRESS_ROOM', 'Media interviews, press briefings, and content work'),
                    ('Green Room', 'GREEN_ROOM', 'Private holding area for speakers and performers'),
                    ('Speaker Ready Room', 'SPEAKER_READY_ROOM', 'Speaker preparation and briefing space'),
                    ('Presentation Room', 'PRESENTATION', 'General presentation and lecture room'),
                    ('Open Area', 'OPEN_AREA', 'Open-plan activation or informal gathering space'),
                    ('Virtual / Streaming Stage', 'VIRTUAL', 'Digital stage for virtual or hybrid live streaming'),
                    ('Other / Miscellaneous', 'OTHER', 'General purpose space or custom setup')
                ) AS defaults(name, code, description)
                ON CONFLICT (code) WHERE organization_id IS NULL DO UPDATE
                SET name = EXCLUDED.name,
                    description = EXCLUDED.description,
                    is_system = true,
                    is_active = true,
                    updated_at = now();
                """)
            )

            # 2. Session Types
            await db.execute(
                text("""
                INSERT INTO agenda.session_types (id, name, code, category, default_duration_minutes, configuration, is_system, is_active, created_at, updated_at)
                SELECT gen_random_uuid(), defaults.name, defaults.code, defaults.category,
                       defaults.duration_minutes, '{}'::jsonb, true, true, now(), now()
                FROM (VALUES
                    ('Keynote Address', 'KEYNOTE', 'Scientific', 45),
                    ('Plenary Session', 'PLENARY', 'Scientific', 60),
                    ('Oral Presentation', 'ORAL', 'Scientific', 15),
                    ('Panel Discussion', 'PANEL', 'Discussion', 45),
                    ('Workshop / Masterclass', 'WORKSHOP', 'Practical', 90),
                    ('Symposium', 'SYMPOSIUM', 'Scientific', 60),
                    ('Poster Presentation Session', 'POSTER_SESSION', 'Exhibition', 60),
                    ('Break / Networking', 'BREAK', 'Social', 30),
                    ('Inauguration / Ceremony', 'INAUGURATION', 'Ceremony', 45)
                ) AS defaults(name, code, category, duration_minutes)
                ON CONFLICT (code) WHERE organization_id IS NULL DO NOTHING;
                """)
            )

            # 3. Agenda Roles
            await db.execute(
                text("""
                INSERT INTO agenda.agenda_roles (id, code, name, category, description, is_system, is_active, sort_order, created_at, updated_at)
                VALUES
                    (gen_random_uuid(), 'SPEAKER', 'Speaker / Presenter', 'Faculty', 'Delivers scientific presentation or lecture', true, true, 1, now(), now()),
                    (gen_random_uuid(), 'KEYNOTE_SPEAKER', 'Keynote Speaker', 'Faculty', 'Delivers keynote or plenary address', true, true, 2, now(), now()),
                    (gen_random_uuid(), 'CHAIRPERSON', 'Session Chairperson', 'Moderation', 'Leads and moderates session proceedings', true, true, 3, now(), now()),
                    (gen_random_uuid(), 'CO_CHAIR', 'Co-Chairperson', 'Moderation', 'Assists session chairperson', true, true, 4, now(), now()),
                    (gen_random_uuid(), 'MODERATOR', 'Moderator', 'Moderation', 'Facilitates Q&A and interactive discussions', true, true, 5, now(), now()),
                    (gen_random_uuid(), 'PANELIST', 'Panelist', 'Discussion', 'Participates in panel debate and discussion', true, true, 6, now(), now()),
                    (gen_random_uuid(), 'DISCUSSANT', 'Discussant', 'Discussion', 'Critiques and discusses presented papers', true, true, 7, now(), now()),
                    (gen_random_uuid(), 'JUDGE', 'Poster / Presentation Judge', 'Evaluation', 'Evaluates oral or poster presentations', true, true, 8, now(), now())
                ON CONFLICT (code) DO NOTHING;
                """)
            )

            # 4. Track Types
            await db.execute(
                text("""
                INSERT INTO agenda.track_types (id, name, code, description, is_system, is_active, created_at, updated_at)
                SELECT gen_random_uuid(), defaults.name, defaults.code, defaults.description, true, true, now(), now()
                FROM (VALUES
                    ('Scientific & Clinical', 'SCIENTIFIC', 'Core scientific, clinical, and medical tracks'),
                    ('Hands-on Workshop', 'WORKSHOP', 'Interactive skills and hands-on laboratory tracks'),
                    ('Industry & Innovation', 'INDUSTRY', 'Industry symposia, tech talks, and sponsor presentations'),
                    ('Poster & Abstracts', 'POSTER', 'Poster presentations and abstract displays'),
                    ('Plenary & Ceremonies', 'PLENARY', 'General assemblies, inaugurations, and keynote tracks')
                ) AS defaults(name, code, description)
                ON CONFLICT (code) WHERE organization_id IS NULL DO NOTHING;
                """)
            )

            await db.commit()
            logger.info("Validated & populated default types across agenda catalog tables.")
        except Exception as e:
            logger.warning(f"Auto-populating agenda default types encountered: {e}")
            await db.rollback()
