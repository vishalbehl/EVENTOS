"""Restricted-role consent/scope/revocation proof, entirely outer-rolled-back.

Only the named local rehearsal database and approved synthetic parties are used.
Default mode proves admission only. The explicit isolated-fixture mode also
executes commercially entitled registration/survey/speaker writes and denials.
"""
import asyncio
import argparse
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
from bootstrap_cloud_database import upsert_login

EMC = uuid.UUID("95424c7f-785a-49da-9f7d-66f015cb19a6")
CLIENT = uuid.UUID("bf57237a-6c47-4bbd-a5fc-33868db8a9f8")
RUNTIME_LOGIN = os.environ.get(
    "CATEGORY_A_RUNTIME_LOGIN", "category_a_rehearsal_runtime_20261015"
)
if not re.fullmatch(
    r"(?:category_a_rehearsal_runtime_20261015|category_a_form_[0-9a-f]{12})",
    RUNTIME_LOGIN,
):
    raise RuntimeError("Invalid isolated Category A runtime login")


async def probe(actor_id, owner_id, member_id, event_id, workspace_id, keys, client_id=CLIENT, binding_sources=None, workspace_scope=False):
    import app.models
    from fastapi import HTTPException
    from sqlalchemy.ext.asyncio import AsyncSession
    from app.database import async_engine
    from app.dependencies import TokenData
    from app.core.tenant_context import TenantContextGuard
    from app.modules.identity.models.user import User
    from app.modules.identity.services.auth_service import persist_refresh_token
    from app.modules.rbac.schemas.client_relationships import RelationshipRequest, RelationshipTransition
    from app.modules.rbac.services.client_relationships import request_relationship, transition_relationship
    from app.modules.rbac.services.access_contexts import actor_request_context
    from app.modules.rbac.services.delegated_access import delegated_request_context
    from app.modules.registration.application.category_commands import category_authority
    from app.modules.registration.application.operational_binding_commands import update_operational_binding
    from app.modules.registration.schemas.operational_binding import OperationalBindingUpdate
    from app.modules.registration.models.form_template import EventFormTemplateBinding
    from app.modules.registration.models.registration_form_config import RegistrationFormConfig
    from app.modules.registration.application.commands import RegistrationFormCommandService
    from app.modules.registration.schemas.registration_form_config import RegistrationFormConfigUpdate
    from app.modules.events.models.event import Event
    from app.modules.platform.models.idempotency import IdempotencyRecord
    from app.modules.audit.models.audit_log import AuditLog, compute_audit_hash
    from types import SimpleNamespace
    checks = []

    def key():
        value = f"delegated-runtime-{uuid.uuid4()}"
        keys.append(value)
        return value

    async def denied(call, expected, name):
        try:
            await call()
        except HTTPException as error:
            assert error.status_code == expected, (name, error.status_code)
        else:
            raise RuntimeError(f"Expected scope denial missing: {name}")
        checks.append(name)

    try:
        async with async_engine.connect() as connection:
            transaction = await connection.begin()
            async with AsyncSession(bind=connection, expire_on_commit=False,
                    join_transaction_mode="create_savepoint") as db:
                try:
                    role = (await db.execute(text("SELECT current_user AS login,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user"))).one()
                    assert role.login == RUNTIME_LOGIN and not role.rolsuper and not role.rolbypassrls
                    async with TenantContextGuard.scoped(db, EMC):
                        actor = await db.get(User, actor_id)
                        assert actor.platform_role is None
                        request = await request_relationship(db, actor, EMC,
                            RelationshipRequest(client_organization_id=client_id, reason="Isolated runtime consent proof",
                                scopes=[{"member_id": member_id, "workspace_id": workspace_id,
                                    "event_id": None if workspace_scope else event_id, "actions": ["REG_CONFIG:FORM"]}]), key())
                    relationship_id = uuid.UUID(request["id"])

                    async def unapproved():
                        async with delegated_request_context(db, actor, emc_organization_id=EMC,
                                client_organization_id=client_id, relationship_id=relationship_id,
                                workspace_id=workspace_id, event_id=event_id, action="REG_CONFIG:FORM"):
                            pass
                    await denied(unapproved, 404, "requested_relationship_has_no_access")
                    async with TenantContextGuard.scoped(db, client_id):
                        owner = await db.get(User, owner_id)
                        active = await transition_relationship(db, owner, client_id, relationship_id,
                            RelationshipTransition(action="accept", reason="Explicit synthetic client owner approval"),
                            request["version"], key())
                    async with TenantContextGuard.scoped(db, EMC):
                        session = await persist_refresh_token(db, actor, secrets.token_urlsafe(40),
                            access_mode="DELEGATED", active_organization_id=client_id, acting_organization_id=EMC,
                            active_workspace_id=workspace_id, active_event_id=None if workspace_scope else event_id, relationship_id=relationship_id)
                        session_id = session.id
                        await db.commit()
                    selector = TokenData(user_id=actor_id, role=actor.role, organization_id=EMC,
                        jti=str(uuid.uuid4()), session_id=session.family_id, access_mode="DELEGATED",
                        active_organization_id=client_id, acting_organization_id=EMC,
                        active_workspace_id=workspace_id, active_event_id=None if workspace_scope else event_id, relationship_id=relationship_id)

                    @asynccontextmanager
                    async def selected():
                        nonlocal actor
                        # A denied command rolls its transaction back and
                        # expires ORM identities. Real subsequent requests
                        # reload identity; this reused-session probe must too.
                        async with TenantContextGuard.scoped(db, EMC):
                            actor = await db.get(User, actor_id, populate_existing=True)
                            assert actor is not None and actor.platform_role is None
                        db.info.update(customer_request_selector=selector, customer_request_identity=actor_id)
                        actor._request_token_data = selector
                        try:
                            async with TenantContextGuard.scoped(db, client_id):
                                yield
                        finally:
                            db.info.pop("customer_request_selector", None)
                            db.info.pop("customer_request_identity", None)
                            actor.__dict__.pop("_request_token_data", None)

                    async def admit(action="REG_CONFIG:FORM", target_event=event_id):
                        async with selected():
                            async with actor_request_context(db, actor_id, client_id, event_id=target_event, action=action):
                                pass
                    await admit()
                    checks.append("client_approved_form_action_admitted")
                    async def bindings(allowed, label):
                        if not binding_sources:
                            return
                        for purpose in ("REGISTRATION", "SURVEY", "SPEAKER_INTAKE"):
                            retry = key()
                            source = uuid.UUID(binding_sources[purpose])
                            async def write():
                                async with selected():
                                    if purpose == "REGISTRATION":
                                        form = await db.scalar(select(RegistrationFormConfig).where(RegistrationFormConfig.event_id == event_id))
                                        event = await db.get(Event, event_id, populate_existing=True)
                                        arguments = dict(event=event, actor_user_id=actor_id,
                                            if_match=str(form.version if form else 1), idempotency_key=retry,
                                            payload=RegistrationFormConfigUpdate(template_id=source, fields=[], settings={}))
                                        command = lambda: RegistrationFormCommandService.update(db, **arguments)
                                        audit_action = "REGISTRATION_FORM_UPDATED"
                                    else:
                                        binding = await db.scalar(select(EventFormTemplateBinding).where(
                                            EventFormTemplateBinding.event_id == event_id,
                                            EventFormTemplateBinding.purpose == purpose))
                                        arguments = dict(event=SimpleNamespace(id=event_id, organization_id=client_id),
                                            actor=actor, purpose=purpose, if_match=str(binding.version if binding else 1),
                                            idempotency_key=retry, payload=OperationalBindingUpdate(
                                                source_template_id=source, source_version=1, fields=[], settings={}))
                                        command = lambda: update_operational_binding(db, **arguments)
                                        audit_action = "EVENT_FORM_BINDING_UPDATED"
                                    saved = await command()
                                    if allowed:
                                        replay = await command()
                                        assert (replay == saved if purpose == "REGISTRATION" else
                                            replay.model_dump(mode="json") == saved.model_dump(mode="json"))
                                        receipt = await db.scalar(select(IdempotencyRecord).where(IdempotencyRecord.idempotency_key == retry))
                                        assert receipt.status == "COMPLETED" and receipt.organization_id == client_id and receipt.actor_id == actor_id
                                        audits = list((await db.scalars(select(AuditLog).where(AuditLog.correlation_id == receipt.id,
                                            AuditLog.action_type == audit_action))).all())
                                        assert len(audits) == 1
                                        audit = audits[0]
                                        assert audit.organization_id == client_id and audit.actor_user_id == actor_id
                                        assert audit.new_state["access_mode"] == "DELEGATED"
                                        assert audit.new_state["acting_organization_id"] == str(EMC)
                                        assert audit.new_state["target_organization_id"] == str(client_id)
                                        assert compute_audit_hash(audit) == audit.row_hash
                            if allowed:
                                await write()
                                checks.append(f"{purpose.lower()}_{label}_save_replay_audit")
                            else:
                                await denied(write, 404, f"{purpose.lower()}_{label}_write_denied")
                                async with TenantContextGuard.scoped(db, client_id):
                                    assert await db.scalar(select(IdempotencyRecord.id).where(IdempotencyRecord.idempotency_key == retry)) is None
                    await bindings(True, "active")
                    await denied(lambda: admit("PAYMENTS:PRICING"), 403, "billing_not_inherited")
                    await denied(lambda: admit(target_event=uuid.uuid4()), 404, "foreign_event_concealed")
                    async def catalogue():
                        async with selected():
                            await category_authority(db, actor, "CUSTOMER")
                    await denied(catalogue, 403, "organisation_catalogue_administration_denied")
                    async with TenantContextGuard.scoped(db, client_id):
                        owner = await db.get(User, owner_id, populate_existing=True)
                        suspended = await transition_relationship(db, owner, client_id, relationship_id,
                            RelationshipTransition(action="suspend", reason="Synthetic client suspends access"),
                            active["version"], key())
                    await denied(admit, 404, "old_selector_denied_after_committed_suspension")
                    await bindings(False, "suspended")
                    async with TenantContextGuard.scoped(db, client_id):
                        owner = await db.get(User, owner_id, populate_existing=True)
                        await transition_relationship(db, owner, client_id, relationship_id,
                            RelationshipTransition(action="detach", reason="Synthetic client detaches EMC"),
                            suspended["version"], key())
                    await denied(admit, 404, "old_selector_denied_after_committed_detachment")
                    await bindings(False, "detached")
                    return {"status": "PASSED", "checks": checks,
                        "temporary_relationship_id": str(relationship_id), "temporary_session_id": str(session_id),
                        "business_mutation_acceptance": "PASSED_SCOPED_REGISTRATION_SURVEY_SPEAKER_WRITES" if binding_sources else
                            "NOT_PROVEN_CLIENT_EVENT_HAS_NO_ACTIVE_CONTRACT"}
                finally:
                    await db.rollback()
                    await transaction.rollback()
    finally:
        from app.redis import close_redis
        await close_redis()
        await async_engine.dispose()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--isolated-fixture", type=Path)
    parser.add_argument("--workspace-scope", action="store_true")
    args = parser.parse_args()
    fixture = None
    client_id = CLIENT
    if args.isolated_fixture:
        if args.isolated_fixture.stat().st_size > 4096:
            raise RuntimeError("Oversized fixture manifest")
        fixture = json.loads(args.isolated_fixture.read_text(encoding="utf-8"))
        if fixture.get("purpose") != "isolated_delegated_runtime_acceptance" or not re.fullmatch(
                r"category_a_restore_\d{8}_[0-9a-f]{12}", fixture.get("database", "")):
            raise RuntimeError("Only an isolated delegated fixture is permitted")
        client_id = uuid.UUID(fixture["organization_id"])
    target = make_url(settings.DATABASE_URL_SYNC).set(database=fixture["database"] if fixture else "category_a_rehearsal_20261015")
    if settings.is_production or settings.ALLOW_TEST_CAPABILITY_BYPASS or target.host not in {"localhost", "127.0.0.1"}:
        raise RuntimeError("Only the named local rehearsal database is permitted")
    engine = create_engine(target)
    keys = []
    def emit(result):
        result.update(database=target.database, organization_id=str(client_id),
            scope="WORKSPACE" if args.workspace_scope else "EVENT",
            probe_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest())
        output = Path(__file__).parents[1] / f"test-results/category-a-delegated-form-runtime-{uuid.uuid4().hex}.json"
        with output.open("x", encoding="utf-8") as artifact:
            json.dump(result, artifact, indent=2)
        print(json.dumps(result, indent=2))
        print(f"Evidence: {output.name}")
    try:
        with engine.connect() as db, db.begin():
            db.execute(text("SET TRANSACTION READ ONLY"))
            assert db.scalar(text("SELECT count(*) FROM pg_stat_activity WHERE usename=:login"), {"login": RUNTIME_LOGIN}) == 0
            assert db.scalar(text("SELECT count(*) FROM platform.organizations WHERE id IN (:emc,:client) AND NOT is_platform_org AND is_active AND suspended_at IS NULL"), {"emc": EMC, "client": client_id}) == 2
            assert db.scalar(text("SELECT organization_kind FROM platform.organizations WHERE id=:id"), {"id": EMC}) == "EMC"
            assert db.scalar(text("SELECT organization_kind FROM platform.organizations WHERE id=:id"), {"id": client_id}) == "CLIENT"
            assert db.scalar(text("SELECT count(*) FROM organizer_access.emc_client_relationships WHERE client_organization_id=:id"), {"id": client_id}) == 0
            def owner(org):
                return db.execute(text("SELECT u.id,m.id FROM identity.users u JOIN organizer_access.organization_members m ON m.user_id=u.id WHERE m.organization_id=:org AND m.org_role='owner' AND m.is_active AND m.accepted_at IS NOT NULL AND u.is_active AND u.deleted_at IS NULL AND u.platform_role IS NULL ORDER BY u.id LIMIT 1"), {"org": org}).one()
            actor_id, member_id = owner(EMC)
            owner_id, _ = owner(client_id)
            event_id, workspace_id = db.execute(text("SELECT id,operational_workspace_id FROM events.events WHERE organization_id=:org AND deleted_at IS NULL ORDER BY id LIMIT 1"), {"org": client_id}).one()
            if fixture:
                assert event_id == uuid.UUID(fixture["event_id"]) and owner_id == uuid.UUID(fixture["actor_id"])
            original = list(db.execute(text("SELECT organization_id,revision FROM organizer_access.organization_access_revisions WHERE organization_id IN (:emc,:client) ORDER BY organization_id"), {"emc": EMC, "client": client_id}))
            original_bindings = list(db.execute(text("SELECT id,template_id,purpose,version FROM design.event_form_template_bindings WHERE event_id=:event ORDER BY id"), {"event": event_id}))
            original_templates = db.scalar(text("SELECT count(*) FROM design.form_templates WHERE organization_id=:client"), {"client": client_id})
            original_registration = list(db.scalars(text("SELECT to_jsonb(f)::text FROM registration.registration_forms f WHERE event_id=:event ORDER BY id"), {"event": event_id}))
        password = secrets.token_urlsafe(40)
        raw = engine.raw_connection()
        try:
            with raw.cursor() as cursor:
                upsert_login(cursor, RUNTIME_LOGIN, password, "event_runtime")
            raw.commit()
        finally:
            raw.close()
        settings.DATABASE_URL_ASYNC = target.set(drivername="postgresql+asyncpg", username=RUNTIME_LOGIN, password=password).render_as_string(hide_password=False)
        from app.core.database_security import enforce_runtime_database_login
        enforce_runtime_database_login(target.set(username=RUNTIME_LOGIN, password=password))
        result = asyncio.run(probe(actor_id, owner_id, member_id, event_id, workspace_id, keys, client_id,
            fixture.get("source_ids") if fixture else None, args.workspace_scope))
        with engine.connect() as db, db.begin():
            db.execute(text("SET TRANSACTION READ ONLY"))
            assert list(db.execute(text("SELECT organization_id,revision FROM organizer_access.organization_access_revisions WHERE organization_id IN (:emc,:client) ORDER BY organization_id"), {"emc": EMC, "client": client_id})) == original
            assert list(db.execute(text("SELECT id,template_id,purpose,version FROM design.event_form_template_bindings WHERE event_id=:event ORDER BY id"), {"event": event_id})) == original_bindings
            assert db.scalar(text("SELECT count(*) FROM design.form_templates WHERE organization_id=:client"), {"client": client_id}) == original_templates
            assert list(db.scalars(text("SELECT to_jsonb(f)::text FROM registration.registration_forms f WHERE event_id=:event ORDER BY id"), {"event": event_id})) == original_registration
            for table, identity in (("organizer_access.emc_client_relationships", result["temporary_relationship_id"]),
                                    ("identity.refresh_tokens", result["temporary_session_id"])):
                assert db.scalar(text(f"SELECT count(*) FROM {table} WHERE id=:id"), {"id": uuid.UUID(identity)}) == 0
            assert db.scalar(text("SELECT count(*) FROM platform.idempotency_records WHERE idempotency_key=ANY(:keys)"), {"keys": keys}) == 0
        result.update(independent_rollback_verified=True, independent_original_state_and_receipts_restored=True)
        emit(result)
    except Exception as error:
        result = {"status": "FAILED", "error_type": type(error).__name__}
        if isinstance(getattr(error, "detail", None), dict):
            result["denial_code"] = error.detail.get("code")
            result["denied_feature"] = error.detail.get("feature")
        # Stack file/line identifiers are useful diagnostics; never serialize
        # exception SQL, credentials, parameter values or customer documents.
        import traceback
        result["failure_sites"] = [{"file": Path(frame.filename).name, "line": frame.lineno,
            "function": frame.name} for frame in traceback.extract_tb(error.__traceback__)
            if "site-packages" not in frame.filename]
        emit(result)
        return 1
    finally:
        engine.dispose()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
