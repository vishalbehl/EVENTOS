"""Explicit invalid-history correction never becomes a foreign access grant."""
import uuid

from fastapi import HTTPException
from pydantic import ValidationError
import pytest
from sqlalchemy import select, event as sa_event

from app.core.tenant_context import TenantContextGuard
from app.modules.platform.models.organization import Organization
from app.modules.platform.models.idempotency import IdempotencyRecord
from app.modules.registration.models.form_template import FormTemplate, FormTemplateReconciliation
from app.modules.registration.application.template_commands import repair_catalogue_document
from app.modules.registration.schemas.catalogue_contracts import CatalogueRepairRequest
from app.modules.audit.models.audit_log import AuditLog, compute_audit_hash


async def fixture(db, event, kind):
    root_id = uuid.uuid4()
    foreign = Organization(name="Foreign detachment owner", slug=f"detach-owner-{uuid.uuid4().hex}")
    db.add(foreign)
    await db.flush()
    if kind in {"foreign", "valid_retired"}:
        db.add(FormTemplate(id=root_id, name="Recorded root", slug=f"root-{root_id.hex}",
            organization_id=foreign.id if kind == "foreign" else None,
            scope_type="ORGANIZATION" if kind == "foreign" else "GLOBAL",
            is_active=kind != "valid_retired", fields=[], settings={}))
    settings = {"_event_id": str(event.id)}
    if kind not in {"none", "global"}:
        settings["_source_template_id"] = {"legacy_secret": "never-copy-this-secret"} if kind == "malformed" else str(root_id)
    row = FormTemplate(name="Reviewed history correction", slug=f"detach-copy-{uuid.uuid4().hex}",
        organization_id=None if kind == "global" else event.organization_id,
        scope_type="GLOBAL" if kind == "global" else "EVENT", fields=[],
        settings={} if kind == "global" else settings)
    db.add(row)
    await db.flush()
    row_id = row.id
    db.add(FormTemplateReconciliation(template_id=row_id, template_version=1,
        operation="DOCUMENT_VALIDATION", status="BLOCKED"))
    await db.commit()
    return row_id, settings, root_id


def request():
    return CatalogueRepairRequest(document={"fields": [], "settings": {}},
        reason="Reviewed removal of invalid historical source linkage", detach_invalid_source_lineage=True)


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["foreign", "missing", "malformed"])
async def test_explicit_detachment_is_atomic_audited_safe_and_retryable(db, event, super_admin, kind):
    row_id, settings, root_id = await fixture(db, event, kind)
    owner, platform_id = event.organization_id, super_admin.organization_id
    args = dict(template_id=row_id, actor=super_admin, payload=request(),
        if_match='"1"', idempotency_key=f"reviewed-detach-{uuid.uuid4()}")
    result = await repair_catalogue_document(db, **args)
    assert result["version"] == 2 and await repair_catalogue_document(db, **args) == result
    assert "never-copy-this-secret" not in str(result) and str(root_id) not in str(result)
    async with TenantContextGuard.scoped(db, owner):
        saved = await db.get(FormTemplate, row_id, populate_existing=True)
        assert saved.version == 2 and saved.settings == {"_event_id": str(event.id)}
        evidence = (await db.scalars(select(FormTemplateReconciliation).where(
            FormTemplateReconciliation.template_id == row_id))).all()
        assert {(e.template_version, e.operation, e.status) for e in evidence} == {
            (1, "DOCUMENT_VALIDATION", "BLOCKED"), (1, "LINEAGE_DETACHMENT", "COMPLETED"),
            (1, "EXPLICIT_REPAIR", "COMPLETED"), (2, "DOCUMENT_VALIDATION", "VALID")}
        detached = next(e for e in evidence if e.operation == "LINEAGE_DETACHMENT")
        if kind == "malformed":
            assert len(detached.details["previous_source_reference_digest"]) == 64
            assert detached.details["previous_source_reference_kind"] == "MALFORMED"
            assert "never-copy-this-secret" not in str(detached.details)
        else:
            assert detached.details["previous_source_reference_id"] == str(root_id)
        audit = (await db.scalars(select(AuditLog).where(AuditLog.resource_id == row_id,
            AuditLog.action_type == "FORM_TEMPLATE_EXPLICIT_REPAIR"))).one()
        assert audit.row_hash == compute_audit_hash(audit)
        assert "lineage_detachment" in audit.new_state and "never-copy-this-secret" not in str(audit.new_state)
    async with TenantContextGuard.scoped(db, platform_id):
        receipt = await db.scalar(select(IdempotencyRecord).where(IdempotencyRecord.idempotency_key == args["idempotency_key"]))
        assert receipt.status == "COMPLETED"
    with pytest.raises(HTTPException) as exc:
        await repair_catalogue_document(db, **{**args, "payload": request().model_copy(update={"detach_invalid_source_lineage": False})})
    assert exc.value.status_code == 409


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["valid_retired", "none", "global"])
async def test_detachment_does_not_remove_valid_history_or_change_scope(db, event, super_admin, kind):
    row_id, settings, _ = await fixture(db, event, kind)
    owner = super_admin.organization_id if kind == "global" else event.organization_id
    with pytest.raises(HTTPException) as exc:
        await repair_catalogue_document(db, template_id=row_id, actor=super_admin, payload=request(),
            if_match='"1"', idempotency_key=f"refused-detach-{uuid.uuid4()}")
    assert exc.value.status_code == 409
    assert exc.value.detail["code"] == ("LINEAGE_DETACH_REQUIRES_EVENT_TEMPLATE" if kind == "global" else "LINEAGE_DETACH_NOT_REQUIRED")
    async with TenantContextGuard.scoped(db, owner):
        row = await db.scalar(select(FormTemplate).where(FormTemplate.id == row_id)
            .execution_options(shared_form_catalogue=True, populate_existing=True))
        assert row.version == 1 and row.settings == ({} if kind == "global" else settings)


@pytest.mark.asyncio
@pytest.mark.parametrize("failure", ["audit", "lineage_evidence"])
async def test_detachment_rolls_back_when_mandatory_history_fails(db, event, super_admin, failure):
    row_id, settings, _ = await fixture(db, event, "foreign")
    owner, platform_id, key = event.organization_id, super_admin.organization_id, f"detach-rollback-{uuid.uuid4()}"

    def refuse(session, flush_context, instances):
        if any((failure == "audit" and isinstance(item, AuditLog) and item.action_type == "FORM_TEMPLATE_EXPLICIT_REPAIR")
               or (failure == "lineage_evidence" and isinstance(item, FormTemplateReconciliation)
                   and item.operation == "LINEAGE_DETACHMENT") for item in session.new):
            raise RuntimeError("Injected mandatory detachment history failure")

    sa_event.listen(db.sync_session, "before_flush", refuse)
    try:
        with pytest.raises(RuntimeError, match="mandatory detachment history failure"):
            await repair_catalogue_document(db, template_id=row_id, actor=super_admin, payload=request(),
                if_match='"1"', idempotency_key=key)
    finally:
        sa_event.remove(db.sync_session, "before_flush", refuse)
    async with TenantContextGuard.scoped(db, owner):
        row = await db.get(FormTemplate, row_id, populate_existing=True)
        assert row.version == 1 and row.settings == settings
    async with TenantContextGuard.scoped(db, platform_id):
        assert await db.scalar(select(IdempotencyRecord.id).where(IdempotencyRecord.idempotency_key == key)) is None


@pytest.mark.parametrize("change", [{"detach_invalid_source_lineage": "true"}, {"reason": " " * 12}])
def test_detachment_requires_strict_confirmation_and_meaningful_reason(change):
    with pytest.raises(ValidationError):
        CatalogueRepairRequest.model_validate({**request().model_dump(), **change})


@pytest.mark.asyncio
async def test_legacy_global_role_does_not_authorise_detachment(db, event, organizer):
    row_id, settings, _ = await fixture(db, event, "foreign")
    owner = event.organization_id
    organizer.role = "super_admin"
    await db.flush()
    with pytest.raises(HTTPException) as exc:
        await repair_catalogue_document(db, template_id=row_id, actor=organizer, payload=request(),
            if_match='"1"', idempotency_key=f"unauthorised-detach-{uuid.uuid4()}")
    assert exc.value.status_code == 403
    async with TenantContextGuard.scoped(db, owner):
        row = await db.get(FormTemplate, row_id, populate_existing=True)
        assert row.version == 1 and row.settings == settings


@pytest.mark.asyncio
@pytest.mark.parametrize("version,status", [(None, 428), ('"2"', 412)])
async def test_explicit_detachment_cannot_skip_version_preconditions(db, event, super_admin, version, status):
    row_id, settings, _ = await fixture(db, event, "foreign")
    owner = event.organization_id
    with pytest.raises(HTTPException) as exc:
        await repair_catalogue_document(db, template_id=row_id, actor=super_admin, payload=request(),
            if_match=version, idempotency_key=f"stale-detach-{uuid.uuid4()}")
    assert exc.value.status_code == status
    async with TenantContextGuard.scoped(db, owner):
        row = await db.get(FormTemplate, row_id, populate_existing=True)
        assert row.version == 1 and row.settings == settings
