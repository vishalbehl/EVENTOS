import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.audit.models.audit_log import AuditLog
from app.modules.files.models.file import Asset
from app.modules.identity.models.user import User
from app.modules.platform.models.organization import Organization
from app.modules.support.models.ticket import SupportTicket, TicketComment
from app.modules.support.models.support_domain_tables import TicketAttachment
from tests.conftest import auth_headers


SUPPORT_REASON = "Investigating approved customer support case SUP-2048"


def support_headers(user: User) -> dict[str, str]:
    return {**auth_headers(user), "X-Support-Reason": SUPPORT_REASON}


@pytest.mark.asyncio
async def test_support_admin_list_is_explicitly_scoped_and_conceals_other_tenant(
    client: AsyncClient,
    db: AsyncSession,
    super_admin: User,
    organizer: User,
    organization: Organization,
):
    other_org = Organization(name="Other Support Tenant", slug=f"support-other-{uuid.uuid4().hex[:8]}", plan="pro")
    db.add(other_org)
    await db.flush()
    own = SupportTicket(organization_id=organization.id, creator_id=organizer.id, subject="Scoped ticket", description="Visible only in selected tenant", status="OPEN")
    hidden = SupportTicket(organization_id=other_org.id, creator_id=super_admin.id, subject="Hidden ticket", description="Must never bleed across scope", status="OPEN")
    db.add_all([own, hidden])
    await db.commit()

    missing_scope = await client.get("/api/v1/support/tickets/admin", headers=support_headers(super_admin))
    assert missing_scope.status_code == 422

    response = await client.get(
        f"/api/v1/support/tickets/admin?organization_id={organization.id}",
        headers=support_headers(super_admin),
    )
    assert response.status_code == 200, response.text
    assert [item["id"] for item in response.json()["items"]] == [str(own.id)]

    concealed = await client.get(
        f"/api/v1/support/tickets/admin/{hidden.id}?organization_id={organization.id}",
        headers=support_headers(super_admin),
    )
    assert concealed.status_code == 404


@pytest.mark.asyncio
async def test_support_lifecycle_is_versioned_step_up_audited_and_internal_notes_are_private(
    client: AsyncClient,
    db: AsyncSession,
    super_admin: User,
    organizer: User,
    organization: Organization,
):
    ticket = SupportTicket(
        organization_id=organization.id,
        creator_id=organizer.id,
        subject="Lifecycle ticket",
        description="Exercise support administration controls",
        status="OPEN",
        priority="MEDIUM",
    )
    db.add(ticket)
    await db.commit()
    base = f"/api/v1/support/tickets/admin/{ticket.id}?organization_id={organization.id}"

    updated = await client.patch(
        base,
        headers=support_headers(super_admin),
        json={
            "status": "IN_PROGRESS",
            "priority": "HIGH",
            "escalate": True,
            "version": 1,
            "reason": "Escalating verified customer production impact",
        },
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["version"] == 2
    assert updated.json()["is_escalated"] is True

    stale = await client.patch(
        base,
        headers=support_headers(super_admin),
        json={"status": "RESOLVED", "version": 1, "reason": "Testing stale support update rejection"},
    )
    assert stale.status_code == 409
    assert stale.json()["detail"]["code"] == "VERSION_CONFLICT"

    note = await client.post(
        f"/api/v1/support/tickets/admin/{ticket.id}/comments?organization_id={organization.id}",
        headers=support_headers(super_admin),
        json={"content": "Private investigation evidence", "is_internal": True},
    )
    assert note.status_code == 201, note.text
    reply = await client.post(
        f"/api/v1/support/tickets/admin/{ticket.id}/comments?organization_id={organization.id}",
        headers=support_headers(super_admin),
        json={"content": "Customer-safe response", "is_internal": False},
    )
    assert reply.status_code == 201, reply.text

    customer_comments = await client.get(
        f"/api/v1/support/tickets/{ticket.id}/comments",
        headers=auth_headers(organizer),
    )
    assert customer_comments.status_code == 200, customer_comments.text
    assert [comment["content"] for comment in customer_comments.json()] == ["Customer-safe response"]

    actions = set((await db.execute(select(AuditLog.action_type).where(
        AuditLog.resource_id == ticket.id,
        AuditLog.organization_id == organization.id,
    ))).scalars().all())
    assert {"SUPPORT_TICKET_UPDATED", "SUPPORT_INTERNAL_NOTE_ADDED", "SUPPORT_REPLY_ADDED"}.issubset(actions)


@pytest.mark.asyncio
async def test_support_attachments_are_idempotent_quarantined_and_tenant_scoped(
    client: AsyncClient,
    db: AsyncSession,
    super_admin: User,
    organizer: User,
    organization: Organization,
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr(
        "app.modules.platform.support_router.create_presigned_upload",
        lambda **kwargs: {"url": "https://upload.example.test/object", "expires_in": 900, "storage_path": kwargs["storage_path"]},
    )
    monkeypatch.setattr(
        "app.modules.platform.support_router.create_presigned_download",
        lambda **kwargs: "https://download.example.test/object",
    )
    monkeypatch.setattr(
        "app.modules.platform.support_router.get_object_metadata",
        lambda **kwargs: {"size": 2048, "content_type": "application/pdf"},
    )
    ticket = SupportTicket(
        organization_id=organization.id,
        creator_id=organizer.id,
        subject="Attachment security ticket",
        description="Validate quarantine and tenant download boundaries",
        status="OPEN",
        priority="HIGH",
    )
    db.add(ticket)
    await db.commit()
    key = f"support-attachment-{uuid.uuid4()}"
    headers = {**support_headers(super_admin), "Idempotency-Key": key}
    url = f"/api/v1/support/tickets/admin/{ticket.id}/attachments/upload-request?organization_id={organization.id}"
    payload = {
        "file_name": "diagnostic.pdf",
        "mime_type": "application/pdf",
        "file_size_bytes": 2048,
        "reason": "Attaching verified diagnostic evidence to support case",
    }
    requested = await client.post(url, headers=headers, json=payload)
    assert requested.status_code == 201, requested.text
    attachment = requested.json()
    assert attachment["processing_status"] == "UPLOADING"
    assert attachment["upload_url"] == "https://upload.example.test/object"

    replay = await client.post(url, headers=headers, json=payload)
    assert replay.status_code == 201
    assert replay.json()["id"] == attachment["id"]
    conflict = await client.post(url, headers=headers, json={**payload, "file_size_bytes": 4096})
    assert conflict.status_code == 409
    assert conflict.json()["detail"]["code"] == "IDEMPOTENCY_CONFLICT"

    download_url = f"/api/v1/support/tickets/admin/{ticket.id}/attachments/{attachment['id']}/download?organization_id={organization.id}"
    blocked = await client.get(download_url, headers=support_headers(super_admin))
    assert blocked.status_code == 409
    assert blocked.json()["detail"]["code"] == "FILE_NOT_READY"

    monkeypatch.setattr(
        "app.modules.platform.support_router.get_object_metadata",
        lambda **kwargs: {"size": 4096, "content_type": "application/pdf"},
    )
    size_mismatch = await client.post(
        f"/api/v1/support/tickets/admin/{ticket.id}/attachments/{attachment['id']}/complete?organization_id={organization.id}",
        headers=support_headers(super_admin),
        json={"reason": "Confirming direct upload completion for malware scanning"},
    )
    assert size_mismatch.status_code == 409
    assert size_mismatch.json()["detail"]["code"] == "UPLOAD_SIZE_MISMATCH"
    monkeypatch.setattr(
        "app.modules.platform.support_router.get_object_metadata",
        lambda **kwargs: {"size": 2048, "content_type": "application/pdf"},
    )
    completed = await client.post(
        f"/api/v1/support/tickets/admin/{ticket.id}/attachments/{attachment['id']}/complete?organization_id={organization.id}",
        headers=support_headers(super_admin),
        json={"reason": "Confirming direct upload completion for malware scanning"},
    )
    assert completed.status_code == 200, completed.text
    assert completed.json()["processing_status"] == "QUARANTINED"

    asset = await db.get(Asset, uuid.UUID(attachment["asset_id"]))
    asset.processing_status = "READY"
    await db.commit()
    downloaded = await client.get(download_url, headers=support_headers(super_admin))
    assert downloaded.status_code == 200, downloaded.text
    assert downloaded.json()["download_url"] == "https://download.example.test/object"

    other_org = Organization(name="Attachment Other Tenant", slug=f"attachment-other-{uuid.uuid4().hex[:8]}", plan="pro")
    db.add(other_org)
    await db.commit()
    concealed = await client.get(
        f"/api/v1/support/tickets/admin/{ticket.id}/attachments?organization_id={other_org.id}",
        headers=support_headers(super_admin),
    )
    assert concealed.status_code == 404
    actions = set((await db.scalars(select(AuditLog.action_type).where(AuditLog.resource_id == ticket.id))).all())
    assert {"SUPPORT_ATTACHMENT_UPLOAD_REQUESTED", "SUPPORT_ATTACHMENT_QUARANTINED", "SUPPORT_ATTACHMENT_DOWNLOADED"}.issubset(actions)
    assert await db.scalar(select(TicketAttachment.id).where(TicketAttachment.id == uuid.UUID(attachment["id"]))) is not None
