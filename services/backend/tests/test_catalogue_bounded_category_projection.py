"""Category validation never expands to an unbounded template portfolio."""
from contextlib import asynccontextmanager
from types import SimpleNamespace
import uuid

import pytest
from sqlalchemy import func, select

from app.core.tenant_context import TenantContextGuard
from app.modules.registration.models.form_category import FormCategory, FormCategoryReconciliation
from app.modules.registration.models.form_template import FormTemplate, FormTemplateReconciliation
from app.tasks import catalogue_reconciliation as worker


@pytest.mark.asyncio
@pytest.mark.parametrize("invalid", ["OVERSIZED", "DUPLICATE", "FOREIGN_OWNER"])
async def test_projection_rejects_invalid_page_before_database_work(invalid):
    from app.modules.registration.application.category_key_projection import normalize_template_page_category_keys

    row = SimpleNamespace(id=uuid.uuid4(), organization_id=None)
    rows = [row] * (101 if invalid == "OVERSIZED" else 2) if invalid != "FOREIGN_OWNER" else [
        SimpleNamespace(id=uuid.uuid4(), organization_id=uuid.uuid4())]
    with pytest.raises(ValueError):
        await normalize_template_page_category_keys(None, rows=rows,
            organization_id=None, evidenced={}, actor_id=uuid.uuid4())


@pytest.mark.asyncio
@pytest.mark.parametrize("scope", ["GLOBAL", "ORGANIZATION", "GLOBAL_CATEGORY_OWNED_TEMPLATES"])
async def test_one_category_projects_205_references_only_in_committed_template_pages(
        db, organization, super_admin, monkeypatch, scope):
    owner = None if scope == "GLOBAL" else organization.id
    category_owner = organization.id if scope == "ORGANIZATION" else None
    category = FormCategory(organization_id=category_owner, name="Bounded taxonomy",
        slug=f"bounded-{uuid.uuid4().hex}")
    db.add(category)
    await db.flush()
    start = (1 << 128) - 4096
    rows = [FormTemplate(id=uuid.UUID(int=start + index), organization_id=owner,
        scope_type="GLOBAL" if owner is None else "ORGANIZATION", category_id=category.id,
        category_key="registration" if index == 204 else "legacy-taxonomy-key",
        name=f"Bounded projection {index}", slug=f"projection-{uuid.uuid4().hex}",
        fields=[], settings={}, version=1) for index in range(205)]
    db.add_all(rows)
    await db.flush()
    db.add_all([FormTemplateReconciliation(template_id=row.id, template_version=1,
        operation="DOCUMENT_VALIDATION", status="BLOCKED" if index == 0 else "VALID",
        actor_user_id=super_admin.id) for index, row in enumerate(rows)])
    await db.commit()
    category_id, category_slug = category.id, category.slug
    identities = [row.id for row in rows]

    @asynccontextmanager
    async def sessions():
        try:
            yield db
        except Exception:
            await db.rollback()
            raise

    monkeypatch.setattr(worker, "AsyncSessionLocal", sessions)
    async with TenantContextGuard.scoped(db, super_admin.organization_id):
        if category_owner is None:
            # The retained catalogue can itself exceed a category page. Follow
            # its real cursor, as the durable global stream does, before templates.
            category_cursor = None
            while True:
                taxonomy = await worker._global_category_page(super_admin.id, category_cursor)
                if taxonomy["next_cursor"] is None:
                    break
                advanced = uuid.UUID(taxonomy["next_cursor"])
                assert category_cursor is None or advanced > category_cursor
                category_cursor = advanced
        else:
            await worker._process_page(organization.id, super_admin.id, "FORM_CATEGORY", None)
    async with TenantContextGuard.scoped(db, owner or super_admin.organization_id):
        assert await db.scalar(select(func.count()).select_from(FormTemplate).where(
            FormTemplate.id.in_(identities), FormTemplate.version != 1)
            .execution_options(shared_form_catalogue=True)) == 0
    cursor = uuid.UUID(int=start - 1)
    observed = []
    for expected_changed in (100, 200, 204):
        async with TenantContextGuard.scoped(db, super_admin.organization_id):
            if owner is None:
                result = await worker._global_template_page(super_admin.id, cursor)
            else:
                result = await worker._process_page(organization.id, super_admin.id,
                    "FORM_TEMPLATE", cursor)
        observed.append((result["checked"], result["normalized"], result["blocked"]))
        async with TenantContextGuard.scoped(db, owner or super_admin.organization_id):
            changed = await db.scalar(select(func.count()).select_from(FormTemplate).where(
                FormTemplate.id.in_(identities), FormTemplate.version == 2,
                FormTemplate.category_key == category_slug)
                .execution_options(shared_form_catalogue=True))
            assert changed == expected_changed, (result, (await db.execute(
                select(FormTemplate.version, FormTemplate.category_key, func.count()).where(
                    FormTemplate.id.in_(identities)).group_by(
                        FormTemplate.version, FormTemplate.category_key)
                    .execution_options(shared_form_catalogue=True))).all())
        cursor = uuid.UUID(result["next_cursor"]) if result["next_cursor"] else None
    assert observed == [(100, 100, 1), (100, 100, 0), (5, 4, 0)]
    assert cursor is None
    async with TenantContextGuard.scoped(db, owner or super_admin.organization_id):
        historical = (await db.execute(select(FormTemplateReconciliation.template_version,
            FormTemplateReconciliation.operation, FormTemplateReconciliation.status).where(
            FormTemplateReconciliation.template_id == identities[0]))).all()
        assert set(historical) == {(1, "DOCUMENT_VALIDATION", "BLOCKED"),
            (2, "DOCUMENT_VALIDATION", "BLOCKED"), (2, "CATEGORY_KEY_NORMALIZATION", "COMPLETED")}
        purpose = await db.get(FormTemplate, identities[-1], populate_existing=True,
            execution_options={"shared_form_catalogue": True})
        assert purpose.version == 1 and purpose.category_key == "registration"
        lineage = await db.scalar(select(func.count()).select_from(FormTemplateReconciliation).where(
            FormTemplateReconciliation.template_id.in_(identities),
            FormTemplateReconciliation.operation == "CATEGORY_KEY_NORMALIZATION"))
        assert lineage == 204
    # A fresh run observes the committed current evidence; no repeated version bump.
    async with TenantContextGuard.scoped(db, super_admin.organization_id):
        if owner is None:
            replay = await worker._global_template_page(super_admin.id, uuid.UUID(int=start - 1))
        else:
            replay = await worker._process_page(organization.id, super_admin.id,
                "FORM_TEMPLATE", uuid.UUID(int=start - 1))
    assert replay["normalized"] == 0 and replay["blocked"] == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("taxonomy", ["MISSING", "STALE", "BLOCKED", "RETIRED", "FOREIGN", "INVALID_SLUG", "PURPOSE_COLLISION"])
async def test_projection_never_treats_missing_or_invalid_taxonomy_as_approval(
        db, organization, super_admin, monkeypatch, taxonomy):
    slug = ("X" * 51 if taxonomy == "INVALID_SLUG" else "registration" if taxonomy == "PURPOSE_COLLISION"
        else f"unapproved-{uuid.uuid4().hex}")
    category = FormCategory(organization_id=super_admin.organization_id if taxonomy == "FOREIGN" else None,
        name="Unapproved taxonomy", slug=slug,
        version=2 if taxonomy == "STALE" else 1, is_active=taxonomy != "RETIRED")
    db.add(category)
    await db.flush()
    template = FormTemplate(organization_id=organization.id, scope_type="ORGANIZATION",
        category_id=category.id, category_key="unresolved-legacy", fields=[], settings={},
        name="Unapproved legacy reference", slug=f"unapproved-template-{uuid.uuid4().hex}")
    db.add(template)
    if taxonomy not in {"MISSING", "FOREIGN"}:
        db.add(FormCategoryReconciliation(category_id=category.id, category_version=1,
            operation="TAXONOMY_VALIDATION", status="BLOCKED" if taxonomy == "BLOCKED" else "VALID",
            actor_user_id=super_admin.id))
    await db.flush()
    db.add(FormTemplateReconciliation(template_id=template.id, template_version=1,
        operation="DOCUMENT_VALIDATION", status="VALID", actor_user_id=super_admin.id))
    await db.commit()
    template_id = template.id

    @asynccontextmanager
    async def sessions():
        yield db

    monkeypatch.setattr(worker, "AsyncSessionLocal", sessions)
    async with TenantContextGuard.scoped(db, super_admin.organization_id):
        result = await worker._process_page(organization.id, super_admin.id, "FORM_TEMPLATE", None)
    assert result["blocked"] == 1 and result["normalized"] == 0
    async with TenantContextGuard.scoped(db, organization.id):
        current = await db.get(FormTemplate, template_id, populate_existing=True)
        assert current.category_key == "unresolved-legacy" and current.version == 2
        records = (await db.execute(select(FormTemplateReconciliation.template_version,
            FormTemplateReconciliation.operation, FormTemplateReconciliation.status).where(
            FormTemplateReconciliation.template_id == template_id))).all()
        assert set(records) == {(1, "DOCUMENT_VALIDATION", "VALID"),
            (1, "REFERENCE_VALIDATION", "BLOCKED"), (2, "DOCUMENT_VALIDATION", "BLOCKED")}


@pytest.mark.asyncio
async def test_template_projection_and_lineage_roll_back_with_failed_checkpoint_audit(
        db, organization, super_admin, monkeypatch):
    from sqlalchemy import event as sqlalchemy_event
    from app.modules.audit.models.audit_log import AuditLog
    from app.modules.registration.models.catalogue_reconciliation import CatalogueReconciliationWork as Work
    from app.modules.registration.services import catalogue_work as service
    from tests.test_catalogue_durable_pages import initialize, execute_claimed

    category = FormCategory(organization_id=organization.id, name="Atomic bounded projection",
        slug=f"atomic-{uuid.uuid4().hex}")
    db.add(category)
    await db.flush()
    template = FormTemplate(organization_id=organization.id, scope_type="ORGANIZATION",
        category_id=category.id, category_key="legacy-key", fields=[], settings={},
        name="Atomic bounded projection", slug=f"atomic-template-{uuid.uuid4().hex}")
    db.add(template)
    await db.flush()
    db.add(FormTemplateReconciliation(template_id=template.id, template_version=1,
        operation="DOCUMENT_VALIDATION", status="BLOCKED", actor_user_id=super_admin.id))
    await db.commit()
    template_id, category_slug = template.id, category.slug
    _, owner, platform, _ = await initialize(db, organization, super_admin, monkeypatch)
    await execute_claimed(db, platform)  # global taxonomy
    await execute_claimed(db, platform)  # global templates
    await execute_claimed(db, platform)  # owned taxonomy, no reference fan-out
    messages = await service.claim_pages(platform)
    assert len(messages) == 1
    work_id, _, generation = messages[0]
    async with TenantContextGuard.scoped(db, platform):
        work = await db.get(Work, work_id)
        assert work.stage == "FORM_TEMPLATE" and work.pages_completed == 1

    def fail_audit(mapper, connection, target):
        if target.resource_id == work_id and target.action_type == "CATALOGUE_PAGE_CHECKPOINT_COMMITTED":
            raise RuntimeError("Projection checkpoint audit unavailable")

    sqlalchemy_event.listen(AuditLog, "before_insert", fail_audit)
    try:
        with pytest.raises(RuntimeError, match="Projection checkpoint audit unavailable"):
            await service.execute_page(*messages[0])
    finally:
        sqlalchemy_event.remove(AuditLog, "before_insert", fail_audit)
    async with TenantContextGuard.scoped(db, owner):
        current = await db.get(FormTemplate, template_id, populate_existing=True)
        assert current.version == 1 and current.category_key == "legacy-key"
        assert await db.scalar(select(func.count()).select_from(FormTemplateReconciliation).where(
            FormTemplateReconciliation.template_id == template_id)) == 1
    async with TenantContextGuard.scoped(db, platform):
        work = await db.get(Work, work_id, populate_existing=True)
        assert work.pages_completed == 1 and work.cursor is None and work.generation == generation
    assert (await service.execute_page(*messages[0]))["pages_completed"] == 2
    assert await service.execute_page(*messages[0]) == {"status": "STALE_OR_UNAVAILABLE"}
    async with TenantContextGuard.scoped(db, owner):
        current = await db.get(FormTemplate, template_id, populate_existing=True)
        assert current.version == 2 and current.category_key == category_slug
        assert await db.scalar(select(func.count()).select_from(FormTemplateReconciliation).where(
            FormTemplateReconciliation.template_id == template_id)) == 3
