"""Local backup-derived 3670 migration and actual restricted-role rubric proof."""
import argparse
import asyncio
from datetime import date, datetime, timezone
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import traceback
import uuid

sys.path.insert(0, str(Path(__file__).parents[1]))
from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import make_url

from app.config import settings
from ops.category_a_backup_restore_rehearsal import SOURCE, fingerprint, quarantine_database
from ops.category_a_forward_recovery_rehearsal import validate_restore_evidence
from ops.bootstrap_cloud_database import upsert_login

ROOT = Path(__file__).parents[1]
REVISION = "20261022_3670"


async def child(path):
    fixture = json.loads(path.read_text())
    url = make_url(settings.DATABASE_URL_ASYNC)
    assert not settings.is_production and url.host in {"localhost", "127.0.0.1"}
    assert url.database == fixture["database"] and url.username == fixture["login"]
    assert re.fullmatch(r"category_a_restore_[0-9]{8}_[0-9a-f]{12}", url.database or "")
    assert re.fullmatch(r"category_a_checkpoint_[0-9a-f]{12}", url.username or "")
    assert path.resolve().parent == (ROOT / "test-results").resolve()
    # Reuse the real durable stream/checkpoint probe, not another scan engine.
    from ops.category_a_durable_work_rehearsal import child as checkpoint_child
    if await checkpoint_child(path) != 0:
        return 1
    from app.database import AsyncSessionLocal, async_engine
    from app.core.tenant_context import TenantContextGuard
    from app.modules.identity.models.user import User
    from app.modules.programme.models import ProgrammeEvaluationPlan
    from app.modules.programme.router import submit_public_review
    from app.modules.programme.schemas import PublicReviewerReview
    from app.modules.registration.application.aggregate_reconciliation import repair_aggregate_document
    from app.modules.registration.application.catalogue_review_queries import list_blocked_aggregates
    from app.modules.registration.models.catalogue_reconciliation import CatalogueReconciliationRun as Run
    from app.modules.registration.schemas.catalogue_contracts import AggregateRepairRequest
    from app.modules.registration.schemas.event_form_contracts import evaluation_rubric_projection
    from app.modules.registration.services.catalogue_work import progress
    owner, platform, actor_id, bad_id = (uuid.UUID(fixture[key]) for key in ("owner", "platform", "actor", "bad_plan"))
    result = dict(status="FAILED", stage="rubric_runtime", actual_restricted_login=True,
        migration_revision=REVISION, production_acceptance="NOT_RUN", http_admission="NOT_RUN")
    try:
        async with AsyncSessionLocal() as db:
            result["stage"] = "runtime_role_and_rls"
            assert await db.scalar(text("SELECT version_num FROM public.alembic_version")) == REVISION
            assert await db.scalar(text("SELECT relrowsecurity AND relforcerowsecurity AND NOT pg_has_role(current_user,relowner,'USAGE') FROM pg_class WHERE oid='programme.evaluation_plans'::regclass"))
            assert not await db.scalar(text("SELECT has_table_privilege(current_user,'programme.evaluation_plans','TRUNCATE')"))
            assert await db.scalar(text("SELECT count(*) FROM programme.evaluation_plans")) == 0
            async with TenantContextGuard.scoped(db, platform):
                assert await db.scalar(text("SELECT count(*) FROM programme.evaluation_plans")) == 0
                old_run = await db.get(Run, uuid.UUID(fixture["legacy_run"]))
                result["stage"] = "legacy_coverage_projection"
                assert (await progress(db, old_run))["completion_status"] == "LEGACY_UNTRACKED"
                page = await list_blocked_aggregates(db, actor=await db.get(User, actor_id), resource_type="PROGRAMME_RUBRIC")
                result["stage"] = "blocked_rubric_projection"
                assert len(page.items) == 1 and page.items[0].resource_id == bad_id
                assert page.items[0].resource_version == 2 and page.items[0].current_document is None
                assert "private-legacy-data" not in page.model_dump_json()
                proposal = AggregateRepairRequest(document={"rubric": [{"key": "quality", "label": "Quality", "max": 10, "weight": 100}]},
                    reason="Reviewed synthetic historical rubric correction")
                actor = await db.get(User, actor_id)
                result["stage"] = "reviewed_correction_and_receipt"
                kwargs = dict(resource_type="PROGRAMME_RUBRIC", resource_id=bad_id, actor=actor,
                    payload=proposal, if_match='"2"', idempotency_key=f"rubric-runtime-{fixture['bad_plan']}")
                corrected = await repair_aggregate_document(db, **kwargs)
                assert corrected["previous_version"] == 2 and corrected["version"] == 3
                assert await repair_aggregate_document(db, **kwargs) == corrected
            async with TenantContextGuard.scoped(db, owner):
                result["stage"] = "post_correction_plan_preservation"
                bad = await db.get(ProgrammeEvaluationPlan, bad_id)
                valid = await db.get(ProgrammeEvaluationPlan, uuid.UUID(fixture["valid_plan"]))
                assert bad.version == 3 and bad.rubric == evaluation_rubric_projection(proposal.document["rubric"])
                assert bad.scope_filter == {"private_note": "private-legacy-data"} and bad.reviewer_ids == []
                assert valid.version == 1 and valid.rubric[0]["weight"] == 100
            result["stage"] = "public_review_without_browser_context"
            await db.rollback()
            assert TenantContextGuard.current() is None
            review_key = f"rubric-public-runtime-{fixture['bad_plan']}"
            review = await submit_public_review(os.environ["CATEGORY_A_RUBRIC_REVIEW_TOKEN"],
                uuid.UUID(fixture["assignment"]), PublicReviewerReview(scores={"quality": 7}, recommendation="ACCEPT"),
                idempotency_key=review_key, db=db)
            assert uuid.UUID(review["review_id"]) and review["total_score"] == 7
            assert await submit_public_review(os.environ["CATEGORY_A_RUBRIC_REVIEW_TOKEN"],
                uuid.UUID(fixture["assignment"]), PublicReviewerReview(scores={"quality": 7}, recommendation="ACCEPT"),
                idempotency_key=review_key, db=db) == review
            assert TenantContextGuard.current() is None
            assert await db.scalar(text("SELECT count(*) FROM programme.evaluation_plans")) == 0
            async with TenantContextGuard.scoped(db, owner):
                from app.modules.audit.models.audit_log import AuditLog, compute_audit_hash
                audits = list((await db.scalars(select(AuditLog).where(
                    AuditLog.organization_id == owner, AuditLog.resource_id == uuid.UUID(review["review_id"]),
                    AuditLog.action_type == "ABSTRACT_PUBLIC_REVIEW_SUBMITTED"))).all())
                assert len(audits) == 1 and audits[0].row_hash == compute_audit_hash(audits[0])
                assert audits[0].new_state["score_field_count"] == 1
                assert "scores" not in audits[0].new_state and "comments_to_committee" not in audits[0].new_state
            result.update(status="PASSED", forced_rls=True, missing_and_foreign_context_concealed=True,
                old_coverage_not_upgraded=True, reviewed_correction_and_replay=True,
                raw_historical_document_not_projected=True, unrelated_plan_data_preserved=True,
                public_review_verified_grant_context_and_replay=True,
                public_review_single_transactional_audit_with_valid_hash=True)
    except Exception as error:
        result["error_type"] = type(error).__name__
        result["error_location"] = [{"file": Path(frame.filename).name, "line": frame.lineno}
            for frame in traceback.extract_tb(error.__traceback__)[-3:]]
        if isinstance(getattr(error, "detail", None), dict):
            result["denial_code"] = error.detail.get("code")
    finally:
        await async_engine.dispose()
        with path.with_name(path.stem + "-rubric-runtime.json").open("x", encoding="utf-8") as handle:
            json.dump(result, handle, indent=2)
    return 0 if result["status"] == "PASSED" else 1


def migrate(environment, revision):
    result = subprocess.run([sys.executable, "-m", "alembic", "upgrade", revision],
        cwd=ROOT, env=environment, capture_output=True, text=True, timeout=180)
    if result.returncode:
        raise RuntimeError("Migration rehearsal failed; inspect the isolated clone before retrying")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--child", type=Path)
    args = parser.parse_args()
    if args.child:
        return asyncio.run(child(args.child))
    if not args.execute:
        print(json.dumps({"status": "READ_ONLY", "planned_revision": REVISION,
            "action": "Use --execute for a new local backup-derived isolated clone"}))
        return 0
    target = make_url(settings.DATABASE_URL_SYNC).set(database=SOURCE)
    assert not settings.is_production and target.host in {"localhost", "127.0.0.1"}
    backup = ROOT / "test-results/category-a-backup-restore-4eeff58ce5f1439b950b4dc5e457e74a.json"
    template = validate_restore_evidence(json.loads(backup.read_text()))
    identity = uuid.uuid4().hex
    name = f"category_a_restore_{datetime.now(timezone.utc):%Y%m%d}_{identity[:12]}"
    login = f"category_a_checkpoint_{identity[:12]}"
    fixture_path = ROOT / "test-results" / f"category-a-rubric-fixture-{identity}.json"
    output = ROOT / "test-results" / f"category-a-rubric-rehearsal-{identity}.json"
    result = dict(status="FAILED", stage="create_clone", database=name, migration_revision=REVISION,
        applied_history_rewritten=False, production_acceptance="NOT_RUN")
    control, clone, created, login_created = create_engine(target), None, False, False
    try:
        with control.connect().execution_options(isolation_level="AUTOCOMMIT") as db:
            assert db.scalar(text("SELECT datallowconn FROM pg_database WHERE datname=:name"), {"name": template}) is False
            assert db.scalar(text("SELECT count(*) FROM pg_stat_activity WHERE datname=:name"), {"name": template}) == 0
            quote = db.dialect.identifier_preparer.quote
            db.execute(text(f"CREATE DATABASE {quote(name)} TEMPLATE {quote(template)}"))
            created = True
        url = target.set(database=name)
        environment = dict(os.environ, MIGRATION_DATABASE_URL_SYNC=url.render_as_string(hide_password=False))
        result["stage"] = "upgrade_3660_and_seed_legacy_streams"
        migrate(environment, "20261021_3660")
        clone = create_engine(url)
        import app.models
        from sqlalchemy.orm import Session
        from app.modules.platform.models.organization import Organization
        from app.modules.identity.models.user import User
        from app.modules.events.models.event import Event
        from app.modules.rbac.models.access_foundation import OperationalWorkspace, OrganizationAccessRevision
        from app.modules.programme.models import ProgrammeEvaluationPlan
        from app.modules.programme.models import ProgrammeAccessGrant
        from app.modules.programme.router import _hash_token
        from app.modules.abstracts.models import AbstractReviewer, AbstractSubmission, AbstractAssignment
        from app.modules.registration.models.form_category import FormCategory
        from app.modules.registration.models.catalogue_reconciliation import CatalogueDocumentReconciliation as Evidence, CatalogueReconciliationRun as Run
        review_token = secrets.token_urlsafe(32)
        with Session(clone, expire_on_commit=False) as db:
            platform = Organization(name="Rubric control fixture", slug=f"rubric-control-{identity}", is_platform_org=True)
            owner = Organization(name="Rubric target fixture", slug=f"rubric-target-{identity}")
            db.add_all([platform, owner]); db.flush()
            actor = User(organization_id=platform.id, email=f"rubric-{identity}@example.test", first_name="Rubric",
                last_name="Operator", role="super_admin", platform_role="SUPER_ADMIN", is_active=True)
            workspace = OperationalWorkspace(organization_id=owner.id, name="Rubric workspace")
            db.add_all([actor, workspace, OrganizationAccessRevision(organization_id=platform.id),
                OrganizationAccessRevision(organization_id=owner.id)])
            db.flush()
            event = Event(organization_id=owner.id, created_by=actor.id, operational_workspace_id=workspace.id,
                name="Rubric runtime event", short_code=f"RR{identity[:8]}", start_date=date(2026, 10, 22),
                end_date=date(2026, 10, 23), location="Local test", timezone="UTC", status="draft")
            db.add(event); db.flush()
            reviewer = AbstractReviewer(organization_id=owner.id, event_id=event.id, user_id=actor.id,
                email=f"rubric-reviewer-{identity}@example.test", full_name="Runtime reviewer", status="ACTIVE")
            submission = AbstractSubmission(organization_id=owner.id, event_id=event.id,
                code=f"RR-{identity[:10]}", title="Runtime rubric submission")
            db.add_all([reviewer, submission]); db.flush()
            assignment = AbstractAssignment(organization_id=owner.id, event_id=event.id,
                submission_id=submission.id, reviewer_id=reviewer.id)
            from datetime import timedelta
            db.add_all([assignment, ProgrammeAccessGrant(organization_id=owner.id, event_id=event.id,
                audience="REVIEWER", email=reviewer.email, token_hash=_hash_token(review_token),
                expires_at=datetime.now(timezone.utc) + timedelta(hours=1))])
            plans = [ProgrammeEvaluationPlan(organization_id=owner.id, event_id=event.id,
                name=f"Historical rubric {index}", rubric=[{"key": "quality", "label": "Quality", "max": 10,
                    "weight": 99 if index == 0 else 100, **({"unknown_private": "private-legacy-data"} if index == 0 else {})}],
                reviewer_ids=[] if index == 0 else [str(reviewer.id)], status="DRAFT" if index == 0 else "ACTIVE",
                scope_filter={"private_note": "private-legacy-data"}) for index in range(2)]
            db.add_all(plans); db.flush()
            db.add(Evidence(organization_id=owner.id, event_id=event.id, resource_type="PROGRAMME_RUBRIC",
                resource_id=plans[0].id, resource_version=1, operation="DOCUMENT_VALIDATION", status="VALID"))
            db.add_all([FormCategory(organization_id=owner.id, name=f"Rubric page {index}", slug=f"rubric-{identity}-{index}") for index in range(205)])
            legacy = Run(organization_id=platform.id, actor_user_id=actor.id, reason="Synthetic historical completed coverage",
                status="DISPATCHED", enumeration_complete=True)
            db.add(legacy); db.flush()
            for kind, stage, pages, destination in (("GLOBAL", "GLOBAL_TEMPLATE", 2, platform.id), ("TENANT", "ABSTRACT_FORM", 4, owner.id)):
                db.execute(text("""INSERT INTO design.catalogue_reconciliation_work
                    (id,run_id,organization_id,target_organization_id,kind,stage,status,pages_completed)
                    VALUES (:id,:run,:platform,:destination,:kind,:stage,'COMPLETED',:pages)"""),
                    dict(id=uuid.uuid4(), run=legacy.id, platform=platform.id, destination=destination, kind=kind, stage=stage, pages=pages))
            db.commit()
            fixture = dict(database=name, login=login, platform=str(platform.id), owner=str(owner.id), actor=str(actor.id),
                bad_plan=str(plans[0].id), valid_plan=str(plans[1].id), legacy_run=str(legacy.id), assignment=str(assignment.id))
        with clone.begin() as db:
            before = fingerprint(db)
            old_work = db.execute(text("SELECT id,to_jsonb(w) AS document FROM design.catalogue_reconciliation_work w ORDER BY id")).all()
        result["stage"] = "upgrade_3670_and_preservation"
        migrate(environment, REVISION)
        with clone.begin() as db:
            after = fingerprint(db)
            assert {k:v for k,v in before["tables"].items() if k not in ("public.alembic_version", "design.catalogue_reconciliation_work")} == {
                k:v for k,v in after["tables"].items() if k not in ("public.alembic_version", "design.catalogue_reconciliation_work")}
            assert before["sequences"] == after["sequences"]
            assert old_work == db.execute(text("SELECT id,to_jsonb(w)-'coverage_version' AS document FROM design.catalogue_reconciliation_work w ORDER BY id")).all()
            assert db.scalar(text("SELECT count(*) FROM design.catalogue_reconciliation_work WHERE coverage_version<>1")) == 0
            assert db.scalar(text("SELECT version_num FROM public.alembic_version")) == REVISION
        result.update(existing_rows_and_sequences_preserved=True, old_work_coverage_preserved=True)
        password = secrets.token_urlsafe(40)
        raw = control.raw_connection()
        try:
            with raw.cursor() as cursor:
                upsert_login(cursor, login, password, "event_runtime")
            raw.commit(); login_created = True
        finally:
            raw.close()
        runtime = url.set(username=login, password=password)
        environment.update(DATABASE_URL_SYNC=runtime.render_as_string(hide_password=False),
            DATABASE_URL_ASYNC=runtime.set(drivername="postgresql+asyncpg").render_as_string(hide_password=False),
            CATEGORY_A_RUBRIC_REVIEW_TOKEN=review_token)
        with fixture_path.open("x", encoding="utf-8") as handle:
            json.dump(fixture, handle)
        result["stage"] = "restricted_runtime"
        probe = subprocess.run([sys.executable, __file__, "--child", str(fixture_path)], cwd=ROOT,
            env=environment, capture_output=True, text=True, timeout=240)
        result["checkpoint_artifact"] = fixture_path.stem + "-runtime.json"
        result["rubric_artifact"] = fixture_path.stem + "-rubric-runtime.json"
        rubric_result = json.loads(fixture_path.with_name(result["rubric_artifact"]).read_text())
        assert probe.returncode == 0 and rubric_result["status"] == "PASSED"
        result["stage"] = "forward_only_downgrade_guard"
        from ops.category_a_category_key_migration import snapshot
        before_refusal = snapshot(clone)
        refused = subprocess.run([sys.executable, "-m", "alembic", "downgrade", "20261021_3660"],
            cwd=ROOT, env=environment, capture_output=True, text=True, timeout=180)
        assert refused.returncode != 0 and "Forward-only: retain rubric evidence" in refused.stderr
        assert before_refusal == snapshot(clone)
        result.update(forward_only_downgrade_refused=True,
            downgrade_refusal_preserved_data_metadata_revision_and_sequences=True)
        result.update(status="PASSED", stage="completed", actual_restricted_login=True)
    except Exception as error:
        result["error_type"] = type(error).__name__
    finally:
        if clone is not None:
            clone.dispose()
        if created:
            try:
                quarantine_database(control, name)
                result["database_quarantined"] = True
            except Exception as error:
                result.update(status="FAILED", quarantine_error_type=type(error).__name__)
        if login_created:
            try:
                with control.connect().execution_options(isolation_level="AUTOCOMMIT") as db:
                    assert db.scalar(text("SELECT count(*) FROM pg_stat_activity WHERE usename=:name"), {"name": login}) == 0
                    db.execute(text(f"DROP ROLE {db.dialect.identifier_preparer.quote(login)}"))
                result["temporary_login_removed"] = True
            except Exception as error:
                result.update(status="FAILED", login_cleanup_error_type=type(error).__name__)
        control.dispose()
        with output.open("x", encoding="utf-8") as handle:
            json.dump(result, handle, indent=2)
        print(json.dumps(result))
    return 0 if result["status"] == "PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
