from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.modules.crm.services.lifecycle_service import CrmLifecycleService
from app.modules.superadmin.dependencies import require_billing_read, require_crm_read


def _user(role: str | None):
    return SimpleNamespace(role="organiser", platform_role=role, is_platform_admin=False)


@pytest.mark.asyncio
async def test_support_can_read_crm_but_not_billing():
    assert await require_crm_read(_user("SUPPORT_ADMIN"))
    with pytest.raises(HTTPException) as exc:
        await require_billing_read(_user("SUPPORT_ADMIN"))
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_finance_can_read_billing_but_not_crm():
    assert await require_billing_read(_user("FINANCE_ADMIN"))
    with pytest.raises(HTTPException) as exc:
        await require_crm_read(_user("FINANCE_ADMIN"))
    assert exc.value.status_code == 403


def test_support_crm_mutation_fails_closed():
    with pytest.raises(HTTPException) as exc:
        CrmLifecycleService._require_mutation_access(SimpleNamespace(actor=_user("SUPPORT_ADMIN")))
    assert exc.value.detail["code"] == "PERMISSION_DENIED"
