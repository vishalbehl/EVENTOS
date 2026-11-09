"""Independent PostgreSQL transactions run real platform reference commands."""
import asyncio
import uuid

from fastapi import HTTPException
import pytest
import pytest_asyncio
from sqlalchemy import delete, select, text

from app.core.tenant_context import TenantContextGuard
from app.modules.audit.models.audit_log import AuditLog
from app.modules.identity.models.user import User
from app.modules.platform.models.organization import Organization
from app.modules.platform.models.idempotency import IdempotencyRecord
from app.modules.rbac.models.access_foundation import OrganizationAccessRevision
from app.modules.registration.models.form_category import FormCategory, FormCategoryReconciliation
from app.modules.registration.models.form_template import FormTemplate, FormTemplateReconciliation
from app.modules.registration.schemas.form_builder import FormTemplateCreate
from app.modules.registration.application.category_commands import retire_global_category
from app.modules.registration.application.template_commands import retire_global_template, TemplateCommands
from app.modules.registration.application.catalogue_lifecycle_locks import lock_template_retirement, lock_category_retirement


@pytest_asyncio.fixture
async def race_fixture(committed_session_factory):
    run_id = uuid.uuid4().hex
    async with committed_session_factory() as db:
        platform = Organization(name="Catalogue race platform fixture", slug=f"catalogue-race-{run_id}", is_platform_org=True)
        db.add(platform)
        await db.flush()
        actor = User(organization_id=platform.id, email=f"catalogue-race-{run_id}@example.test",
            first_name="Race", last_name="Operator", role="super_admin", platform_role="SUPER_ADMIN", is_active=True)
        categories = [FormCategory(name=f"Race category {index}", slug=f"race-{index}-{run_id[:8]}", is_system=True)
            for index in range(2)]
        db.add_all([actor, *categories, OrganizationAccessRevision(organization_id=platform.id)])
        await db.flush()
        templates = [FormTemplate(name=f"Race template {index}", slug=f"race-template-{index}-{run_id}",
            category_id=categories[0].id, category_key=categories[0].slug, scope_type="GLOBAL", fields=[], settings={})
            for index in range(2)]
        db.add_all(templates)
        await db.commit()
        data = dict(platform_id=platform.id, actor_id=actor.id, source_category=categories[0].id,
            replacement_category=categories[1].id, category_key=categories[0].slug,
            source_template=templates[0].id, replacement_template=templates[1].id,
            writer_slug=f"race-writer-{run_id}")
    try:
        yield data
    finally:
        async with committed_session_factory() as db:
            fixture_templates = list((await db.scalars(select(FormTemplate.id).where(
                FormTemplate.id.in_([data["source_template"], data["replacement_template"]])
                | (FormTemplate.slug == data["writer_slug"])))).all())
            # Administrative cleanup in the dedicated test DB only. Production
            # runtime cannot delete immutable ledgers or their retained targets.
            await db.execute(delete(FormTemplateReconciliation).where(
                FormTemplateReconciliation.template_id.in_(fixture_templates)
                | FormTemplateReconciliation.replacement_template_id.in_(fixture_templates)))
            await db.execute(delete(FormCategoryReconciliation).where(
                FormCategoryReconciliation.category_id.in_([data["source_category"], data["replacement_category"]])
                | FormCategoryReconciliation.replacement_category_id.in_([data["source_category"], data["replacement_category"]])))
            await db.execute(delete(FormTemplate).where((FormTemplate.id.in_(
                [data["source_template"], data["replacement_template"]])) | (FormTemplate.slug == data["writer_slug"])))
            await db.execute(delete(FormCategory).where(FormCategory.id.in_(
                [data["source_category"], data["replacement_category"]])))
            await db.execute(delete(AuditLog).where(AuditLog.organization_id == data["platform_id"]))
            await db.execute(delete(IdempotencyRecord).where(IdempotencyRecord.organization_id == data["platform_id"]))
            await db.execute(delete(User).where(User.id == data["actor_id"]))
            await db.execute(delete(OrganizationAccessRevision).where(OrganizationAccessRevision.organization_id == data["platform_id"]))
            await db.execute(delete(Organization).where(Organization.id == data["platform_id"]))
            await db.commit()


async def retire(db, actor, data, kind):
    operation = retire_global_template if kind == "template" else retire_global_category
    return await operation(db, actor=actor, if_match='"1"', idempotency_key=f"race-retire-{uuid.uuid4()}",
        reason="Authorised independent transaction catalogue race",
        **{f"{kind}_id": data[f"source_{kind}"], f"replacement_{kind}_id": data[f"replacement_{kind}"]})


async def write(db, actor, data, kind):
    return await TemplateCommands.execute(db, operation="duplicate" if kind == "template" else "create",
        actor=actor, template_id=data["source_template"] if kind == "template" else None,
        if_match='"1"' if kind == "template" else None, audience="PLATFORM",
        idempotency_key=f"race-writer-{uuid.uuid4()}",
        payload=FormTemplateCreate(name="Concurrent catalogue writer", slug=data["writer_slug"], scope_type="GLOBAL",
            category_id=data["source_category"], category_key=data["category_key"], fields=[], settings={}))


async def wait_for_blocker(observer, pid, task):
    async def observed():
        while not await observer.scalar(text("SELECT cardinality(pg_blocking_pids(:pid))>0"), {"pid": pid}):
            if task.done():
                task.result()
                pytest.fail("Competing catalogue transaction did not wait")
            await asyncio.sleep(0.02)
    await asyncio.wait_for(observed(), 10)


async def prepare_taxonomy_repair(factory, data):
    async with factory() as db:
        db.add(FormCategoryReconciliation(category_id=data["source_category"], category_version=1,
            operation="TAXONOMY_VALIDATION", status="BLOCKED"))
        await db.commit()


async def repair_taxonomy(db, actor, data, slug):
    from app.modules.registration.application.aggregate_reconciliation import repair_aggregate_document
    from app.modules.registration.schemas.catalogue_contracts import AggregateRepairRequest
    return await repair_aggregate_document(db, resource_type="FORM_CATEGORY", resource_id=data["source_category"],
        payload=AggregateRepairRequest(document={"name": "Reviewed taxonomy", "slug": slug,
            "description": None, "icon": None, "sort_order": 0}, reason="Approved independent transaction taxonomy repair"),
        actor=actor, if_match='"1"', idempotency_key=f"taxonomy-race-{uuid.uuid4()}")


@pytest.mark.asyncio
async def test_parallel_catalogue_receipts_do_not_deadlock_owner_serialization(committed_session_factory, race_fixture, monkeypatch):
    from app.modules.registration.application import template_commands
    data = race_fixture
    second = {**data, "writer_slug": f"parallel-{uuid.uuid4().hex}"}
    rendezvous = asyncio.Barrier(2)
    original = template_commands.begin_idempotent

    async def both_receipts_committed_to_transaction(*args, **kwargs):
        receipt = await original(*args, **kwargs)
        # Real INSERTs/FK locks, not synthetic receipts. Only scheduling is held.
        await asyncio.wait_for(rendezvous.wait(), 10)
        return receipt

    monkeypatch.setattr(template_commands, "begin_idempotent", both_receipts_committed_to_transaction)
    async def create(values):
        async with committed_session_factory() as db:
            async with TenantContextGuard.scoped(db, values["platform_id"]):
                actor = await db.get(User, values["actor_id"])
                return await write(db, actor, values, "category")
    try:
        rows = await asyncio.wait_for(asyncio.gather(create(data), create(second)), 15)
        assert len({row.id for row in rows}) == 2
    finally:
        async with committed_session_factory() as db:
            await db.execute(delete(FormTemplate).where(FormTemplate.slug == second["writer_slug"]))
            await db.commit()


@pytest.mark.asyncio
async def test_owner_serialization_still_blocks_lifecycle_changes(committed_session_factory, race_fixture):
    data, task = race_fixture, None
    try:
        async with committed_session_factory() as protected, committed_session_factory() as lifecycle:
            async with TenantContextGuard.scoped(protected, data["platform_id"]):
                await protected.scalar(select(Organization.id).where(Organization.id == data["platform_id"])
                    .with_for_update(key_share=True))
                pid = await lifecycle.scalar(text("SELECT pg_backend_pid()"))
                async def suspend():
                    await lifecycle.execute(text("UPDATE platform.organizations SET is_active=false WHERE id=:id"),
                        {"id": data["platform_id"]})
                    await lifecycle.commit()
                task = asyncio.create_task(suspend())
                await wait_for_blocker(protected, pid, task)
                await protected.commit()
                await asyncio.wait_for(task, 10)
    finally:
        if task is not None and not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)


@pytest.mark.asyncio
async def test_taxonomy_repair_before_waiting_writer_rejects_cached_key(committed_session_factory, race_fixture):
    data, task = race_fixture, None
    await prepare_taxonomy_repair(committed_session_factory, data)
    try:
        async with committed_session_factory() as repairing, committed_session_factory() as writing:
            async with TenantContextGuard.scoped(repairing, data["platform_id"]):
                actor = await repairing.get(User, data["actor_id"])
                await lock_category_retirement(repairing)
                pid = await writing.scalar(text("SELECT pg_backend_pid()"))

                async def writer():
                    async with TenantContextGuard.scoped(writing, data["platform_id"]):
                        writer_actor = await writing.get(User, data["actor_id"])
                        with pytest.raises(HTTPException) as exc:
                            await write(writing, writer_actor, data, "category")
                        return exc.value.status_code

                task = asyncio.create_task(writer())
                await wait_for_blocker(repairing, pid, task)
                assert (await repair_taxonomy(repairing, actor, data, f"renamed-{uuid.uuid4().hex}"))["version"] == 2
                assert await asyncio.wait_for(task, 10) == 422
        async with committed_session_factory() as db:
            assert await db.scalar(select(FormTemplate.id).where(FormTemplate.slug == data["writer_slug"])) is None
    finally:
        if task is not None and not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)


@pytest.mark.asyncio
async def test_waiting_taxonomy_repair_preserves_preceding_writer_and_lineage(committed_session_factory, race_fixture):
    from sqlalchemy.ext.asyncio import AsyncSession
    data, task = race_fixture, None
    slug = f"renamed-{uuid.uuid4().hex}"
    await prepare_taxonomy_repair(committed_session_factory, data)
    try:
        async with committed_session_factory() as repairing, committed_session_factory() as outer:
            connection = await outer.connection()
            writing = AsyncSession(bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint")
            try:
                async with TenantContextGuard.scoped(writing, data["platform_id"]):
                    actor = await writing.get(User, data["actor_id"])
                    created = await write(writing, actor, data, "category")
                pid = await repairing.scalar(text("SELECT pg_backend_pid()"))

                async def repair():
                    async with TenantContextGuard.scoped(repairing, data["platform_id"]):
                        actor = await repairing.get(User, data["actor_id"])
                        return await repair_taxonomy(repairing, actor, data, slug)

                task = asyncio.create_task(repair())
                await wait_for_blocker(writing, pid, task)
                await writing.close()
                await outer.commit()
                assert (await asyncio.wait_for(task, 10))["version"] == 2
            finally:
                await writing.close()
        async with committed_session_factory() as db:
            row = await db.get(FormTemplate, created.id)
            assert row.category_key == slug and row.version == 2
            assert await db.scalar(select(FormTemplateReconciliation.id).where(
                FormTemplateReconciliation.template_id == created.id,
                FormTemplateReconciliation.template_version == 2,
                FormTemplateReconciliation.operation == "CATEGORY_KEY_NORMALIZATION")) is not None
    finally:
        if task is not None and not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["template", "category"])
async def test_retirement_before_waiting_writer_rejects_stale_reference(committed_session_factory, race_fixture, kind):
    data = race_fixture
    writer_task = None
    try:
        async with committed_session_factory() as retiring, committed_session_factory() as writing:
            async with TenantContextGuard.scoped(retiring, data["platform_id"]):
                actor = await retiring.get(User, data["actor_id"])
                await (lock_template_retirement(retiring) if kind == "template" else lock_category_retirement(retiring))
                writer_pid = await writing.scalar(text("SELECT pg_backend_pid()"))

                async def writer():
                    async with TenantContextGuard.scoped(writing, data["platform_id"]):
                        writer_actor = await writing.get(User, data["actor_id"])
                        try:
                            await write(writing, writer_actor, data, kind)
                            return 200
                        except HTTPException as exc:
                            return exc.status_code

                writer_task = asyncio.create_task(writer())
                await wait_for_blocker(retiring, writer_pid, writer_task)
                assert (await retire(retiring, actor, data, kind))["status"] == "RETIRED"
                assert await asyncio.wait_for(writer_task, 10) in {404, 409, 412}
        async with committed_session_factory() as db:
            assert await db.scalar(select(FormTemplate.id).where(FormTemplate.slug == data["writer_slug"])) is None
    finally:
        if writer_task is not None and not writer_task.done():
            writer_task.cancel()
            await asyncio.gather(writer_task, return_exceptions=True)


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["template", "category"])
async def test_writer_before_retirement_is_preserved_and_reassigned(committed_session_factory, race_fixture, kind):
    from sqlalchemy.ext.asyncio import AsyncSession
    data = race_fixture
    retiring_task = None
    try:
        async with committed_session_factory() as retiring, committed_session_factory() as connection_source:
            connection = await connection_source.connection()
            writing = AsyncSession(bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint")
            try:
                async with TenantContextGuard.scoped(writing, data["platform_id"]):
                    writer_actor = await writing.get(User, data["actor_id"])
                    created = await write(writing, writer_actor, data, kind)
                retire_pid = await retiring.scalar(text("SELECT pg_backend_pid()"))

                async def retirement():
                    async with TenantContextGuard.scoped(retiring, data["platform_id"]):
                        actor = await retiring.get(User, data["actor_id"])
                        return await retire(retiring, actor, data, kind)

                retiring_task = asyncio.create_task(retirement())
                await wait_for_blocker(writing, retire_pid, retiring_task)
                await writing.close()
                await connection_source.commit()
                assert (await asyncio.wait_for(retiring_task, 10))["status"] == "RETIRED"
            finally:
                await writing.close()
        async with committed_session_factory() as db:
            persisted = await db.get(FormTemplate, created.id)
            assert persisted is not None and persisted.is_active
            if kind == "category":
                assert persisted.category_id == data["replacement_category"]
                assert persisted.version == 2
    finally:
        if retiring_task is not None and not retiring_task.done():
            retiring_task.cancel()
            await asyncio.gather(retiring_task, return_exceptions=True)
