"""Operator canonical provisioning is a reference writer, not a customer GET."""
import asyncio
import uuid

import pytest
import pytest_asyncio
from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tenant_context import TenantContextGuard
from app.modules.identity.models.user import User
from app.modules.registration.application.queries import FormBuilderQueryService
from app.modules.registration.application.catalogue_lifecycle_locks import lock_template_retirement, lock_category_retirement
from app.modules.registration.models.form_template import FormTemplate, FormTemplateReconciliation
from app.modules.registration.models.form_category import FormCategory, FormCategoryReconciliation
from tests.test_catalogue_retirement_concurrency import race_fixture, retire, wait_for_blocker


async def provision(db, data):
    async with TenantContextGuard.scoped(db, data["platform_id"]):
        await FormBuilderQueryService(db)._ensure_global_templates()


@pytest_asyncio.fixture
async def canonical_fixture(committed_session_factory, race_fixture):
    data = {**race_fixture}
    async with committed_session_factory() as db:
        templates_before = set((await db.scalars(select(FormTemplate.id))).all())
        categories_before = set((await db.scalars(select(FormCategory.id))).all())
        await provision(db, data)
        templates = list((await db.scalars(select(FormTemplate).where(FormTemplate.id.not_in(templates_before)))).all())
        categories = list((await db.scalars(select(FormCategory).where(FormCategory.id.not_in(categories_before)))).all())
        template_ids, category_ids = [row.id for row in templates], [row.id for row in categories]
        assert len(templates) == 25 and len(categories) == 5
        source = next(row for row in templates if row.slug == "standard-event-registration")
        parent = next(row for row in categories if row.slug == "registration")
        replacement = FormTemplate(name="Explicit clean canonical replacement", slug=f"canonical-replacement-{uuid.uuid4().hex}",
            scope_type="GLOBAL", category_key="registration", category_id=parent.id, fields=[], settings={})
        db.add(replacement)
        await db.flush()
        template_ids.append(replacement.id)
        data.update(source_template=source.id, replacement_template=replacement.id, source_category=parent.id,
            canonical_template_ids=set(template_ids), canonical_category_ids=set(category_ids),
            all_template_ids=templates_before | set(template_ids), all_category_ids=categories_before | set(category_ids))
        await db.commit()
    try:
        yield data
    finally:
        # Exact generated fixture IDs only, in the separate disposable test DB.
        async with committed_session_factory() as db:
            await db.execute(delete(FormTemplateReconciliation).where(FormTemplateReconciliation.template_id.in_(template_ids)))
            await db.execute(delete(FormCategoryReconciliation).where(FormCategoryReconciliation.category_id.in_(category_ids)))
            await db.execute(delete(FormTemplate).where(FormTemplate.id.in_(template_ids)))
            await db.execute(delete(FormCategory).where(FormCategory.id.in_(category_ids)))
            await db.commit()


async def assert_preserved(factory, data, kind):
    async with factory() as db:
        source = await db.get(FormTemplate if kind == "template" else FormCategory, data[f"source_{kind}"])
        assert source.is_active is False and source.version == 2
        templates = set((await db.scalars(select(FormTemplate.id))).all())
        categories = set((await db.scalars(select(FormCategory.id))).all())
        assert templates == data["all_template_ids"] and categories == data["all_category_ids"]
        canonical_slug_count = await db.scalar(select(text("count(*)")).select_from(FormTemplate).where(
            FormTemplate.slug == "standard-event-registration", FormTemplate.organization_id.is_(None)))
        assert canonical_slug_count == 1
        for template_id in data["canonical_template_ids"]:
            row = await db.get(FormTemplate, template_id)
            if row.is_active:
                category = await db.get(FormCategory, row.category_id)
                assert category is not None and category.is_active and category.deleted_at is None
        if kind == "category":
            assert await db.scalar(select(text("count(*)")).select_from(FormTemplate).where(
                FormTemplate.category_id == data["source_category"], FormTemplate.is_active.is_(True))) == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["template", "category"])
async def test_retirement_before_operator_provisioning_does_not_resurrect(committed_session_factory, canonical_fixture, kind):
    data, task = canonical_fixture, None
    try:
        async with committed_session_factory() as retiring, committed_session_factory() as seeding:
            async with TenantContextGuard.scoped(retiring, data["platform_id"]):
                actor = await retiring.get(User, data["actor_id"])
                await (lock_template_retirement(retiring) if kind == "template" else lock_category_retirement(retiring))
                pid = await seeding.scalar(text("SELECT pg_backend_pid()"))
                async def seed():
                    if kind == "category":
                        with pytest.raises(RuntimeError, match="GLOBAL_FORM_CATEGORY_RECONCILIATION_REQUIRED"):
                            await provision(seeding, data)
                    else:
                        await provision(seeding, data)
                task = asyncio.create_task(seed())
                await wait_for_blocker(retiring, pid, task)
                assert (await retire(retiring, actor, data, kind))["status"] == "RETIRED"
                await asyncio.wait_for(task, 15)
        await assert_preserved(committed_session_factory, data, kind)
    finally:
        if task is not None and not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["template", "category"])
async def test_operator_provisioning_before_retirement_is_serialised(committed_session_factory, canonical_fixture, kind):
    data, task = canonical_fixture, None
    try:
        async with committed_session_factory() as retiring, committed_session_factory() as outer:
            connection = await outer.connection()
            async with AsyncSession(bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint") as seeding:
                await provision(seeding, data)
                pid = await retiring.scalar(text("SELECT pg_backend_pid()"))
                async def retirement():
                    async with TenantContextGuard.scoped(retiring, data["platform_id"]):
                        actor = await retiring.get(User, data["actor_id"])
                        return await retire(retiring, actor, data, kind)
                task = asyncio.create_task(retirement())
                await wait_for_blocker(seeding, pid, task)
                await seeding.close()
                await outer.commit()
                assert (await asyncio.wait_for(task, 15))["status"] == "RETIRED"
        await assert_preserved(committed_session_factory, data, kind)
    finally:
        if task is not None and not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
