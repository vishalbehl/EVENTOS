"""Independent read/retirement transactions; same actual customer write setup."""
import asyncio

import pytest
from sqlalchemy import select, text

from app.core.tenant_context import TenantContextGuard
from app.modules.events.models.event import Event
from app.modules.identity.models.user import User
from app.modules.registration.application.catalogue_lifecycle_locks import lock_category_retirement, lock_template_retirement
from app.modules.registration.application.operational_binding_commands import get_operational_binding, get_operational_form_projection
from app.modules.registration.models.form_category import FormCategory
from app.modules.registration.models.form_template import FormTemplate
from tests.test_catalogue_retirement_concurrency import race_fixture, retire, wait_for_blocker
from tests.test_event_writer_retirement_races import customer_race, customer_write


async def read_binding(db, data, public):
    purpose = "SURVEY" if data["writer_kind"] == "survey" else "SPEAKER_INTAKE"
    async with TenantContextGuard.scoped(db, data["owner_id"]):
        event = await db.get(Event, data["event_id"])
        result = await (get_operational_form_projection(db, event=event, purpose=purpose) if public
            else get_operational_binding(db, event=event, purpose=purpose))
        assert result is not None
        return result["template_version"] if public else result.template.version


@pytest.mark.asyncio
@pytest.mark.parametrize("customer_race", ["survey", "speaker"], indirect=True)
@pytest.mark.parametrize("public", [False, True])
@pytest.mark.parametrize("kind", ["template", "category"])
@pytest.mark.parametrize("first", ["reader", "retirement"])
async def test_operational_reader_and_retirement_are_ordered(committed_session_factory, customer_race, public, kind, first):
    data, task = customer_race, None
    async with committed_session_factory() as preparation:
        await customer_write(preparation, data)
    try:
        async with committed_session_factory() as reading, committed_session_factory() as retiring:
            if first == "reader":
                assert await read_binding(reading, data, public) == 1
                pid = await retiring.scalar(text("SELECT pg_backend_pid()"))
                async def retirement():
                    async with TenantContextGuard.scoped(retiring, data["platform_id"]):
                        actor = await retiring.get(User, data["actor_id"])
                        return await retire(retiring, actor, data, kind)
                task = asyncio.create_task(retirement())
                await wait_for_blocker(reading, pid, task)
                await reading.commit()
                assert (await asyncio.wait_for(task, 15))["status"] == "RETIRED"
            else:
                async with TenantContextGuard.scoped(retiring, data["platform_id"]):
                    actor = await retiring.get(User, data["actor_id"])
                    await (lock_template_retirement(retiring) if kind == "template" else lock_category_retirement(retiring))
                    pid = await reading.scalar(text("SELECT pg_backend_pid()"))
                    task = asyncio.create_task(read_binding(reading, data, public))
                    await wait_for_blocker(retiring, pid, task)
                    assert (await retire(retiring, actor, data, kind))["status"] == "RETIRED"
                    assert await asyncio.wait_for(task, 15) == (2 if kind == "category" else 1)
        async with committed_session_factory() as observer:
            assert await read_binding(observer, data, public) == (2 if kind == "category" else 1)
            async with TenantContextGuard.scoped(observer, data["owner_id"]):
                copy = await observer.scalar(select(FormTemplate).where(
                    FormTemplate.organization_id == data["owner_id"], FormTemplate.scope_type == "EVENT"))
                assert copy.settings["_source_template_id"] == str(data["source_template"])
                category = await observer.scalar(select(FormCategory).where(FormCategory.id == copy.category_id)
                    .execution_options(shared_form_catalogue=True))
                assert category.is_active and category.deleted_at is None
    finally:
        if task is not None and not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
