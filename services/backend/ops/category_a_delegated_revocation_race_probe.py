"""Committed restricted-login delegated writers versus real client suspension.

Only an explicitly provisioned isolated clone is permitted. Business state is
retained in that clone for independent inspection; the parent quarantines it.
"""
import argparse
import asyncio
from contextlib import asynccontextmanager
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import sys
import uuid

sys.path.insert(0, str(Path(__file__).parents[1]))
from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import make_url
from app.config import settings
from ops.bootstrap_cloud_database import upsert_login

EMC = uuid.UUID("95424c7f-785a-49da-9f7d-66f015cb19a6")
RUNTIME_LOGIN = os.environ.get(
    "CATEGORY_A_RUNTIME_LOGIN", "category_a_rehearsal_runtime_20261015"
)
if not re.fullmatch(
    r"(?:category_a_rehearsal_runtime_20261015|category_a_form_[0-9a-f]{12})",
    RUNTIME_LOGIN,
):
    raise RuntimeError("Invalid isolated Category A runtime login")


async def run(fixture, actor_id, member_id, workspace_scope=False):
    import app.models
    from fastapi import HTTPException
    from sqlalchemy.ext.asyncio import AsyncSession
    from app.database import async_engine
    from app.dependencies import TokenData
    from app.core.tenant_context import TenantContextGuard
    from app.modules.identity.models.user import User
    from app.modules.identity.services.auth_service import persist_refresh_token
    from app.modules.events.models.event import Event
    from app.modules.rbac.schemas.client_relationships import RelationshipRequest, RelationshipTransition
    from app.modules.rbac.services.client_relationships import request_relationship, transition_relationship
    from app.modules.registration.models.registration_form_config import RegistrationFormConfig
    from app.modules.registration.models.form_template import EventFormTemplateBinding
    from app.modules.registration.application.commands import RegistrationFormCommandService
    from app.modules.registration.application.operational_binding_commands import update_operational_binding
    from app.modules.registration.schemas.registration_form_config import RegistrationFormConfigUpdate
    from app.modules.registration.schemas.operational_binding import OperationalBindingUpdate
    from app.modules.platform.models.idempotency import IdempotencyRecord
    from app.modules.audit.models.audit_log import AuditLog, compute_audit_hash

    client, owner_id, event_id = map(uuid.UUID, (fixture["organization_id"], fixture["actor_id"], fixture["event_id"]))
    checks = []
    retry = lambda: f"committed-delegated-race-{uuid.uuid4()}"

    @asynccontextmanager
    async def session():
        async with AsyncSession(async_engine, expire_on_commit=False) as db:
            await db.execute(text("SET LOCAL statement_timeout='20000'"))
            role = (await db.execute(text("SELECT current_user,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user"))).one()
            assert role.current_user == RUNTIME_LOGIN and not role.rolsuper and not role.rolbypassrls
            yield db

    try:
        async with session() as db:
            async with TenantContextGuard.scoped(db, client):
                workspace_id = await db.scalar(select(Event.operational_workspace_id).where(Event.id == event_id))
            async with TenantContextGuard.scoped(db, EMC):
                actor = await db.get(User, actor_id)
                requested = await request_relationship(db, actor, EMC, RelationshipRequest(
                    client_organization_id=client, reason="Isolated independently committed revocation ordering",
                    scopes=[{"member_id": member_id, "workspace_id": workspace_id, "event_id": None if workspace_scope else event_id,
                        "actions": ["REG_CONFIG:FORM"]}]), retry())
            relationship_id = uuid.UUID(requested["id"])
            async with TenantContextGuard.scoped(db, client):
                owner = await db.get(User, owner_id)
                relationship = await transition_relationship(db, owner, client, relationship_id,
                    RelationshipTransition(action="accept", reason="Explicit synthetic client owner consent"), requested["version"], retry())
            async with TenantContextGuard.scoped(db, EMC):
                refresh = await persist_refresh_token(db, actor, secrets.token_urlsafe(40), access_mode="DELEGATED",
                    active_organization_id=client, acting_organization_id=EMC, active_workspace_id=workspace_id,
                    active_event_id=None if workspace_scope else event_id, relationship_id=relationship_id)
                family_id, actor_role = refresh.family_id, actor.role
                await db.commit()
        selector = TokenData(user_id=actor_id, role=actor_role, organization_id=EMC, jti=str(uuid.uuid4()),
            session_id=family_id, access_mode="DELEGATED", active_organization_id=client,
            acting_organization_id=EMC, active_workspace_id=workspace_id, active_event_id=None if workspace_scope else event_id,
            relationship_id=relationship_id)

        async def transition(db, action, expected):
            async with TenantContextGuard.scoped(db, client):
                owner = await db.get(User, owner_id, populate_existing=True)
                return await transition_relationship(db, owner, client, relationship_id,
                    RelationshipTransition(action=action, reason="Client-owned committed concurrency acceptance"), expected, retry())

        async def write(db, purpose, key):
            async with TenantContextGuard.scoped(db, EMC):
                actor = await db.get(User, actor_id, populate_existing=True)
            db.info.update(customer_request_identity=actor_id, customer_request_selector=selector)
            actor._request_token_data = selector
            try:
                async with TenantContextGuard.scoped(db, client):
                    event = await db.get(Event, event_id, populate_existing=True)
                    source = uuid.UUID(fixture["source_ids"][purpose])
                    if purpose == "REGISTRATION":
                        row = await db.scalar(select(RegistrationFormConfig).where(RegistrationFormConfig.event_id == event_id))
                        return await RegistrationFormCommandService.update(db, event=event, actor_user_id=actor_id,
                            if_match=str(row.version if row else 1), idempotency_key=key,
                            payload=RegistrationFormConfigUpdate(template_id=source, fields=[], settings={}))
                    row = await db.scalar(select(EventFormTemplateBinding).where(EventFormTemplateBinding.event_id == event_id,
                        EventFormTemplateBinding.purpose == purpose))
                    result = await update_operational_binding(db, event=event, actor=actor, purpose=purpose,
                        if_match=str(row.version if row else 1), idempotency_key=key,
                        payload=OperationalBindingUpdate(source_template_id=source, source_version=1, fields=[], settings={}))
                    return result.model_dump(mode="json")
            finally:
                db.info.pop("customer_request_identity", None)
                db.info.pop("customer_request_selector", None)
                actor.__dict__.pop("_request_token_data", None)

        async def blocked(observer, pid, task):
            async def observe():
                while not await observer.scalar(text("SELECT cardinality(pg_blocking_pids(:pid))>0"), {"pid": pid}):
                    if task.done():
                        task.result()
                        raise RuntimeError("Competing command did not wait for the authority lock")
                    await asyncio.sleep(0.02)
            await asyncio.wait_for(observe(), 10)

        async def denied_write(purpose, key, existing_receipt=False):
            async with session() as db:
                try:
                    await write(db, purpose, key)
                except HTTPException as error:
                    assert error.status_code == 404
                else:
                    raise RuntimeError("Write was admitted after committed suspension")
            async with session() as observer, TenantContextGuard.scoped(observer, client):
                receipt_id = await observer.scalar(select(IdempotencyRecord.id).where(IdempotencyRecord.idempotency_key == key))
                assert (receipt_id is not None) == existing_receipt

        for purpose in ("REGISTRATION", "SURVEY", "SPEAKER_INTAKE"):
            for ordering in ("suspension_first", "writer_first"):
                if relationship["status"] == "SUSPENDED":
                    async with session() as db:
                        relationship = await transition(db, "resume", relationship["version"])
                key, task = retry(), None
                # Holding the command's real commit as a savepoint lets us
                # observe its locks, then release the outer transaction as an
                # actual cross-connection commit. No command is mocked.
                try:
                    async with async_engine.connect() as holder_connection:
                        outer = await holder_connection.begin()
                        try:
                            async with AsyncSession(bind=holder_connection, expire_on_commit=False,
                                    join_transaction_mode="create_savepoint") as holder, session() as contender:
                                pid = await contender.scalar(text("SELECT pg_backend_pid()"))
                                if ordering == "suspension_first":
                                    relationship = await transition(holder, "suspend", relationship["version"])
                                    async def attempt():
                                        try:
                                            await write(contender, purpose, key)
                                        except HTTPException as error:
                                            assert error.status_code == 404
                                            return "DENIED"
                                        raise RuntimeError("Waiting writer ignored committed suspension")
                                    task = asyncio.create_task(attempt())
                                else:
                                    saved = await write(holder, purpose, key)
                                    task = asyncio.create_task(transition(contender, "suspend", relationship["version"]))
                                await blocked(holder, pid, task)
                                await holder.close()
                                await outer.commit()
                                outcome = await asyncio.wait_for(task, 20)
                                if ordering == "suspension_first":
                                    assert outcome == "DENIED"
                                else:
                                    relationship = outcome
                                assert relationship["status"] == "SUSPENDED"
                        finally:
                            if outer.is_active:
                                await outer.rollback()
                    async with session() as observer, TenantContextGuard.scoped(observer, client):
                        receipt = await observer.scalar(select(IdempotencyRecord).where(IdempotencyRecord.idempotency_key == key))
                        assert (receipt is not None) == (ordering == "writer_first")
                        if receipt:
                            assert receipt.status == "COMPLETED" and receipt.actor_id == actor_id and receipt.organization_id == client
                            action = "REGISTRATION_FORM_UPDATED" if purpose == "REGISTRATION" else "EVENT_FORM_BINDING_UPDATED"
                            audits = list((await observer.scalars(select(AuditLog).where(AuditLog.correlation_id == receipt.id,
                                AuditLog.action_type == action))).all())
                            assert len(audits) == 1 and compute_audit_hash(audits[0]) == audits[0].row_hash
                            assert audits[0].new_state["access_mode"] == "DELEGATED"
                            assert audits[0].new_state["acting_organization_id"] == str(EMC)
                            assert receipt.response_body == saved
                    await denied_write(purpose, retry())
                    if ordering == "writer_first":
                        # Replay is not an authority bypass after revocation.
                        await denied_write(purpose, key, existing_receipt=True)
                    checks.append(dict(purpose=purpose, ordering=ordering, blocking_observed=True,
                        independent_commit_verified=True, post_suspension_write_denied=True))
                finally:
                    if task is not None and not task.done():
                        task.cancel()
                        await asyncio.gather(task, return_exceptions=True)
        return dict(status="PASSED", checks=checks, relationship_id=str(relationship_id),
            relationship_version=relationship["version"], independent_final_state_verified=True,
            committed_fixture_state_retained=True, http_browser_multi_replica_acceptance="NOT_RUN")
    finally:
        from app.redis import close_redis
        await close_redis()
        await async_engine.dispose()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--isolated-fixture", required=True, type=Path)
    parser.add_argument("--workspace-scope", action="store_true")
    args = parser.parse_args()
    if args.isolated_fixture.stat().st_size > 4096:
        raise SystemExit("Fixture manifest exceeds budget")
    fixture = json.loads(args.isolated_fixture.read_text(encoding="utf-8"))
    if fixture.get("purpose") != "isolated_delegated_runtime_acceptance" or not re.fullmatch(
            r"category_a_restore_\d{8}_[0-9a-f]{12}", fixture.get("database", "")):
        raise SystemExit("Only an isolated delegated acceptance clone is permitted")
    target = make_url(settings.DATABASE_URL_SYNC).set(database=fixture["database"])
    if settings.is_production or settings.ALLOW_TEST_CAPABILITY_BYPASS or target.host not in {"localhost", "127.0.0.1"}:
        raise SystemExit("Only local enforced acceptance is permitted")
    engine = create_engine(target)
    result = dict(status="FAILED", database=target.database, organization_id=fixture["organization_id"],
        scope="WORKSPACE" if args.workspace_scope else "EVENT")
    try:
        with engine.connect() as db:
            assert db.scalar(text("SELECT count(*) FROM pg_stat_activity WHERE usename=:login"), {"login": RUNTIME_LOGIN}) == 0
            actor_id, member_id = db.execute(text("""SELECT u.id,m.id FROM identity.users u JOIN organizer_access.organization_members m ON m.user_id=u.id
                WHERE m.organization_id=:emc AND m.org_role='owner' AND m.is_active AND m.accepted_at IS NOT NULL
                AND u.is_active AND u.platform_role IS NULL ORDER BY u.id LIMIT 1"""), {"emc": EMC}).one()
        password = secrets.token_urlsafe(40)
        raw = engine.raw_connection()
        try:
            with raw.cursor() as cursor:
                upsert_login(cursor, RUNTIME_LOGIN, password, "event_runtime")
            raw.commit()
        finally:
            raw.close()
        runtime = target.set(username=RUNTIME_LOGIN, password=password)
        from app.core.database_security import enforce_runtime_database_login
        enforce_runtime_database_login(runtime)
        settings.DATABASE_URL_ASYNC = runtime.set(drivername="postgresql+asyncpg").render_as_string(hide_password=False)
        result.update(asyncio.run(run(fixture, actor_id, member_id, args.workspace_scope)))
        with engine.connect() as db, db.begin():
            db.execute(text("SET TRANSACTION READ ONLY"))
            observed = db.execute(text("SELECT status,version FROM organizer_access.emc_client_relationships WHERE id=:id AND client_organization_id=:client"),
                {"id": uuid.UUID(result["relationship_id"]), "client": uuid.UUID(fixture["organization_id"])}).one()
            assert observed.status == "SUSPENDED" and observed.version == result["relationship_version"]
            forms = db.execute(text("SELECT version FROM registration.registration_forms WHERE event_id=:event"),
                {"event": uuid.UUID(fixture["event_id"])}).scalars().all()
            bindings = db.execute(text("SELECT purpose,version FROM design.event_form_template_bindings WHERE event_id=:event"),
                {"event": uuid.UUID(fixture["event_id"])}).all()
            assert forms == [2] and {(row.purpose, row.version) for row in bindings} == {("SURVEY", 2), ("SPEAKER_INTAKE", 2)}
            copies = db.execute(text("""SELECT id FROM design.form_templates WHERE organization_id=:client AND scope_type='EVENT'
                AND is_active AND deleted_at IS NULL AND settings->>'_event_id'=:event"""),
                {"client": uuid.UUID(fixture["organization_id"]), "event": fixture["event_id"]}).scalars().all()
            assert len(copies) == 3
            result["independent_operator_state"] = dict(relationship_status=observed.status,
                relationship_version=observed.version, registration_version=forms[0], binding_count=len(bindings), active_event_copies=len(copies))
    except Exception as error:
        import traceback
        result.update(error_type=type(error).__name__, failure_sites=[dict(file=Path(frame.filename).name,
            line=frame.lineno, function=frame.name) for frame in traceback.extract_tb(error.__traceback__)
            if "site-packages" not in frame.filename])
        if isinstance(getattr(error, "detail", None), dict):
            result["denial_code"] = error.detail.get("code")
    finally:
        engine.dispose()
    result["probe_sha256"] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    output = Path(__file__).parents[1] / f"test-results/category-a-delegated-revocation-runtime-{uuid.uuid4().hex}.json"
    with output.open("x", encoding="utf-8") as artifact:
        json.dump(result, artifact, indent=2)
    print(json.dumps(result, indent=2))
    print(f"Evidence: {output.name}")
    return 0 if result["status"] == "PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
