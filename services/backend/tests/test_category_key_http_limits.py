"""Expanded key limits apply to real query contracts and bounded worker pages."""
from contextlib import asynccontextmanager
import uuid

import pytest
from sqlalchemy import select

from app.core.tenant_context import TenantContextGuard
from app.modules.registration.models.form_category import FormCategory
from app.modules.registration.models.form_template import FormTemplate, FormTemplateReconciliation
from app.tasks import catalogue_reconciliation as worker
from tests.test_category_long_slug_transitions import slug_of_length
from tests.test_category_historical_document_validation import category_page


@pytest.mark.asyncio
@pytest.mark.parametrize("global_category", [False, True])
@pytest.mark.parametrize("length", [51, 100])
async def test_bounded_projection_keeps_long_key_and_current_blocked_document(
        db, organization, super_admin, monkeypatch, global_category, length):
    owner = None if global_category else organization.id
    category = FormCategory(organization_id=owner, name="Long worker category", slug=slug_of_length(length))
    db.add(category)
    await db.flush()
    template = FormTemplate(organization_id=owner, scope_type="GLOBAL" if global_category else "ORGANIZATION",
        category_id=category.id, category_key="legacy-key", name="Long worker template",
        slug=f"long-worker-{uuid.uuid4().hex}", fields=[], settings={})
    db.add(template)
    await db.flush()
    db.add(FormTemplateReconciliation(template_id=template.id, template_version=1,
        operation="DOCUMENT_VALIDATION", status="BLOCKED", actor_user_id=super_admin.id))
    await db.commit()
    identity, slug = template.id, category.slug
    await category_page(db, category, super_admin, global_category, monkeypatch)

    @asynccontextmanager
    async def sessions():
        yield db
    monkeypatch.setattr(worker, "AsyncSessionLocal", sessions)
    async with TenantContextGuard.scoped(db, super_admin.organization_id):
        result = (await worker._global_template_page(super_admin.id, None) if global_category else
            await worker._process_page(organization.id, super_admin.id, "FORM_TEMPLATE", None))
    assert result["normalized"] == 1 and result["blocked"] == 1
    async with TenantContextGuard.scoped(db, owner or super_admin.organization_id):
        current = await db.scalar(select(FormTemplate).where(FormTemplate.id == identity)
            .execution_options(shared_form_catalogue=True, populate_existing=True))
        assert current.version == 2 and current.category_key == slug and len(current.category_key) == length
        states = (await db.execute(select(FormTemplateReconciliation.template_version,
            FormTemplateReconciliation.operation, FormTemplateReconciliation.status).where(
            FormTemplateReconciliation.template_id == identity))).all()
        assert set(states) == {(1, "DOCUMENT_VALIDATION", "BLOCKED"),
            (2, "DOCUMENT_VALIDATION", "BLOCKED"), (2, "CATEGORY_KEY_NORMALIZATION", "COMPLETED")}


def test_customer_and_platform_query_contracts_share_the_100_character_bound():
    from app.main import fastapi_app
    from app.modules.registration.routers.form_templates import list_form_templates, list_platform_form_templates

    schema = fastapi_app.openapi()
    found = set()
    for route in fastapi_app.routes:
        endpoint = getattr(route, "endpoint", None)
        if endpoint not in (list_form_templates, list_platform_form_templates):
            continue
        found.add(endpoint)
        parameters = schema["paths"][route.path]["get"]["parameters"]
        query = next(parameter for parameter in parameters if parameter["name"] == "category_key")
        variants = query["schema"].get("anyOf", [query["schema"]])
        assert next(value for value in variants if value.get("type") == "string")["maxLength"] == 100
    assert found == {list_form_templates, list_platform_form_templates}
