"""Source blueprint review includes customer scopes without exposing documents."""
from datetime import datetime, timezone
import uuid

from fastapi import HTTPException
import pytest
from sqlalchemy import select, text

from app.core.tenant_context import TenantContextGuard
from app.database import tenant_org_id
from app.modules.audit.models.audit_log import AuditLog
from app.modules.registration.application.catalogue_review_queries import list_blocked_templates
from app.modules.registration.application.template_commands import repair_catalogue_document
from app.modules.registration.models.form_template import FormTemplate, FormTemplateReconciliation
from app.modules.registration.schemas.catalogue_contracts import CatalogueRepairRequest


@pytest.mark.asyncio
async def test_source_template_review_cursor_and_safe_projection(db, super_admin, organization, organizer):
    at = datetime.now(timezone.utc)
    templates = [FormTemplate(organization_id=organization.id, scope_type="ORGANIZATION",
        name=f"Historical source {index}", slug=f"review-{uuid.uuid4().hex}",
        fields=[], settings={"custom_js": "private-unsupported-document"}) for index in range(205)]
    db.add_all(templates)
    await db.flush()
    ids = {row.id for row in templates}
    db.add_all([FormTemplateReconciliation(template_id=row.id, template_version=1,
        operation="DOCUMENT_VALIDATION", status="BLOCKED", reason="private historical reason",
        details={"private": "must not be projected"}, created_at=at) for row in templates])
    await db.flush()
    original = tenant_org_id.get()
    cursor, found = None, []
    for _ in range(3):
        page = await list_blocked_templates(db, actor=super_admin, cursor=cursor, page_size=100)
        assert len(page.items) <= 100
        found.extend(page.items)
        cursor = page.next_cursor
    assert len(found) == 205 and {item.template_id for item in found} == ids and cursor is None
    assert all(item.reason == "Stored blueprint requires a reviewed correction." for item in found)
    assert not any("private" in item.model_dump_json() for item in found)
    assert tenant_org_id.get() == original
    with pytest.raises(HTTPException) as exc:
        await list_blocked_templates(db, actor=organizer)
    assert exc.value.status_code == 403
    async with TenantContextGuard.scoped(db, organization.id):
        denied = await db.execute(text("SELECT * FROM design.catalogue_template_review_v1(:actor,NULL,NULL,NULL,100)"),
            {"actor": super_admin.id})
        assert denied.all() == []
    super_admin.platform_role = "SUPPORT_ADMIN"
    await db.flush()
    async with TenantContextGuard.scoped(db, super_admin.organization_id):
        denied = await db.execute(text("SELECT * FROM design.catalogue_template_review_v1(:actor,NULL,NULL,NULL,100)"),
            {"actor": super_admin.id})
        assert denied.all() == []


@pytest.mark.asyncio
@pytest.mark.parametrize("scope", ["GLOBAL", "ORGANIZATION", "EVENT"])
async def test_reviewed_source_repair_is_scoped_versioned_audited_and_repeatable(db, super_admin, event, scope):
    owner = None if scope == "GLOBAL" else event.organization_id
    document = {"custom_js": "invalid historical setting"}
    if scope == "EVENT":
        document["_event_id"] = str(event.id)
    row = FormTemplate(organization_id=owner, scope_type=scope, name="Blocked source fixture",
        slug=f"blocked-{uuid.uuid4().hex}", fields=[], settings=document)
    db.add(row)
    await db.flush()
    resource_id = row.id
    db.add(FormTemplateReconciliation(template_id=resource_id, template_version=1,
        operation="DOCUMENT_VALIDATION", status="BLOCKED"))
    await db.flush()
    original = tenant_org_id.get()
    assert resource_id in {item.template_id for item in (await list_blocked_templates(db, actor=super_admin)).items}
    payload = CatalogueRepairRequest(document={"fields": [], "settings": {}},
        reason="Approved historical source correction fixture")
    arguments = dict(template_id=resource_id, payload=payload, actor=super_admin,
        if_match='"1"', idempotency_key=f"source-repair-{uuid.uuid4()}")
    result = await repair_catalogue_document(db, **arguments)
    assert result["version"] == 2
    assert await repair_catalogue_document(db, **arguments) == result
    assert tenant_org_id.get() == original
    assert resource_id not in {item.template_id for item in (await list_blocked_templates(db, actor=super_admin)).items}
    async with TenantContextGuard.scoped(db, owner or super_admin.organization_id):
        updated = await db.get(FormTemplate, resource_id)
        assert updated.version == 2 and "custom_js" not in updated.settings
        if scope == "EVENT":
            assert updated.settings["_event_id"] == str(event.id)
        audit = list((await db.scalars(select(AuditLog).where(AuditLog.resource_id == resource_id,
            AuditLog.action_type == "FORM_TEMPLATE_EXPLICIT_REPAIR"))).all())
        assert len(audit) == 1 and audit[0].organization_id == (owner or super_admin.organization_id)
        history = (await db.scalars(select(FormTemplateReconciliation).where(
            FormTemplateReconciliation.template_id == resource_id))).all()
        assert {(entry.template_version, entry.operation, entry.status) for entry in history} == {
            (1, "DOCUMENT_VALIDATION", "BLOCKED"), (1, "EXPLICIT_REPAIR", "COMPLETED"),
            (2, "DOCUMENT_VALIDATION", "VALID")}


@pytest.mark.parametrize("changes", [
    {"public_can_execute": True}, {"runtime_can_assume_definer": True},
    {"security_definer": False}, {"stable": False}, {"returns_set": False},
    {"argument_names": ["fields", "settings"]},
    {"fixed_settings": ["search_path=public", "row_security=off"]},
])
def test_source_review_preflight_rejects_unsafe_projection(changes):
    from ops.category_a_preflight import template_review_is_safe
    metadata = {"security_definer": True, "record_result": True, "stable": True, "returns_set": True,
        "definer_can_bypass_rls": True, "runtime_can_execute": True, "runtime_can_assume_definer": False,
        "public_can_execute": False, "runtime_can_create_schema_objects": False,
        "fixed_settings": ["search_path=pg_catalog", "row_security=off"],
        "argument_names": ["actor_id", "requested_template", "after_at", "after_id", "requested_limit",
            "reconciliation_id", "template_id", "organization_id", "template_name", "template_version", "reason", "created_at"]}
    assert template_review_is_safe(metadata)
    assert not template_review_is_safe({**metadata, **changes})
