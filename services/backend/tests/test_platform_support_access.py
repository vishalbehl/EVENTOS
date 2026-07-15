import uuid
from datetime import datetime, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tenant_context import TenantContextGuard
from app.modules.audit.models.audit_log import AuditLog
from app.modules.crm.models.core import Account, Contact, Lead
from app.modules.crm.models.crm_domain_tables import Activity, CrmOperationRequest, Note, Opportunity, PipelineStage, Task
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


@pytest.mark.asyncio
async def test_qualified_lead_conversion_is_idempotent_versioned_and_audited(
    client: AsyncClient,
    db: AsyncSession,
    super_admin: User,
    organization: Organization,
):
    account = Account(organization_id=organization.id, name="Conversion account")
    db.add(account)
    await db.flush()
    contact = Contact(
        organization_id=organization.id,
        account_id=account.id,
        first_name="Qualified",
        last_name="Buyer",
        email=f"buyer-{uuid.uuid4().hex[:8]}@example.test",
    )
    stage = PipelineStage(name=f"Qualification {uuid.uuid4().hex[:6]}", order=10)
    db.add_all([contact, stage])
    await db.flush()
    lead = Lead(organization_id=organization.id, contact_id=contact.id, status="QUALIFIED", source="Referral")
    db.add(lead)
    await db.commit()

    key = f"convert-lead-{uuid.uuid4()}"
    headers = {**auth_headers(super_admin), "X-Support-Reason": SUPPORT_REASON, "Idempotency-Key": key}
    payload = {
        "version": 1,
        "stage_id": str(stage.id),
        "opportunity_name": "Annual conference opportunity",
        "amount": 125000,
        "reason": "Converting verified qualified lead into sales pipeline",
    }
    url = f"/superadmin/crm/leads/{lead.id}/convert?organization_id={organization.id}"
    converted = await client.post(url, json=payload, headers=headers)
    assert converted.status_code == 201, converted.text
    opportunity_id = uuid.UUID(converted.json()["id"])
    assert converted.json()["account_id"] == str(account.id)

    replay = await client.post(url, json=payload, headers=headers)
    assert replay.status_code == 201
    assert replay.json()["id"] == str(opportunity_id)

    refreshed_lead = await db.get(Lead, lead.id)
    assert refreshed_lead.status == "CONVERTED"
    assert refreshed_lead.archived_at is not None
    opportunity = await db.get(Opportunity, opportunity_id)
    assert opportunity is not None
    actions = set((await db.scalars(select(AuditLog.action_type).where(
        AuditLog.resource_id.in_([lead.id, opportunity_id])
    ))).all())
    assert {"CRM_LEAD_CONVERTED", "CRM_OPPORTUNITY_CREATED_FROM_LEAD"}.issubset(actions)


@pytest.mark.asyncio
async def test_crm_engagement_records_are_scoped_idempotent_versioned_and_audited(
    client: AsyncClient,
    db: AsyncSession,
    super_admin: User,
    organization: Organization,
):
    headers = {**auth_headers(super_admin), "X-Support-Reason": SUPPORT_REASON}
    activity_key = f"activity-{uuid.uuid4()}"
    activity_payload = {
        "entity_type": "organization",
        "entity_id": str(organization.id),
        "activity_type": "MEETING",
        "description": "Quarterly account review",
        "occurred_at": "2026-07-15T10:00:00Z",
        "reason": "Recording verified quarterly customer meeting",
    }
    activity_response = await client.post(
        f"/superadmin/crm/activities?organization_id={organization.id}",
        json=activity_payload,
        headers={**headers, "Idempotency-Key": activity_key},
    )
    assert activity_response.status_code == 201, activity_response.text
    activity = activity_response.json()
    replay = await client.post(
        f"/superadmin/crm/activities?organization_id={organization.id}",
        json=activity_payload,
        headers={**headers, "Idempotency-Key": activity_key},
    )
    assert replay.status_code == 201
    assert replay.json()["id"] == activity["id"]

    task_response = await client.post(
        f"/superadmin/crm/tasks?organization_id={organization.id}",
        json={
            "entity_type": "organization",
            "entity_id": str(organization.id),
            "subject": "Send reviewed commercial summary",
            "status": "NOT_STARTED",
            "reason": "Creating follow-up from verified customer meeting",
        },
        headers={**headers, "Idempotency-Key": f"task-{uuid.uuid4()}"},
    )
    assert task_response.status_code == 201, task_response.text
    task = task_response.json()
    completed = await client.patch(
        f"/superadmin/crm/tasks/{task['id']}?organization_id={organization.id}",
        json={
            "version": task["version"],
            "status": "COMPLETED",
            "reason": "Marking the verified customer follow-up complete",
        },
        headers={**headers, "Idempotency-Key": f"complete-task-{uuid.uuid4()}"},
    )
    assert completed.status_code == 200, completed.text
    assert completed.json()["completed_at"] is not None

    note_response = await client.post(
        f"/superadmin/crm/notes?organization_id={organization.id}",
        json={
            "entity_type": "account",
            "entity_id": str(uuid.uuid4()),
            "content": "Must never persist against an unrelated entity.",
            "reason": "Testing CRM entity reference isolation safely",
        },
        headers={**headers, "Idempotency-Key": f"bad-note-{uuid.uuid4()}"},
    )
    assert note_response.status_code == 422
    assert note_response.json()["detail"]["code"] == "INVALID_CRM_REFERENCE"

    listed = await client.get(
        f"/superadmin/crm/activities?organization_id={organization.id}&entity_type=organization&entity_id={organization.id}",
        headers=headers,
    )
    assert listed.status_code == 200, listed.text
    assert [item["id"] for item in listed.json()["items"]] == [activity["id"]]

    archived = await client.post(
        f"/superadmin/crm/activities/{activity['id']}/archive?organization_id={organization.id}",
        json={"version": activity["version"], "reason": "Archiving duplicate customer activity after review"},
        headers={**headers, "Idempotency-Key": f"archive-activity-{uuid.uuid4()}"},
    )
    assert archived.status_code == 200, archived.text
    assert archived.json()["archived_at"] is not None

    async with TenantContextGuard.scoped(db, organization.id):
        assert await db.get(Activity, uuid.UUID(activity["id"])) is not None
        assert await db.get(Task, uuid.UUID(task["id"])) is not None
        assert await db.scalar(select(Note.id).where(Note.organization_id == organization.id)) is None
        actions = set((await db.scalars(select(AuditLog.action_type).where(
            AuditLog.organization_id == organization.id,
            AuditLog.resource_id.in_([uuid.UUID(activity["id"]), uuid.UUID(task["id"])]),
        ))).all())
        assert {"CRM_ACTIVITY_CREATED", "CRM_ACTIVITY_ARCHIVED", "CRM_TASK_CREATED", "CRM_TASK_UPDATED"}.issubset(actions)


@pytest.mark.asyncio
async def test_crm_opportunity_list_and_account_workspace_are_complete_scoped_and_audited(
    client: AsyncClient,
    db: AsyncSession,
    super_admin: User,
    organization: Organization,
):
    account = Account(organization_id=organization.id, name="Workspace account")
    db.add(account)
    await db.flush()
    contact = Contact(
        organization_id=organization.id,
        account_id=account.id,
        first_name="Workspace",
        last_name="Contact",
        email=f"workspace-{uuid.uuid4().hex[:8]}@example.test",
    )
    stage = PipelineStage(name=f"Workspace {uuid.uuid4().hex[:6]}", order=20)
    db.add_all([contact, stage])
    await db.flush()
    opportunity = Opportunity(
        organization_id=organization.id,
        account_id=account.id,
        stage_id=stage.id,
        name="Workspace opportunity",
        amount=250000,
    )
    db.add(opportunity)
    await db.flush()
    db.add_all([
        Activity(
            organization_id=organization.id,
            entity_type="account",
            entity_id=account.id,
            activity_type="MEETING",
            description="Account planning meeting",
            occurred_at=datetime.now(timezone.utc),
        ),
        Task(
            organization_id=organization.id,
            entity_type="opportunity",
            entity_id=opportunity.id,
            subject="Prepare proposal",
            status="IN_PROGRESS",
        ),
        Note(
            organization_id=organization.id,
            entity_type="contact",
            entity_id=contact.id,
            content="Primary commercial contact.",
        ),
    ])
    other_org = Organization(
        name="Hidden CRM Workspace Tenant",
        slug=f"hidden-workspace-{uuid.uuid4().hex[:8]}",
        plan="pro",
    )
    db.add(other_org)
    await db.flush()
    hidden_account = Account(organization_id=other_org.id, name="Hidden account")
    db.add(hidden_account)
    await db.commit()

    headers = {**auth_headers(super_admin), "X-Support-Reason": SUPPORT_REASON}
    listed = await client.get(
        f"/superadmin/crm/opportunities?organization_id={organization.id}",
        headers=headers,
    )
    assert listed.status_code == 200, listed.text
    assert [item["id"] for item in listed.json()["items"]] == [str(opportunity.id)]

    workspace = await client.get(
        f"/superadmin/crm/accounts/{account.id}/workspace?organization_id={organization.id}",
        headers=headers,
    )
    assert workspace.status_code == 200, workspace.text
    payload = workspace.json()
    assert payload["account"]["id"] == str(account.id)
    assert [item["id"] for item in payload["contacts"]] == [str(contact.id)]
    assert [item["id"] for item in payload["opportunities"]] == [str(opportunity.id)]
    assert payload["metrics"] == {
        "contact_count": 1,
        "active_opportunity_count": 1,
        "pipeline_value": 250000.0,
        "open_task_count": 1,
    }
    assert len(payload["activities"]) == 1
    assert len(payload["tasks"]) == 1
    assert len(payload["notes"]) == 1

    concealed = await client.get(
        f"/superadmin/crm/accounts/{hidden_account.id}/workspace?organization_id={organization.id}",
        headers=headers,
    )
    assert concealed.status_code == 404

    audit = await db.scalar(select(AuditLog).where(
        AuditLog.resource_type == "crm_account_workspace",
        AuditLog.resource_id == account.id,
        AuditLog.organization_id == organization.id,
    ))
    assert audit is not None
    assert audit.is_sensitive is True
