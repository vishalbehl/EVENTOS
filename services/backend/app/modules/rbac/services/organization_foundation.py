"""Foundation seed for explicitly newly-created tenants, never legacy reconciliation."""
from fastapi import HTTPException
from sqlalchemy import inspect
from app.core.tenant_context import TenantContextGuard
from app.modules.rbac.models.access_foundation import OperationalWorkspace, OrganizationAccessRevision


async def initialize_new_organization(db, organization, *, workspace_name="Operations"):
    if organization.organization_kind not in {"NORMAL", "EMC", "CLIENT"}:
        raise HTTPException(422, detail={"code": "INVALID_ORGANIZATION_KIND"})
    if not inspect(organization).pending:
        # Existing tenant repair requires the separate approved reconciliation path.
        raise ValueError("Foundation initialization requires a pending new organisation.")
    async with TenantContextGuard.scoped(db, organization.id):
        await db.flush([organization])
        workspace = OperationalWorkspace(organization_id=organization.id,
            name=workspace_name, is_default=True)
        db.add_all([workspace, OrganizationAccessRevision(organization_id=organization.id)])
        await db.flush()
    return workspace
