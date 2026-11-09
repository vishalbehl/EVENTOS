"""Actual rows returned by page evidence lookup stay independent of history."""
from contextlib import asynccontextmanager
import uuid

import pytest
from sqlalchemy import func, select
from fastapi import HTTPException

from app.core.tenant_context import TenantContextGuard
from app.modules.abstracts.models import AbstractForm
from app.modules.registration.models.catalogue_reconciliation import CatalogueDocumentReconciliation
from app.modules.registration.models.form_category import FormCategory, FormCategoryReconciliation
from app.modules.registration.models.form_template import FormTemplate, FormTemplateReconciliation
from app.modules.registration.models.registration_form_config import RegistrationFormConfig
from app.modules.registration.application.template_commands import reconcile_catalogue_documents
from app.tasks import catalogue_reconciliation as worker


@pytest.mark.asyncio
@pytest.mark.parametrize("entry", ["global_template", "owned_template", "manual_template",
    "global_category", "owned_category", "registration", "abstract"])
@pytest.mark.parametrize("current_status", ["VALID", "BLOCKED"])
async def test_page_does_not_materialize_every_historical_evidence_version(
        db, organization, super_admin, event, monkeypatch, entry, current_status):
    version = 201
    key = uuid.uuid4().hex
    if "template" in entry:
        row = FormTemplate(organization_id=organization.id if entry == "owned_template" else None,
            scope_type="ORGANIZATION" if entry == "owned_template" else "GLOBAL", category_key="registration",
            name="Historical evidence budget", slug=f"budget-{key}", fields=[], settings={}, version=version)
        model, selector = FormTemplateReconciliation, FormTemplateReconciliation.template_id
    elif "category" in entry:
        row = FormCategory(organization_id=None if entry == "global_category" else organization.id,
            name="Historical taxonomy budget", slug=f"budget-{key}", version=version)
        model = FormCategoryReconciliation if entry == "global_category" else CatalogueDocumentReconciliation
        selector = model.category_id if entry == "global_category" else model.resource_id
    elif entry == "registration":
        row = RegistrationFormConfig(event_id=event.id, fields=[], settings={}, version=version)
        model, selector = CatalogueDocumentReconciliation, CatalogueDocumentReconciliation.resource_id
    else:
        row = AbstractForm(organization_id=organization.id, event_id=event.id,
            schema={"fields": [], "settings": {}}, version=version)
        model, selector = CatalogueDocumentReconciliation, CatalogueDocumentReconciliation.resource_id
    db.add(row)
    await db.flush()
    operation = "TAXONOMY_VALIDATION" if entry == "global_category" else "DOCUMENT_VALIDATION"
    evidence = []
    for old in range(1, version + 1):
        values = dict(status=current_status if old == version else "BLOCKED" if current_status == "VALID" else "VALID",
            operation=operation, actor_user_id=super_admin.id)
        if model is FormTemplateReconciliation:
            values.update(template_id=row.id, template_version=old)
        elif model is FormCategoryReconciliation:
            values.update(category_id=row.id, category_version=old)
        else:
            resource_type = {"owned_category": "FORM_CATEGORY", "registration": "REGISTRATION_FORM", "abstract": "ABSTRACT_FORM"}[entry]
            values.update(organization_id=organization.id, resource_type=resource_type,
                resource_id=row.id, resource_version=old)
        evidence.append(model(**values))
    db.add_all(evidence)
    await db.commit()
    identity = row.id

    @asynccontextmanager
    async def sessions():
        yield db
    monkeypatch.setattr(worker, "AsyncSessionLocal", sessions)
    execute = db.execute
    returned = []
    selectors = {("template_id", "template_version", "status"),
        ("category_id", "category_version", "status"), ("resource_id", "resource_version", "status")}

    async def observed(statement, *args, **kwargs):
        result = await execute(statement, *args, **kwargs)
        if getattr(statement, "is_select", False) and tuple(statement.selected_columns.keys()) in selectors:
            # Freeze/return the same real DB rows; this is observation, not a
            # query/result double. A LIMIT or application-side slicing cannot
            # hide that the DB returned every old version.
            frozen = result.freeze()
            returned.append(len(frozen.data))
            return frozen()
        return result
    monkeypatch.setattr(db, "execute", observed)
    async with TenantContextGuard.scoped(db, super_admin.organization_id):
        if entry == "global_template":
            result = await worker._global_template_page(super_admin.id, None)
        elif entry == "global_category":
            result = await worker._global_category_page(super_admin.id, None)
        elif entry == "manual_template":
            result = await reconcile_catalogue_documents(db, actor=super_admin, page_size=100,
                idempotency_key=f"evidence-budget-{key}")
        else:
            stage = {"owned_template": "FORM_TEMPLATE", "owned_category": "FORM_CATEGORY",
                "registration": "REGISTRATION_FORM", "abstract": "ABSTRACT_FORM"}[entry]
            result = await worker._process_page(organization.id, super_admin.id, stage, None)
    assert returned == [1], f"Page lookup materialized historical rows: {returned}"
    assert result["checked"] == 1 and result["blocked"] == int(current_status == "BLOCKED")
    monkeypatch.setattr(db, "execute", execute)
    assert await db.scalar(select(func.count()).select_from(model).where(selector == identity)) == version
    assert await db.scalar(select(func.count()).select_from(model).where(selector == identity, model.status == "BLOCKED")) == (
        version - 1 if current_status == "VALID" else 1)


@pytest.mark.asyncio
@pytest.mark.parametrize("entry", ["global_template", "owned_template", "manual_template"])
async def test_evidence_lookup_pairs_each_identity_with_its_own_version(
        db, organization, super_admin, monkeypatch, entry):
    """Separate ID/version IN lists create a historical cross product."""
    key = uuid.uuid4().hex
    rows = [FormTemplate(
        organization_id=organization.id if entry == "owned_template" else None,
        scope_type="ORGANIZATION" if entry == "owned_template" else "GLOBAL",
        category_key="registration", name="Paired evidence budget",
        slug=f"paired-{key}-{version}", fields=[], settings={}, version=version,
    ) for version in (1, 2)]
    db.add_all(rows)
    await db.flush()
    db.add_all([FormTemplateReconciliation(template_id=row.id,
        template_version=version, operation="DOCUMENT_VALIDATION",
        status="VALID" if version == row.version else "BLOCKED",
        actor_user_id=super_admin.id) for row in rows for version in (1, 2)])
    await db.commit()

    @asynccontextmanager
    async def sessions():
        yield db

    monkeypatch.setattr(worker, "AsyncSessionLocal", sessions)
    execute, returned = db.execute, []

    async def observed(statement, *args, **kwargs):
        result = await execute(statement, *args, **kwargs)
        if (getattr(statement, "is_select", False)
                and tuple(statement.selected_columns.keys()) == (
                    "template_id", "template_version", "status")):
            frozen = result.freeze()
            returned.append(len(frozen.data))
            return frozen()
        return result

    monkeypatch.setattr(db, "execute", observed)
    async with TenantContextGuard.scoped(db, super_admin.organization_id):
        if entry == "global_template":
            result = await worker._global_template_page(super_admin.id, None)
        elif entry == "manual_template":
            result = await reconcile_catalogue_documents(db, actor=super_admin,
                idempotency_key=f"paired-budget-{key}")
        else:
            result = await worker._process_page(organization.id, super_admin.id,
                "FORM_TEMPLATE", None)
    assert returned == [2]
    assert result["checked"] == 2 and result["blocked"] == 0
    monkeypatch.setattr(db, "execute", execute)
    assert await db.scalar(select(func.count()).select_from(FormTemplateReconciliation).where(
        FormTemplateReconciliation.template_id.in_([row.id for row in rows]))) == 4


@pytest.mark.asyncio
@pytest.mark.parametrize("page_size", [True, 0, -1, 101, 1.5, "100"])
async def test_manual_reconciliation_rejects_unbounded_or_ambiguous_page_size(page_size):
    with pytest.raises(HTTPException) as invalid:
        await reconcile_catalogue_documents(None, actor=None, page_size=page_size)
    assert invalid.value.status_code == 422 and invalid.value.detail["code"] == "INVALID_PAGE_SIZE"
