from types import SimpleNamespace
from datetime import datetime, timezone

import pytest
from fastapi import HTTPException, Request, Response

from app.modules.crm.services.lifecycle_service import CrmLifecycleService
from app.modules.superadmin.dependencies import require_billing_read, require_crm_read
from app.modules.platform.models.organization import Organization


def _user(role: str | None):
    return SimpleNamespace(role="organiser", platform_role=role, is_platform_admin=False)


async def _admit(dependency, db, user):
    response = Response()
    accepted = await dependency(Request({"type": "http", "method": "GET", "path": "/"}),
        response, SimpleNamespace(role="super_admin", amr=("pwd", "totp"), impersonator_id=None),
        user=user, db=db)
    assert response.headers["Cache-Control"] == "no-store"
    return accepted


@pytest.mark.asyncio
async def test_support_can_read_crm_but_not_billing(db, super_admin):
    super_admin.platform_role = "SUPPORT_ADMIN"
    await db.flush()
    assert await _admit(require_crm_read, db, super_admin) is super_admin
    with pytest.raises(HTTPException) as exc:
        await _admit(require_billing_read, db, super_admin)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_finance_can_read_billing_but_not_crm(db, super_admin):
    super_admin.platform_role = "FINANCE_ADMIN"
    await db.flush()
    assert await _admit(require_billing_read, db, super_admin) is super_admin
    with pytest.raises(HTTPException) as exc:
        await _admit(require_crm_read, db, super_admin)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize("restriction", ["archived", "suspended", "inactive", "not_platform", "revoked_role"])
async def test_platform_lifecycle_and_role_revocation_deny_old_claims(db, super_admin, restriction):
    assert await _admit(require_crm_read, db, super_admin) is super_admin
    organization = await db.get(Organization, super_admin.organization_id)
    if restriction == "archived":
        organization.archived_at = datetime.now(timezone.utc)
        organization.is_active = False  # Required by the real archive-state constraint.
    elif restriction == "suspended":
        organization.suspended_at = datetime.now(timezone.utc)
    elif restriction == "inactive":
        organization.is_active = False
    elif restriction == "not_platform":
        organization.is_platform_org = False
    else:
        super_admin.platform_role = None
    await db.flush()
    with pytest.raises(HTTPException) as exc:
        await _admit(require_crm_read, db, super_admin)
    assert exc.value.status_code == 403
    assert exc.value.detail["code"] == "PLATFORM_PERMISSION_DENIED"


@pytest.mark.asyncio
async def test_customer_global_admin_label_cannot_grant_platform_authority(db, organizer):
    organizer.role = "super_admin"
    organizer.is_platform_admin = True
    organizer.platform_role = "SUPER_ADMIN"
    await db.flush()
    with pytest.raises(HTTPException) as exc:
        await _admit(require_crm_read, db, organizer)
    assert exc.value.status_code == 403


def test_support_crm_mutation_fails_closed():
    with pytest.raises(HTTPException) as exc:
        CrmLifecycleService._require_mutation_access(SimpleNamespace(actor=_user("SUPPORT_ADMIN")))
    assert exc.value.detail["code"] == "PERMISSION_DENIED"
