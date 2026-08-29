# =============================================================
# Conference Platform — Super Admin Aggregator Router
# app/modules/superadmin/router.py
#
# This module is a PURE AGGREGATOR. It does NOT define any
# business logic itself. It re-exports routes from existing
# module routers under the /api/v1/superadmin/ namespace and
# enforces Super Admin authentication on every route.
#
# Pattern:
#   - Import each existing sub-router
#   - Include it into `superadmin_router` with:
#       * a /superadmin sub-prefix
#       * `dependencies=[Depends(require_super_admin)]` applied
#         to every route in that sub-router
#
# ⚠️  DO NOT add business logic here. Route handlers stay in
#     their original modules. This router only re-mounts them.
# =============================================================

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.modules.superadmin.dependencies import require_billing_read, require_crm_read, require_super_admin

# ── Import existing module routers (not rewritten — re-exported) ──
from app.modules.rbac.routers.organisations import router as orgs_router

# ── Import existing module routers (not rewritten — re-exported) ──
from app.modules.rbac.routers.organisations import router as orgs_router
from app.modules.billing.routers.billing import router as billing_router
from app.modules.billing.routers.activations import router as activations_router
from app.modules.identity.routers.users import router as users_router
from app.modules.identity.routers.impersonation import router as impersonation_router
from app.modules.analytics.routers.dashboard import router as dashboard_router
from app.modules.developer.routers.developer import router as developer_router
from app.modules.platform_health.router import router as platform_health_router
from app.modules.crm.routers.crm_router import router as crm_router
from app.modules.billing.routers.billing_superadmin import router as billing_superadmin_router
from app.modules.platform.reports_router import router as reports_router
from app.modules.audit.routers.audit_exports import router as audit_exports_router
from app.modules.console_summary.router import router as console_summary_router


# ── Top-level superadmin router ───────────────────────────────
# All sub-routers are mounted here with the shared dependency.
# main.py will include this router under the /api/v1/superadmin prefix.

superadmin_router = APIRouter(
    prefix="/superadmin",
    tags=["superadmin"],
    dependencies=[Depends(require_super_admin)],
)

# ── Sub-router mounts ─────────────────────────────────────────
# Each existing router keeps its own internal prefix and tags.
# The superadmin_router adds an outer /superadmin prefix on top.

superadmin_router.include_router(orgs_router)
superadmin_router.include_router(billing_router)
superadmin_router.include_router(activations_router)
superadmin_router.include_router(users_router)
superadmin_router.include_router(impersonation_router)
superadmin_router.include_router(dashboard_router)
superadmin_router.include_router(developer_router)
superadmin_router.include_router(platform_health_router)
superadmin_router.include_router(reports_router)
superadmin_router.include_router(audit_exports_router)
superadmin_router.include_router(console_summary_router)
from app.modules.search.router import router as search_router
superadmin_router.include_router(search_router)



commercial_staff_router = APIRouter(prefix="/superadmin", tags=["platform-commercial"])
commercial_staff_router.include_router(crm_router, dependencies=[Depends(require_crm_read)])
commercial_staff_router.include_router(billing_superadmin_router, dependencies=[Depends(require_billing_read)])
