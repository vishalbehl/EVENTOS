"""Current live template schema is mandatory even with immutable old approvals."""
from contextlib import asynccontextmanager
import uuid

import pytest
from sqlalchemy import select

from app.core.tenant_context import TenantContextGuard
from app.modules.registration.models.form_template import FormTemplate, FormTemplateReconciliation


@pytest.mark.asyncio
@pytest.mark.parametrize("entry", ["owned_worker", "event_worker", "global_worker", "manual"])
@pytest.mark.parametrize("defect", ["settings", "field"])
async def test_live_schema_rechecked_without_overwriting_old_approval(db, organization, event, super_admin,
        monkeypatch, entry, defect):
    from app.tasks import catalogue_reconciliation as worker
    from app.modules.registration.application.template_commands import reconcile_catalogue_documents
    owner, actor_id = (event.organization_id if entry == "event_worker" else organization.id), super_admin.id
    scope = "GLOBAL" if entry in {"global_worker", "manual"} else "EVENT" if entry == "event_worker" else "ORGANIZATION"
    fields, settings = [], {"_event_id": str(event.id)} if scope == "EVENT" else {}
    if defect == "settings":
        settings["custom_js"] = "old approval cannot permit executable configuration"
    else:
        fields = [{"id": "x", "name": "x", "label": "X", "type": "text", "default_value": {"unsupported": "object"}}]
    row = FormTemplate(organization_id=None if scope == "GLOBAL" else owner, scope_type=scope,
        name="Old schema approval", slug=f"old-schema-{uuid.uuid4().hex}", fields=fields, settings=settings)
    db.add(row)
    await db.flush()
    row_id = row.id
    db.add(FormTemplateReconciliation(template_id=row_id, template_version=1,
        operation="DOCUMENT_VALIDATION", status="VALID", details={"old_approval": True}))
    await db.commit()

    @asynccontextmanager
    async def sessions():
        yield db

    monkeypatch.setattr(worker, "AsyncSessionLocal", sessions)

    async def run():
        if entry == "global_worker":
            return await worker._global_template_page(actor_id, None)
        if entry == "manual":
            return await reconcile_catalogue_documents(db, actor=super_admin,
                idempotency_key=f"schema-revalidation-{uuid.uuid4()}")
        return await worker._process_page(owner, actor_id, "FORM_TEMPLATE", None)

    first, second = await run(), await run()
    assert first["blocked"] == second["blocked"] == 1
    async with TenantContextGuard.scoped(db, owner if scope != "GLOBAL" else super_admin.organization_id):
        saved = await db.scalar(select(FormTemplate).where(FormTemplate.id == row_id)
            .execution_options(shared_form_catalogue=True, populate_existing=True))
        assert saved.version == 2 and saved.fields == fields and saved.settings == settings
        evidence = list((await db.scalars(select(FormTemplateReconciliation).where(
            FormTemplateReconciliation.template_id == row_id))).all())
        assert len(evidence) == 3
        original = next(item for item in evidence if item.template_version == 1 and item.operation == "DOCUMENT_VALIDATION")
        assert original.status == "VALID" and original.details == {"old_approval": True}
        current = next(item for item in evidence if item.template_version == 2)
        assert current.status == "BLOCKED"
        assert current.details["issues"] == ["DOCUMENT_SCHEMA_REVALIDATION_REQUIRED"]
