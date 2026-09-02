import uuid
import json
from sqlalchemy import select, delete, update, text
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
    """Scan all events and ensure they have unified portal theme settings seeded with defaults."""
    from app.modules.events.models.event import Event
    from app.modules.registration.models.portal_theme_setting import PortalThemeSetting
    from app.modules.registration.routers.registration_portal import DEFAULT_TERMS, DEFAULT_FAQS

    result = await db.execute(select(Event))
    events = result.scalars().all()
    
    updated = False
    for event in events:
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

        logger.info("Database default templates and FAQ/Terms settings auto-seeded/synced.")


async def ensure_plans_and_features():
    """Seed the database with default subscription plans and features."""
    from app.modules.platform.models.feature import FeatureCatalog
    from app.modules.billing.models.subscription import SubscriptionPlan, PlanFeature, Addon, AddonFeature, OrganizationFeature, OrganizationSubscription
    from app.modules.billing.capability_registry import (
        CATALOG_LIMIT_KEYS,
        FEATURE_DEFINITIONS,
        PLATFORM_HARD_CEILINGS,
    )
    from app.modules.billing.services.capability_service import CapabilityService
    
    async with AsyncSessionLocal() as db:
        try:
            # The code-owned registry is authoritative for enforcement keys.
            # Synchronize it before applying commercial labels/default plans so
            # a fresh database receives the same catalogue as an upgraded one.
            await CapabilityService.sync_catalogue(db)

            # 1. Seed Feature Catalog
            features = [
                {"key": "LIMIT_ORGANIZER_USERS", "name": "Organizer Users", "category": "PLATFORM_LIMITS", "category_order": 1, "feature_order": 1, "description": "Maximum organizer/staff users allowed", "display_value_basic": "2", "display_value_professional": "10", "display_value_enterprise": "50"},
                {"key": "LIMIT_REGISTRATIONS", "name": "Registrations", "category": "PLATFORM_LIMITS", "category_order": 1, "feature_order": 2, "description": "Maximum attendee registrations per event", "display_value_basic": "Up to 150", "display_value_professional": "Up to 1,000", "display_value_enterprise": "Unlimited"},
                {"key": "LIMIT_SPEAKERS", "name": "Speakers", "category": "PLATFORM_LIMITS", "category_order": 1, "feature_order": 3, "description": "Maximum speakers per event", "display_value_basic": "Up to 30", "display_value_professional": "Up to 100", "display_value_enterprise": "Up to 500"},
                {"key": "LIMIT_SESSIONS", "name": "Sessions", "category": "PLATFORM_LIMITS", "category_order": 1, "feature_order": 4, "description": "Maximum sessions per event", "display_value_basic": "Up to 25", "display_value_professional": "Up to 100", "display_value_enterprise": "Unlimited"},
                {"key": "LIMIT_ROOMS", "name": "Rooms", "category": "PLATFORM_LIMITS", "category_order": 1, "feature_order": 5, "description": "Maximum rooms/halls per event", "display_value_basic": "Up to 5", "display_value_professional": "Up to 20", "display_value_enterprise": "Unlimited"},
                {"key": "LIMIT_STORAGE", "name": "Storage", "category": "PLATFORM_LIMITS", "category_order": 1, "feature_order": 6, "description": "File storage quota", "display_value_basic": "10 GB", "display_value_professional": "50 GB", "display_value_enterprise": "200 GB+ (Custom)"},
                {"key": "FEAT_EVENT_WEBSITE", "name": "Event Website", "category": "PLATFORM_LIMITS", "category_order": 1, "feature_order": 7, "description": "Event website quality and customization", "display_value_basic": "Basic", "display_value_professional": "Customizable", "display_value_enterprise": "Fully Branded"},
                {"key": "FEAT_CUSTOM_DOMAIN", "name": "Custom Domain", "category": "PLATFORM_LIMITS", "category_order": 1, "feature_order": 8, "description": "Use your own domain name for portals", "display_value_basic": "❌", "display_value_professional": "✅", "display_value_enterprise": "✅"},
                {"key": "FEAT_WHITE_LABEL", "name": "White Label", "category": "PLATFORM_LIMITS", "category_order": 1, "feature_order": 9, "description": "Remove all Event branding", "display_value_basic": "❌", "display_value_professional": "❌", "display_value_enterprise": "✅"},
                
                {"key": "FEAT_REGISTRATION_PORTAL", "name": "Registration Portal", "category": "REGISTRATION", "category_order": 2, "feature_order": 1, "description": "Attendee-facing registration portal", "display_value_basic": "Basic", "display_value_professional": "Advanced", "display_value_enterprise": "Enterprise"},
                {"key": "FEAT_REGISTRATION_FORMS", "name": "Registration Forms", "category": "REGISTRATION", "category_order": 2, "feature_order": 2, "description": "Custom registration form fields", "display_value_basic": "Standard (Up to 10 Fields)", "display_value_professional": "Custom (Unlimited)", "display_value_enterprise": "Custom (Unlimited)"},
                {"key": "FEAT_TICKET_CATEGORIES", "name": "Ticket Categories", "category": "REGISTRATION", "category_order": 2, "feature_order": 3, "description": "Number of registration ticket types", "display_value_basic": "3", "display_value_professional": "10", "display_value_enterprise": "Unlimited"},
                {"key": "FEAT_COUPON_CODES", "name": "Coupon Codes", "category": "REGISTRATION", "category_order": 2, "feature_order": 4, "description": "Promotional discount codes for registration", "display_value_basic": "❌", "display_value_professional": "✅", "display_value_enterprise": "✅"},
                {"key": "FEAT_PAYMENT_GATEWAY", "name": "Payment Gateway Integration", "category": "REGISTRATION", "category_order": 2, "feature_order": 5, "description": "Online payment collection for registrations", "display_value_basic": "✅", "display_value_professional": "✅", "display_value_enterprise": "✅"},
                {"key": "FEAT_REGISTRATION_ANALYTICS", "name": "Registration Analytics", "category": "REGISTRATION", "category_order": 2, "feature_order": 6, "description": "Registration data reporting and insights", "display_value_basic": "Basic", "display_value_professional": "Advanced", "display_value_enterprise": "Advanced"},
                {"key": "FEAT_BULK_IMPORT", "name": "Bulk Registration Import", "category": "REGISTRATION", "category_order": 2, "feature_order": 7, "description": "Import attendees via CSV/Excel", "display_value_basic": "❌", "display_value_professional": "✅", "display_value_enterprise": "✅"},
                {"key": "FEAT_QR_CONFIRMATION", "name": "QR Registration Confirmation", "category": "REGISTRATION", "category_order": 2, "feature_order": 8, "description": "QR code in confirmation email for check-in", "display_value_basic": "✅", "display_value_professional": "✅", "display_value_enterprise": "✅"},
                {"key": "FEAT_ATTENDEE_CHECKIN", "name": "Attendee Check-In", "category": "REGISTRATION", "category_order": 2, "feature_order": 9, "description": "Attendee check-in system at venue", "display_value_basic": "Basic", "display_value_professional": "Advanced", "display_value_enterprise": "Enterprise"},

                {"key": "FEAT_SPEAKER_PORTAL", "name": "Speaker Portal", "category": "SPEAKER_MANAGEMENT", "category_order": 3, "feature_order": 1, "description": "Speaker-facing portal for profile and file uploads", "display_value_basic": "Partial", "display_value_professional": "Full", "display_value_enterprise": "Full"},
                {"key": "FEAT_ABSTRACT_SUBMISSION", "name": "Abstract Submission", "category": "SPEAKER_MANAGEMENT", "category_order": 3, "feature_order": 2, "description": "Call for papers and abstract review workflow", "display_value_basic": "❌", "display_value_professional": "Advanced", "display_value_enterprise": "Advanced"},
                {"key": "FEAT_FILE_UPLOADS", "name": "File Uploads", "category": "SPEAKER_MANAGEMENT", "category_order": 3, "feature_order": 3, "description": "Speaker presentation file upload system", "display_value_basic": "✅", "display_value_professional": "✅", "display_value_enterprise": "✅"},
                {"key": "FEAT_PRESENTATION_VALIDATION", "name": "Presentation Validation", "category": "SPEAKER_MANAGEMENT", "category_order": 3, "feature_order": 4, "description": "Automated deep file validation on upload", "display_value_basic": "Basic", "display_value_professional": "Advanced", "display_value_enterprise": "Advanced"},
                {"key": "FEAT_SPEAKER_DASHBOARD", "name": "Speaker Dashboard", "category": "SPEAKER_MANAGEMENT", "category_order": 3, "feature_order": 5, "description": "Speaker self-service dashboard", "display_value_basic": "Basic", "display_value_professional": "Advanced", "display_value_enterprise": "Advanced"},
                {"key": "FEAT_SPEAKER_COMMS", "name": "Speaker Communications", "category": "SPEAKER_MANAGEMENT", "category_order": 3, "feature_order": 6, "description": "Automated emails and notifications to speakers", "display_value_basic": "Basic", "display_value_professional": "Advanced", "display_value_enterprise": "Advanced"},
                {"key": "FEAT_SPEAKER_PROFILES", "name": "Speaker Profiles", "category": "SPEAKER_MANAGEMENT", "category_order": 3, "feature_order": 7, "description": "Public speaker profile pages", "display_value_basic": "Basic", "display_value_professional": "Customizable", "display_value_enterprise": "Fully Custom"},
                {"key": "FEAT_MULTI_PRESENTATION_VERSIONS", "name": "Multiple Presentation Versions", "category": "SPEAKER_MANAGEMENT", "category_order": 3, "feature_order": 8, "description": "Speakers can upload multiple file versions", "display_value_basic": "❌", "display_value_professional": "✅", "display_value_enterprise": "✅"},

                {"key": "FEAT_BADGE_TEMPLATES", "name": "Badge Templates", "category": "BADGE_CERTIFICATE", "category_order": 4, "feature_order": 1, "description": "Number of badge design templates available", "display_value_basic": "3", "display_value_professional": "Unlimited", "display_value_enterprise": "Unlimited"},
                {"key": "FEAT_CERTIFICATE_TEMPLATES", "name": "Certificate Templates", "category": "BADGE_CERTIFICATE", "category_order": 4, "feature_order": 2, "description": "Number of certificate design templates available", "display_value_basic": "3", "display_value_professional": "Unlimited", "display_value_enterprise": "Unlimited"},
                {"key": "FEAT_CUSTOM_BADGE_DESIGN", "name": "Custom Badge Design", "category": "BADGE_CERTIFICATE", "category_order": 4, "feature_order": 3, "description": "Fully custom badge layout and design", "display_value_basic": "❌", "display_value_professional": "✅", "display_value_enterprise": "✅"},
                {"key": "FEAT_CUSTOM_CERT_DESIGN", "name": "Custom Certificate Design", "category": "BADGE_CERTIFICATE", "category_order": 4, "feature_order": 4, "description": "Fully custom certificate layout and design", "display_value_basic": "❌", "display_value_professional": "✅", "display_value_enterprise": "✅"},
                {"key": "FEAT_QR_BADGE", "name": "QR Badge Generation", "category": "BADGE_CERTIFICATE", "category_order": 4, "feature_order": 5, "description": "QR codes on badges for scanning", "display_value_basic": "✅", "display_value_professional": "✅", "display_value_enterprise": "✅"},
                {"key": "FEAT_BULK_BADGE_EXPORT", "name": "Bulk Badge Export", "category": "BADGE_CERTIFICATE", "category_order": 4, "feature_order": 6, "description": "Export all badges as ZIP for bulk printing", "display_value_basic": "❌", "display_value_professional": "✅", "display_value_enterprise": "✅"},
                {"key": "FEAT_AUTO_CERTIFICATE", "name": "Auto Certificate Generation", "category": "BADGE_CERTIFICATE", "category_order": 4, "feature_order": 7, "description": "Automatic certificate generation on attendance", "display_value_basic": "✅", "display_value_professional": "✅", "display_value_enterprise": "✅"},

                {"key": "FEAT_EMAIL_NOTIFICATIONS", "name": "Email Notifications", "category": "COMMUNICATIONS", "category_order": 5, "feature_order": 1, "description": "Transactional email notifications", "display_value_basic": "✅", "display_value_professional": "✅", "display_value_enterprise": "✅"},
                {"key": "FEAT_REMINDER_EMAILS", "name": "Reminder Emails", "category": "COMMUNICATIONS", "category_order": 5, "feature_order": 2, "description": "Automated reminder email sequences", "display_value_basic": "✅", "display_value_professional": "✅", "display_value_enterprise": "✅"},
                {"key": "FEAT_CAMPAIGN_MGMT", "name": "Campaign Management", "category": "COMMUNICATIONS", "category_order": 5, "feature_order": 3, "description": "Email campaign creation and scheduling", "display_value_basic": "❌", "display_value_professional": "✅", "display_value_enterprise": "✅"},
                {"key": "FEAT_BULK_EMAIL", "name": "Bulk Email Campaigns", "category": "COMMUNICATIONS", "category_order": 5, "feature_order": 4, "description": "Send bulk emails to attendees/speakers", "display_value_basic": "❌", "display_value_professional": "✅", "display_value_enterprise": "✅"},
                {"key": "FEAT_ANNOUNCEMENT_CENTER", "name": "Announcement Center", "category": "COMMUNICATIONS", "category_order": 5, "feature_order": 5, "description": "In-portal announcement management", "display_value_basic": "❌", "display_value_professional": "✅", "display_value_enterprise": "✅"},
                {"key": "FEAT_PUSH_NOTIFICATIONS", "name": "Push Notifications", "category": "COMMUNICATIONS", "category_order": 5, "feature_order": 6, "description": "Mobile push notifications", "display_value_basic": "❌", "display_value_professional": "✅", "display_value_enterprise": "✅"},
                {"key": "FEAT_WHATSAPP", "name": "WhatsApp Integration", "category": "COMMUNICATIONS", "category_order": 5, "feature_order": 7, "description": "WhatsApp messaging for speakers and attendees", "display_value_basic": "❌", "display_value_professional": "Optional Add-On", "display_value_enterprise": "✅"},
                {"key": "FEAT_SMS", "name": "SMS Integration", "category": "COMMUNICATIONS", "category_order": 5, "feature_order": 8, "description": "SMS notifications and OTPs", "display_value_basic": "❌", "display_value_professional": "Optional Add-On", "display_value_enterprise": "✅"},

                {"key": "FEAT_DEFAULT_THEME", "name": "Default Theme", "category": "BRANDING", "category_order": 6, "feature_order": 1, "description": "Standard Event theme for all portals", "display_value_basic": "✅", "display_value_professional": "✅", "display_value_enterprise": "✅"},
                {"key": "FEAT_THEME_CUSTOMIZATION", "name": "Theme Customization", "category": "BRANDING", "category_order": 6, "feature_order": 2, "description": "Customize portal themes", "display_value_basic": "❌", "display_value_professional": "✅", "display_value_enterprise": "✅"},
                {"key": "FEAT_CUSTOM_COLORS", "name": "Custom Colors", "category": "BRANDING", "category_order": 6, "feature_order": 3, "description": "Brand-matching color schemes", "display_value_basic": "❌", "display_value_professional": "✅", "display_value_enterprise": "✅"},
                {"key": "FEAT_CUSTOM_FONTS", "name": "Custom Fonts", "category": "BRANDING", "category_order": 6, "feature_order": 4, "description": "Custom typography selection", "display_value_basic": "❌", "display_value_professional": "Limited", "display_value_enterprise": "Unlimited"},
                {"key": "FEAT_LOGO_BRANDING", "name": "Logo Branding", "category": "BRANDING", "category_order": 6, "feature_order": 5, "description": "Organization logo on all portals", "display_value_basic": "Basic", "display_value_professional": "Advanced", "display_value_enterprise": "Full White Label"},
                {"key": "FEAT_CUSTOM_LOGIN_PAGE", "name": "Custom Login Page", "category": "BRANDING", "category_order": 6, "feature_order": 6, "description": "Fully branded login experience", "display_value_basic": "❌", "display_value_professional": "❌", "display_value_enterprise": "✅"},

                # Mobile integrations and venue-operations entitlements are intentionally excluded.
                # They are no longer seeded into the canonical feature catalog.
            ]
            
            # Never infer obsolescence from this legacy presentation list.
            # Canonical keys may be owned by Developer, Operations, Security,
            # or Support and must be deprecated through governed catalogue
            # lifecycle controls rather than deleted during application start.
            
            existing_feats_res = await db.execute(select(FeatureCatalog.key))
            existing_feats = set(existing_feats_res.scalars().all())
            
            for f_data in features:
                if f_data["key"] not in existing_feats:
                    feat = FeatureCatalog(
                        key=f_data["key"],
                        name=f_data["name"],
                        category=f_data["category"],
                        category_order=f_data["category_order"],
                        feature_order=f_data["feature_order"],
                        description=f_data["description"],
                        is_active=True
                    )
                    db.add(feat)
                else:
                    # Update existing feature fields in case catalog structure changed
                    stmt = select(FeatureCatalog).where(FeatureCatalog.key == f_data["key"])
                    feat = (await db.execute(stmt)).scalar_one()
                    feat.name = f_data["name"]
                    feat.category = f_data["category"]
                    feat.category_order = f_data["category_order"]
                    feat.feature_order = f_data["feature_order"]
                    feat.description = f_data["description"]

            await db.execute(
                update(FeatureCatalog)
                .where(FeatureCatalog.key.in_(LEGACY_NON_ENFORCED_FEATURE_KEYS))
                .values(is_active=False)
            )
            
            await db.flush()
            
            # Fetch all features to get their IDs
            feat_res = await db.execute(select(FeatureCatalog))
            all_feats = {f.key: f for f in feat_res.scalars().all()}
            feature_seed = {item["key"]: item for item in features}
            
            # Purge any legacy 'Demo Public' plan and its references if present in current DB
            legacy_demo_plans = (await db.execute(select(SubscriptionPlan).where(SubscriptionPlan.name == "Demo Public"))).scalars().all()
            if legacy_demo_plans:
                basic_plan = (await db.execute(select(SubscriptionPlan).where(SubscriptionPlan.name == "Basic"))).scalars().first()
                for dp in legacy_demo_plans:
                    if basic_plan:
                        await db.execute(
                            update(OrganizationSubscription)
                            .where(OrganizationSubscription.plan_id == dp.id)
                            .values(plan_id=basic_plan.id)
                        )
                    await db.execute(delete(PlanFeature).where(PlanFeature.plan_id == dp.id))
                    await db.delete(dp)
                await db.flush()

            # 2. Seed Default Plans
            plans = [
                {
                    "name": "Free Trial",
                    "tagline": "14-Day Workspace Evaluation",
                    "description": "14-day evaluation trial with minimal capacity limits. Upgrade to purchase a commercial subscription.",
                    "billing_model": "PER_EVENT",
                    "currency": "INR",
                    "price_per_event": 0,
                    "max_events": 1,
                    "max_users": 1,
                    "max_event_team_members": 1,
                    "max_registrations": 10,
                    "max_speakers": 3,
                    "max_sessions": 3,
                    "max_rooms": 1,
                    "max_ticket_categories": 1,
                    "max_badge_templates": 0,
                    "max_certificate_templates": 0,
                    "max_emails_per_event": 0,
                    "storage_quota_mb": 500, # 500 MB
                    "display_order": -1,
                    "is_popular": False,
                    "color_hex": "#F59E0B"
                },
                {
                    "name": "Basic",
                    "tagline": "Registration + Speaker Management",
                    "description": "Perfect for small events and basic registration.",
                    "billing_model": "PER_EVENT",
                    "currency": "INR",
                    "price_per_event": 15000,
                    "max_events": 1,
                    "max_users": 2,
                    "max_event_team_members": 2,
                    "max_registrations": 150,
                    "max_speakers": 30,
                    "max_sessions": 25,
                    "max_rooms": 5,
                    "max_ticket_categories": 3,
                    "max_badge_templates": 3,
                    "max_certificate_templates": 3,
                    "max_emails_per_event": 450,
                    "storage_quota_mb": 10240, # 10 GB
                    "display_order": 0,
                    "is_popular": False,
                    "color_hex": "#64748B"
                },
                {
                    "name": "Professional",
                    "tagline": "Registration + Speaker + Campaigns",
                    "description": "For scaling events needing advanced workflows and badge printing.",
                    "billing_model": "PER_EVENT",
                    "currency": "INR",
                    "price_per_event": 60000,
                    "max_events": 1,
                    "max_users": 10,
                    "max_event_team_members": 10,
                    "max_registrations": 1000,
                    "max_speakers": 100,
                    "max_sessions": 100,
                    "max_rooms": 20,
                    "max_ticket_categories": 10,
                    "max_badge_templates": None,
                    "max_certificate_templates": None,
                    "max_emails_per_event": 5000,
                    "storage_quota_mb": 51200, # 50 GB
                    "display_order": 1,
                    "is_popular": True,
                    "color_hex": "#4F46E5"
                },
                {
                    "name": "Enterprise",
                    "tagline": "Complete Conference Ecosystem",
                    "description": "Full control, advanced security, API access, and integrations.",
                    "billing_model": "PER_EVENT",
                    "currency": "INR",
                    "price_per_event": 250000,
                    "max_events": 1,
                    "max_users": 50,
                    "max_event_team_members": 50,
                    "max_registrations": None,
                    "max_speakers": 500,
                    "max_sessions": None,
                    "max_rooms": None,
                    "max_ticket_categories": None,
                    "max_badge_templates": None,
                    "max_certificate_templates": None,
                    "max_emails_per_event": None,
                    "storage_quota_mb": 204800, # 200 GB
                    "display_order": 2,
                    "is_popular": False,
                    "color_hex": "#7C3AED"
                }
            ]

            limit_attribute_by_key = {
                "max_events": "max_events",
                "max_users": "max_users",
                "max_event_team_members": "max_event_team_members",
                "max_registrations": "max_registrations",
                "max_speakers": "max_speakers",
                "max_sessions": "max_sessions",
                "max_rooms": "max_rooms",
                "max_ticket_categories": "max_ticket_categories",
                "max_badge_templates": "max_badge_templates",
                "max_certificate_templates": "max_certificate_templates",
                "max_emails_per_event": "max_emails_per_event",
                "storage_quota_mb": "storage_quota_mb",
            }
            canonical_defaults = {
                "FEAT_EVENT_PLANNING": {"Free Trial", "Basic", "Professional", "Enterprise"},
                "FEAT_SESSION_MANAGEMENT": {"Free Trial", "Basic", "Professional", "Enterprise"},
                "FEAT_COMMUNICATION_CENTER": {"Free Trial", "Basic", "Professional", "Enterprise"},
                "FEAT_DATA_EXPORTS": {"Basic", "Professional", "Enterprise"},
                "FEAT_SESSION_QUEUE": {"Professional", "Enterprise"},
                "FEAT_API_ACCESS": {"Enterprise"},
                "FEAT_WEBHOOK_ACCESS": {"Enterprise"},
                "FEAT_THIRD_PARTY_INTEGRATIONS": {"Enterprise"},
                "FEAT_VENUE_SYNC": {"Enterprise"},
                "FEAT_DEDICATED_MANAGER": {"Enterprise"},
            }
            new_limit_defaults = {
                "max_sms_per_event": {
                    "Free Trial": 0, "Basic": 0, "Professional": 0, "Enterprise": 10_000,
                },
                "max_whatsapp_per_event": {
                    "Free Trial": 0, "Basic": 0, "Professional": 0, "Enterprise": 10_000,
                },
                "max_push_per_event": {
                    "Free Trial": 0, "Basic": 0, "Professional": 10_000, "Enterprise": 1_000_000,
                },
                "max_api_calls_per_month": {
                    "Free Trial": 0, "Basic": 0, "Professional": 0, "Enterprise": 1_000_000,
                },
                "max_webhook_deliveries_per_month": {
                    "Free Trial": 0, "Basic": 0, "Professional": 0, "Enterprise": 100_000,
                },
                "max_integrations": {
                    "Free Trial": 0, "Basic": 0, "Professional": 0, "Enterprise": 50,
                },
                "max_exports_per_event": {
                    "Free Trial": 0, "Basic": 50, "Professional": 500, "Enterprise": 10_000,
                },
                "max_devices_per_event": {
                    "Free Trial": 0, "Basic": 0, "Professional": 0, "Enterprise": 500,
                },
            }

            def typed_seed_assignment(
                *,
                feature: FeatureCatalog,
                plan_name: str,
                plan_data: dict,
            ) -> tuple[bool, dict]:
                canonical_limit = CATALOG_LIMIT_KEYS.get(feature.key)
                if canonical_limit:
                    attribute = limit_attribute_by_key.get(canonical_limit)
                    if attribute:
                        raw_value = plan_data.get(attribute)
                    else:
                        raw_value = new_limit_defaults.get(canonical_limit, {}).get(plan_name, 0)
                    if raw_value is None and attribute:
                        raw_value = PLATFORM_HARD_CEILINGS.get(canonical_limit, 0)
                    return True, {"value": int(raw_value)}

                seed = feature_seed.get(feature.key)
                display_value = ""
                if seed:
                    display_key = {
                        "Basic": "display_value_basic",
                        "Professional": "display_value_professional",
                        "Enterprise": "display_value_enterprise",
                    }.get(plan_name)
                    display_value = str(seed.get(display_key, "")) if display_key else ""

                normalized = display_value.strip().upper().replace("-", " ").replace("_", " ")
                explicitly_disabled = (
                    plan_name == "Free Trial"
                    or "❌" in display_value
                    or "OPTIONAL ADD ON" in normalized
                )
                enabled = (
                    not explicitly_disabled
                    if seed
                    else plan_name in canonical_defaults.get(feature.key, set())
                )

                if feature.value_type == "BOOLEAN":
                    return enabled, {"value": bool(enabled)}
                if not enabled:
                    return False, {"value": None}

                allowed_values = list(
                    feature.allowed_values
                    or FEATURE_DEFINITIONS.get(feature.key, {}).get("allowed_values", [])
                )
                for allowed in sorted(allowed_values, key=len, reverse=True):
                    allowed_words = allowed.upper().replace("_", " ")
                    if (
                        normalized == allowed_words
                        or normalized.startswith(f"{allowed_words} ")
                        or allowed_words in normalized
                    ):
                        return True, {"value": allowed}

                if feature.key == "FEAT_SLA" and plan_name == "Enterprise":
                    return True, {"value": "MISSION_CRITICAL"}
                return False, {"value": None}
            
            existing_plans_res = await db.execute(select(SubscriptionPlan))
            existing_plans = {p.name: p for p in existing_plans_res.scalars().all()}
            
            for p_data in plans:
                plan = existing_plans.get(p_data["name"])
                if not plan:
                    plan = SubscriptionPlan(
                        name=p_data["name"],
                        tagline=p_data["tagline"],
                        description=p_data["description"],
                        billing_model=p_data["billing_model"],
                        currency=p_data["currency"],
                        price_per_event=p_data.get("price_per_event"),
                        max_events=p_data["max_events"],
                        max_users=p_data["max_users"],
                        max_event_team_members=p_data["max_event_team_members"],
                        max_registrations=p_data["max_registrations"],
                        max_speakers=p_data["max_speakers"],
                        max_sessions=p_data["max_sessions"],
                        max_rooms=p_data["max_rooms"],
                        max_ticket_categories=p_data["max_ticket_categories"],
                        max_badge_templates=p_data["max_badge_templates"],
                        max_certificate_templates=p_data["max_certificate_templates"],
                        max_emails_per_event=p_data["max_emails_per_event"],
                        storage_quota_mb=p_data["storage_quota_mb"],
                        display_order=p_data["display_order"],
                        is_popular=p_data["is_popular"],
                        color_hex=p_data["color_hex"],
                        is_active=True
                    )
                    db.add(plan)
                    await db.flush() # get plan.id
                    
                    for feat in all_feats.values():
                        enabled, entitlement_value = typed_seed_assignment(
                            feature=feat,
                            plan_name=plan.name,
                            plan_data=p_data,
                        )
                        db.add(PlanFeature(
                            plan_id=plan.id,
                            feature_id=feat.id,
                            enabled=enabled,
                            value_type=feat.value_type,
                            entitlement_value=entitlement_value,
                            scope_type=feat.scope_type,
                            hard_ceiling=(
                                {"value": PLATFORM_HARD_CEILINGS[CATALOG_LIMIT_KEYS[feat.key]]}
                                if feat.key in CATALOG_LIMIT_KEYS
                                else None
                            ),
                        ))
                else:
                    existing_pf_rows = {
                        row.feature_id: row
                        for row in (await db.scalars(
                            select(PlanFeature).where(PlanFeature.plan_id == plan.id)
                        )).all()
                    }
                    for feat in all_feats.values():
                        enabled, entitlement_value = typed_seed_assignment(
                            feature=feat,
                            plan_name=plan.name,
                            plan_data=p_data,
                        )
                        row = existing_pf_rows.get(feat.id)
                        if row is None:
                            db.add(PlanFeature(
                                plan_id=plan.id,
                                feature_id=feat.id,
                                enabled=enabled,
                                value_type=feat.value_type,
                                entitlement_value=entitlement_value,
                                scope_type=feat.scope_type,
                                hard_ceiling=(
                                    {"value": PLATFORM_HARD_CEILINGS[CATALOG_LIMIT_KEYS[feat.key]]}
                                    if feat.key in CATALOG_LIMIT_KEYS
                                    else None
                                ),
                            ))
                            continue
                        current_value = (
                            row.entitlement_value.get("value")
                            if isinstance(row.entitlement_value, dict)
                            else row.entitlement_value
                        )
                        is_untyped_legacy_value = (
                            row.entitlement_value is None
                            or (feat.value_type != "BOOLEAN" and isinstance(current_value, bool))
                        )
                        if is_untyped_legacy_value:
                            row.enabled = enabled
                            row.value_type = feat.value_type
                            row.entitlement_value = entitlement_value
                            row.scope_type = feat.scope_type
                            if feat.key in CATALOG_LIMIT_KEYS and row.hard_ceiling is None:
                                row.hard_ceiling = {
                                    "value": PLATFORM_HARD_CEILINGS[CATALOG_LIMIT_KEYS[feat.key]]
                                }
                    await db.flush()


            # Sync FeatureCatalog value_type for numeric limit features
            await db.execute(
                text("""
                    UPDATE commerce.feature_catalog
                    SET value_type = 'LIMIT',
                        unit = CASE key
                            WHEN 'FEAT_TICKET_CATEGORIES' THEN 'categories'
                            WHEN 'FEAT_BADGE_TEMPLATES' THEN 'templates'
                            WHEN 'FEAT_CERTIFICATE_TEMPLATES' THEN 'templates'
                            WHEN 'FEAT_EMAIL_NOTIFICATIONS' THEN 'messages'
                            ELSE unit
                        END
                    WHERE key IN ('FEAT_TICKET_CATEGORIES', 'FEAT_BADGE_TEMPLATES', 'FEAT_CERTIFICATE_TEMPLATES', 'FEAT_EMAIL_NOTIFICATIONS');
                """)
            )

            # Sync value_type and scope_type for all existing plan_features from feature_catalog
            await db.execute(
                text("""
                    UPDATE commerce.plan_features pf
                    SET value_type = fc.value_type,
                        scope_type = fc.scope_type
                    FROM commerce.feature_catalog fc
                    WHERE pf.feature_id = fc.id
                      AND (pf.value_type != fc.value_type OR pf.scope_type != fc.scope_type)
                """)
            )
            # Migrate any TRIAL subscriptions currently pointing to "Basic" to point to "Free Trial"
            free_trial_plan = (await db.execute(select(SubscriptionPlan).where(SubscriptionPlan.name == "Free Trial"))).scalar_one_or_none()
            if free_trial_plan:
                basic_plan = (await db.execute(select(SubscriptionPlan).where(SubscriptionPlan.name == "Basic"))).scalar_one_or_none()
                if basic_plan:
                    await db.execute(
                        update(OrganizationSubscription)
                        .where(
                            OrganizationSubscription.plan_id == basic_plan.id,
                            OrganizationSubscription.status == "TRIAL"
                        )
                        .values(plan_id=free_trial_plan.id)
                    )
            await db.flush()

            # Remove legacy seed-driven add-ons so the catalog stays manual-only.
            legacy_addon_keys = {
                "ADDON_WHATSAPP",
                "ADDON_EPOSTER",
                "ADDON_DIGITAL_SIGNAGE",
                "ADDON_VENUE_READY_ROOM",
                "ADDON_ONSITE_TECH",
                "ADDON_WHITE_LABEL",
                "ADDON_MOBILE_APP",
            }
            legacy_addons_res = await db.execute(select(Addon).where(Addon.key.in_(legacy_addon_keys)))
            for legacy_addon in legacy_addons_res.scalars().all():
                logger.info(f"Deleting legacy seeded add-on: {legacy_addon.key}")
                await db.delete(legacy_addon)
            await db.flush()

            """
            # 3. Seed Addons (legacy reference only)
            addons = [
                {
                    "name": "WhatsApp Integration",
                    "key": "ADDON_WHATSAPP",
                    "description": "WhatsApp notifications and communication for attendees and speakers",
                    "price_inr": 10000.0,
                    "billing_unit": "PER_EVENT",
                    "available_for_plans": ["PROFESSIONAL", "ENTERPRISE"],
                    "is_optional_for_plan": "PROFESSIONAL",
                    "included_in_plan": "ENTERPRISE",
                    "features_spec": [
                        {"category": "Notifications", "feature": "Registration Confirmation", "value": "Included"},
                        {"category": "Notifications", "feature": "Payment Confirmation", "value": "Included"},
                        {"category": "Notifications", "feature": "Speaker Acceptance", "value": "Included"},
                        {"category": "Notifications", "feature": "Session Reminder", "value": "Included"},
                        {"category": "Notifications", "feature": "Event Reminder", "value": "Included"},
                        {"category": "Notifications", "feature": "Certificate Notification", "value": "Included"},
                        {"category": "Messaging", "feature": "Bulk Broadcast", "value": "Included"},
                        {"category": "Messaging", "feature": "Template Messages", "value": "Included"},
                        {"category": "Messaging", "feature": "Two-Way Chat", "value": "Optional"},
                        {"category": "Messaging", "feature": "AI Chatbot", "value": "Optional"},
                        {"category": "Analytics", "feature": "Delivery Tracking", "value": "Included"},
                        {"category": "Analytics", "feature": "Read Receipts", "value": "Included"},
                        {"category": "Analytics", "feature": "Click Tracking", "value": "Included"},
                        {"category": "Compliance", "feature": "Meta Approved Templates", "value": "Included"}
                    ]
                },
                {
                    "name": "ePoster Module",
                    "key": "ADDON_EPOSTER",
                    "description": "Digital ePoster display and management system",
                    "price_inr": 25000.0,
                    "billing_unit": "PER_EVENT",
                    "available_for_plans": ["PROFESSIONAL", "ENTERPRISE"],
                    "is_optional_for_plan": "PROFESSIONAL",
                    "included_in_plan": "ENTERPRISE",
                    "features_spec": [
                        {"category": "Limits", "feature": "Poster Capacity", "value": "100 / 500 / Unlimited"},
                        {"category": "Submission", "feature": "Poster Upload Portal", "value": "Included"},
                        {"category": "Submission", "feature": "Reviewer Workflow", "value": "Included"},
                        {"category": "Submission", "feature": "Poster Approval Process", "value": "Included"},
                        {"category": "Display", "feature": "Interactive Poster Viewer", "value": "Included"},
                        {"category": "Display", "feature": "Zoom Capability", "value": "Included"},
                        {"category": "Display", "feature": "Video Poster Support", "value": "Optional"},
                        {"category": "Search", "feature": "Poster Search", "value": "Included"},
                        {"category": "Search", "feature": "Filter by Category", "value": "Included"},
                        {"category": "Search", "feature": "Filter by Author", "value": "Included"},
                        {"category": "Analytics", "feature": "Poster Views Tracking", "value": "Included"},
                        {"category": "Analytics", "feature": "Most Viewed Posters", "value": "Included"},
                        {"category": "Branding", "feature": "Custom Theme", "value": "Included"}
                    ]
                },
                {
                    "name": "Digital Signage",
                    "key": "ADDON_DIGITAL_SIGNAGE",
                    "description": "Digital signage displays for venue wayfinding and announcements",
                    "price_inr": 20000.0,
                    "billing_unit": "PER_EVENT",
                    "available_for_plans": ["PROFESSIONAL", "ENTERPRISE"],
                    "is_optional_for_plan": "PROFESSIONAL",
                    "included_in_plan": "ENTERPRISE",
                    "features_spec": [
                        {"category": "Display", "feature": "Session Schedule Screen", "value": "Included"},
                        {"category": "Display", "feature": "Speaker Information Screen", "value": "Included"},
                        {"category": "Display", "feature": "Wayfinding Screen", "value": "Included"},
                        {"category": "Display", "feature": "Sponsor Advertisement Screen", "value": "Included"},
                        {"category": "Display", "feature": "Welcome Screen", "value": "Included"},
                        {"category": "Display", "feature": "Emergency Alerts", "value": "Included"},
                        {"category": "Hardware", "feature": "Screen Count Supported", "value": "5 / 10 / Unlimited"},
                        {"category": "Hardware", "feature": "TV Support", "value": "Yes"},
                        {"category": "Hardware", "feature": "LED Wall Support", "value": "Yes"},
                        {"category": "Sync", "feature": "Real-Time Session Sync", "value": "Yes"},
                        {"category": "Sync", "feature": "Auto Schedule Updates", "value": "Yes"},
                        {"category": "Branding", "feature": "Custom Theme", "value": "Yes"},
                        {"category": "Branding", "feature": "Sponsor Branding", "value": "Yes"},
                        {"category": "Monitoring", "feature": "Screen Health Monitoring", "value": "Yes"},
                        {"category": "Monitoring", "feature": "Offline Alert Detection", "value": "Yes"}
                    ]
                },
                {
                    "name": "Venue Ready Room Setup",
                    "key": "ADDON_VENUE_READY_ROOM",
                    "description": "Complete Ready Room setup with SRR stations and device management",
                    "price_inr": 30000.0,
                    "billing_unit": "PER_EVENT",
                    "available_for_plans": ["PROFESSIONAL", "ENTERPRISE"],
                    "is_optional_for_plan": None,
                    "included_in_plan": None,
                    "features_spec": [
                        {"category": "Operations", "feature": "Speaker Check-In", "value": "Included"},
                        {"category": "Operations", "feature": "SRR Queue Management", "value": "Included"},
                        {"category": "Operations", "feature": "Session Readiness Tracking", "value": "Included"},
                        {"category": "Operations", "feature": "File Verification", "value": "Included"},
                        {"category": "Operations", "feature": "Presentation Version Control", "value": "Included"},
                        {"category": "Operations", "feature": "Last Minute Upload Handling", "value": "Included"},
                        {"category": "Hardware", "feature": "SRR Workstations", "value": "2 / 5 / Custom"},
                        {"category": "Hardware", "feature": "Local Server Setup", "value": "Optional"},
                        {"category": "Hardware", "feature": "Backup Storage", "value": "Included"},
                        {"category": "Monitoring", "feature": "Device Health Monitoring", "value": "Included"},
                        {"category": "Monitoring", "feature": "Presentation Delivery Status", "value": "Included"},
                        {"category": "Sync", "feature": "Venue Sync Engine", "value": "Included"},
                        {"category": "Reporting", "feature": "Session Readiness Dashboard", "value": "Included"}
                    ]
                },
                {
                    "name": "Onsite Technical Team",
                    "key": "ADDON_ONSITE_TECH",
                    "description": "Dedicated technical support team present at your venue",
                    "price_inr": None,
                    "billing_unit": "CUSTOM",
                    "available_for_plans": ["BASIC", "PROFESSIONAL", "ENTERPRISE"],
                    "is_optional_for_plan": None,
                    "included_in_plan": "ENTERPRISE",
                    "features_spec": [
                        {"category": "Staffing", "feature": "Technical Coordinator", "value": "Included"},
                        {"category": "Staffing", "feature": "SRR Operator", "value": "Included"},
                        {"category": "Staffing", "feature": "Device Monitoring Staff", "value": "Included"},
                        {"category": "Staffing", "feature": "Session Support Engineer", "value": "Included"},
                        {"category": "Staffing", "feature": "Registration Desk Support", "value": "Optional"},
                        {"category": "Staffing", "feature": "Speaker Assistance Staff", "value": "Optional"},
                        {"category": "Operations", "feature": "Presentation Management", "value": "Included"},
                        {"category": "Operations", "feature": "Session Queue Monitoring", "value": "Included"},
                        {"category": "Operations", "feature": "Emergency Technical Support", "value": "Included"},
                        {"category": "Coverage", "feature": "Half Day", "value": "Available"},
                        {"category": "Coverage", "feature": "Full Day", "value": "Available"},
                        {"category": "Coverage", "feature": "Multi-Day Event", "value": "Available"},
                        {"category": "Reporting", "feature": "Daily Operations Report", "value": "Included"},
                        {"category": "SLA", "feature": "Response Time", "value": "<5 min"}
                    ]
                },
                {
                    "name": "White Label Deployment",
                    "key": "ADDON_WHITE_LABEL",
                    "description": "Remove all Event branding, use your own domain and identity",
                    "price_inr": 50000.0,
                    "billing_unit": "PER_EVENT",
                    "available_for_plans": ["ENTERPRISE"],
                    "is_optional_for_plan": None,
                    "included_in_plan": None,
                    "features_spec": [
                        {"category": "Branding", "feature": "Event Branding Removal", "value": "Included"},
                        {"category": "Branding", "feature": "Custom Logo", "value": "Included"},
                        {"category": "Branding", "feature": "Custom Domain", "value": "Included"},
                        {"category": "Branding", "feature": "Custom Email Templates", "value": "Included"},
                        {"category": "Branding", "feature": "Custom Login Screen", "value": "Included"},
                        {"category": "Branding", "feature": "Custom Colors", "value": "Included"},
                        {"category": "Branding", "feature": "Custom Typography", "value": "Included"},
                        {"category": "Security", "feature": "SSL Certificate", "value": "Included"},
                        {"category": "Security", "feature": "SSO Integration", "value": "Optional"},
                        {"category": "Infrastructure", "feature": "Dedicated Subdomain", "value": "Included"},
                        {"category": "Infrastructure", "feature": "Dedicated Environment", "value": "Optional"},
                        {"category": "Support", "feature": "White Label Onboarding", "value": "Included"}
                    ]
                },
                {
                    "name": "Dedicated Mobile App",
                    "key": "ADDON_MOBILE_APP",
                    "description": "Custom-branded mobile app for attendees on iOS and Android",
                    "price_inr": 75000.0,
                    "billing_unit": "PER_EVENT",
                    "available_for_plans": ["ENTERPRISE"],
                    "is_optional_for_plan": None,
                    "included_in_plan": None,
                    "features_spec": [
                        {"category": "Platform", "feature": "Android App", "value": "Yes"},
                        {"category": "Platform", "feature": "iOS App", "value": "Yes"},
                        {"category": "Branding", "feature": "Custom Logo", "value": "Yes"},
                        {"category": "Branding", "feature": "Custom Splash Screen", "value": "Yes"},
                        {"category": "Branding", "feature": "Custom App Name", "value": "Yes"},
                        {"category": "Branding", "feature": "Custom Theme Colors", "value": "Yes"},
                        {"category": "Features", "feature": "Agenda View", "value": "Included"},
                        {"category": "Features", "feature": "Speaker Directory", "value": "Included"},
                        {"category": "Features", "feature": "Attendee Directory", "value": "Included"},
                        {"category": "Features", "feature": "Push Notifications", "value": "Included"},
                        {"category": "Features", "feature": "Live Polling", "value": "Optional"},
                        {"category": "Features", "feature": "Q&A Module", "value": "Optional"},
                        {"category": "Features", "feature": "Networking Chat", "value": "Optional"},
                        {"category": "Features", "feature": "Meeting Scheduler", "value": "Optional"},
                        {"category": "Distribution", "feature": "Public App Store", "value": "Yes"},
                        {"category": "Distribution", "feature": "Private Enterprise Distribution", "value": "Yes"},
                        {"category": "Analytics", "feature": "App Usage Analytics", "value": "Basic/Advanced"},
                        {"category": "Support", "feature": "Maintenance Period", "value": "30/60/90 Days"}
                    ]
                }
            ]

            existing_addons_res = await db.execute(select(Addon))
            existing_addons = {a.key: a for a in existing_addons_res.scalars().all()}

            for a_data in addons:
                addon = existing_addons.get(a_data["key"])
                if not addon:
                    addon = Addon(
                        name=a_data["name"],
                        key=a_data["key"],
                        description=a_data["description"],
                        price_inr=a_data["price_inr"],
                        billing_unit=a_data["billing_unit"],
                        available_for_plans=a_data["available_for_plans"],
                        is_optional_for_plan=a_data["is_optional_for_plan"],
                        included_in_plan=a_data["included_in_plan"],
                        features_spec=a_data["features_spec"],
                        is_active=True
                    )
                    db.add(addon)
                else:
                    # Addon exists. We don't overwrite its customized configuration details.
                    pass

            """
            await db.flush()
            await db.commit()
            logger.info("Subscription plans and features seeded.")
        except Exception as e:
            logger.error(f"Failed to seed plans and features: {e}")
            await db.rollback()


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

            org_id = await db.scalar(text("SELECT id FROM platform.organizations LIMIT 1"))
            if not org_id:
                org_id = uuid.uuid4()
                logger.info("No organization found. Creating default organization Eventos...")
                await db.execute(
                    text(
                        """
                        INSERT INTO platform.organizations (
                            id, name, slug, plan, is_platform_org,
                            is_internal_unrestricted, event_count, primary_color,
                            secondary_color, max_events, max_users, max_storage_gb,
                            country, timezone, is_active, onboarding_completed,
                            language, date_format, time_format, currency,
                            onboarding_step, onboarding_draft, created_at, updated_at
                        )
                        VALUES (
                            :id, 'Eventos', 'Eventos', 'trial', true,
                            true, 0, '#6366f1', '#8b5cf6', 1, 2, 10,
                            'IN', 'Asia/Kolkata', true, false,
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
                        is_internal_unrestricted = true
                    WHERE lower(slug) = 'eventos'
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
                            "id": uuid.uuid4(),
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
                    logger.info("Created local development admin account.")
            else:
                logger.debug("At least one Super Admin already exists. Skipping default admin creation.")
                await db.commit()

        except Exception as e:
            logger.error(f"Failed to ensure admin user: {e}")
            await db.rollback()
            if settings.is_production:
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
                VALUES
                    (gen_random_uuid(), 'Main Hall / Auditorium', 'MAIN_HALL', 'Primary conference hall for keynotes and plenary sessions', true, true, now(), now()),
                    (gen_random_uuid(), 'Breakout Room', 'BREAKOUT', 'Medium-sized room for parallel tracks and interactive sessions', true, true, now(), now()),
                    (gen_random_uuid(), 'Workshop / Hands-on Lab', 'WORKSHOP', 'Equipped room for training, workshops, and practical demos', true, true, now(), now()),
                    (gen_random_uuid(), 'Boardroom / Meeting Room', 'BOARDROOM', 'Executive meeting and committee room', true, true, now(), now()),
                    (gen_random_uuid(), 'Poster Exhibition Area', 'POSTER', 'Exhibition area for scientific posters and ePosters', true, true, now(), now()),
                    (gen_random_uuid(), 'Virtual / Streaming Stage', 'VIRTUAL', 'Digital stage for virtual or hybrid live streaming', true, true, now(), now()),
                    (gen_random_uuid(), 'Other / Miscellaneous', 'OTHER', 'General purpose space or custom setup', true, true, now(), now())
                ON CONFLICT DO NOTHING;
                """)
            )

            # 2. Session Types
            await db.execute(
                text("""
                INSERT INTO agenda.session_types (id, name, code, category, default_duration_minutes, configuration, is_system, is_active, created_at, updated_at)
                VALUES
                    (gen_random_uuid(), 'Keynote Address', 'KEYNOTE', 'Scientific', 45, '{}'::jsonb, true, true, now(), now()),
                    (gen_random_uuid(), 'Plenary Session', 'PLENARY', 'Scientific', 60, '{}'::jsonb, true, true, now(), now()),
                    (gen_random_uuid(), 'Oral Presentation', 'ORAL', 'Scientific', 15, '{}'::jsonb, true, true, now(), now()),
                    (gen_random_uuid(), 'Panel Discussion', 'PANEL', 'Discussion', 45, '{}'::jsonb, true, true, now(), now()),
                    (gen_random_uuid(), 'Workshop / Masterclass', 'WORKSHOP', 'Practical', 90, '{}'::jsonb, true, true, now(), now()),
                    (gen_random_uuid(), 'Symposium', 'SYMPOSIUM', 'Scientific', 60, '{}'::jsonb, true, true, now(), now()),
                    (gen_random_uuid(), 'Poster Presentation Session', 'POSTER_SESSION', 'Exhibition', 60, '{}'::jsonb, true, true, now(), now()),
                    (gen_random_uuid(), 'Break / Networking', 'BREAK', 'Social', 30, '{}'::jsonb, true, true, now(), now()),
                    (gen_random_uuid(), 'Inauguration / Ceremony', 'INAUGURATION', 'Ceremony', 45, '{}'::jsonb, true, true, now(), now())
                ON CONFLICT DO NOTHING;
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
                VALUES
                    (gen_random_uuid(), 'Scientific & Clinical', 'SCIENTIFIC', 'Core scientific, clinical, and medical tracks', true, true, now(), now()),
                    (gen_random_uuid(), 'Hands-on Workshop', 'WORKSHOP', 'Interactive skills and hands-on laboratory tracks', true, true, now(), now()),
                    (gen_random_uuid(), 'Industry & Innovation', 'INDUSTRY', 'Industry symposia, tech talks, and sponsor presentations', true, true, now(), now()),
                    (gen_random_uuid(), 'Poster & Abstracts', 'POSTER', 'Poster presentations and abstract displays', true, true, now(), now()),
                    (gen_random_uuid(), 'Plenary & Ceremonies', 'PLENARY', 'General assemblies, inaugurations, and keynote tracks', true, true, now(), now())
                ON CONFLICT DO NOTHING;
                """)
            )

            await db.commit()
            logger.info("Validated & populated default types across agenda catalog tables.")
        except Exception as e:
            logger.warning(f"Auto-populating agenda default types encountered: {e}")
            await db.rollback()
