"""Exercise actual copy/binding services, permissions and PostgreSQL locks."""
import uuid

from fastapi import HTTPException
import pytest
from sqlalchemy import event as sa_event, select

from app.core.tenant_context import TenantContextGuard
from app.modules.registration.application.commands import FormTemplateCommandService
from app.modules.registration.application.operational_binding_commands import update_operational_binding
from app.modules.registration.models.form_category import FormCategory
from app.modules.registration.models.form_template import EventFormTemplateBinding, FormTemplate
from app.modules.registration.schemas.form_builder import FormTemplateSaveEventCopy
from app.modules.registration.schemas.operational_binding import OperationalBindingUpdate
from app.modules.platform.models.idempotency import IdempotencyRecord
from tests.conftest import activate_event_for_test


@pytest.mark.asyncio
@pytest.mark.parametrize("defect", ["customer_parent_on_global", "retired_parent", "conflicting_events", "valid"])
async def test_copy_checks_source_hierarchy_and_every_event_marker(db, event, organizer, defect):
    await activate_event_for_test(db, event)
    owner = event.organization_id
    category = FormCategory(name="Copy parent", slug="survey", is_system=True,
        organization_id=owner if defect == "customer_parent_on_global" else None,
        is_active=defect != "retired_parent")
    db.add(category)
    await db.flush()
    source = FormTemplate(name="Survey source", slug=f"copy-source-{uuid.uuid4().hex}",
        category_id=category.id, category_key="survey", fields=[],
        scope_type="EVENT" if defect == "conflicting_events" else "GLOBAL",
        organization_id=owner if defect == "conflicting_events" else None,
        settings={"_event_id": str(event.id), "event_id": str(uuid.uuid4())} if defect == "conflicting_events" else {})
    db.add(source)
    await db.commit()
    source_id, key = source.id, f"copy-hierarchy-{uuid.uuid4()}"
    async with TenantContextGuard.scoped(db, owner):
        arguments = dict(source_template_id=source_id, actor=organizer, if_match='"1"',
            idempotency_key=key, payload=FormTemplateSaveEventCopy(event_id=event.id, fields=[], settings={}))
        if defect == "valid":
            saved = await FormTemplateCommandService.save_event_copy(db, **arguments)
            assert saved.scope_type == "EVENT" and saved.organization_id == owner
            assert saved.settings["_source_template_id"] == str(source_id)
        else:
            with pytest.raises(HTTPException) as denied:
                await FormTemplateCommandService.save_event_copy(db, **arguments)
            assert denied.value.status_code == 404
            assert await db.scalar(select(IdempotencyRecord.id).where(IdempotencyRecord.idempotency_key == key)) is None


@pytest.mark.asyncio
async def test_parent_authorization_proof_cannot_be_forged(db, event, organizer):
    await activate_event_for_test(db, event)

    with pytest.raises(RuntimeError, match="Invalid parent event-copy authorization proof"):
        await FormTemplateCommandService.save_event_copy(
            db,
            source_template_id=uuid.uuid4(),
            actor=organizer,
            if_match='"1"',
            idempotency_key=f"forged-parent-proof-{uuid.uuid4()}",
            payload=FormTemplateSaveEventCopy(
                event_id=event.id,
                fields=[],
                settings={},
            ),
            _authorization_proof=object(),
        )


@pytest.mark.asyncio
@pytest.mark.parametrize("purpose", ["SURVEY", "SPEAKER_INTAKE"])
@pytest.mark.parametrize("mismatch", [False, True])
async def test_binding_takes_lifecycle_fence_before_event_lock_and_rolls_back_mismatch(
    db, event, organizer, purpose, mismatch, monkeypatch
):
    await activate_event_for_test(db, event)
    owner, actor_id = event.organization_id, organizer.id
    key = "survey" if purpose == "SURVEY" else "speaker_intake"
    if mismatch:
        key = "speaker_intake" if key == "survey" else "survey"
    category = FormCategory(name="Binding parent", slug=key, is_system=True)
    db.add(category)
    await db.flush()
    source = FormTemplate(name="Binding source", slug=f"binding-{uuid.uuid4().hex}", category_id=category.id,
        category_key=key, scope_type="GLOBAL", fields=[], settings={})
    db.add(source)
    await db.commit()
    event_id, source_id, retry_key = event.id, source.id, f"binding-order-{uuid.uuid4()}"
    observed = []
    authorization_calls = 0

    from app.modules.registration.application import operational_binding_commands

    authoritative_check = operational_binding_commands.enforce_event_operation

    async def count_authorization(*args, **kwargs):
        nonlocal authorization_calls
        authorization_calls += 1
        return await authoritative_check(*args, **kwargs)

    monkeypatch.setattr(
        operational_binding_commands,
        "enforce_event_operation",
        count_authorization,
    )

    def capture(connection, cursor, statement, parameters, context, executemany):
        if "pg_advisory_xact_lock_shared" in statement:
            observed.append("lifecycle")
        if "FROM events.events" in statement and "FOR UPDATE OF" in statement:
            observed.append("event")

    async with TenantContextGuard.scoped(db, owner):
        sa_event.listen(db.bind.sync_engine, "before_cursor_execute", capture)
        try:
            arguments = dict(event=event, purpose=purpose, actor=organizer, if_match='"1"',
                idempotency_key=retry_key, payload=OperationalBindingUpdate(
                    source_template_id=source_id, source_version=1, fields=[], settings={}))
            if mismatch:
                with pytest.raises(HTTPException) as denied:
                    await update_operational_binding(db, **arguments)
                assert denied.value.status_code == 422
            else:
                result = await update_operational_binding(db, **arguments)
                assert result.version == 2 and result.template_id != source_id
        finally:
            sa_event.remove(db.bind.sync_engine, "before_cursor_execute", capture)
        assert observed.index("lifecycle") < observed.index("event")
        assert authorization_calls == 1
        if mismatch:
            assert await db.scalar(select(EventFormTemplateBinding.id).where(EventFormTemplateBinding.event_id == event_id)) is None
            assert await db.scalar(select(IdempotencyRecord.id).where(IdempotencyRecord.idempotency_key == retry_key)) is None
            assert await db.scalar(select(FormTemplate.id).where(FormTemplate.organization_id == owner,
                FormTemplate.scope_type == "EVENT")) is None
