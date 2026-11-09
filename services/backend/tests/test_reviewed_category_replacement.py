"""Reviewed document/category replacement is one scoped audited transaction."""
import uuid

from fastapi import HTTPException
import pytest
from sqlalchemy import select, event as sa_event

from app.core.tenant_context import TenantContextGuard
from app.modules.audit.models.audit_log import AuditLog, compute_audit_hash
from app.modules.platform.models.organization import Organization
from app.modules.platform.models.idempotency import IdempotencyRecord
from app.modules.registration.models.form_category import FormCategory
from app.modules.registration.models.form_template import FormTemplate, FormTemplateReconciliation
from app.modules.registration.application.template_commands import repair_catalogue_document
from app.modules.registration.schemas.catalogue_contracts import CatalogueRepairRequest


@pytest.mark.asyncio
async def test_old_document_only_receipts_keep_their_fingerprint(db, super_admin):
    from app.core.idempotency_service import begin_idempotent, complete_idempotent
    row_id, key = uuid.uuid4(), f"legacy-repair-{uuid.uuid4()}"
    payload = CatalogueRepairRequest(document={"fields": [], "settings": {}},
        reason="Reviewed compatible document-only correction")
    old_response = {"template_id": str(row_id), "previous_version": 1, "version": 2, "status": "REPAIRED"}
    async with TenantContextGuard.scoped(db, super_admin.organization_id):
        receipt = await begin_idempotent(db, organization_id=super_admin.organization_id,
            actor_id=super_admin.id, operation="registration.platform.form_template.repair", key=key,
            payload={"template_id": str(row_id), "version": 1,
                "document": payload.document.model_dump(mode="json", exclude_none=True), "reason": payload.reason})
        await complete_idempotent(db, receipt, response_status=200, response_body=old_response, resource_id=row_id)
        await db.commit()
    assert await repair_catalogue_document(db, template_id=row_id, actor=super_admin, payload=payload,
        if_match='"1"', idempotency_key=key) == old_response


@pytest.mark.asyncio
@pytest.mark.parametrize("scope", ["GLOBAL", "ORGANIZATION", "EVENT"])
@pytest.mark.parametrize("target", ["global", "own", "foreign", "retired", "missing", "long_key"])
async def test_reviewed_replacement_never_crosses_scope(db, event, super_admin, scope, target):
    foreign = Organization(name="Foreign repair owner", slug=f"repair-owner-{uuid.uuid4().hex}")
    db.add(foreign)
    await db.flush()
    owner = None if scope == "GLOBAL" else event.organization_id
    category = FormCategory(name="Reviewed category", slug="x" * 100 if target == "long_key" else f"reviewed-{uuid.uuid4().hex}",
        organization_id=(foreign.id if target == "foreign" else event.organization_id if target == "own" else None),
        is_active=target != "retired")
    db.add(category)
    await db.flush()
    selected_id = uuid.uuid4() if target == "missing" else category.id
    settings = {"custom_js": "historical unsafe document"}
    if scope == "EVENT":
        settings["_event_id"] = str(event.id)
    row = FormTemplate(name="Blocked reference repair", slug=f"repair-{uuid.uuid4().hex}",
        organization_id=owner, scope_type=scope, category_key="legacy-key", fields=[], settings=settings)
    db.add(row)
    await db.flush()
    row_id, actor_id, platform_id = row.id, super_admin.id, super_admin.organization_id
    db.add(FormTemplateReconciliation(template_id=row_id, template_version=1,
        operation="DOCUMENT_VALIDATION", status="BLOCKED"))
    await db.commit()
    key = f"reviewed-category-{uuid.uuid4()}"
    payload = CatalogueRepairRequest(document={"fields": [], "settings": {}},
        reason="Approved explicit document and category correction", replacement_category_id=selected_id)
    args = dict(template_id=row_id, payload=payload, actor=super_admin, if_match='"1"', idempotency_key=key)
    allowed = target in {"global", "long_key"} or target == "own" and scope != "GLOBAL"
    if not allowed:
        with pytest.raises(HTTPException) as exc:
            await repair_catalogue_document(db, **args)
        assert exc.value.status_code == 409
        assert exc.value.detail == {"code": "TEMPLATE_CATEGORY_RECONCILIATION_REQUIRED"}
        async with TenantContextGuard.scoped(db, owner or platform_id):
            saved = await db.scalar(select(FormTemplate).where(FormTemplate.id == row_id)
                .execution_options(shared_form_catalogue=True, populate_existing=True))
            assert saved.version == 1 and saved.category_id is None and "custom_js" in saved.settings
        async with TenantContextGuard.scoped(db, platform_id):
            assert await db.scalar(select(IdempotencyRecord.id).where(IdempotencyRecord.idempotency_key == key)) is None
        return
    result = await repair_catalogue_document(db, **args)
    assert result["version"] == 2 and await repair_catalogue_document(db, **args) == result
    async with TenantContextGuard.scoped(db, owner or platform_id):
        saved = await db.scalar(select(FormTemplate).where(FormTemplate.id == row_id)
            .execution_options(shared_form_catalogue=True, populate_existing=True))
        assert saved.version == 2 and saved.category_id == selected_id and saved.category_key == category.slug
        assert "custom_js" not in saved.settings
        if scope == "EVENT":
            assert saved.settings["_event_id"] == str(event.id)
        audits = (await db.scalars(select(AuditLog).where(AuditLog.resource_id == row_id,
            AuditLog.action_type == "FORM_TEMPLATE_EXPLICIT_REPAIR"))).all()
        assert len(audits) == 1 and audits[0].actor_user_id == actor_id
        assert audits[0].new_state["category_id"] == str(selected_id)
        assert audits[0].old_state["category_id"] is None
        assert audits[0].row_hash == compute_audit_hash(audits[0])
    # The replacement selector is part of the retry fingerprint.
    changed = payload.model_copy(update={"replacement_category_id": uuid.uuid4()})
    with pytest.raises(HTTPException) as exc:
        await repair_catalogue_document(db, **{**args, "payload": changed})
    assert exc.value.status_code == 409


@pytest.mark.asyncio
@pytest.mark.parametrize("long_key", [False, True])
async def test_mandatory_audit_failure_rolls_back_document_category_and_receipt(db, super_admin, long_key):
    category = FormCategory(name="Atomic review target", slug="x" * 100 if long_key else f"atomic-{uuid.uuid4().hex}")
    row = FormTemplate(name="Atomic review proof", slug=f"atomic-{uuid.uuid4().hex}",
        scope_type="GLOBAL", fields=[], settings={"custom_js": "historical"})
    db.add_all([category, row])
    await db.flush()
    row_id, category_id, platform_id = row.id, category.id, super_admin.organization_id
    db.add(FormTemplateReconciliation(template_id=row_id, template_version=1,
        operation="DOCUMENT_VALIDATION", status="BLOCKED"))
    await db.commit()
    key = f"audit-failure-{uuid.uuid4()}"

    def fail_audit(session, flush_context, instances):
        if any(isinstance(item, AuditLog) and item.action_type == "FORM_TEMPLATE_EXPLICIT_REPAIR"
               for item in session.new):
            raise RuntimeError("Injected mandatory review audit failure")

    sa_event.listen(db.sync_session, "before_flush", fail_audit)
    try:
        with pytest.raises(RuntimeError, match="mandatory review audit failure"):
            await repair_catalogue_document(db, template_id=row_id, actor=super_admin,
                payload=CatalogueRepairRequest(document={"fields": [], "settings": {}},
                    replacement_category_id=category_id, reason="Atomic reviewed reference replacement"),
                if_match='"1"', idempotency_key=key)
    finally:
        sa_event.remove(db.sync_session, "before_flush", fail_audit)
    async with TenantContextGuard.scoped(db, platform_id):
        saved = await db.scalar(select(FormTemplate).where(FormTemplate.id == row_id)
            .execution_options(shared_form_catalogue=True, populate_existing=True))
        assert saved.version == 1 and saved.category_id is None and saved.settings == {"custom_js": "historical"}
        assert await db.scalar(select(IdempotencyRecord.id).where(IdempotencyRecord.idempotency_key == key)) is None
