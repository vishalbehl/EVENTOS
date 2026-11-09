"""New current-version quarantine feeds the existing reviewed repair command."""
import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.core.tenant_context import TenantContextGuard
from app.modules.audit.models.audit_log import AuditLog, compute_audit_hash
from app.modules.identity.models.user import User
from app.modules.platform.models.idempotency import IdempotencyRecord
from app.modules.registration.models.form_category import FormCategory
from app.modules.registration.application.aggregate_reconciliation import repair_aggregate_document
from app.modules.registration.schemas.catalogue_contracts import AggregateRepairRequest
from tests.test_category_historical_document_validation import marker, category_page, evidence_type


@pytest.mark.asyncio
@pytest.mark.parametrize("global_category", [False, True])
async def test_reviewed_repair_rejects_old_version_then_preserves_all_quarantine_history(
        db, organization, super_admin, monkeypatch, global_category):
    owner, actor_id, platform = organization.id, super_admin.id, super_admin.organization_id
    category = FormCategory(organization_id=None if global_category else owner,
        name="Reviewed retained category", slug=f"reviewed-{uuid.uuid4().hex}", sort_order=-1)
    db.add(category)
    await db.flush()
    db.add(marker(category, global_category=global_category, status="VALID", actor=actor_id))
    await db.commit()
    identity, slug = category.id, category.slug
    assert (await category_page(db, category, super_admin, global_category, monkeypatch))["blocked"] == 1
    model = evidence_type(global_category)
    selector = model.category_id if global_category else model.resource_id
    validation = "TAXONOMY_VALIDATION" if global_category else "DOCUMENT_VALIDATION"
    async with TenantContextGuard.scoped(db, platform if global_category else owner):
        old_records = {row.id for row in (await db.scalars(select(model).where(selector == identity))).all()}
        assert len(old_records) == 3
    payload = AggregateRepairRequest(document={"name": "Reviewed retained category", "slug": slug,
        "description": None, "icon": "ClipboardList", "sort_order": 0},
        reason="Reviewed correction of the invalid retained category sort order")
    stale_key, key = f"category-stale-{uuid.uuid4()}", f"category-review-{uuid.uuid4()}"
    with pytest.raises(HTTPException) as stale:
        await repair_aggregate_document(db, resource_type="FORM_CATEGORY", resource_id=identity,
            payload=payload, actor=super_admin, if_match='"1"', idempotency_key=stale_key)
    assert stale.value.status_code == 412
    async with TenantContextGuard.scoped(db, platform):
        assert await db.scalar(select(IdempotencyRecord.id).where(IdempotencyRecord.idempotency_key == stale_key)) is None
        actor = await db.get(User, actor_id, populate_existing=True)
        result = await repair_aggregate_document(db, resource_type="FORM_CATEGORY", resource_id=identity,
            payload=payload, actor=actor, if_match='"2"', idempotency_key=key)
        assert result["previous_version"] == 2 and result["version"] == 3 and result["status"] == "REPAIRED"
        assert await repair_aggregate_document(db, resource_type="FORM_CATEGORY", resource_id=identity,
            payload=payload, actor=actor, if_match='"2"', idempotency_key=key) == result
        receipt = await db.scalar(select(IdempotencyRecord).where(IdempotencyRecord.idempotency_key == key))
        assert receipt.status == "COMPLETED"
        receipt_id = receipt.id
    async with TenantContextGuard.scoped(db, platform if global_category else owner):
        current = await db.scalar(select(FormCategory).where(FormCategory.id == identity)
            .execution_options(shared_form_catalogue=True, populate_existing=True))
        assert current.version == 3 and current.sort_order == 0 and current.slug == slug
        records = list((await db.scalars(select(model).where(selector == identity))).all())
        assert old_records <= {row.id for row in records}
        version = lambda row: row.category_version if global_category else row.resource_version
        assert {(version(row), row.operation, row.status) for row in records} == {
            (1, validation, "VALID"), (1, "DOCUMENT_REVALIDATION", "BLOCKED"),
            (2, validation, "BLOCKED"), (2, "EXPLICIT_REPAIR", "COMPLETED"),
            (3, validation, "VALID")}
        audits = list((await db.scalars(select(AuditLog).where(AuditLog.correlation_id == receipt_id))).all())
        assert len(audits) == 1 and audits[0].action_type == "CATALOGUE_AGGREGATE_EXPLICIT_REPAIR"
        assert audits[0].row_hash == compute_audit_hash(audits[0])
    # A later worker run validates the repair, never alters its old blocked records.
    assert (await category_page(db, current, actor, global_category, monkeypatch))["blocked"] == 0
