# =============================================================
# Conference Platform — Routers Package (Re-exporters)
# API routers package.
# =============================================================

from fastapi import APIRouter
from app.modules.registration.routers.ticket_types import router as ticket_types_router

from app.modules.identity.routers import auth, users, me, impersonation
from app.modules.platform import router as platform
from app.modules.platform import support_router
from app.modules.platform.departments.router import router as departments_router
from app.modules.platform.teams.router import router as teams_router
from app.modules.platform.roles.router import router as roles_router, assignments_router
from app.modules.platform.permissions.router import router as permissions_router
from app.modules.rbac.routers import events, settings, rbac, global_settings, organisations
from app.modules.speakers.routers import sessions, speakers, portal, speaker_profiles
from app.modules.presentations.routers import bundles, files, queue, posters, storage
from app.modules.venue.routers import rooms, rooms_devices, attendance, capacity, srr, sync
from app.modules.registration.routers import (
    badges, printers, import_jobs, print_templates, 
    registrations, registration_portal, participant_roles, participants,
    payments, portal_auth, portal_dashboard
)
from app.modules.analytics.routers import analytics
from app.modules.analytics.routers.dashboard import router as dashboard_router
from app.modules.notifications.routers import notifications, webhooks, announcements
from app.modules.notifications.routers.notifications import email_router

from app.modules.search.routers.search import router as search_router
from app.modules.audit.routers.audit import router as audit_router

# Phase 2: Files, Workflow & AI RAG Platform
from app.modules.files.routers.files import router as files_router
from app.modules.workflow.routers.workflows import router as workflows_router
from app.modules.ai.routers.ai import router as ai_router


api_router = APIRouter()

# ── Phase 5: Commercial Catalog, Inventory & Pricing Engine ────
from app.modules.commercial.router import router as commercial_router
from app.modules.inventory.router import router as inventory_router
from app.modules.pricing.router import router as pricing_router
from app.modules.procurement.router import router as procurement_router

api_router.include_router(commercial_router)
api_router.include_router(inventory_router)
api_router.include_router(pricing_router)
api_router.include_router(procurement_router)

# ── Phase 6: Enterprise Template System, Website Builder & Blueprint Engine ────
from app.modules.website_builder.router import router as website_builder_router
from app.modules.blueprints.router import router as blueprints_router

api_router.include_router(website_builder_router)
api_router.include_router(blueprints_router)

api_router.include_router(auth.router)
api_router.include_router(impersonation.router)
api_router.include_router(platform.router)

api_router.include_router(support_router.router)
api_router.include_router(departments_router)
api_router.include_router(teams_router)
api_router.include_router(roles_router)
api_router.include_router(assignments_router)
api_router.include_router(permissions_router)
api_router.include_router(organisations.router)
api_router.include_router(bundles.router)
api_router.include_router(events.router)
api_router.include_router(sessions.router)
api_router.include_router(rooms.router)
api_router.include_router(speakers.router)
api_router.include_router(speaker_profiles.router)
api_router.include_router(portal.router)
api_router.include_router(files.router)
api_router.include_router(import_jobs.router)
api_router.include_router(notifications.router)
api_router.include_router(email_router)
api_router.include_router(announcements.router)
api_router.include_router(srr.router)
api_router.include_router(rooms_devices.router)
api_router.include_router(queue.router)
api_router.include_router(posters.router)
api_router.include_router(analytics.router)
api_router.include_router(analytics.global_router)
api_router.include_router(dashboard_router)
api_router.include_router(settings.router)
api_router.include_router(global_settings.router)
api_router.include_router(webhooks.router)
api_router.include_router(storage.router)
api_router.include_router(users.router)
api_router.include_router(rbac.router)
api_router.include_router(me.router)
api_router.include_router(participants.router)
api_router.include_router(print_templates.router)
api_router.include_router(ticket_types_router)
api_router.include_router(registration_portal.router)
api_router.include_router(participant_roles.router)
api_router.include_router(registrations.router)
api_router.include_router(capacity.router)
api_router.include_router(badges.router)
api_router.include_router(printers.router)
api_router.include_router(attendance.router)
api_router.include_router(sync.router)
api_router.include_router(payments.router)
api_router.include_router(portal_auth.router)
api_router.include_router(portal_dashboard.router)

# ── Phase 1: Search & Audit Core ──────────────────────────────
api_router.include_router(search_router)
api_router.include_router(audit_router)

# ── Phase 2: Files, Workflow & AI RAG Platform ────────────────
api_router.include_router(files_router)
api_router.include_router(workflows_router)
api_router.include_router(ai_router)

# ── Phase 3: Applications, Developer Portal & OAuth2 Gateway ──
from app.modules.developer.routers.developer import router as developer_router
api_router.include_router(developer_router)

# ── Phase 4: Billing & Plan Usage ─────────────────────────────
from app.modules.billing.routers.billing import router as billing_router
from app.modules.billing.routers.activations import router as activations_router
api_router.include_router(billing_router)
api_router.include_router(activations_router)

# ── Phase 7: Tech Services & Operations Planning Engine ───────
from app.modules.technology_services.router import router as technology_services_router
from app.modules.operations_planning.router import router as operations_planning_router
from app.modules.resource_management.router import router as resource_management_router
from app.modules.deployment_management.router import router as deployment_management_router

api_router.include_router(technology_services_router)
api_router.include_router(operations_planning_router)
api_router.include_router(resource_management_router)
api_router.include_router(deployment_management_router)

# ── Super Admin Namespace ──────────────────────────────────────
# Aggregates existing module routers under /api/v1/superadmin/.
# All routes in this namespace require Super Admin authentication.
from app.modules.superadmin.router import superadmin_router
api_router.include_router(superadmin_router)



