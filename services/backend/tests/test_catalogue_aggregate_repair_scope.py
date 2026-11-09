"""Historical customer documents are reviewed from platform, not customer identity."""
from contextlib import asynccontextmanager
import uuid

import pytest
from fastapi import HTTPException, Response
from sqlalchemy import select

from app.core.tenant_context import TenantContextGuard
from app.database import tenant_org_id
from app.modules.abstracts.models import AbstractForm
from app.modules.audit.models.audit_log import AuditLog
from app.modules.identity.models.user import User
from app.modules.platform.models.idempotency import IdempotencyRecord
from app.modules.registration.models.registration_form_config import RegistrationFormConfig
from app.modules.registration.models.form_category import FormCategory
from app.modules.registration.models.catalogue_reconciliation import CatalogueDocumentReconciliation
from app.modules.registration.schemas.catalogue_contracts import AggregateRepairRequest
from app.modules.registration.application.aggregate_reconciliation import repair_aggregate_document


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["REGISTRATION_FORM", "ABSTRACT_FORM", "FORM_CATEGORY"])
async def test_customer_document_block_review_repair_and_replay_from_platform(db, event, super_admin, organizer, monkeypatch, kind):
    from app.tasks import catalogue_reconciliation as worker
    if kind == "REGISTRATION_FORM":
        row = RegistrationFormConfig(event_id=event.id, fields=[], settings={"custom_js": "not permitted"})
    elif kind == "ABSTRACT_FORM":
        row = AbstractForm(organization_id=event.organization_id, event_id=event.id,
            title="Historical rubric fixture", schema={"fields": [], "settings": {},
                "rubric": [{"key": "quality", "label": "Quality", "weight": 99}]})
    else:
        row = FormCategory(organization_id=event.organization_id,
            name="Historical customer category", slug="")
    db.add(row)
    await db.commit()
    resource_id, owner_id = row.id, event.organization_id
    platform_id, actor_id = super_admin.organization_id, super_admin.id

    @asynccontextmanager
    async def sessions():
        yield db

    monkeypatch.setattr(worker, "AsyncSessionLocal", sessions)
    async with TenantContextGuard.scoped(db, platform_id):
        result = await worker._process_page(owner_id, actor_id, kind, None)
        assert result["checked"] == result["blocked"] == 1
        assert tenant_org_id.get() == platform_id
        from app.modules.registration.routers.form_templates import list_blocked_aggregate_documents
        listed = await list_blocked_aggregate_documents(response=Response(), resource_type=kind,
            cursor=None, page_size=50, db=db, current_user=super_admin)
        assert [issue.resource_id for issue in listed.items] == [resource_id]
        document = {"fields": [], "settings": {}}
        if kind == "ABSTRACT_FORM":
            document["rubric"] = [{"key": "quality", "label": "Quality", "weight": 100}]
        elif kind == "FORM_CATEGORY":
            document = {"name": "Reviewed customer category", "slug": f"reviewed-{uuid.uuid4().hex}",
                "description": None, "icon": "ClipboardList", "sort_order": 0}
        arguments = dict(resource_type=kind, resource_id=resource_id,
            payload=AggregateRepairRequest(document=document,
                reason="Reviewed correction of historical customer document"),
            actor=super_admin, if_match='"1"', idempotency_key=f"reviewed-aggregate-{uuid.uuid4()}")
        with pytest.raises(HTTPException) as customer:
            await repair_aggregate_document(db, **{**arguments, "actor": organizer})
        assert customer.value.status_code == 403
        repaired = await repair_aggregate_document(db, **arguments)
        assert repaired["version"] == 2 and repaired["status"] == "REPAIRED"
        after_repair = await list_blocked_aggregate_documents(response=Response(), resource_type=kind,
            cursor=None, page_size=50, db=db, current_user=super_admin)
        assert after_repair.items == []
        assert await repair_aggregate_document(db, **arguments) == repaired
        assert tenant_org_id.get() == platform_id
        with pytest.raises(HTTPException) as stale:
            await repair_aggregate_document(db, **{**arguments,
                "idempotency_key": f"stale-aggregate-{uuid.uuid4()}"})
        assert stale.value.status_code == 412
        assert tenant_org_id.get() == platform_id
        # A failed request rolls the session back and expires mapped identities.
        # Simulate the next request's authenticated identity reload explicitly.
        arguments["actor"] = await db.get(User, actor_id)
        with pytest.raises(HTTPException) as changed:
            await repair_aggregate_document(db, **{**arguments,
                "payload": AggregateRepairRequest(document=document,
                    reason="Different reviewed reason cannot reuse a committed retry key")})
        assert changed.value.status_code == 409
        assert tenant_org_id.get() == platform_id
        receipts = list((await db.scalars(select(IdempotencyRecord).where(
            IdempotencyRecord.idempotency_key == arguments["idempotency_key"]))).all())
        assert len(receipts) == 1 and receipts[0].status == "COMPLETED"
    async with TenantContextGuard.scoped(db, owner_id):
        evidence = list((await db.scalars(select(CatalogueDocumentReconciliation).where(
            CatalogueDocumentReconciliation.resource_type == kind,
            CatalogueDocumentReconciliation.resource_id == resource_id))).all())
        assert {(item.resource_version, item.operation, item.status) for item in evidence} == {
            (1, "DOCUMENT_VALIDATION", "BLOCKED"), (1, "EXPLICIT_REPAIR", "COMPLETED"),
            (2, "DOCUMENT_VALIDATION", "VALID")}
        await db.refresh(row)
        assert row.version == 2
        audits = list((await db.scalars(select(AuditLog).where(
            AuditLog.resource_id == resource_id,
            AuditLog.action_type == "CATALOGUE_AGGREGATE_EXPLICIT_REPAIR"))).all())
        assert len(audits) == 1 and audits[0].actor_user_id == actor_id
