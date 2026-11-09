"""Current category documents are not waived by historical VALID evidence."""
from contextlib import asynccontextmanager
import uuid

import pytest
from sqlalchemy import select

from app.core.tenant_context import TenantContextGuard
from app.modules.registration.models.form_category import FormCategory, FormCategoryReconciliation
from app.modules.registration.models.catalogue_reconciliation import CatalogueDocumentReconciliation
from app.modules.registration.models.form_template import FormTemplate, FormTemplateReconciliation
from app.tasks import catalogue_reconciliation as worker


def document(row):
    return {key: getattr(row, key) for key in ("name", "slug", "description", "icon", "sort_order")}


def evidence_type(global_category):
    return FormCategoryReconciliation if global_category else CatalogueDocumentReconciliation


def marker(row, *, global_category, status, actor):
    values = dict(status=status, actor_user_id=actor, details={"historical_proof": "immutable"})
    if global_category:
        return FormCategoryReconciliation(category_id=row.id, category_version=row.version,
            operation="TAXONOMY_VALIDATION", **values)
    return CatalogueDocumentReconciliation(organization_id=row.organization_id,
        resource_type="FORM_CATEGORY", resource_id=row.id, resource_version=row.version,
        operation="DOCUMENT_VALIDATION", **values)


async def category_page(db, row, actor, global_category, monkeypatch):
    @asynccontextmanager
    async def sessions():
        yield db
    monkeypatch.setattr(worker, "AsyncSessionLocal", sessions)
    async with TenantContextGuard.scoped(db, actor.organization_id):
        if global_category:
            return await worker._global_category_page(actor.id, None)
        return await worker._process_page(row.organization_id, actor.id, "FORM_CATEGORY", None)


@pytest.mark.asyncio
@pytest.mark.parametrize("global_category", [False, True])
@pytest.mark.parametrize("historical", [False, True])
@pytest.mark.parametrize("invalid", ["SHORT_NAME", "EMPTY_NAME", "UPPER_SLUG", "SPACE_SLUG",
    "NEGATIVE_SORT", "HIGH_SORT", "TRIM_SLUG"])
async def test_invalid_current_category_is_quarantined_without_repairing_its_fields(
        db, organization, super_admin, monkeypatch, global_category, historical, invalid):
    values = dict(name="Historical category", slug=f"historical-{uuid.uuid4().hex}",
        description="Description", icon="ClipboardList", sort_order=1)
    values.update({
        "SHORT_NAME": {"name": "X"}, "EMPTY_NAME": {"name": "  "},
        "UPPER_SLUG": {"slug": f"Upper-{uuid.uuid4().hex}"},
        "SPACE_SLUG": {"slug": f"space slug-{uuid.uuid4().hex}"},
        "NEGATIVE_SORT": {"sort_order": -1}, "HIGH_SORT": {"sort_order": 100001},
        "TRIM_SLUG": {"slug": f" trim-{uuid.uuid4().hex} "},
    }[invalid])
    row = FormCategory(organization_id=None if global_category else organization.id,
        version=1, **values)
    db.add(row)
    await db.flush()
    old = marker(row, global_category=global_category, status="VALID", actor=super_admin.id) if historical else None
    if old is not None:
        db.add(old)
    await db.commit()
    identity, before = row.id, document(row)
    old_identity = old.id if old else None
    result = await category_page(db, row, super_admin, global_category, monkeypatch)
    assert result["blocked"] == 1 and result["normalized"] == 0
    model = evidence_type(global_category)
    selector = model.category_id if global_category else model.resource_id
    async with TenantContextGuard.scoped(db, super_admin.organization_id if global_category else organization.id):
        current = await db.scalar(select(FormCategory).where(FormCategory.id == identity)
            .execution_options(shared_form_catalogue=True, populate_existing=True))
        assert document(current) == before
        assert current.version == (2 if historical else 1)
        records = list((await db.scalars(select(model).where(selector == identity))).all())
        version = lambda item: item.category_version if global_category else item.resource_version
        validation = "TAXONOMY_VALIDATION" if global_category else "DOCUMENT_VALIDATION"
        expected = {(current.version, validation, "BLOCKED")}
        if historical:
            expected |= {(1, validation, "VALID"), (1, "DOCUMENT_REVALIDATION", "BLOCKED")}
            preserved = next(item for item in records if item.id == old_identity)
            assert preserved.details == {"historical_proof": "immutable"}
        assert {(version(item), item.operation, item.status) for item in records} == expected
        evidence_ids = {item.id for item in records}
    retry = await category_page(db, current, super_admin, global_category, monkeypatch)
    assert retry["blocked"] == 1 and retry["normalized"] == 0
    async with TenantContextGuard.scoped(db, super_admin.organization_id if global_category else organization.id):
        assert {item.id for item in (await db.scalars(select(model).where(selector == identity))).all()} == evidence_ids
        assert current.version == (2 if historical else 1)


@pytest.mark.asyncio
@pytest.mark.parametrize("global_category", [False, True])
async def test_old_valid_category_marker_cannot_project_a_malformed_current_document(
        db, organization, super_admin, monkeypatch, global_category):
    category = FormCategory(organization_id=None if global_category else organization.id,
        name="Invalid retained taxonomy", slug=f"retained-{uuid.uuid4().hex}", sort_order=-1)
    db.add(category)
    await db.flush()
    db.add(marker(category, global_category=global_category, status="VALID", actor=super_admin.id))
    template = FormTemplate(organization_id=organization.id, scope_type="ORGANIZATION",
        category_id=category.id, category_key="legacy-unresolved", fields=[], settings={},
        name="Retained taxonomy consumer", slug=f"retained-template-{uuid.uuid4().hex}")
    db.add(template)
    await db.flush()
    db.add(FormTemplateReconciliation(template_id=template.id, template_version=1,
        operation="DOCUMENT_VALIDATION", status="BLOCKED", actor_user_id=super_admin.id))
    await db.commit()
    identity = template.id

    @asynccontextmanager
    async def sessions():
        yield db
    monkeypatch.setattr(worker, "AsyncSessionLocal", sessions)
    async with TenantContextGuard.scoped(db, super_admin.organization_id):
        result = await worker._process_page(organization.id, super_admin.id, "FORM_TEMPLATE", None)
    assert result["normalized"] == 0 and result["blocked"] == 1
    async with TenantContextGuard.scoped(db, organization.id):
        current = await db.get(FormTemplate, identity, populate_existing=True)
        assert current.version == 1 and current.category_key == "legacy-unresolved"
        records = list((await db.scalars(select(FormTemplateReconciliation).where(
            FormTemplateReconciliation.template_id == identity))).all())
        assert len(records) == 1 and records[0].status == "BLOCKED"


@pytest.mark.asyncio
@pytest.mark.parametrize("global_category", [False, True])
@pytest.mark.parametrize("historical", [False, True])
async def test_valid_category_preserves_allowed_display_text_and_evidence(
        db, organization, super_admin, monkeypatch, global_category, historical):
    row = FormCategory(organization_id=None if global_category else organization.id,
        name=" Valid display name ", slug=f"valid-{uuid.uuid4().hex}",
        description=" Allowed display description ", icon=" ClipboardList ", sort_order=100000)
    db.add(row)
    await db.flush()
    if historical:
        db.add(marker(row, global_category=global_category, status="VALID", actor=super_admin.id))
    await db.commit()
    identity, before = row.id, document(row)
    result = await category_page(db, row, super_admin, global_category, monkeypatch)
    assert result["blocked"] == 0 and result["normalized"] == 0
    model = evidence_type(global_category)
    selector = model.category_id if global_category else model.resource_id
    async with TenantContextGuard.scoped(db, super_admin.organization_id if global_category else organization.id):
        current = await db.scalar(select(FormCategory).where(FormCategory.id == identity)
            .execution_options(shared_form_catalogue=True, populate_existing=True))
        assert current.version == 1 and document(current) == before
        records = list((await db.scalars(select(model).where(selector == identity))).all())
        assert len(records) == 1 and records[0].status == "VALID"
        if historical:
            assert records[0].details == {"historical_proof": "immutable"}


@pytest.mark.asyncio
@pytest.mark.parametrize("global_category", [False, True])
async def test_current_blocked_category_cannot_be_healed_by_rerunning_validation(
        db, organization, super_admin, monkeypatch, global_category):
    row = FormCategory(organization_id=None if global_category else organization.id,
        name="Valid but unresolved category", slug=f"blocked-{uuid.uuid4().hex}")
    db.add(row)
    await db.flush()
    old = marker(row, global_category=global_category, status="BLOCKED", actor=super_admin.id)
    db.add(old)
    await db.commit()
    old_id, identity = old.id, row.id
    for _ in range(2):
        result = await category_page(db, row, super_admin, global_category, monkeypatch)
        assert result["blocked"] == 1 and row.version == 1
    model = evidence_type(global_category)
    selector = model.category_id if global_category else model.resource_id
    async with TenantContextGuard.scoped(db, super_admin.organization_id if global_category else organization.id):
        records = list((await db.scalars(select(model).where(selector == identity))).all())
        assert len(records) == 1 and records[0].id == old_id and records[0].status == "BLOCKED"


@pytest.mark.asyncio
@pytest.mark.parametrize("global_category", [False, True])
async def test_operational_template_revalidates_category_despite_old_valid_document(
        db, organization, super_admin, monkeypatch, global_category):
    category = FormCategory(organization_id=None if global_category else organization.id,
        name="Invalid operational taxonomy", slug=f"operational-{uuid.uuid4().hex}", sort_order=-1)
    db.add(category)
    await db.flush()
    db.add(marker(category, global_category=global_category, status="VALID", actor=super_admin.id))
    template = FormTemplate(organization_id=organization.id, scope_type="ORGANIZATION",
        category_id=category.id, category_key="registration", fields=[], settings={},
        name="Operational taxonomy consumer", slug=f"operational-template-{uuid.uuid4().hex}")
    db.add(template)
    await db.flush()
    db.add(FormTemplateReconciliation(template_id=template.id, template_version=1,
        operation="DOCUMENT_VALIDATION", status="VALID", actor_user_id=super_admin.id))
    await db.commit()
    identity = template.id

    @asynccontextmanager
    async def sessions():
        yield db
    monkeypatch.setattr(worker, "AsyncSessionLocal", sessions)
    async with TenantContextGuard.scoped(db, super_admin.organization_id):
        result = await worker._process_page(organization.id, super_admin.id, "FORM_TEMPLATE", None)
    assert result["normalized"] == 0 and result["blocked"] == 1
    async with TenantContextGuard.scoped(db, organization.id):
        current = await db.get(FormTemplate, identity, populate_existing=True)
        assert current.version == 2 and current.category_key == "registration"
        records = (await db.execute(select(FormTemplateReconciliation.template_version,
            FormTemplateReconciliation.operation, FormTemplateReconciliation.status).where(
            FormTemplateReconciliation.template_id == identity))).all()
        assert set(records) == {(1, "DOCUMENT_VALIDATION", "VALID"),
            (1, "REFERENCE_VALIDATION", "BLOCKED"), (2, "DOCUMENT_VALIDATION", "BLOCKED")}
