"""Old document approval cannot conceal an unsafe live catalogue reference."""
from contextlib import asynccontextmanager
import uuid

import pytest
from sqlalchemy import select

from app.core.tenant_context import TenantContextGuard
from app.modules.platform.models.organization import Organization
from app.modules.registration.models.form_category import FormCategory
from app.modules.registration.models.form_template import FormTemplate, FormTemplateReconciliation


@pytest.mark.asyncio
@pytest.mark.parametrize("entry", ["owned_worker", "global_worker", "manual"])
@pytest.mark.parametrize("defect", ["foreign", "retired", "key_mismatch"])
async def test_old_valid_evidence_is_superseded_not_rewritten(db, organization, super_admin,
        monkeypatch, entry, defect):
    from app.tasks import catalogue_reconciliation as worker
    from app.modules.registration.application.template_commands import reconcile_catalogue_documents
    global_template = entry != "owned_worker"
    foreign = Organization(name="Foreign reference proof", slug=f"foreign-{uuid.uuid4().hex}")
    db.add(foreign)
    await db.flush()
    category = FormCategory(organization_id=foreign.id if defect == "foreign" else None,
        name="Reference proof", slug=f"ref-{uuid.uuid4().hex}", is_active=defect != "retired")
    db.add(category)
    await db.flush()
    row = FormTemplate(organization_id=None if global_template else organization.id,
        scope_type="GLOBAL" if global_template else "ORGANIZATION", name="Old valid proof",
        slug=f"reference-{uuid.uuid4().hex}", category_id=category.id,
        category_key="wrong" if defect == "key_mismatch" else category.slug, fields=[], settings={})
    db.add(row)
    await db.flush()
    template_id = row.id
    old = FormTemplateReconciliation(template_id=template_id, template_version=1,
        operation="DOCUMENT_VALIDATION", status="VALID", details={"historical": True})
    db.add(old)
    await db.commit()

    @asynccontextmanager
    async def sessions():
        yield db

    monkeypatch.setattr(worker, "AsyncSessionLocal", sessions)
    manual_keys = []

    async def run():
        if entry == "owned_worker":
            return await worker._process_page(organization.id, super_admin.id, "FORM_TEMPLATE", None)
        if entry == "global_worker":
            return await worker._global_template_page(super_admin.id, None)
        key = f"reference-review-{uuid.uuid4()}"
        manual_keys.append(key)
        return await reconcile_catalogue_documents(db, actor=super_admin, cursor=None, page_size=100,
            idempotency_key=key)

    async with TenantContextGuard.scoped(db, super_admin.organization_id):
        first, second = await run(), await run()
        assert first["blocked"] == second["blocked"] == 1
        if entry == "manual":
            from app.modules.audit.models.audit_log import AuditLog, compute_audit_hash
            from app.modules.platform.models.idempotency import IdempotencyRecord
            receipts = (await db.scalars(select(IdempotencyRecord).where(
                IdempotencyRecord.idempotency_key.in_(manual_keys)))).all()
            assert len(receipts) == 2 and all(r.status == "COMPLETED" for r in receipts)
            audits = (await db.scalars(select(AuditLog).where(
                AuditLog.resource_id.in_([r.id for r in receipts]),
                AuditLog.action_type == "FORM_TEMPLATE_RECONCILE_PAGE"))).all()
            assert len(audits) == 2
            assert all(a.resource_id == a.correlation_id and a.row_hash == compute_audit_hash(a) for a in audits)
    async with TenantContextGuard.scoped(db, organization.id if not global_template else super_admin.organization_id):
        refreshed = await db.scalar(select(FormTemplate).where(FormTemplate.id == template_id)
            .execution_options(shared_form_catalogue=True, populate_existing=True))
        assert refreshed.version == 2 and refreshed.category_id == category.id
        evidence = (await db.scalars(select(FormTemplateReconciliation).where(
            FormTemplateReconciliation.template_id == template_id))).all()
        assert {(r.template_version, r.operation, r.status) for r in evidence} == {
            (1, "DOCUMENT_VALIDATION", "VALID"), (1, "REFERENCE_VALIDATION", "BLOCKED"),
            (2, "DOCUMENT_VALIDATION", "BLOCKED")}
        assert next(r for r in evidence if r.operation == "DOCUMENT_VALIDATION" and r.template_version == 1).details == {"historical": True}
        assert all("foreign" not in str(r.details).lower() for r in evidence)
    if defect == "key_mismatch":
        from fastapi import HTTPException
        from app.modules.registration.application.template_commands import repair_catalogue_document
        from app.modules.registration.schemas.catalogue_contracts import CatalogueRepairRequest
        # Document-only repair must not re-approve a still-mismatched reference.
        with pytest.raises(HTTPException) as exc:
            await repair_catalogue_document(db, template_id=template_id, actor=super_admin,
                payload=CatalogueRepairRequest(document={"fields": [], "settings": {}},
                    reason="Document repair cannot approve invalid taxonomy"),
                if_match='"2"', idempotency_key=f"repair-denial-{uuid.uuid4()}")
        assert exc.value.status_code == 409
        assert exc.value.detail["code"] == "TEMPLATE_CATEGORY_RECONCILIATION_REQUIRED"


@pytest.mark.asyncio
async def test_old_valid_event_reference_is_rechecked(db, organization, super_admin, monkeypatch):
    from app.tasks import catalogue_reconciliation as worker
    row = FormTemplate(organization_id=organization.id, scope_type="EVENT", name="Lost event proof",
        slug=f"lost-event-{uuid.uuid4().hex}", fields=[], settings={"_event_id": str(uuid.uuid4())})
    db.add(row)
    await db.flush()
    row_id = row.id
    db.add(FormTemplateReconciliation(template_id=row_id, template_version=1,
        operation="DOCUMENT_VALIDATION", status="VALID"))
    await db.commit()

    @asynccontextmanager
    async def sessions():
        yield db

    monkeypatch.setattr(worker, "AsyncSessionLocal", sessions)
    assert (await worker._process_page(organization.id, super_admin.id, "FORM_TEMPLATE", None))["blocked"] == 1
    async with TenantContextGuard.scoped(db, organization.id):
        evidence = await db.scalar(select(FormTemplateReconciliation).where(
            FormTemplateReconciliation.template_id == row_id,
            FormTemplateReconciliation.template_version == 2))
        assert evidence.details["issues"] == ["EVENT_REFERENCE_UNAVAILABLE"]


@pytest.mark.asyncio
async def test_valid_reference_batch_is_constant_query_and_preserves_approval(db, organization, super_admin):
    from sqlalchemy import event as sa_event
    from app.modules.registration.application.template_reference_validation import quarantine_invalid_template_references
    from app.modules.registration.application.catalogue_lifecycle_locks import lock_catalogue_reference_writes
    category = FormCategory(organization_id=organization.id, name="Valid owned category",
        slug=f"valid-{uuid.uuid4().hex}")
    db.add(category)
    await db.flush()
    rows = [FormTemplate(organization_id=organization.id, scope_type="ORGANIZATION",
        name="Valid source", slug=f"valid-{uuid.uuid4().hex}", category_id=category.id,
        category_key=category.slug, fields=[], settings={}) for _ in range(100)]
    db.add_all(rows)
    await db.flush()
    db.add_all([FormTemplateReconciliation(template_id=row.id, template_version=1,
        operation="DOCUMENT_VALIDATION", status="VALID") for row in rows])
    await db.flush()
    evidenced = {(row.id, 1): "VALID" for row in rows}
    statements = []

    def capture(connection, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    async with TenantContextGuard.scoped(db, organization.id):
        await lock_catalogue_reference_writes(db)
        sa_event.listen(db.bind.sync_engine, "after_cursor_execute", capture)
        try:
            await quarantine_invalid_template_references(db, rows=rows, evidenced=evidenced,
                actor_id=super_admin.id)
        finally:
            sa_event.remove(db.bind.sync_engine, "after_cursor_execute", capture)
    assert len(statements) == 1
    assert all(row.version == 1 for row in rows)
    assert set(evidenced.values()) == {"VALID"} and len(evidenced) == 100
