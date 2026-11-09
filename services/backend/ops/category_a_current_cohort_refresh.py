"""Explicit local approved-cohort preflight; never infer or grant authority."""
import argparse
import asyncio
import hashlib
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import uuid

sys.path.insert(0, str(Path(__file__).parents[1]))
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.engine import make_url
from app.config import settings
from ops.category_a_phase1_cohort import load_cohort
from ops.bootstrap_cloud_database import upsert_login
from ops.category_a_backup_restore_rehearsal import fingerprint

ROOT = Path(__file__).parents[1]
COHORT = ROOT.parents[1] / "docs/category-a/plans-status-evidence/2026-10-15/rehearsal-cohort.json"
SOURCE = "category_a_rehearsal_20261015"
APPROVAL = "user-approved-isolated-local-category-a-rehearsal"
REVISION = "20261022_3670"
SOURCES = ("app/tasks/catalogue_reconciliation.py", "app/modules/registration/services/catalogue_work.py",
    "app/modules/registration/application/category_document_validation.py",
    "app/modules/registration/application/category_key_projection.py",
    "app/modules/registration/application/aggregate_reconciliation.py",
    "app/modules/registration/application/template_commands.py",
    "app/modules/rbac/services/platform_permissions.py",
    "app/modules/registration/application/programme_rubric_validation.py",
    "app/modules/programme/rubric_integrity.py",
    "alembic/versions/20261021_3660_category_key_identity_length.py",
    "alembic/versions/20261022_3670_programme_rubric_reconciliation.py")


def source_hashes():
    return {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in SOURCES}


def preflight(*, expected_revision=REVISION):
    base = make_url(settings.DATABASE_URL_SYNC).set(database=SOURCE)
    if settings.is_production or base.host not in {"localhost", "127.0.0.1"}:
        raise RuntimeError("Only the approved named local rehearsal is permitted")
    approved = load_cohort(COHORT)
    engine = create_engine(base)
    try:
        with engine.begin() as db:
            db.execute(text("SET TRANSACTION READ ONLY"))
            assert db.scalar(text("SELECT version_num FROM public.alembic_version")) == expected_revision, (
                f"Approved cohort must be at {expected_revision} for this operation; never stamp or rewrite history")
            operators = list(db.execute(text("""SELECT u.id,u.organization_id FROM identity.users u
                JOIN platform.organizations o ON o.id=u.organization_id
                WHERE o.slug='rehearsal-operators' AND o.is_platform_org AND o.is_active
                AND o.suspended_at IS NULL AND o.archived_at IS NULL AND u.is_active
                AND u.deleted_at IS NULL AND u.platform_role='SUPER_ADMIN'""")).mappings())
            assert len(operators) == 1, "Expected one previously approved non-default operator"
            tenants = list(db.execute(text("""SELECT id,organization_kind FROM platform.organizations
                WHERE NOT is_platform_org AND archived_at IS NULL ORDER BY id""")).mappings())
            observed = {str(row["id"]): row["organization_kind"] for row in tenants}
            expected = {row["organization_id"]: row["confirmed_kind"] for row in approved}
            assert observed == expected, "Whole live customer cohort differs from the approved test cohort"
            pending_runs = db.scalar(text("SELECT count(*) FROM design.catalogue_reconciliation_runs WHERE status IN ('PENDING','RUNNING')"))
            pending_work = db.scalar(text("SELECT count(*) FROM design.catalogue_reconciliation_work WHERE status IN ('PENDING','RUNNING')"))
            return dict(status="READ_ONLY_PREFLIGHT_COMPLETE", database=SOURCE,
                migration_revision=expected_revision, actor=str(operators[0]["id"]),
                platform=str(operators[0]["organization_id"]), cohort=approved,
                pending_runs=pending_runs, pending_work=pending_work,
                changed=False, production_acceptance="NOT_RUN")
    finally:
        engine.dispose()


async def refresh(fixture_path):
    fixture = json.loads(fixture_path.read_text())
    url = make_url(settings.DATABASE_URL_ASYNC)
    assert (not settings.is_production and url.host in {"localhost", "127.0.0.1"}
        and url.database == SOURCE and url.username == fixture["login"])
    assert fixture_path.resolve().parent == (ROOT / "test-results").resolve()
    assert source_hashes() == fixture["sources"]
    assert hashlib.sha256(COHORT.read_bytes()).hexdigest() == fixture["cohort_sha256"]
    from redis import Redis
    unavailable = f"redis://127.0.0.1:{fixture['reserved_port']}/0"
    probe = Redis.from_url(unavailable, socket_connect_timeout=1, socket_timeout=1)
    try:
        probe.ping()
    except Exception:
        pass
    else:
        raise RuntimeError("Reserved non-listening nudge endpoint unexpectedly has a broker")
    finally:
        probe.close()
    import app.models
    from app.database import AsyncSessionLocal, async_engine
    from app.core.database_security import inspect_database_security
    from app.core.tenant_context import TenantContextGuard
    from app.modules.identity.models.user import User
    from app.modules.audit.models.audit_log import AuditLog, compute_audit_hash
    from app.modules.platform.models.idempotency import IdempotencyRecord
    from app.modules.registration.models.catalogue_reconciliation import CatalogueReconciliationRun as Run, CatalogueReconciliationWork as Work
    from app.modules.registration.schemas.catalogue_contracts import CohortReconciliationRequest
    from app.modules.registration.routers.form_templates import start_catalogue_reconciliation_run
    from app.modules.registration.services import catalogue_work
    from app.tasks import catalogue_reconciliation as worker
    # The scheduling body is genuine. Its best-effort nudge must not reach the
    # shared broker or existing workers; the held non-listening port guarantees
    # a real connection failure, not a mocked apply_async result.
    worker.celery_app.conf.update(broker_url=unavailable, broker_write_url=unavailable,
        broker_read_url=unavailable, result_backend=None, broker_connection_timeout=1,
        broker_transport_options={"socket_timeout": 1, "socket_connect_timeout": 1, "retry_on_timeout": False})
    actor_id, platform = uuid.UUID(fixture["actor"]), uuid.UUID(fixture["platform"])
    approved = tuple(sorted(uuid.UUID(row["organization_id"]) for row in fixture["cohort"]))
    result = dict(status="FAILED", stage="runtime_preflight", database=SOURCE,
        admission="OPERATOR_SERVICE_NOT_HTTP", queue_delivery="NOT_RUN",
        staging_acceptance="NOT_RUN", production_acceptance="NOT_RUN")
    try:
        async with AsyncSessionLocal() as db:
            security = await inspect_database_security(db)
            assert security.runtime_role_is_safe and not security.missing_canary_policies
            assert await db.scalar(text("SELECT current_user")) == fixture["login"]
            result["actual_restricted_login"] = True
            async with TenantContextGuard.scoped(db, platform):
                assert await worker._authorise_platform_actor(db, actor_id, for_write=True) == platform
                actor = await db.get(User, actor_id)
                payload = CohortReconciliationRequest(reason=f"{APPROVAL}: current-source approved cohort refresh")
                key = f"current-cohort-{fixture['operation_id']}"
                accepted = await start_catalogue_reconciliation_run(payload, db=db,
                    current_user=actor, idempotency_key=key)
                assert await worker._authorise_platform_actor(db, actor_id, for_write=True) == platform
                assert await start_catalogue_reconciliation_run(payload, db=db,
                    current_user=actor, idempotency_key=key) == accepted
                run_id = uuid.UUID(accepted["run_id"])
                run = await db.get(Run, run_id, populate_existing=True)
                assert run.status == "PENDING" and run.dispatch_attempts == 0
                result.update(run_id=str(run_id), real_nudge_unavailable=True, pending_before_recovery=True)
        result["stage"] = "scoped_run_recovery"
        claims = await worker._claim_reconciliation_runs(run_id=run_id)
        assert claims == [(run_id, actor_id, 1)]
        assert await worker._mark_run_started(run_id, actor_id, 1) == 1
        owners = tuple(await worker._organization_page(actor_id, None, run_id))
        assert owners == approved
        await catalogue_work.stage_streams(run_id, actor_id, 1, None, owners, enumeration_complete=True)
        await worker._mark_run_dispatched(run_id, actor_id, 1)
        async with AsyncSessionLocal() as db:
            async with TenantContextGuard.scoped(db, platform):
                works = list((await db.scalars(select(Work).where(Work.run_id == run_id).order_by(Work.id))).all())
                assert len(works) == len(approved) + 1
                assert all(row.coverage_version == 2 for row in works)
                assert {row.target_organization_id for row in works if row.kind == "TENANT"} == set(approved)
                work_ids = [row.id for row in works]
        result["stage"] = "bounded_checkpoint_execution"
        for _ in range(256):
            made_progress = False
            for work_id in work_ids:
                for message in await catalogue_work.claim_pages(platform_id=platform, work_id=work_id):
                    await catalogue_work.execute_page(*message)
                    assert await catalogue_work.execute_page(*message) == {"status": "STALE_OR_UNAVAILABLE"}
                    made_progress = True
            async with AsyncSessionLocal() as db:
                async with TenantContextGuard.scoped(db, platform):
                    run = await db.get(Run, run_id)
                    progress = await catalogue_work.progress(db, run)
                    if progress["completion_status"] == "COMPLETED":
                        break
                    assert progress["completion_status"] != "FAILED"
            if not made_progress:
                await asyncio.sleep(0.1)
        else:
            raise RuntimeError("Bounded cohort execution budget exhausted; checkpoints remain resumable")
        result["stage"] = "independent_committed_evidence"
        async with AsyncSessionLocal() as db:
            async with TenantContextGuard.scoped(db, platform):
                audits = list((await db.scalars(select(AuditLog).where(AuditLog.correlation_id == run_id))).all())
                assert all(row.row_hash == compute_audit_hash(row) for row in audits)
                assert len(audits) == progress["pages_completed"] + 2
                assert sum(row.action_type == "CATALOGUE_RECONCILIATION_SCHEDULED" for row in audits) == 1
                assert sum(row.action_type == "CATALOGUE_RECONCILIATION_WORKERS_DISPATCHED" for row in audits) == 1
                assert sum(row.action_type == "CATALOGUE_PAGE_CHECKPOINT_COMMITTED" for row in audits) == progress["pages_completed"]
                receipt = await db.get(IdempotencyRecord, run_id)
                assert receipt.status == "COMPLETED" and receipt.response_body["run_id"] == str(run_id)
                stages = [dict(row._mapping) for row in (await db.execute(select(
                    Work.kind, Work.target_organization_id, Work.stage, Work.status, Work.coverage_version,
                    Work.pages_completed, Work.checked_count, Work.blocked_count).where(Work.run_id == run_id))).all()]
                assert all(row["coverage_version"] == 2 and row["status"] == "COMPLETED" for row in stages)
                assert all(row["stage"] == "PROGRAMME_RUBRIC" for row in stages if row["kind"] == "TENANT")
            for owner in approved:
                async with TenantContextGuard.scoped(db, owner):
                    assert await db.scalar(select(func.count()).select_from(Work)) == 0
        result.update(progress=progress, streams=[{**row, "target_organization_id": str(row["target_organization_id"])} for row in stages],
            mandatory_audits=len(audits), schedule_receipt_and_retry_preserved=True,
            customer_control_rows_visible=0, status="RECONCILED" if progress["blocked_count"] == 0 else "BLOCKED")
        assert source_hashes() == fixture["sources"]
    except Exception as error:
        result["error_type"] = type(error).__name__
    finally:
        await async_engine.dispose()
        output = fixture_path.with_name(fixture_path.stem + "-runtime.json")
        with output.open("x", encoding="utf-8") as file:
            json.dump(result, file, indent=2)
    return result


def run_report(script, arguments, environment, output):
    command = subprocess.run([sys.executable, str(ROOT / "ops" / script), *arguments,
        "--output", str(output)], cwd=ROOT, env=environment, capture_output=True, text=True, timeout=300)
    assert command.returncode == 0, f"Operator report failed: {script}"
    return json.loads(output.read_text())


def permitted_changes(engine):
    import app.models
    from app.modules.audit.models.audit_log import AuditLog
    from app.modules.platform.models.idempotency import IdempotencyRecord
    from app.modules.registration.models.catalogue_reconciliation import CatalogueReconciliationRun, CatalogueReconciliationWork, CatalogueDocumentReconciliation
    from app.modules.registration.models.form_category import FormCategory, FormCategoryReconciliation
    from app.modules.registration.models.form_template import FormTemplate, FormTemplateReconciliation
    from app.modules.registration.models.registration_form_config import RegistrationFormConfig
    from app.modules.abstracts.models import AbstractForm
    from app.modules.programme.models import ProgrammeEvaluationPlan
    allowed = {model.__table__.fullname for model in (AuditLog, IdempotencyRecord,
        CatalogueReconciliationRun, CatalogueReconciliationWork, CatalogueDocumentReconciliation,
        FormCategory, FormCategoryReconciliation, FormTemplate, FormTemplateReconciliation,
        RegistrationFormConfig, AbstractForm, ProgrammeEvaluationPlan)}
    with engine.begin() as db:
        allowed.update(db.execute(text("""WITH RECURSIVE children(oid) AS (
            SELECT to_regclass(:parent) UNION ALL
            SELECT i.inhrelid FROM pg_inherits i JOIN children p ON p.oid=i.inhparent)
            SELECT n.nspname||'.'||c.relname FROM children p JOIN pg_class c ON c.oid=p.oid
            JOIN pg_namespace n ON n.oid=c.relnamespace"""), {"parent": AuditLog.__table__.fullname}).scalars())
    return allowed


def execute():
    prepared = preflight()
    assert prepared["pending_runs"] == 0 and prepared["pending_work"] == 0
    operation_id = uuid.uuid4().hex
    output = ROOT / "test-results" / f"category-a-current-cohort-{operation_id}.json"
    fixture_path = output.with_name(output.stem + "-fixture.json")
    login = f"category_a_current_{operation_id[:12]}"
    base = make_url(settings.DATABASE_URL_SYNC).set(database=SOURCE)
    engine = create_engine(base)
    hashes = source_hashes()
    build = "33b3f156-dirty-" + hashlib.sha256(json.dumps(hashes, sort_keys=True).encode()).hexdigest()[:12]
    environment = dict(os.environ, MIGRATION_DATABASE_URL_SYNC=base.render_as_string(hide_password=False))
    result = dict(status="FAILED", operation_id=operation_id, database=SOURCE, source_hashes=hashes,
        source_identity=build, build_artifact="NOT_FROZEN", production_acceptance="NOT_RUN")
    created = False
    with output.open("x", encoding="utf-8") as evidence:
        try:
            common = ["--cohort", str(COHORT), "--actor", prepared["actor"],
                "--approval-reference", APPROVAL, "--build-id", build]
            before_report = output.with_name(output.stem + "-foundation-before.json")
            before_foundation = run_report("category_a_phase1_cohort.py", common, environment, before_report)
            assert before_foundation["status"] == "OPERATOR_STAGE_COMPLETE_NOT_RELEASED"
            result["foundation_before"] = before_report.name
            with engine.begin() as db:
                before = fingerprint(db)
            allowed = permitted_changes(engine)
            password = secrets.token_urlsafe(40)
            raw = engine.raw_connection()
            try:
                with raw.cursor() as cursor:
                    upsert_login(cursor, login, password, "event_runtime")
                raw.commit()
                created = True
            finally:
                raw.close()
            runtime = base.set(username=login, password=password)
            child_environment = dict(os.environ, DATABASE_URL_SYNC=runtime.render_as_string(hide_password=False),
                DATABASE_URL_ASYNC=runtime.set(drivername="postgresql+asyncpg").render_as_string(hide_password=False),
                REQUIRE_RLS_SAFE_RUNTIME_ROLE="true")
            with socket.socket() as listener:
                listener.bind(("127.0.0.1", 0))
                fixture = {**prepared, "login": login, "operation_id": operation_id,
                    "sources": hashes, "cohort_sha256": hashlib.sha256(COHORT.read_bytes()).hexdigest(),
                    "reserved_port": listener.getsockname()[1]}
                with fixture_path.open("x", encoding="utf-8") as file:
                    json.dump(fixture, file)
                child = subprocess.run([sys.executable, __file__, "--child", str(fixture_path)],
                    cwd=ROOT, env=child_environment, capture_output=True, text=True, timeout=300)
            assert child.returncode == 0
            runtime_path = fixture_path.with_name(fixture_path.stem + "-runtime.json")
            current = json.loads(runtime_path.read_text())
            result.update(runtime_artifact=runtime_path.name, runtime=current)
            assert current["status"] == "RECONCILED"
            after_report = output.with_name(output.stem + "-foundation-after.json")
            after_foundation = run_report("category_a_phase1_cohort.py", common, environment, after_report)
            assert after_foundation["status"] == "OPERATOR_STAGE_COMPLETE_NOT_RELEASED"
            catalogue_path = output.with_name(output.stem + "-catalogue.json")
            catalogue = run_report("category_a_catalogue_cohort_report.py", ["--cohort", str(COHORT),
                "--build-id", build, "--approval-reference", APPROVAL], environment, catalogue_path)
            assert catalogue["status"] == "RECONCILED"
            result.update(foundation_after=after_report.name, catalogue_report=catalogue_path.name)
            with engine.begin() as db:
                after = fingerprint(db)
            result.update(before=before, after=after)
            changed = {name for name in before["tables"] if before["tables"][name] != after["tables"].get(name)}
            assert before["tables"].keys() == after["tables"].keys()
            assert changed <= allowed, "Unexpected mutation outside catalogue/audit/receipt state"
            result["changed_tables"] = sorted(changed)
            result["other_application_tables_unchanged"] = True
            assert before["schema_security_sha256"] == after["schema_security_sha256"]
            assert before["sequences"] == after["sequences"]
            assert before["migration_revision"] == after["migration_revision"] == REVISION
            assert source_hashes() == hashes
            result["status"] = "CURRENT_COHORT_RECONCILED_NOT_RELEASED"
        except Exception as error:
            result["error_type"] = type(error).__name__
        finally:
            if created:
                try:
                    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as db:
                        assert db.scalar(text("SELECT count(*) FROM pg_stat_activity WHERE usename=:name"), {"name": login}) == 0
                        db.execute(text(f"DROP ROLE {db.dialect.identifier_preparer.quote(login)}"))
                    result["temporary_login_removed"] = True
                except Exception as error:
                    result.update(status="FAILED", cleanup_error_type=type(error).__name__)
            engine.dispose()
            json.dump(result, evidence, indent=2)
    print(json.dumps({key: result.get(key) for key in ("status", "operation_id", "runtime_artifact", "temporary_login_removed", "error_type")}))
    return result["status"] == "CURRENT_COHORT_RECONCILED_NOT_RELEASED"


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--child", type=Path)
    args = parser.parse_args()
    if args.child:
        current = asyncio.run(refresh(args.child))
        print(json.dumps({key: current.get(key) for key in ("status", "stage", "run_id", "error_type")}))
        raise SystemExit(0 if current["status"] == "RECONCILED" else 1)
    if args.execute:
        raise SystemExit(0 if execute() else 1)
    print(json.dumps(preflight(), indent=2))
