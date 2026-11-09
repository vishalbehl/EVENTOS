"""Lineage checks stay bounded and fail closed outside the validated context."""
from types import SimpleNamespace
import uuid

from fastapi import HTTPException
import pytest
from sqlalchemy import event as sa_event

from app.core.tenant_context import TenantContextGuard, TenantContextRequired
from app.modules.registration.models.form_category import FormCategory
from app.modules.registration.models.form_template import FormTemplate
from app.modules.registration.application.template_lineage import require_historical_lineage, lineage_roots


@pytest.mark.asyncio
@pytest.mark.parametrize("value", ["not-a-uuid", "", {}, []])
async def test_malformed_history_returns_only_a_safe_code(db, organization, value):
    row = SimpleNamespace(id=uuid.uuid4(), scope_type="EVENT", organization_id=organization.id,
        settings={"_source_template_id": value})
    async with TenantContextGuard.scoped(db, organization.id):
        with pytest.raises(HTTPException) as exc:
            await require_historical_lineage(db, row)
        assert exc.value.status_code == 409
        assert exc.value.detail == {"code": "EVENT_TEMPLATE_LINEAGE_REPAIR_REQUIRED"}


@pytest.mark.asyncio
async def test_wrong_context_and_oversized_lookup_do_not_create_authority(db, organization):
    row = SimpleNamespace(id=uuid.uuid4(), scope_type="EVENT", organization_id=organization.id, settings={})
    async with TenantContextGuard.scoped(db, uuid.uuid4()):
        with pytest.raises(TenantContextRequired):
            await require_historical_lineage(db, row)
        with pytest.raises(ValueError, match="page limit"):
            await lineage_roots(db, {uuid.uuid4() for _ in range(101)})


@pytest.mark.asyncio
async def test_one_hundred_event_references_use_three_queries_not_per_row(db, event, super_admin):
    from app.modules.registration.application.template_reference_validation import quarantine_invalid_template_references
    from app.modules.registration.application.catalogue_lifecycle_locks import lock_catalogue_reference_writes
    category = FormCategory(name="Batched provenance", slug=f"batch-{uuid.uuid4().hex}")
    db.add(category)
    await db.flush()
    roots = [FormTemplate(scope_type="GLOBAL", name="Root", slug=f"root-{uuid.uuid4().hex}",
        category_id=category.id, category_key=category.slug, fields=[], settings={}) for _ in range(100)]
    db.add_all(roots)
    await db.flush()
    copies = [FormTemplate(organization_id=event.organization_id, scope_type="EVENT", name="Copy",
        slug=f"copy-{uuid.uuid4().hex}", category_id=category.id, category_key=category.slug, fields=[],
        settings={"_event_id": str(event.id), "_source_template_id": str(root.id)}) for root in roots]
    db.add_all(copies)
    await db.flush()
    evidenced = {(row.id, 1): "VALID" for row in copies}
    statements = []

    def capture(connection, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    async with TenantContextGuard.scoped(db, event.organization_id):
        await lock_catalogue_reference_writes(db)
        sa_event.listen(db.bind.sync_engine, "after_cursor_execute", capture)
        try:
            await quarantine_invalid_template_references(db, rows=copies, evidenced=evidenced, actor_id=super_admin.id)
        finally:
            sa_event.remove(db.bind.sync_engine, "after_cursor_execute", capture)
    assert len(statements) == 3
    assert "form_templates.fields" not in statements[-1] and "form_templates.settings" not in statements[-1]
    assert all(row.version == 1 for row in copies) and set(evidenced.values()) == {"VALID"}
