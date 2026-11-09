"""Actual restricted-login/direct-member writer proof, with outer rollback.

Uses an existing approved synthetic event and catalogue. No fixture rows, users,
contracts, permissions or audit history are created permanently by the probe.
"""
import asyncio
import argparse
import hashlib
import json
from pathlib import Path
import secrets
import sys
import uuid
from datetime import datetime, timezone

sys.path.insert(0, str(Path(__file__).parents[1]))
from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import make_url
from app.config import settings
from bootstrap_cloud_database import upsert_login

OWNER = uuid.UUID("0a62c7fc-5ee2-40fb-871c-2c74d59098cf")
FOREIGN = uuid.UUID("5a6ed530-6787-4985-87cc-92faf98345d3")


def state(connection, event_id):
    row = connection.execute(text("""SELECT f.id,f.template_id,f.category_id,f.version,f.fields,f.settings,f.is_live
        FROM registration.registration_forms f JOIN events.events e ON e.id=f.event_id
        WHERE e.id=:event AND e.organization_id=:owner"""), {"event": event_id, "owner": OWNER}).mappings().one()
    return hashlib.sha256(json.dumps(dict(row), sort_keys=True, default=str).encode()).hexdigest()


def binding_state(connection, event_id):
    rows = connection.execute(text("""SELECT id,template_id,purpose,version FROM design.event_form_template_bindings
        WHERE event_id=:event AND organization_id=:owner ORDER BY id"""),
        {"event": event_id, "owner": OWNER}).mappings().all()
    return hashlib.sha256(json.dumps([dict(row) for row in rows], sort_keys=True, default=str).encode()).hexdigest()


async def binding_write_probe(event_id, actor_id, foreign_source, keys):
    """Real commands and receipts under a restricted login; outer rollback only."""
    import app.models
    from fastapi import HTTPException
    from sqlalchemy.ext.asyncio import AsyncSession
    from app.database import async_engine
    from app.core.tenant_context import TenantContextGuard
    from app.modules.identity.models.user import User
    from app.modules.events.models.event import Event
    from app.modules.registration.models.form_template import FormTemplate, EventFormTemplateBinding
    from app.modules.registration.schemas.form_builder import FormTemplateCreate, FormTemplateUpdate
    from app.modules.registration.schemas.operational_binding import OperationalBindingUpdate
    from app.modules.registration.application.template_commands import TemplateCommands
    from app.modules.registration.application.operational_binding_commands import update_operational_binding
    from app.modules.audit.models.audit_log import AuditLog, compute_audit_hash
    from app.core.idempotency_service import IdempotencyRecord

    checks, created_ids = [], []
    def new_key():
        key = f"runtime-binding-{uuid.uuid4()}"
        keys.append(key)
        return key
    try:
        for purpose in ("SURVEY", "SPEAKER_INTAKE"):
            for case in ("success_replay", "stale_version", "missing_version", "missing_key",
                         "foreign_source", "wrong_purpose", "changed_retry_payload",
                         "retired_source", "stale_source_version"):
                async with async_engine.connect() as connection:
                    transaction = await connection.begin()
                    async with AsyncSession(bind=connection, expire_on_commit=False,
                            join_transaction_mode="create_savepoint") as db:
                        try:
                            role = (await db.execute(text("SELECT current_user AS login,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user"))).one()
                            assert role.login == "category_a_rehearsal_runtime_20261015" and not role.rolsuper and not role.rolbypassrls
                            async with TenantContextGuard.scoped(db, OWNER):
                                actor = await db.get(User, actor_id)
                                assert actor.platform_role is None
                                assert actor.request_organization_id == OWNER
                                event = await db.get(Event, event_id)
                                category_key = "survey" if purpose == "SURVEY" else "speaker_intake"
                                source = await TemplateCommands.execute(db, operation="create", actor=actor,
                                    payload=FormTemplateCreate(name="Rolled-back binding source",
                                        slug=f"runtime-binding-{uuid.uuid4().hex}",
                                        category_key=("speaker_intake" if purpose == "SURVEY" else "survey")
                                            if case == "wrong_purpose" else category_key,
                                        fields=[], settings={}), idempotency_key=new_key())
                                created_ids.append(source.id)
                                source_version = source.version
                                if case in {"retired_source", "stale_source_version"}:
                                    updated_source = await TemplateCommands.execute(db, operation="update", actor=actor,
                                        template_id=source.id, if_match=str(source_version), idempotency_key=new_key(),
                                        payload=FormTemplateUpdate(**({"is_active": False} if case == "retired_source"
                                            else {"name": "Updated source before binding"})))
                                    assert updated_source.version == source_version + 1
                                    if case == "retired_source":
                                        source_version = updated_source.version
                                binding = await db.scalar(select(EventFormTemplateBinding).where(
                                    EventFormTemplateBinding.event_id == event_id,
                                    EventFormTemplateBinding.organization_id == OWNER,
                                    EventFormTemplateBinding.purpose == purpose))
                                version = int(binding.version or 1) if binding else 1
                                payload = OperationalBindingUpdate(source_template_id=(foreign_source if case == "foreign_source" else source.id),
                                    source_version=source_version, fields=[], settings={})
                                arguments = dict(event=event, purpose=purpose, payload=payload, actor=actor,
                                    if_match=None if case == "missing_version" else str(version),
                                    idempotency_key=None if case == "missing_key" else new_key())
                                if case in {"success_replay", "changed_retry_payload", "stale_version"}:
                                    saved = await update_operational_binding(db, **arguments)
                                    created_ids.append(saved.template_id)
                                    assert saved.version == version + 1
                                    receipt = await db.scalar(select(IdempotencyRecord).where(
                                        IdempotencyRecord.idempotency_key == arguments["idempotency_key"]))
                                    assert receipt.status == "COMPLETED"
                                    audit = (await db.scalars(select(AuditLog).where(
                                        AuditLog.correlation_id == receipt.id,
                                        AuditLog.action_type == "EVENT_FORM_BINDING_UPDATED"))).one()
                                    assert audit.actor_user_id == actor_id and compute_audit_hash(audit) == audit.row_hash
                                    if case == "success_replay":
                                        replay = await update_operational_binding(db, **arguments)
                                        assert replay.model_dump(mode="json") == saved.model_dump(mode="json")
                                        assert await db.scalar(select(text("count(*)")).select_from(AuditLog).where(
                                            AuditLog.correlation_id == receipt.id,
                                            AuditLog.action_type == "EVENT_FORM_BINDING_UPDATED")) == 1
                                        checks.append({"purpose": purpose, "case": case, "expected_decision_verified": True})
                                        continue
                                    if case == "changed_retry_payload":
                                        arguments["payload"] = payload.model_copy(update={"name": "Changed retry payload"})
                                    else:
                                        arguments["idempotency_key"] = new_key()
                                expected = {"stale_version": 412, "missing_version": 428,
                                    "missing_key": 428, "foreign_source": 404, "wrong_purpose": 422,
                                    "changed_retry_payload": 409, "retired_source": 409,
                                    "stale_source_version": 412}[case]
                                before_count = await db.scalar(text("SELECT count(*) FROM design.form_templates WHERE organization_id=:owner"), {"owner": OWNER})
                                try:
                                    await update_operational_binding(db, **arguments)
                                except HTTPException as denied:
                                    assert denied.status_code == expected, (case, denied.status_code)
                                    if case == "retired_source":
                                        assert denied.detail["code"] == "SOURCE_TEMPLATE_INACTIVE"
                                else:
                                    raise RuntimeError(f"Unsafe binding write accepted: {case}")
                                assert await db.scalar(text("SELECT count(*) FROM design.form_templates WHERE organization_id=:owner"), {"owner": OWNER}) == before_count
                                if arguments["idempotency_key"] and case != "changed_retry_payload":
                                    assert await db.scalar(select(text("count(*)")).select_from(IdempotencyRecord).where(
                                        IdempotencyRecord.idempotency_key == arguments["idempotency_key"])) == 0
                                checks.append({"purpose": purpose, "case": case, "expected_decision_verified": True})
                        finally:
                            await db.rollback()
                            await transaction.rollback()
        return {"status": "PASSED", "operation": "binding-write", "checks": checks,
            "scope": "isolated_actual_runtime_login_direct_accepted_owner",
            "mandatory_audit_and_replay_verified": True, "business_changes_rolled_back": True,
            "_created_ids": created_ids}
    finally:
        from app.redis import close_redis
        await close_redis()
        await async_engine.dispose()


async def binding_read_probe(event_id, actor_id, global_category, foreign_category, foreign_root):
    import app.models
    from fastapi import HTTPException
    from sqlalchemy.ext.asyncio import AsyncSession
    from app.database import async_engine
    from app.core.tenant_context import TenantContextGuard
    from app.core.dependencies.feature_gate import enforce_event_operation
    from app.modules.identity.models.user import User
    from app.modules.events.models.event import Event
    from app.modules.registration.models.form_category import FormCategory
    from app.modules.registration.models.form_template import FormTemplate, EventFormTemplateBinding
    from app.modules.registration.application.operational_binding_commands import (
        get_operational_binding, get_operational_form_projection,
    )
    from ops.category_a_catalogue_policy_metadata import SHARED_CATALOGUE_QUERY, shared_catalogue_structure_is_safe
    checks, created_ids = [], []
    try:
        for purpose in ("SURVEY", "SPEAKER_INTAKE"):
            for defect in ("valid", "foreign_parent", "retired_parent", "retired_template", "conflicting_events",
                    "foreign_lineage", "retired_owned_lineage"):
                async with async_engine.connect() as connection:
                    transaction = await connection.begin()
                    async with AsyncSession(bind=connection, expire_on_commit=False,
                            join_transaction_mode="create_savepoint") as db:
                        try:
                            role = (await db.execute(text("""SELECT current_user AS login,rolsuper,rolbypassrls
                                FROM pg_roles WHERE rolname=current_user"""))).one()
                            assert role.login == "category_a_rehearsal_runtime_20261015" and not role.rolsuper and not role.rolbypassrls
                            assert shared_catalogue_structure_is_safe((await db.execute(SHARED_CATALOGUE_QUERY)).mappings().all())
                            async with TenantContextGuard.scoped(db, OWNER):
                                actor = await db.get(User, actor_id)
                                assert actor.platform_role is None
                                await enforce_event_operation(db, OWNER, event_id, "registration.forms.manage", user_id=actor_id)
                                event = await db.get(Event, event_id)
                                category_id = foreign_category if defect == "foreign_parent" else global_category
                                if defect == "retired_parent":
                                    category = FormCategory(organization_id=OWNER, name="Rolled-back retired parent",
                                        slug=f"runtime-read-{uuid.uuid4().hex}", is_active=False)
                                    db.add(category)
                                    await db.flush()
                                    category_id = category.id
                                if defect == "foreign_parent":
                                    assert await db.scalar(text("SELECT id FROM design.form_categories WHERE id=:id"),
                                        {"id": foreign_category}) is None
                                metadata = {"_event_id": str(event_id)}
                                if defect == "conflicting_events":
                                    metadata["event_id"] = str(uuid.uuid4())
                                if defect == "foreign_lineage":
                                    metadata["_source_template_id"] = str(foreign_root)
                                if defect == "retired_owned_lineage":
                                    root = FormTemplate(organization_id=OWNER, name="Rolled-back retired historical root",
                                        slug=f"runtime-history-{uuid.uuid4().hex}", scope_type="ORGANIZATION",
                                        category_key="survey" if purpose == "SURVEY" else "speaker_intake",
                                        fields=[], settings={}, is_active=False, deleted_at=datetime.now(timezone.utc))
                                    db.add(root)
                                    await db.flush()
                                    created_ids.append(root.id)
                                    metadata["_source_template_id"] = str(root.id)
                                template = FormTemplate(organization_id=OWNER, name="Rolled-back operational read fixture",
                                    slug=f"runtime-read-{uuid.uuid4().hex}", category_id=category_id, scope_type="EVENT",
                                    category_key="survey" if purpose == "SURVEY" else "speaker_intake",
                                    fields=[], settings=metadata, is_active=defect != "retired_template")
                                db.add(template)
                                await db.flush()
                                created_ids.append(template.id)
                                binding = await db.scalar(select(EventFormTemplateBinding).where(
                                    EventFormTemplateBinding.organization_id == OWNER,
                                    EventFormTemplateBinding.event_id == event_id, EventFormTemplateBinding.purpose == purpose))
                                if binding is None:
                                    db.add(EventFormTemplateBinding(organization_id=OWNER, event_id=event_id,
                                        template_id=template.id, purpose=purpose))
                                else:
                                    binding.template_id = template.id
                                await db.flush()
                                for public, call in ((False, get_operational_binding), (True, get_operational_form_projection)):
                                    if defect in {"valid", "retired_owned_lineage"}:
                                        result = await call(db, event=event, purpose=purpose)
                                        if public:
                                            assert result["purpose"] == purpose and "_event_id" not in result["settings"]
                                            assert "_source_template_id" not in result["settings"]
                                        else:
                                            assert result.template_id == template.id
                                    else:
                                        try:
                                            await call(db, event=event, purpose=purpose)
                                        except HTTPException as denied:
                                            assert denied.status_code == (503 if public else 409)
                                        else:
                                            raise RuntimeError("Unavailable operational hierarchy was delivered")
                                    checks.append({"purpose": purpose, "case": defect,
                                        "reader": "public" if public else "administration", "expected_decision_verified": True})
                        finally:
                            await db.rollback()
                            await transaction.rollback()
        return {"status": "PASSED", "scope": "isolated_actual_runtime_login_direct_accepted_owner",
            "operation": "binding-read", "checks": checks, "_created_ids": created_ids,
            "shared_catalogue_role_verified": True, "foreign_category_concealment_verified": True,
            "business_changes_rolled_back": True}
    finally:
        from app.redis import close_redis
        await close_redis()
        await async_engine.dispose()


async def probe(event_id, actor_id, global_source, foreign_source, keys, *, operation="update"):
    import app.models
    from fastapi import HTTPException
    from sqlalchemy.ext.asyncio import AsyncSession
    from app.database import async_engine
    from app.core.tenant_context import TenantContextGuard
    from app.modules.identity.models.user import User
    from app.modules.events.models.event import Event
    from app.modules.platform.models.idempotency import IdempotencyRecord
    from app.modules.audit.models.audit_log import AuditLog, compute_audit_hash
    from app.modules.registration.models.registration_form_config import RegistrationFormConfig
    from app.modules.registration.application.commands import RegistrationFormCommandService
    from app.modules.registration.schemas.registration_form_config import RegistrationFormConfigUpdate
    from ops.category_a_catalogue_policy_metadata import SHARED_CATALOGUE_QUERY, shared_catalogue_structure_is_safe
    results = []
    try:
        for source, key, allowed in ((global_source, keys[0], True), (foreign_source, keys[1], False)):
            async with async_engine.connect() as connection:
                transaction = await connection.begin()
                async with AsyncSession(bind=connection, expire_on_commit=False,
                        join_transaction_mode="create_savepoint") as db:
                    try:
                        role = (await db.execute(text("""SELECT current_user AS login,rolsuper,rolbypassrls
                            FROM pg_roles WHERE rolname=current_user"""))).one()
                        assert role.login == "category_a_rehearsal_runtime_20261015" and not role.rolsuper and not role.rolbypassrls
                        assert shared_catalogue_structure_is_safe((await db.execute(SHARED_CATALOGUE_QUERY)).mappings().all())
                        async with TenantContextGuard.scoped(db, OWNER):
                            actor = await db.get(User, actor_id)
                            assert actor is not None and actor.platform_role is None
                            visible = await db.scalar(text("SELECT id FROM design.form_templates WHERE id=:id"), {"id": source})
                            assert (visible == source) if allowed else (visible is None)
                            event = await db.scalar(select(Event).where(Event.id == event_id, Event.organization_id == OWNER))
                            form = await db.scalar(select(RegistrationFormConfig).where(RegistrationFormConfig.event_id == event_id))
                            version, resource_id = form.version, form.id
                            # Only transient test-state injection in this outer
                            # transaction. Ordinary callers cannot write SQL.
                            form.template_id = source
                            await db.flush()
                            command = (RegistrationFormCommandService.update if operation == "update"
                                else RegistrationFormCommandService.set_live)
                            arguments = dict(event=event, actor_user_id=actor_id, idempotency_key=key)
                            if operation == "update":
                                arguments.update(if_match=str(version), payload=RegistrationFormConfigUpdate(is_live=False))
                            else:
                                arguments.update(expected_version=version, is_live=False)
                            if allowed:
                                saved = await command(db, **arguments)
                                assert saved["version"] == version + 1
                                assert await command(db, **arguments) == saved
                                receipt = await db.scalar(select(IdempotencyRecord).where(IdempotencyRecord.idempotency_key == key))
                                assert receipt is not None and receipt.status == "COMPLETED"
                                audit = (await db.scalars(select(AuditLog).where(AuditLog.resource_id == resource_id,
                                    AuditLog.correlation_id == receipt.id))).one()
                                assert audit.actor_user_id == actor_id and compute_audit_hash(audit) == audit.row_hash
                            else:
                                try:
                                    await command(db, **arguments)
                                except HTTPException as denied:
                                    assert denied.status_code == 409 and denied.detail["code"] == "FORM_TEMPLATE_RECONCILIATION_REQUIRED"
                                else:
                                    raise RuntimeError("Foreign retained template was accepted")
                            results.append({"source_scope": "GLOBAL" if allowed else "FOREIGN_ORGANIZATION",
                                "allowed": allowed, "expected_decision_verified": True})
                    finally:
                        await db.rollback()
                        await transaction.rollback()
        guards = await raw_catalogue_guards(async_engine, global_source, foreign_source)
        return {"status": "PASSED", "scope": "isolated_actual_runtime_login_direct_accepted_owner",
            "operation": operation,
            "checks": results, "global_shared_reference_write_verified": True,
            "non_owner_runtime_role_verified": True,
            "mandatory_audit_and_replay_verified": True, "business_changes_rolled_back": True,
            "raw_catalogue_guards": guards}
    finally:
        from app.redis import close_redis
        await close_redis()
        await async_engine.dispose()


async def raw_catalogue_guards(engine, global_source, foreign_source):
    from sqlalchemy.exc import DBAPIError
    denied = []
    async with engine.connect() as connection:
        transaction = await connection.begin()
        try:
            await connection.execute(text("SELECT set_config('app.current_organization_id','',true)"))
            assert await connection.scalar(text("SELECT count(*) FROM design.form_templates")) == 0
            assert await connection.scalar(text("SELECT count(*) FROM design.form_categories")) == 0
            await connection.execute(text("SELECT set_config('app.current_organization_id',:owner,true)"), {"owner": str(OWNER)})
            assert await connection.scalar(text("SELECT count(*) FROM design.form_templates WHERE id=:id"), {"id": foreign_source}) == 0
            assert await connection.scalar(text("SELECT count(*) FROM design.form_categories WHERE organization_id=:foreign"), {"foreign": FOREIGN}) == 0
            category_id = await connection.scalar(text("SELECT category_id FROM design.form_templates WHERE id=:id"), {"id": global_source})
            assert category_id is not None
            attempts = (
                ("global_template_update", "UPDATE design.form_templates SET name=name WHERE id=:id", global_source),
                ("global_template_owner_claim", "UPDATE design.form_templates SET organization_id=:owner WHERE id=:id", global_source),
                ("global_template_delete", "DELETE FROM design.form_templates WHERE id=:id", global_source),
                ("global_category_update", "UPDATE design.form_categories SET name=name WHERE id=:id", category_id),
                ("global_category_owner_claim", "UPDATE design.form_categories SET organization_id=:owner WHERE id=:id", category_id),
                ("global_category_delete", "DELETE FROM design.form_categories WHERE id=:id", category_id),
            )
            for name, statement, resource_id in attempts:
                savepoint = await connection.begin_nested()
                try:
                    try:
                        await connection.execute(text(statement), {"id": resource_id, "owner": OWNER})
                    except DBAPIError as error:
                        assert getattr(error.orig, "sqlstate", None) == "42501"
                        denied.append(name)
                    else:
                        raise RuntimeError("Ordinary runtime context mutated the global catalogue")
                finally:
                    await savepoint.rollback()
        finally:
            await transaction.rollback()
    return {"missing_context_reads_fail_closed": True, "foreign_rows_concealed": True,
        "denied_mutations": denied}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--operation", choices=("update", "portal", "binding-read", "binding-write"), default="update")
    args = parser.parse_args()
    target = make_url(settings.DATABASE_URL_SYNC).set(database="category_a_rehearsal_20261015")
    if settings.is_production or target.host not in {"localhost", "127.0.0.1"}:
        raise RuntimeError("Only the named local rehearsal database is permitted")
    engine = create_engine(target)
    try:
        with engine.connect() as connection, connection.begin():
            connection.execute(text("SET TRANSACTION READ ONLY"))
            event_id = connection.execute(text("""SELECT e.id FROM events.events e
                JOIN platform.organizations o ON o.id=e.organization_id
                JOIN registration.registration_forms f ON f.event_id=e.id
                WHERE e.organization_id=:owner AND NOT o.is_platform_org AND o.is_active
                  AND e.deleted_at IS NULL AND NOT e.is_read_only AND NOT e.is_maintenance AND e.status='active'
                  AND EXISTS(SELECT 1 FROM commerce.event_commercial_contracts c WHERE c.event_id=e.id AND c.status='ACTIVE')
                ORDER BY e.id LIMIT 1"""), {"owner": OWNER}).scalar_one()
            actor_id = connection.execute(text("""SELECT u.id FROM identity.users u
                JOIN organizer_access.organization_members m ON m.user_id=u.id
                WHERE m.organization_id=:owner AND m.org_role='owner' AND m.is_active AND m.accepted_at IS NOT NULL
                  AND u.is_active AND u.deleted_at IS NULL AND u.platform_role IS NULL ORDER BY u.id LIMIT 1"""),
                {"owner": OWNER}).scalar_one()
            global_source = connection.execute(text("""SELECT t.id FROM design.form_templates t
                LEFT JOIN design.form_categories c ON c.id=t.category_id
                WHERE t.organization_id IS NULL AND t.scope_type='GLOBAL' AND t.category_key='registration'
                  AND t.is_active AND t.deleted_at IS NULL
                  AND (t.category_id IS NULL OR (c.organization_id IS NULL AND c.is_active AND c.deleted_at IS NULL))
                ORDER BY t.id LIMIT 1""")).scalar_one()
            foreign_source = connection.execute(text("""SELECT id FROM design.form_templates
                WHERE organization_id=:foreign AND scope_type='ORGANIZATION' AND is_active AND deleted_at IS NULL
                ORDER BY id LIMIT 1"""), {"foreign": FOREIGN}).scalar_one()
            original = state(connection, event_id)
            original_bindings = binding_state(connection, event_id)
            if args.operation == "binding-read":
                original_bindings = binding_state(connection, event_id)
                global_category = connection.execute(text("SELECT category_id FROM design.form_templates WHERE id=:id"),
                    {"id": global_source}).scalar_one()
                foreign_category = connection.execute(text("""SELECT id FROM design.form_categories
                    WHERE organization_id=:foreign AND is_active AND deleted_at IS NULL ORDER BY id LIMIT 1"""),
                    {"foreign": FOREIGN}).scalar_one()
        password = secrets.token_urlsafe(40)
        raw = engine.raw_connection()
        try:
            with raw.cursor() as cursor:
                upsert_login(cursor, "category_a_rehearsal_runtime_20261015", password, "event_runtime")
            raw.commit()
        finally:
            raw.close()
        settings.DATABASE_URL_ASYNC = target.set(drivername="postgresql+asyncpg",
            username="category_a_rehearsal_runtime_20261015", password=password).render_as_string(hide_password=False)
        keys = [f"runtime-registration-{args.operation}-{uuid.uuid4()}" for _ in range(2)]
        result = (asyncio.run(binding_write_probe(event_id, actor_id, foreign_source, keys))
            if args.operation == "binding-write" else
            asyncio.run(binding_read_probe(event_id, actor_id, global_category, foreign_category, foreign_source))
            if args.operation == "binding-read" else
            asyncio.run(probe(event_id, actor_id, global_source, foreign_source, keys, operation=args.operation)))
        with engine.connect() as connection, connection.begin():
            connection.execute(text("SET TRANSACTION READ ONLY"))
            assert state(connection, event_id) == original
            if args.operation in {"binding-read", "binding-write"}:
                assert binding_state(connection, event_id) == original_bindings
                assert connection.execute(text("SELECT count(*) FROM design.form_templates WHERE id=ANY(:ids)"),
                    {"ids": result.pop("_created_ids")}).scalar_one() == 0
                result["independent_binding_restoration_verified"] = True
            assert connection.execute(text("SELECT count(*) FROM platform.idempotency_records WHERE idempotency_key=ANY(:keys)"),
                {"keys": keys}).scalar_one() == 0
        result["independent_original_state_restoration_verified"] = True
        output = Path(__file__).parents[1] / {"update": "test-results/category-a-registration-writer-runtime.json",
            "portal": "test-results/category-a-registration-portal-publication-runtime.json",
            "binding-read": "test-results/category-a-operational-binding-read-runtime.json",
            "binding-write": "test-results/category-a-operational-binding-write-runtime.json"}[args.operation]
        output.write_text(json.dumps(result, indent=2), encoding="utf-8")
        print(json.dumps(result, indent=2))
        return 0
    finally:
        engine.dispose()


if __name__ == "__main__":
    raise SystemExit(main())
