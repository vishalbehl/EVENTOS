"""Taxonomy projection never follows a corrupt foreign-owner reference."""
from contextlib import asynccontextmanager
import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.core.tenant_context import TenantContextGuard
from app.database import tenant_org_id
from app.modules.platform.models.organization import Organization
from app.modules.registration.models.form_category import FormCategory, FormCategoryReconciliation
from app.modules.registration.models.form_template import FormTemplate, FormTemplateReconciliation
from app.modules.registration.models.catalogue_reconciliation import CatalogueDocumentReconciliation
from app.modules.registration.application.aggregate_reconciliation import repair_aggregate_document
from app.modules.registration.schemas.catalogue_contracts import AggregateRepairRequest
from app.modules.rbac.models.access_foundation import OrganizationAccessRevision


@pytest.mark.asyncio
@pytest.mark.parametrize("command", ["worker", "reviewed_repair"])
@pytest.mark.parametrize("global_category", [False, True])
async def test_category_key_updates_are_owned_and_preserve_blocked_lineage(db, organization, super_admin,
        monkeypatch, command, global_category):
    from app.tasks import catalogue_reconciliation as worker
    foreign = Organization(name="Other category owner", slug=f"category-owner-{uuid.uuid4().hex}")
    db.add(foreign)
    await db.flush()
    db.add(OrganizationAccessRevision(organization_id=foreign.id))
    old_slug, new_slug = f"old-{uuid.uuid4().hex}", f"new-{uuid.uuid4().hex}"
    owner = None if global_category else organization.id
    category = FormCategory(organization_id=owner, name="Category proof", slug=new_slug if command == "worker" else old_slug)
    db.add(category)
    await db.flush()
    templates = []
    for index, target in enumerate([organization.id, foreign.id, None]):
        row = FormTemplate(organization_id=target, scope_type="GLOBAL" if target is None else "ORGANIZATION",
            category_id=category.id, category_key=old_slug, name=f"Category source {index}",
            slug=f"source-{uuid.uuid4().hex}", fields=[], settings={"custom_js": "historical invalid document"})
        db.add(row)
        templates.append(row)
    await db.flush()
    ids = [row.id for row in templates]
    db.add_all([FormTemplateReconciliation(template_id=row.id, template_version=1,
        operation="DOCUMENT_VALIDATION", status="BLOCKED") for row in templates])
    if command == "reviewed_repair":
        if global_category:
            db.add(FormCategoryReconciliation(category_id=category.id, category_version=1,
                operation="TAXONOMY_VALIDATION", status="BLOCKED"))
        else:
            db.add(CatalogueDocumentReconciliation(organization_id=owner, resource_type="FORM_CATEGORY",
                resource_id=category.id, resource_version=1, operation="DOCUMENT_VALIDATION", status="BLOCKED"))
    await db.commit()

    @asynccontextmanager
    async def sessions():
        yield db

    monkeypatch.setattr(worker, "AsyncSessionLocal", sessions)
    previous = tenant_org_id.get()
    if command == "worker":
        if global_category:
            cursor = None
            while True:
                page = await worker._global_category_page(super_admin.id, cursor)
                if page["next_cursor"] is None:
                    break
                advanced = uuid.UUID(page["next_cursor"])
                assert cursor is None or advanced > cursor
                cursor = advanced
            cursor = None
            while True:
                page = await worker._global_template_page(super_admin.id, cursor)
                if page["next_cursor"] is None:
                    break
                advanced = uuid.UUID(page["next_cursor"])
                assert cursor is None or advanced > cursor
                cursor = advanced
            for target in (organization.id, foreign.id):
                await worker._process_page(target, super_admin.id, "FORM_TEMPLATE", None)
        else:
            await worker._process_page(owner, super_admin.id, "FORM_CATEGORY", None)
            await worker._process_page(owner, super_admin.id, "FORM_TEMPLATE", None)
    else:
        args = dict(resource_type="FORM_CATEGORY", resource_id=category.id,
            payload=AggregateRepairRequest(document={"name": "Reviewed category", "slug": new_slug,
                "description": None, "icon": None, "sort_order": 0}, reason="Reviewed taxonomy fixture correction"),
            actor=super_admin, if_match='"1"', idempotency_key=f"category-proof-{uuid.uuid4()}")
        first = await repair_aggregate_document(db, **args)
        assert await repair_aggregate_document(db, **args) == first
    assert tenant_org_id.get() == previous
    for index, target in enumerate([organization.id, foreign.id, None]):
        async with TenantContextGuard.scoped(db, target or super_admin.organization_id):
            row = await db.scalar(select(FormTemplate).where(FormTemplate.id == ids[index])
                .execution_options(shared_form_catalogue=True, populate_existing=True))
            should_change = global_category or target == organization.id
            assert row.version == (2 if should_change else 1)
            assert row.category_key == (new_slug if should_change else old_slug)
            evidence = list((await db.scalars(select(FormTemplateReconciliation).where(
                FormTemplateReconciliation.template_id == row.id))).all())
            states = {(item.template_version, item.operation, item.status) for item in evidence}
            assert (1, "DOCUMENT_VALIDATION", "BLOCKED") in states
            if should_change:
                assert states == {(1, "DOCUMENT_VALIDATION", "BLOCKED"),
                    (2, "DOCUMENT_VALIDATION", "BLOCKED"), (2, "CATEGORY_KEY_NORMALIZATION", "COMPLETED")}
            else:
                assert len(states) == 1


@pytest.mark.asyncio
async def test_owned_category_projection_requires_current_owner_context(db, organization, super_admin):
    from app.modules.registration.application.category_key_projection import normalize_category_template_keys
    with pytest.raises(RuntimeError, match="verified owner context"):
        await normalize_category_template_keys(db, category_id=uuid.uuid4(), organization_id=organization.id,
            slug="valid", actor_id=super_admin.id)


@pytest.mark.asyncio
@pytest.mark.parametrize("restriction", ["retired_global_category", "inactive_owner"])
async def test_category_repair_does_not_bypass_lifecycle(db, organization, super_admin, restriction):
    global_category = restriction == "retired_global_category"
    row = FormCategory(organization_id=None if global_category else organization.id,
        name="Blocked category", slug=f"blocked-{uuid.uuid4().hex}", is_active=not global_category)
    db.add(row)
    await db.flush()
    row_id = row.id
    if global_category:
        db.add(FormCategoryReconciliation(category_id=row_id, category_version=1,
            operation="TAXONOMY_VALIDATION", status="BLOCKED"))
    else:
        organization.is_active = False
        db.add(CatalogueDocumentReconciliation(organization_id=organization.id, resource_type="FORM_CATEGORY",
            resource_id=row_id, resource_version=1, operation="DOCUMENT_VALIDATION", status="BLOCKED"))
    await db.commit()
    with pytest.raises(HTTPException) as exc:
        await repair_aggregate_document(db, resource_type="FORM_CATEGORY", resource_id=row_id,
            payload=AggregateRepairRequest(document={"name": "Reviewed category", "slug": f"reviewed-{uuid.uuid4().hex}",
                "description": None, "icon": None, "sort_order": 0}, reason="Lifecycle refusal fixture verification"),
            actor=super_admin, if_match='"1"', idempotency_key=f"lifecycle-proof-{uuid.uuid4()}")
    assert exc.value.status_code == 409
    assert exc.value.detail["code"] == ("CATEGORY_RETIRED" if global_category else "ORGANIZATION_NOT_OPERATIONAL")


@pytest.mark.asyncio
@pytest.mark.parametrize("stage", ["FORM_CATEGORY", "FORM_TEMPLATE", "REGISTRATION_FORM", "ABSTRACT_FORM", "GLOBAL_CATEGORY", "GLOBAL_TEMPLATE"])
async def test_existing_current_blockers_remain_counted_on_reconciliation_retry(db, event, super_admin, monkeypatch, stage):
    from app.tasks import catalogue_reconciliation as worker
    from app.modules.abstracts.models import AbstractForm
    from app.modules.registration.models.registration_form_config import RegistrationFormConfig
    if stage.endswith("CATEGORY"):
        row = FormCategory(organization_id=None if stage.startswith("GLOBAL") else event.organization_id,
            name="", slug=f"blocked-{uuid.uuid4().hex}")
    elif stage.endswith("TEMPLATE"):
        row = FormTemplate(organization_id=None if stage.startswith("GLOBAL") else event.organization_id,
            scope_type="GLOBAL" if stage.startswith("GLOBAL") else "ORGANIZATION",
            name="Blocked proof", slug=f"blocked-{uuid.uuid4().hex}", fields=[], settings={"custom_js": "invalid"})
    elif stage == "REGISTRATION_FORM":
        row = RegistrationFormConfig(event_id=event.id, fields=[], settings={"custom_js": "invalid"})
    else:
        row = AbstractForm(event_id=event.id, organization_id=event.organization_id,
            schema={"fields": [], "settings": {"custom_js": "invalid"}})
    db.add(row)
    await db.commit()

    @asynccontextmanager
    async def sessions():
        yield db

    monkeypatch.setattr(worker, "AsyncSessionLocal", sessions)
    async def reconcile():
        if stage == "GLOBAL_CATEGORY":
            return await worker._global_category_page(super_admin.id, None)
        if stage == "GLOBAL_TEMPLATE":
            return await worker._global_template_page(super_admin.id, None)
        return await worker._process_page(event.organization_id, super_admin.id, stage, None)
    first, second = await reconcile(), await reconcile()
    assert first["blocked"] == second["blocked"] == 1
