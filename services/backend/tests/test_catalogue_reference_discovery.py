"""The definer projection discloses bounded owner IDs, not tenant documents."""
import uuid

import pytest
from sqlalchemy import text

from app.core.tenant_context import TenantContextGuard
from app.modules.identity.models.user import User
from app.modules.platform.models.organization import Organization
from app.modules.registration.models.form_category import FormCategory
from app.modules.registration.models.form_template import FormTemplate


@pytest.mark.asyncio
async def test_reference_discovery_is_bounded_and_requires_platform_identity_and_context(db):
    run = uuid.uuid4().hex
    platform = Organization(name="Discovery test platform", slug=f"discovery-platform-{run}", is_platform_org=True)
    owners = [Organization(name=f"Discovery fixture {index}", slug=f"discovery-{index}-{run}")
        for index in range(103)]
    category = FormCategory(name="Discovery source", slug=f"discovery-source-{run}", is_system=True)
    db.add_all([platform, category, *owners])
    await db.flush()
    actor = User(organization_id=platform.id, email=f"discovery-{run}@example.test",
        first_name="Discovery", last_name="Operator", role="super_admin", platform_role="SUPER_ADMIN", is_active=True)
    outsider = User(organization_id=owners[0].id, email=f"outsider-{run}@example.test",
        first_name="Customer", last_name="Operator", role="super_admin", is_active=True)
    db.add_all([actor, outsider])
    db.add_all([FormTemplate(name="Tenant reference", slug=f"reference-{index}-{run}",
        organization_id=owner.id, category_id=category.id, scope_type="ORGANIZATION", fields=[], settings={})
        for index, owner in enumerate(owners)])
    await db.flush()
    role = "catalogue_discovery_" + run
    await db.execute(text(f'CREATE ROLE "{role}" NOSUPERUSER NOBYPASSRLS NOLOGIN'))
    await db.execute(text(f'GRANT USAGE ON SCHEMA design TO "{role}"'))
    await db.execute(text(f'GRANT EXECUTE ON FUNCTION design.catalogue_reference_owners_v1(text,uuid,uuid,uuid) TO "{role}"'))
    await db.execute(text(f'SET LOCAL ROLE "{role}"'))
    query = text("""SELECT * FROM design.catalogue_reference_owners_v1(
        :kind,CAST(:source AS uuid),CAST(:actor AS uuid),CAST(:after AS uuid))""")

    async def page(*, after=None, actor_id=None, source=None, kind="CATEGORY"):
        return list((await db.scalars(query, {"kind": kind, "source": source or category.id,
            "actor": actor_id or actor.id, "after": after})).all())

    try:
        async with TenantContextGuard.scoped(db, platform.id):
            first = await page()
            assert len(first) == 100 and first == sorted(set(first))
            last = await page(after=first[-1])
            assert len(last) == 3
            assert first + last == sorted(owner.id for owner in owners)
            assert await page(after=last[-1]) == []
            assert await page(actor_id=outsider.id) == []
            assert await page(actor_id=uuid.uuid4()) == []
            assert await page(source=uuid.uuid4()) == []
            assert await page(kind="UNREGISTERED") == []
        async with TenantContextGuard.scoped(db, owners[0].id):
            assert await page() == []  # A valid operator in a customer context is not authority.
            assert await page(actor_id=outsider.id) == []
    finally:
        await db.execute(text("RESET ROLE"))
