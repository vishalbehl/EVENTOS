import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tenant_context import TenantContextGuard
from app.modules.audit.models.audit_log import AuditLog
from app.modules.crm.models.core import Account
from app.modules.crm.models.crm_domain_tables import CrmOperationRequest
from app.modules.identity.models.user import User
from app.modules.platform.models.organization import Organization
from tests.conftest import auth_headers


SUPPORT_REASON = "Investigating customer support case EX-1042"


@pytest.mark.asyncio
async def test_platform_support_read_requires_explicit_scope_and_reason(
    client: AsyncClient,
    super_admin: User,
    organization: Organization,
):
    missing_scope = await client.get(
        "/superadmin/crm/accounts",
        headers={**auth_headers(super_admin), "X-Support-Reason": SUPPORT_REASON},
    )
    assert missing_scope.status_code == 422

    missing_reason = await client.get(
        f"/superadmin/crm/accounts?organization_id={organization.id}",
        headers=auth_headers(super_admin),
    )
    assert missing_reason.status_code == 422

    weak_reason = await client.get(
        f"/superadmin/crm/accounts?organization_id={organization.id}",
        headers={**auth_headers(super_admin), "X-Support-Reason": "   too short   "},
    )
    assert weak_reason.status_code == 422


@pytest.mark.asyncio
async def test_platform_support_read_rejects_non_platform_admin(
    client: AsyncClient,
    organizer: User,
    organization: Organization,
):
    response = await client.get(
        f"/superadmin/crm/accounts?organization_id={organization.id}",
        headers={**auth_headers(organizer), "X-Support-Reason": SUPPORT_REASON},
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_platform_support_read_is_tenant_scoped_and_audited(
    client: AsyncClient,
    db: AsyncSession,
    super_admin: User,
    organization: Organization,
):
    other_org = Organization(
        name="Other Support Tenant",
        slug=f"support-other-{uuid.uuid4().hex[:8]}",
        plan="pro",
    )
    db.add(other_org)
    await db.flush()
    target_account = Account(
        organization_id=organization.id,
        name="Visible Target Account",
    )
    hidden_account = Account(
        organization_id=other_org.id,
        name="Hidden Other Account",
    )
    db.add_all([target_account, hidden_account])
    await db.commit()

    response = await client.get(
        f"/superadmin/crm/accounts?organization_id={organization.id}",
        headers={**auth_headers(super_admin), "X-Support-Reason": SUPPORT_REASON},
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert [row["id"] for row in payload["items"]] == [str(target_account.id)]
    assert all(row["organization_id"] == str(organization.id) for row in payload["items"])
    assert payload["has_next"] is False
    assert payload["next_cursor"] is None

    async with TenantContextGuard.scoped(db, organization.id):
        audit = await db.scalar(
            select(AuditLog).where(
                AuditLog.organization_id == organization.id,
                AuditLog.actor_user_id == super_admin.id,
                AuditLog.resource_type == "crm_accounts",
                AuditLog.action_type == "PLATFORM_SUPPORT_DATA_READ",
            )
        )
        assert audit is not None
        assert audit.is_sensitive is True
        assert audit.new_state["reason"] == SUPPORT_REASON
        assert audit.new_state["result_count"] == 1


@pytest.mark.asyncio
async def test_billing_support_endpoint_has_same_scope_contract(
    client: AsyncClient,
    super_admin: User,
    organization: Organization,
):
    unscoped = await client.get(
        "/superadmin/billing-admin/entitlements",
        headers={**auth_headers(super_admin), "X-Support-Reason": SUPPORT_REASON},
    )
    assert unscoped.status_code == 422

    scoped = await client.get(
        f"/superadmin/billing-admin/entitlements?organization_id={organization.id}",
        headers={**auth_headers(super_admin), "X-Support-Reason": SUPPORT_REASON},
    )
    assert scoped.status_code == 200, scoped.text
    assert scoped.json() == {"items": [], "next_cursor": None, "has_next": False}


@pytest.mark.asyncio
async def test_platform_support_cursor_is_stable_and_rejects_invalid_values(
    client: AsyncClient,
    db: AsyncSession,
    super_admin: User,
    organization: Organization,
):
    accounts = [
        Account(organization_id=organization.id, name=f"Cursor Account {index}")
        for index in range(3)
    ]
    db.add_all(accounts)
    await db.commit()
    headers = {**auth_headers(super_admin), "X-Support-Reason": SUPPORT_REASON}
    base_url = f"/superadmin/crm/accounts?organization_id={organization.id}&limit=2"

    first = await client.get(base_url, headers=headers)
    assert first.status_code == 200, first.text
    first_page = first.json()
    assert len(first_page["items"]) == 2
    assert first_page["has_next"] is True
    assert first_page["next_cursor"]

    second = await client.get(
        f"{base_url}&cursor={first_page['next_cursor']}",
        headers=headers,
    )
    assert second.status_code == 200, second.text
    second_page = second.json()
    assert len(second_page["items"]) == 1
    assert second_page["has_next"] is False
    assert not ({row["id"] for row in first_page["items"]} & {row["id"] for row in second_page["items"]})

    invalid = await client.get(f"{base_url}&cursor=not-a-cursor", headers=headers)
    assert invalid.status_code == 400
    assert invalid.json()["detail"]["code"] == "INVALID_CURSOR"


@pytest.mark.asyncio
async def test_crm_account_lifecycle_is_idempotent_versioned_and_audited(
    client: AsyncClient,
    db: AsyncSession,
    super_admin: User,
    organization: Organization,
):
    headers = {
        **auth_headers(super_admin),
        "X-Support-Reason": SUPPORT_REASON,
        "Idempotency-Key": f"create-account-{uuid.uuid4()}",
    }
    create_payload = {
        "name": "Lifecycle Account",
        "website": "https://example.test",
        "industry": "Events",
        "reason": "Creating account for verified sales request",
    }
    created = await client.post(
        f"/superadmin/crm/accounts?organization_id={organization.id}",
        json=create_payload,
        headers=headers,
    )
    assert created.status_code == 201, created.text
    account = created.json()
    assert account["version"] == 1
    assert account["archived_at"] is None

    replay = await client.post(
        f"/superadmin/crm/accounts?organization_id={organization.id}",
        json=create_payload,
        headers=headers,
    )
    assert replay.status_code == 201
    assert replay.json()["id"] == account["id"]

    conflict = await client.post(
        f"/superadmin/crm/accounts?organization_id={organization.id}",
        json={**create_payload, "name": "Different Account"},
        headers=headers,
    )
    assert conflict.status_code == 409
    assert conflict.json()["detail"]["code"] == "IDEMPOTENCY_CONFLICT"

    update_headers = {**headers, "Idempotency-Key": f"update-account-{uuid.uuid4()}"}
    updated = await client.patch(
        f"/superadmin/crm/accounts/{account['id']}?organization_id={organization.id}",
        json={"name": "Lifecycle Account Updated", "version": 1, "reason": "Correcting verified customer account name"},
        headers=update_headers,
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["version"] == 2

    stale = await client.patch(
        f"/superadmin/crm/accounts/{account['id']}?organization_id={organization.id}",
        json={"industry": "Technology", "version": 1, "reason": "Attempting stale account update safely"},
        headers={**headers, "Idempotency-Key": f"stale-account-{uuid.uuid4()}"},
    )
    assert stale.status_code == 409
    assert stale.json()["detail"]["code"] == "VERSION_CONFLICT"

    archived = await client.post(
        f"/superadmin/crm/accounts/{account['id']}/archive?organization_id={organization.id}",
        json={"version": 2, "reason": "Archiving duplicate account after customer review"},
        headers={**headers, "Idempotency-Key": f"archive-account-{uuid.uuid4()}"},
    )
    assert archived.status_code == 200, archived.text
    assert archived.json()["version"] == 3
    assert archived.json()["archived_at"] is not None

    active_list = await client.get(
        f"/superadmin/crm/accounts?organization_id={organization.id}",
        headers={**auth_headers(super_admin), "X-Support-Reason": SUPPORT_REASON},
    )
    assert all(item["id"] != account["id"] for item in active_list.json()["items"])

    restored = await client.post(
        f"/superadmin/crm/accounts/{account['id']}/restore?organization_id={organization.id}",
        json={"version": 3, "reason": "Restoring account after support validation completed"},
        headers={**headers, "Idempotency-Key": f"restore-account-{uuid.uuid4()}"},
    )
    assert restored.status_code == 200, restored.text
    assert restored.json()["version"] == 4
    assert restored.json()["archived_at"] is None

    async with TenantContextGuard.scoped(db, organization.id):
        operations = (await db.execute(select(CrmOperationRequest).where(
            CrmOperationRequest.organization_id == organization.id,
            CrmOperationRequest.result_ref_id == uuid.UUID(account["id"]),
        ))).scalars().all()
        assert {operation.operation_type for operation in operations} == {
            "CREATE_ACCOUNT", "UPDATE_ACCOUNT", "ARCHIVE_ACCOUNT", "RESTORE_ACCOUNT"
        }
        actions = set((await db.execute(select(AuditLog.action_type).where(
            AuditLog.organization_id == organization.id,
            AuditLog.resource_id == uuid.UUID(account["id"]),
        ))).scalars().all())
        assert {
            "CRM_ACCOUNT_CREATED",
            "CRM_ACCOUNT_UPDATED",
            "CRM_ACCOUNT_ARCHIVED",
            "CRM_ACCOUNT_RESTORED",
        }.issubset(actions)


@pytest.mark.asyncio
async def test_crm_mutations_reject_cross_tenant_references_and_active_dependencies(
    client: AsyncClient,
    db: AsyncSession,
    super_admin: User,
    organization: Organization,
):
    other_org = Organization(
        name="CRM Reference Isolation Tenant",
        slug=f"crm-reference-{uuid.uuid4().hex[:8]}",
        plan="pro",
    )
    db.add(other_org)
    await db.flush()
    other_account = Account(organization_id=other_org.id, name="Other Tenant Account")
    db.add(other_account)
    await db.commit()

    base_headers = {
        **auth_headers(super_admin),
        "X-Support-Reason": SUPPORT_REASON,
    }
    rejected = await client.post(
        f"/superadmin/crm/contacts?organization_id={organization.id}",
        json={
            "account_id": str(other_account.id),
            "first_name": "Cross",
            "last_name": "Tenant",
            "email": "cross-tenant@example.test",
            "reason": "Testing tenant reference isolation safely",
        },
        headers={**base_headers, "Idempotency-Key": f"cross-tenant-{uuid.uuid4()}"},
    )
    assert rejected.status_code == 422
    assert rejected.json()["detail"]["code"] == "INVALID_CRM_REFERENCE"

    account_response = await client.post(
        f"/superadmin/crm/accounts?organization_id={organization.id}",
        json={
            "name": "Account With Dependency",
            "reason": "Creating account for dependency validation",
        },
        headers={**base_headers, "Idempotency-Key": f"dependency-account-{uuid.uuid4()}"},
    )
    assert account_response.status_code == 201, account_response.text
    account = account_response.json()

    contact_response = await client.post(
        f"/superadmin/crm/contacts?organization_id={organization.id}",
        json={
            "account_id": account["id"],
            "first_name": "Active",
            "last_name": "Dependency",
            "email": "active-dependency@example.test",
            "reason": "Creating active contact dependency record",
        },
        headers={**base_headers, "Idempotency-Key": f"dependency-contact-{uuid.uuid4()}"},
    )
    assert contact_response.status_code == 201, contact_response.text

    blocked_archive = await client.post(
        f"/superadmin/crm/accounts/{account['id']}/archive?organization_id={organization.id}",
        json={
            "version": account["version"],
            "reason": "Testing dependency-safe archive behavior",
        },
        headers={**base_headers, "Idempotency-Key": f"dependency-archive-{uuid.uuid4()}"},
    )
    assert blocked_archive.status_code == 409
    assert blocked_archive.json()["detail"]["code"] == "CRM_DEPENDENCIES_EXIST"
