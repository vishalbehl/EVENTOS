"""Committed customer event writers versus real catalogue lifecycle commands.

The database fixture is an operator-owned, separate test database. These tests
prove command ordering, not the runtime-role/RLS matrix in migrated rehearsal.
"""
import asyncio
from datetime import date, datetime, timezone
import uuid

from fastapi import HTTPException
import pytest
import pytest_asyncio
from sqlalchemy import delete, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import UserOrganizationMembership
from app.core.tenant_context import TenantContextGuard
from app.modules.events.models.event import Event
from app.modules.identity.models.user import User
from app.modules.platform.models.organization import Organization
from app.modules.platform.models.idempotency import IdempotencyRecord
from app.modules.rbac.models.access_foundation import OperationalWorkspace, OrganizationAccessRevision
from app.modules.registration.models.registration_form_config import RegistrationFormConfig
from app.modules.registration.models.form_template import FormTemplate, EventFormTemplateBinding
from app.modules.abstracts.models import AbstractForm
from tests.conftest import activate_event_for_test
from tests.test_catalogue_retirement_concurrency import race_fixture, retire, wait_for_blocker
from app.modules.registration.application.catalogue_lifecycle_locks import (
    lock_template_retirement, lock_category_retirement,
)


@pytest_asyncio.fixture
async def customer_race(committed_session_factory, race_fixture, request):
    writer_kind = request.param
    data = {**race_fixture, "writer_kind": writer_kind, "retry_key": f"event-writer-race-{uuid.uuid4()}"}
    run_id = uuid.uuid4().hex
    async with committed_session_factory() as db:
        owner = Organization(name="Customer event race", slug=f"event-race-{run_id}")
        db.add(owner)
        await db.flush()
        actor = User(organization_id=owner.id, email=f"event-race-{run_id}@example.test",
            first_name="Customer", last_name="Owner", role="organiser", is_active=True)
        workspace = OperationalWorkspace(organization_id=owner.id, name="Race workspace")
        db.add_all([actor, workspace, OrganizationAccessRevision(organization_id=owner.id)])
        await db.flush()
        db.add(UserOrganizationMembership(user_id=actor.id, organization_id=owner.id,
            org_role="owner", accepted_at=datetime.now(timezone.utc), is_active=True))
        event = Event(organization_id=owner.id, created_by=actor.id, operational_workspace_id=workspace.id,
            name="Customer writer race", short_code=run_id[:8], start_date=date(2026, 10, 19),
            end_date=date(2026, 10, 20), timezone="UTC", status="draft")
        db.add(event)
        await db.flush()
        purpose = {"registration": "registration", "portal": "registration", "abstract": "abstract", "copy": "survey",
            "survey": "survey", "speaker": "speaker_intake"}[writer_kind]
        for template_id in (data["source_template"], data["replacement_template"]):
            template = await db.get(FormTemplate, template_id)
            template.category_key = purpose
        if writer_kind in {"registration", "portal"}:
            db.add(RegistrationFormConfig(event_id=event.id, template_id=data["source_template"],
                category_id=data["source_category"], fields=[], settings={}))
        elif writer_kind == "abstract":
            db.add(AbstractForm(event_id=event.id, organization_id=owner.id, title="Race abstract",
                schema={"fields": [], "settings": {}, "template_id": str(data["source_template"])}))
        await activate_event_for_test(db, event, abstracts=writer_kind == "abstract")
        data.update(owner_id=owner.id, customer_actor_id=actor.id, event_id=event.id)
    try:
        yield data
    finally:
        # Exact generated cohort only; production immutability is not disabled.
        from app.modules.platform.models.organization_console import EventCommercialContract
        from app.modules.billing.models.cloud_commercial import (
            CommercialAccount, CommercialContract, CommercialContractItem, CommercialOffer,
        )
        async with committed_session_factory() as db:
            accounts = select(CommercialAccount.id).where(CommercialAccount.owner_organization_id == data["owner_id"])
            contracts = select(CommercialContract.id).where(CommercialContract.commercial_account_id.in_(accounts))
            offers = list((await db.scalars(select(CommercialContractItem.offer_id).where(
                CommercialContractItem.contract_id.in_(contracts)))).all())
            await db.execute(delete(EventCommercialContract).where(EventCommercialContract.event_id == data["event_id"]))
            await db.execute(delete(Event).where(Event.id == data["event_id"]))
            await db.execute(delete(CommercialContract).where(CommercialContract.commercial_account_id.in_(accounts)))
            await db.execute(delete(CommercialOffer).where(CommercialOffer.id.in_(offers)))
            await db.execute(delete(OperationalWorkspace).where(OperationalWorkspace.organization_id == data["owner_id"]))
            from app.modules.audit.models.audit_log import AuditLog
            await db.execute(delete(AuditLog).where(AuditLog.organization_id == data["owner_id"]))
            await db.execute(delete(IdempotencyRecord).where(IdempotencyRecord.organization_id == data["owner_id"]))
            await db.execute(delete(User).where(User.id == data["customer_actor_id"]))
            await db.execute(delete(OrganizationAccessRevision).where(OrganizationAccessRevision.organization_id == data["owner_id"]))
            await db.execute(delete(Organization).where(Organization.id == data["owner_id"]))
            await db.commit()


async def customer_write(db, data):
    from app.modules.registration.application.commands import RegistrationFormCommandService, FormTemplateCommandService
    from app.modules.registration.schemas.registration_form_config import RegistrationFormConfigUpdate
    from app.modules.registration.schemas.form_builder import FormTemplateSaveEventCopy
    from app.modules.abstracts.application.commands import AbstractConfigurationCommandService
    from app.modules.registration.application.operational_binding_commands import update_operational_binding
    from app.modules.registration.schemas.operational_binding import OperationalBindingUpdate
    async with TenantContextGuard.scoped(db, data["owner_id"]):
        actor = await db.get(User, data["customer_actor_id"])
        event = await db.get(Event, data["event_id"])
        if data["writer_kind"] == "portal":
            return await RegistrationFormCommandService.set_live(db, event=event, actor_user_id=actor.id,
                expected_version=1, is_live=False, idempotency_key=data["retry_key"])
        if data["writer_kind"] == "registration":
            return await RegistrationFormCommandService.update(db, event=event, actor_user_id=actor.id,
                if_match='"1"', idempotency_key=data["retry_key"],
                payload=RegistrationFormConfigUpdate(is_live=False))
        if data["writer_kind"] == "abstract":
            return await AbstractConfigurationCommandService(db).update_form(event=event, user=actor,
                expected_version='"1"', idempotency_key=data["retry_key"],
                payload={"title": "Race abstract", "schema": {"fields": [], "settings": {}}, "publish": False})
        if data["writer_kind"] == "copy":
            return await FormTemplateCommandService.save_event_copy(db, source_template_id=data["source_template"],
                actor=actor, if_match='"1"', idempotency_key=data["retry_key"],
                payload=FormTemplateSaveEventCopy(event_id=event.id, fields=[], settings={}))
        purpose = "SURVEY" if data["writer_kind"] == "survey" else "SPEAKER_INTAKE"
        return await update_operational_binding(db, event=event, actor=actor, purpose=purpose,
            if_match='"1"', idempotency_key=data["retry_key"],
            payload=OperationalBindingUpdate(source_template_id=data["source_template"], source_version=1,
                fields=[], settings={}))


async def assert_current_references(db, data, lifecycle_kind, *, writer_succeeded):
    from app.modules.registration.models.form_category import FormCategory
    async with TenantContextGuard.scoped(db, data["owner_id"]):
        if data["writer_kind"] in {"registration", "portal"}:
            form = await db.scalar(select(RegistrationFormConfig).where(RegistrationFormConfig.event_id == data["event_id"]))
            assert form.template_id == (data["replacement_template"] if lifecycle_kind == "template" else data["source_template"])
            assert form.version == 2 + int(writer_succeeded)
            category_id = form.category_id
        elif data["writer_kind"] == "abstract":
            form = await db.scalar(select(AbstractForm).where(AbstractForm.event_id == data["event_id"]))
            expected = data["replacement_template"] if lifecycle_kind == "template" else data["source_template"]
            assert form.schema["template_id"] == str(expected)
            assert form.version == 1 + int(lifecycle_kind == "template") + int(writer_succeeded)
            template = await db.scalar(select(FormTemplate).where(FormTemplate.id == expected)
                .execution_options(shared_form_catalogue=True))
            category_id = template.category_id
        else:
            copies = list((await db.scalars(select(FormTemplate).where(FormTemplate.organization_id == data["owner_id"],
                FormTemplate.scope_type == "EVENT"))).all())
            assert len(copies) == int(writer_succeeded)
            for copy in copies:
                assert copy.is_active
                parent = await db.scalar(select(FormCategory).where(FormCategory.id == copy.category_id)
                    .execution_options(shared_form_catalogue=True))
                assert parent.is_active and parent.deleted_at is None
            if data["writer_kind"] != "copy":
                binding = await db.scalar(select(EventFormTemplateBinding).where(EventFormTemplateBinding.event_id == data["event_id"]))
                assert (binding is not None) == writer_succeeded
                if binding is not None:
                    assert binding.template_id in {copy.id for copy in copies}
            return
        category = await db.scalar(select(FormCategory).where(FormCategory.id == category_id)
            .execution_options(shared_form_catalogue=True))
        assert category.is_active and category.deleted_at is None


async def assert_receipt_and_audit(db, data, *, succeeded):
    from app.modules.audit.models.audit_log import AuditLog, compute_audit_hash
    receipt = await db.scalar(select(IdempotencyRecord).where(
        IdempotencyRecord.idempotency_key == data["retry_key"]))
    assert (receipt is not None) == succeeded
    if receipt is not None:
        assert receipt.organization_id == data["owner_id"] and receipt.actor_id == data["customer_actor_id"]
        audits = list((await db.scalars(select(AuditLog).where(AuditLog.correlation_id == receipt.id))).all())
        assert audits
        assert all(audit.organization_id == data["owner_id"] and audit.actor_user_id == data["customer_actor_id"]
            and audit.row_hash == compute_audit_hash(audit) for audit in audits)


@pytest.mark.asyncio
@pytest.mark.parametrize("customer_race", ["registration", "portal", "abstract", "copy", "survey", "speaker"], indirect=True)
@pytest.mark.parametrize("kind", ["template", "category"])
async def test_retirement_orders_before_customer_writer(committed_session_factory, customer_race, kind):
    data, task = customer_race, None
    try:
        async with committed_session_factory() as retiring, committed_session_factory() as writing:
            async with TenantContextGuard.scoped(retiring, data["platform_id"]):
                actor = await retiring.get(User, data["actor_id"])
                await (lock_template_retirement(retiring) if kind == "template" else lock_category_retirement(retiring))
                pid = await writing.scalar(text("SELECT pg_backend_pid()"))
                async def writer():
                    try:
                        await customer_write(writing, data)
                        return 200
                    except HTTPException as exc:
                        return exc.status_code
                task = asyncio.create_task(writer())
                await wait_for_blocker(retiring, pid, task)
                assert (await retire(retiring, actor, data, kind))["status"] == "RETIRED"
                status = await asyncio.wait_for(task, 15)
                # Abstracts retain an active blueprint through taxonomy-only
                # reassignment, so their independent form version stays current.
                expected = {200} if kind == "category" and data["writer_kind"] == "abstract" else {404, 409, 412}
                assert status in expected
        async with committed_session_factory() as observer:
            await assert_current_references(observer, data, kind, writer_succeeded=status == 200)
            await assert_receipt_and_audit(observer, data, succeeded=status == 200)
    finally:
        if task is not None and not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)


@pytest.mark.asyncio
@pytest.mark.parametrize("customer_race", ["registration", "portal", "abstract", "copy", "survey", "speaker"], indirect=True)
@pytest.mark.parametrize("kind", ["template", "category"])
async def test_customer_writer_orders_before_retirement(committed_session_factory, customer_race, kind):
    data, task = customer_race, None
    try:
        async with committed_session_factory() as retiring, committed_session_factory() as outer:
            connection = await outer.connection()
            async with AsyncSession(bind=connection, expire_on_commit=False,
                    join_transaction_mode="create_savepoint") as writing:
                await customer_write(writing, data)
                pid = await retiring.scalar(text("SELECT pg_backend_pid()"))
                async def retirement():
                    async with TenantContextGuard.scoped(retiring, data["platform_id"]):
                        actor = await retiring.get(User, data["actor_id"])
                        return await retire(retiring, actor, data, kind)
                task = asyncio.create_task(retirement())
                await wait_for_blocker(writing, pid, task)
                await writing.close()
                await outer.commit()
                assert (await asyncio.wait_for(task, 15))["status"] == "RETIRED"
        async with committed_session_factory() as observer:
            await assert_current_references(observer, data, kind, writer_succeeded=True)
            await assert_receipt_and_audit(observer, data, succeeded=True)
    finally:
        if task is not None and not task.done():
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)
