"""Platform metadata projection works without customer table privileges."""
from datetime import datetime, timezone
import uuid

from fastapi import HTTPException
import pytest
from sqlalchemy import text

from app.core.tenant_context import TenantContextGuard
from app.database import tenant_org_id
from app.modules.platform.models.organization import Organization
from app.modules.registration.models.form_category import FormCategory
from app.modules.registration.models.catalogue_reconciliation import CatalogueDocumentReconciliation
from app.modules.registration.application.catalogue_review_queries import list_blocked_aggregates


@pytest.mark.asyncio
async def test_review_projection_pages_current_metadata_without_customer_select(db, organization, super_admin, organizer):
    categories = [FormCategory(organization_id=organization.id, name="Historical category",
        slug=f"review-{uuid.uuid4().hex}", version=2 if index == 205 else 1) for index in range(207)]
    foreign = Organization(name="Review ownership mismatch fixture", slug=f"review-foreign-{uuid.uuid4().hex}")
    db.add_all([*categories, foreign])
    await db.flush()
    occurred_at = datetime.now(timezone.utc)
    db.add_all([CatalogueDocumentReconciliation(
        organization_id=foreign.id if index == 206 else organization.id, resource_type="FORM_CATEGORY",
        resource_id=category.id, resource_version=1, operation="DOCUMENT_VALIDATION", status="BLOCKED",
        reason="A private historical validation value must not be projected", details={"secret": "never-project"},
        created_at=occurred_at) for index, category in enumerate(categories)])
    await db.flush()
    actor_id, platform_id, customer_id = super_admin.id, super_admin.organization_id, organizer.id
    role = "review_projection_" + uuid.uuid4().hex
    await db.execute(text(f'CREATE ROLE "{role}" NOSUPERUSER NOBYPASSRLS NOLOGIN'))
    await db.execute(text(f'GRANT USAGE ON SCHEMA design TO "{role}"'))
    await db.execute(text(f'GRANT EXECUTE ON FUNCTION design.catalogue_blocked_review_v1(text,uuid,timestamptz,uuid,integer) TO "{role}"'))
    await db.execute(text(f'SET LOCAL ROLE "{role}"'))
    query = text("""SELECT * FROM design.catalogue_blocked_review_v1(:kind,
        CAST(:actor AS uuid),CAST(:at AS timestamptz),CAST(:after AS uuid),:size)""")

    async def page(*, at=None, after=None, actor=actor_id, size=100, kind="FORM_CATEGORY"):
        return list((await db.execute(query, {"kind": kind, "actor": actor,
            "at": at, "after": after, "size": size})).mappings().all())

    try:
        assert not await db.scalar(text("SELECT has_table_privilege(current_user,'design.form_categories','SELECT')"))
        async with TenantContextGuard.scoped(db, platform_id):
            first = await page()
            second = await page(at=first[-1]["created_at"], after=first[-1]["reconciliation_id"])
            third = await page(at=second[-1]["created_at"], after=second[-1]["reconciliation_id"])
            assert [len(first), len(second), len(third)] == [100, 100, 5]
            combined = first + second + third
            assert {row["resource_id"] for row in combined} == {row.id for row in categories[:205]}
            assert len({row["reconciliation_id"] for row in combined}) == 205
            assert set(first[0]) == {"reconciliation_id", "organization_id", "event_id", "resource_type",
                "resource_id", "resource_version", "reason", "created_at", "current_document"}
            assert all(row["reason"] == "Stored document requires a reviewed correction." for row in combined)
            assert set(first[0]["current_document"]) == {"name", "slug", "description", "icon", "sort_order"}
            assert await page(at=third[-1]["created_at"], after=third[-1]["reconciliation_id"]) == []
            assert await page(actor=customer_id) == []
            assert await page(actor=uuid.uuid4()) == []
            assert await page(kind="UNKNOWN") == []
            assert await page(size=102) == []
            assert await page(at=occurred_at) == []
        async with TenantContextGuard.scoped(db, organization.id):
            assert await page() == []
    finally:
        await db.execute(text("RESET ROLE"))


@pytest.mark.asyncio
async def test_review_missing_execute_is_unavailable_without_fallback(db, super_admin):
    role = "review_denied_" + uuid.uuid4().hex
    await db.execute(text(f'CREATE ROLE "{role}" NOSUPERUSER NOBYPASSRLS NOLOGIN'))
    await db.execute(text(f'GRANT USAGE ON SCHEMA design,identity,platform TO "{role}"'))
    await db.execute(text(f'GRANT SELECT ON identity.users,platform.organizations TO "{role}"'))
    await db.execute(text(f'SET LOCAL ROLE "{role}"'))
    before = tenant_org_id.get()
    try:
        with pytest.raises(HTTPException) as denied:
            await list_blocked_aggregates(db, actor=super_admin, resource_type="REGISTRATION_FORM")
        assert denied.value.status_code == 503
        assert denied.value.detail["code"] == "CATALOGUE_REVIEW_UNAVAILABLE"
        assert tenant_org_id.get() == before
    finally:
        await db.rollback()
        await db.execute(text("RESET ROLE"))


@pytest.mark.parametrize("changes", [
    {"security_definer": False}, {"record_result": False}, {"stable": False}, {"returns_set": False},
    {"definer_can_bypass_rls": False}, {"runtime_can_execute": False},
    {"runtime_can_assume_definer": True}, {"public_can_execute": True},
    {"runtime_can_create_schema_objects": True}, {"argument_names": []},
    {"fixed_settings": ["search_path=public", "row_security=off"]},
])
def test_review_preflight_rejects_unsafe_function_metadata(changes):
    from ops.category_a_preflight import blocked_review_is_safe
    safe = {"security_definer": True, "record_result": True, "stable": True, "returns_set": True,
        "definer_can_bypass_rls": True, "runtime_can_execute": True, "runtime_can_assume_definer": False,
        "public_can_execute": False, "runtime_can_create_schema_objects": False,
        "fixed_settings": ["search_path=pg_catalog", "row_security=off"],
        "argument_names": ["requested_type", "actor_id", "after_at", "after_id", "requested_limit",
            "reconciliation_id", "organization_id", "event_id", "resource_type", "resource_id",
            "resource_version", "reason", "created_at", "current_document"]}
    assert blocked_review_is_safe(safe)
    assert not blocked_review_is_safe({**safe, **changes})
