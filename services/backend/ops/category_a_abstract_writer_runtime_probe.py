"""Real restricted-role abstract saves on the approved local synthetic tenant.

All generated business records/receipts/audits are outer-rolled-back. This does
not certify HTTP/browser, delegated business operation or concurrency acceptance.
"""
import asyncio
import argparse
from datetime import datetime, timezone
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
from ops.category_a_backup_restore_rehearsal import OWNER, FOREIGN, SOURCE


RUNTIME_LOGIN = os.environ.get(
    "CATEGORY_A_RUNTIME_LOGIN", "category_a_rehearsal_runtime_20261015"
)
if not re.fullmatch(
    r"(?:category_a_rehearsal_runtime_20261015|category_a_form_[0-9a-f]{12})",
    RUNTIME_LOGIN,
):
    raise RuntimeError("Invalid isolated Category A runtime login")


def abstract_state(connection, event_id, owner_id=OWNER):
    rows = connection.execute(text("SELECT to_jsonb(f)::text FROM abstract.abstract_forms f "
        "WHERE event_id=:event AND organization_id=:owner ORDER BY id"),
        {"event": event_id, "owner": owner_id}).scalars().all()
    return hashlib.sha256(json.dumps(rows).encode()).hexdigest()


async def probe(event_id, actor_id, foreign_source, keys, created_ids, owner_id=OWNER, progress=None, fixture_sources=None):
    import app.models
    from fastapi import HTTPException
    from sqlalchemy.ext.asyncio import AsyncSession
    from app.database import async_engine
    from app.core.tenant_context import TenantContextGuard
    from app.core.dependencies.feature_gate import enforce_event_operation
    from app.modules.abstracts.application.commands import AbstractConfigurationCommandService
    from app.modules.abstracts.models import AbstractForm
    from app.modules.events.models.event import Event
    from app.modules.identity.models.user import User
    from app.modules.registration.application.template_commands import TemplateCommands
    from app.modules.registration.schemas.form_builder import FormTemplateCreate, FormTemplateUpdate
    from app.modules.registration.models.form_template import FormTemplate
    from app.modules.platform.models.idempotency import IdempotencyRecord
    from app.modules.audit.models.audit_log import AuditLog, compute_audit_hash
    checks = []

    def key():
        value = f"runtime-abstract-{uuid.uuid4()}"
        keys.append(value)
        return value

    try:
        for case in ("success_replay", "stale_version", "missing_version", "missing_key",
                "foreign_source", "wrong_purpose", "retired_source", "stale_source_version",
                "changed_retry_payload", "invalid_rubric"):
            if progress is not None:
                progress["current_case"] = case
            async with async_engine.connect() as connection:
                transaction = await connection.begin()
                async with AsyncSession(bind=connection, expire_on_commit=False,
                        join_transaction_mode="create_savepoint") as db:
                    try:
                        role = (await db.execute(text("SELECT current_user AS login,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user"))).one()
                        assert role.login == RUNTIME_LOGIN and not role.rolsuper and not role.rolbypassrls
                        async with TenantContextGuard.scoped(db, owner_id):
                            actor = await db.get(User, actor_id)
                            event = await db.get(Event, event_id)
                            assert actor is not None and actor.platform_role is None
                            # Verify real entitlement before writing even transient fixtures.
                            await enforce_event_operation(db, owner_id, event_id, "abstracts.configure", user_id=actor_id)
                            if fixture_sources:
                                source_key = {"wrong_purpose": "wrong_purpose", "retired_source": "retired", "stale_source_version": "stale"}.get(case, "valid")
                                source = await db.scalar(select(FormTemplate).where(
                                    FormTemplate.id == uuid.UUID(fixture_sources[source_key]), FormTemplate.organization_id == owner_id))
                                assert source is not None
                            else:
                                source = await TemplateCommands.execute(db, operation="create", actor=actor,
                                    idempotency_key=key(), payload=FormTemplateCreate(name="Rolled-back abstract source",
                                        slug=f"runtime-abstract-{uuid.uuid4().hex}", category_key="survey" if case == "wrong_purpose" else "abstract",
                                        fields=[], settings={}))
                                created_ids.append(source.id)
                            source_version = 1 if fixture_sources and case == "stale_source_version" else source.version
                            if not fixture_sources and case in {"retired_source", "stale_source_version"}:
                                changed = await TemplateCommands.execute(db, operation="update", actor=actor,
                                    template_id=source.id, if_match=str(source_version), idempotency_key=key(),
                                    payload=FormTemplateUpdate(**({"is_active": False} if case == "retired_source" else {"name": "Changed before save"})))
                                assert changed.version == source_version + 1
                                if case == "retired_source":
                                    source_version = changed.version
                            form = await db.scalar(select(AbstractForm).where(AbstractForm.event_id == event_id,
                                AbstractForm.organization_id == owner_id, AbstractForm.is_active.is_(True)))
                            version = int(form.version or 1) if form is not None else 1
                            arguments = dict(event=event, user=actor,
                                expected_version=None if case == "missing_version" else str(version),
                                idempotency_key=None if case == "missing_key" else key(),
                                payload={"title": "Restricted runtime abstract form", "publish": False,
                                    "schema": {"fields": [], "settings": {}, **({"rubric": [{"unexpected": "unsafe"}]} if case == "invalid_rubric" else {})},
                                    "source_template_id": str(foreign_source if case == "foreign_source" else source.id),
                                    "source_version": source_version})
                            command = AbstractConfigurationCommandService(db).update_form
                            if case in {"success_replay", "changed_retry_payload", "stale_version"}:
                                saved = await command(**arguments)
                                assert saved.version == version + 1 and saved.saved_template is not None
                                created_ids.append(saved.saved_template.id)
                                receipt = await db.scalar(select(IdempotencyRecord).where(IdempotencyRecord.idempotency_key == arguments["idempotency_key"]))
                                assert receipt.status == "COMPLETED"
                                audits = list((await db.scalars(select(AuditLog).where(AuditLog.correlation_id == receipt.id,
                                    AuditLog.action_type == "ABSTRACT_FORM_UPDATED"))).all())
                                assert len(audits) == 1
                                audit = audits[0]
                                assert audit.actor_user_id == actor_id and audit.organization_id == owner_id and audit.row_hash == compute_audit_hash(audit)
                                if case == "success_replay":
                                    assert (await command(**arguments)).model_dump(mode="json", by_alias=True) == saved.model_dump(mode="json", by_alias=True)
                                    assert await db.scalar(select(text("count(*)")).select_from(AuditLog).where(AuditLog.correlation_id == receipt.id,
                                        AuditLog.action_type == "ABSTRACT_FORM_UPDATED")) == 1
                                    checks.append(dict(case=case, expected_decision_verified=True))
                                    continue
                                if case == "changed_retry_payload":
                                    arguments["payload"] = {**arguments["payload"], "title": "Different retry payload"}
                                else:
                                    arguments["idempotency_key"] = key()
                            expected = {"stale_version": 412, "missing_version": 428, "missing_key": 428,
                                "foreign_source": 404, "wrong_purpose": 422, "retired_source": 409,
                                "stale_source_version": 412, "changed_retry_payload": 409, "invalid_rubric": 422}[case]
                            count = await db.scalar(select(text("count(*)")).select_from(FormTemplate).where(FormTemplate.organization_id == owner_id))
                            try:
                                await command(**arguments)
                            except HTTPException as error:
                                assert error.status_code == expected, (case, error.status_code)
                            else:
                                raise RuntimeError(f"Expected abstract write denial missing: {case}")
                            assert await db.scalar(select(text("count(*)")).select_from(FormTemplate).where(FormTemplate.organization_id == owner_id)) == count
                            if arguments["idempotency_key"] and case != "changed_retry_payload":
                                assert await db.scalar(select(IdempotencyRecord.id).where(IdempotencyRecord.idempotency_key == arguments["idempotency_key"])) is None
                            checks.append(dict(case=case, expected_status=expected, expected_decision_verified=True))
                    finally:
                        await db.rollback()
                        await transaction.rollback()
        return checks
    finally:
        from app.redis import close_redis
        await close_redis()
        await async_engine.dispose()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--isolated-fixture", type=Path)
    args = parser.parse_args()
    fixture = None
    owner_id = OWNER
    if args.isolated_fixture:
        import re
        if args.isolated_fixture.stat().st_size > 4096:
            raise RuntimeError("Fixture manifest is oversized")
        fixture = json.loads(args.isolated_fixture.read_text(encoding="utf-8"))
        if (fixture.get("purpose") != "isolated_abstract_runtime_acceptance"
                or not re.fullmatch(r"category_a_restore_\d{8}_[0-9a-f]{12}", fixture.get("database", ""))):
            raise RuntimeError("Only a dedicated isolated acceptance fixture is permitted")
        owner_id = uuid.UUID(fixture["organization_id"])
    target = make_url(settings.DATABASE_URL_SYNC).set(database=fixture["database"] if fixture else SOURCE)
    if settings.is_production or settings.ALLOW_TEST_CAPABILITY_BYPASS or target.host not in {"localhost", "127.0.0.1"}:
        raise RuntimeError("Only the named local rehearsal database is permitted")
    engine = create_engine(target)
    run_id, keys, created_ids = uuid.uuid4().hex, [], []
    result = dict(status="FAILED", run_id=run_id, environment="local_isolated_rehearsal",
        scope="actual_restricted_login_direct_accepted_owner", started_at=datetime.now(timezone.utc).isoformat(),
        delegated_http_browser_concurrency_acceptance="NOT_RUN")
    try:
        with engine.connect() as connection:
            assert connection.scalar(text("SELECT count(*) FROM pg_stat_activity WHERE usename=:login"), {"login": RUNTIME_LOGIN}) == 0
            event_id = connection.execute(text("""SELECT e.id FROM events.events e JOIN platform.organizations o ON o.id=e.organization_id
                WHERE e.organization_id=:owner AND NOT o.is_platform_org AND o.is_active AND e.deleted_at IS NULL
                AND NOT e.is_read_only AND NOT e.is_maintenance AND e.status='active'
                AND EXISTS(SELECT 1 FROM commerce.event_commercial_contracts c WHERE c.event_id=e.id AND c.status='ACTIVE')
                ORDER BY e.id LIMIT 1"""), {"owner": owner_id}).scalar_one()
            actor_id = connection.execute(text("""SELECT u.id FROM identity.users u JOIN organizer_access.organization_members m ON m.user_id=u.id
                WHERE m.organization_id=:owner AND m.org_role='owner' AND m.is_active AND m.accepted_at IS NOT NULL
                AND u.is_active AND u.deleted_at IS NULL AND u.platform_role IS NULL ORDER BY u.id LIMIT 1"""), {"owner": owner_id}).scalar_one()
            if fixture:
                assert event_id == uuid.UUID(fixture["event_id"]) and actor_id == uuid.UUID(fixture["actor_id"])
            foreign_source = connection.execute(text("SELECT id FROM design.form_templates WHERE organization_id=:foreign AND scope_type='ORGANIZATION' AND is_active AND deleted_at IS NULL ORDER BY id LIMIT 1"), {"foreign": FOREIGN}).scalar_one()
            original = abstract_state(connection, event_id, owner_id)
            result.update(database=target.database, organization_id=str(owner_id), event_id=str(event_id))
            result["migration_revision"] = connection.scalar(text("SELECT version_num FROM public.alembic_version"))
        password = secrets.token_urlsafe(40)
        raw = engine.raw_connection()
        try:
            with raw.cursor() as cursor:
                upsert_login(cursor, RUNTIME_LOGIN, password, "event_runtime")
            raw.commit()
        finally:
            raw.close()
        runtime_url = target.set(username=RUNTIME_LOGIN, password=password)
        from app.core.database_security import enforce_runtime_database_login
        enforce_runtime_database_login(runtime_url)
        settings.DATABASE_URL_ASYNC = runtime_url.set(drivername="postgresql+asyncpg").render_as_string(hide_password=False)
        result["checks"] = asyncio.run(probe(event_id, actor_id, foreign_source, keys, created_ids, owner_id, result,
            fixture.get("source_ids") if fixture else None))
        result["status"] = "PASSED"
    except Exception as error:
        result.update(error_type=type(error).__name__)
        if isinstance(getattr(error, "detail", None), dict):
            result["denial_code"] = error.detail.get("code")
            result["denied_feature"] = error.detail.get("feature")
    finally:
        try:
            if "original" in locals():
                with engine.connect() as connection:
                    assert abstract_state(connection, event_id, owner_id) == original
                    assert connection.execute(text("SELECT count(*) FROM platform.idempotency_records WHERE idempotency_key=ANY(:keys)"), {"keys": keys}).scalar_one() == 0
                    assert connection.execute(text("SELECT count(*) FROM design.form_templates WHERE id=ANY(:ids)"), {"ids": created_ids}).scalar_one() == 0
                result["independent_original_state_and_receipts_restored"] = True
        except Exception as error:
            result.update(status="FAILED", restoration_error_type=type(error).__name__)
        engine.dispose()
    result.update(completed_at=datetime.now(timezone.utc).isoformat(), probe_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest())
    output = Path(__file__).parents[1] / f"test-results/category-a-abstract-writer-runtime-{run_id}.json"
    with output.open("x", encoding="utf-8") as artifact:
        json.dump(result, artifact, indent=2)
    print(json.dumps(result, indent=2))
    print(f"Evidence: {output.name}")
    return 0 if result["status"] == "PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
