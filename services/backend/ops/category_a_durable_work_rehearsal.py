"""Local backup-derived migration/runtime proof; no existing tenant changes."""
import argparse
import asyncio
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import uuid

sys.path.insert(0, str(Path(__file__).parents[1]))
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.engine import make_url
from app.config import settings
from ops.category_a_backup_restore_rehearsal import SOURCE, quarantine_database
from ops.category_a_forward_recovery_rehearsal import validate_restore_evidence
from ops.bootstrap_cloud_database import upsert_login

ROOT = Path(__file__).parents[1]


async def child(fixture_path):
    fixture = json.loads(fixture_path.read_text())
    url = make_url(settings.DATABASE_URL_ASYNC)
    assert url.database == fixture["database"] and url.username == fixture["login"]
    assert url.host in {"localhost", "127.0.0.1"} and not settings.is_production
    import app.models
    from app.database import AsyncSessionLocal, async_engine
    from app.core.tenant_context import TenantContextGuard
    from app.core.database_security import inspect_database_security
    from app.modules.registration.models.catalogue_reconciliation import CatalogueReconciliationRun as Run, CatalogueReconciliationWork as Work
    from app.modules.registration.models.form_template import FormTemplate, FormTemplateReconciliation
    from app.modules.registration.models.form_category import FormCategory, FormCategoryReconciliation
    from app.modules.registration.models.catalogue_reconciliation import CatalogueDocumentReconciliation
    from app.modules.registration.services import catalogue_work
    from app.tasks import catalogue_reconciliation as worker
    platform, owner, actor = [uuid.UUID(fixture[key]) for key in ("platform", "owner", "actor")]
    result = dict(status="FAILED", database=url.database, login=url.username, stage="restricted_role_preflight")
    try:
        async with AsyncSessionLocal() as db:
            security = await inspect_database_security(db)
            result.update(runtime_role_is_safe=security.runtime_role_is_safe,
                missing_canary_policies=list(security.missing_canary_policies))
            assert security.runtime_role_is_safe and not security.missing_canary_policies
            role = (await db.execute(text("SELECT current_user AS login,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user"))).one()
            assert role.login == fixture["login"] and not role.rolsuper and not role.rolbypassrls
            assert await db.scalar(text("SELECT relrowsecurity AND relforcerowsecurity AND NOT pg_has_role(current_user,relowner,'USAGE') FROM pg_class WHERE oid='design.catalogue_reconciliation_work'::regclass"))
            assert not await db.scalar(text("SELECT has_table_privilege(current_user,'design.catalogue_reconciliation_work','TRUNCATE')"))
            async with TenantContextGuard.scoped(db, platform):
                assert await worker._authorise_platform_actor(db, actor) == platform
                run = Run(organization_id=platform, actor_user_id=actor,
                    reason="New isolated restricted-login durable checkpoint acceptance", status="RUNNING", dispatch_attempts=1)
                db.add(run)
                await db.commit()
                run_id = run.id
        result["stage"] = "stage_and_checkpoint_streams"
        await catalogue_work.stage_streams(run_id, actor, 1, None, (owner,), enumeration_complete=True)
        await worker._mark_run_dispatched(run_id, actor, 1)
        pages, projection_counts = 0, []
        for _ in range(16):
            messages = await catalogue_work.claim_pages(platform)
            if not messages:
                break
            for message in messages:
                if fixture.get("bounded_projection"):
                    async with AsyncSessionLocal() as db:
                        async with TenantContextGuard.scoped(db, platform):
                            before = await db.get(Work, message[0])
                            before_stage, before_kind = before.stage, before.kind
                completed = await catalogue_work.execute_page(*message)
                assert completed["status"] in {"PENDING", "COMPLETED"}
                assert await catalogue_work.execute_page(*message) == {"status": "STALE_OR_UNAVAILABLE"}
                if fixture.get("bounded_projection") and before_kind == "TENANT":
                    async with AsyncSessionLocal() as db:
                        async with TenantContextGuard.scoped(db, owner):
                            changed = await db.scalar(select(func.count()).select_from(FormTemplate).where(
                                FormTemplate.organization_id == owner, FormTemplate.version == 2,
                                FormTemplate.category_key == fixture["projection_slug"]))
                            if before_stage == "FORM_CATEGORY":
                                assert changed == 0
                            elif before_stage == "FORM_TEMPLATE":
                                assert changed == (100, 200, 204)[len(projection_counts)]
                                projection_counts.append(changed)
                pages += 1
        result["stage"] = "independent_completion_read"
        async with AsyncSessionLocal() as db:
            async with TenantContextGuard.scoped(db, platform):
                run = await db.get(Run, run_id)
                progress = await catalogue_work.progress(db, run)
                assert progress["completion_status"] == "COMPLETED" and progress["streams_total"] == 2
                assert progress["streams_completed"] == 2 and progress["checked_count"] >= 205
                result.update(progress)
            if fixture.get("bounded_projection"):
                assert projection_counts == [100, 200, 204] and progress["blocked_count"] == 1
                async with TenantContextGuard.scoped(db, owner):
                    blocked_id, purpose_id = uuid.UUID(fixture["blocked_template"]), uuid.UUID(fixture["purpose_template"])
                    records = (await db.execute(select(FormTemplateReconciliation.template_version,
                        FormTemplateReconciliation.operation, FormTemplateReconciliation.status).where(
                        FormTemplateReconciliation.template_id == blocked_id))).all()
                    assert set(records) == {(1, "DOCUMENT_VALIDATION", "BLOCKED"),
                        (2, "DOCUMENT_VALIDATION", "BLOCKED"), (2, "CATEGORY_KEY_NORMALIZATION", "COMPLETED")}
                    purpose = await db.get(FormTemplate, purpose_id)
                    assert purpose.version == 1 and purpose.category_key == "registration"
                result.update(bounded_projection_counts=projection_counts,
                    blocked_history_preserved=True, operational_purpose_preserved=True)
            if fixture.get("category_document"):
                assert progress["blocked_count"] == 4
                for global_category, identifier in ((True, fixture["invalid_global_category"]),
                        (False, fixture["invalid_owned_category"])):
                    async with TenantContextGuard.scoped(db, platform if global_category else owner):
                        category_id = uuid.UUID(identifier)
                        row = await db.scalar(select(FormCategory).where(FormCategory.id == category_id)
                            .execution_options(shared_form_catalogue=True))
                        assert row.version == 2 and row.sort_order == -1
                        model = FormCategoryReconciliation if global_category else CatalogueDocumentReconciliation
                        selector = model.category_id if global_category else model.resource_id
                        records = list((await db.scalars(select(model).where(selector == category_id))).all())
                        validation = "TAXONOMY_VALIDATION" if global_category else "DOCUMENT_VALIDATION"
                        states = {(item.category_version if global_category else item.resource_version,
                            item.operation, item.status) for item in records}
                        assert states == {(1, validation, "VALID"),
                            (1, "DOCUMENT_REVALIDATION", "BLOCKED"), (2, validation, "BLOCKED")}
                        old = next(item for item in records if item.status == "VALID")
                        assert old.details == {"historical_proof": "immutable"}
                async with TenantContextGuard.scoped(db, owner):
                    operational = await db.get(FormTemplate, uuid.UUID(fixture["invalid_operational_template"]))
                    legacy = await db.get(FormTemplate, uuid.UUID(fixture["invalid_legacy_template"]))
                    assert operational.version == 2 and operational.category_key == "registration"
                    assert legacy.version == 1 and legacy.category_key == "legacy-unresolved"
                result.update(category_documents_quarantined=2, historical_category_evidence_preserved=True,
                    malformed_taxonomy_projection_refused=True, operational_consumer_quarantined=True)
            if fixture.get("long_category_key"):
                from ops.category_a_long_category_key_runtime import exercise
                result.update(await exercise(db, fixture))
            # Customer context cannot inspect control-plane checkpoints.
            async with TenantContextGuard.scoped(db, owner):
                assert await db.scalar(text("SELECT count(*) FROM design.catalogue_reconciliation_work")) == 0
        result.update(status="PASSED", page_transactions=pages, actual_restricted_login=True,
            default_platform_customer_flow="NOT_RUN", provider_io="NOT_RUN")
    except Exception as error:
        result["error_type"] = type(error).__name__
        if isinstance(getattr(error, "detail", None), dict):
            result["denial_code"] = error.detail.get("code")
    finally:
        await async_engine.dispose()
        output = fixture_path.with_name(fixture_path.stem + "-runtime.json")
        with output.open("x", encoding="utf-8") as handle:
            json.dump(result, handle, indent=2)
        print(json.dumps({"status": result["status"], "stage": result["stage"]}))
    return 0 if result["status"] == "PASSED" else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--child", type=Path)
    parser.add_argument("--broker-recovery", action="store_true")
    parser.add_argument("--catalogue-authority", action="store_true")
    parser.add_argument("--worker-target-lifecycle", action="store_true")
    parser.add_argument("--bounded-projection", action="store_true")
    parser.add_argument("--category-document", action="store_true")
    parser.add_argument("--long-category-key", action="store_true")
    args = parser.parse_args()
    target_revision = "20261022_3670" if args.broker_recovery else "20261021_3660"
    if sum((args.broker_recovery, args.catalogue_authority, args.worker_target_lifecycle,
            args.bounded_projection, args.category_document, args.long_category_key)) > 1:
        parser.error("Select one isolated runtime probe mode")
    if args.child:
        if args.worker_target_lifecycle:
            from ops.category_a_worker_target_runtime import run
            return asyncio.run(run(args.child))
        if args.catalogue_authority:
            from ops.category_a_catalogue_authority_runtime import run
            return asyncio.run(run(args.child))
        if args.broker_recovery:
            from ops.category_a_catalogue_broker_rehearsal import run
            return run(args.child)
        return asyncio.run(child(args.child))
    target = make_url(settings.DATABASE_URL_SYNC).set(database=SOURCE)
    assert not settings.is_production and target.host in {"localhost", "127.0.0.1"}
    backup = ROOT / "test-results/category-a-backup-restore-4eeff58ce5f1439b950b4dc5e457e74a.json"
    template = validate_restore_evidence(json.loads(backup.read_text()))
    run_id = uuid.uuid4().hex
    name = f"category_a_restore_{datetime.now(timezone.utc):%Y%m%d}_{run_id[:12]}"
    login = f"category_a_checkpoint_{run_id[:12]}"
    output = ROOT / "test-results" / f"category-a-durable-work-{run_id}.json"
    fixture_path = ROOT / "test-results" / f"category-a-durable-fixture-{run_id}.json"
    control, clone = create_engine(target), None
    created = login_created = False
    result = dict(status="FAILED", database=name, run_id=run_id, environment="local_backup_derived_rehearsal",
        applied_history_rewritten=False, production_acceptance="NOT_RUN")
    try:
        with control.connect().execution_options(isolation_level="AUTOCOMMIT") as c:
            assert c.scalar(text("SELECT datallowconn FROM pg_database WHERE datname=:name"), {"name": template}) is False
            assert c.scalar(text("SELECT count(*) FROM pg_stat_activity WHERE datname=:name"), {"name": template}) == 0
            quote = c.dialect.identifier_preparer.quote
            c.execute(text(f"CREATE DATABASE {quote(name)} TEMPLATE {quote(template)}"))
            created = True
        url = target.set(database=name)
        environment = dict(os.environ, MIGRATION_DATABASE_URL_SYNC=url.render_as_string(hide_password=False))
        migration = subprocess.run([sys.executable, "-m", "alembic", "upgrade", target_revision],
            cwd=ROOT, env=environment, capture_output=True, text=True, timeout=180)
        assert migration.returncode == 0
        clone = create_engine(url)
        if args.long_category_key:
            from ops.category_a_category_key_migration import rehearse_short_rollback
            result["short_key_rollback"] = rehearse_short_rollback(clone, ROOT, environment)
        import app.models
        from sqlalchemy.orm import Session
        from app.modules.platform.models.organization import Organization
        from app.modules.identity.models.user import User
        from app.modules.rbac.models.access_foundation import OrganizationAccessRevision
        from app.modules.registration.models.form_category import FormCategory
        from app.modules.registration.models.form_category import FormCategoryReconciliation
        from app.modules.registration.models.form_template import FormTemplate, FormTemplateReconciliation
        from app.modules.registration.models.catalogue_reconciliation import CatalogueDocumentReconciliation
        with Session(clone, expire_on_commit=False) as db:
            assert db.scalar(text("SELECT version_num FROM public.alembic_version")) == target_revision
            platform = Organization(name="Checkpoint control fixture", slug=f"checkpoint-control-{run_id}", is_platform_org=True)
            owner = Organization(name="Checkpoint target fixture", slug=f"checkpoint-target-{run_id}")
            db.add_all([platform, owner])
            db.flush()
            actor = User(organization_id=platform.id, email=f"checkpoint-{run_id}@example.test", first_name="Checkpoint",
                last_name="Operator", role="super_admin", platform_role="SUPER_ADMIN", is_active=True)
            db.add_all([actor, OrganizationAccessRevision(organization_id=platform.id), OrganizationAccessRevision(organization_id=owner.id)])
            categories = [FormCategory(organization_id=owner.id, name=f"Runtime page {i}", slug=f"checkpoint-{run_id}-{i}") for i in range(205)]
            db.add_all(categories)
            if args.long_category_key:
                review_global = FormCategory(name="Historical long category review",
                    slug=f"long-review-{run_id}")
                retire_source = FormCategory(name="Long category retirement source", slug=f"long-source-{run_id}")
                retire_target = FormCategory(name="Long category retirement target", slug=run_id + "x" * 68)
                db.add_all([review_global, retire_source, retire_target])
                db.flush()
                db.add(FormCategoryReconciliation(category_id=review_global.id, category_version=1,
                    operation="TAXONOMY_VALIDATION", status="BLOCKED", actor_user_id=actor.id))
                db.add(CatalogueDocumentReconciliation(organization_id=owner.id,
                    resource_type="FORM_CATEGORY", resource_id=categories[0].id, resource_version=1,
                    operation="DOCUMENT_VALIDATION", status="BLOCKED", actor_user_id=actor.id))
                long_templates = [FormTemplate(organization_id=owner.id if index < 4 else None,
                    scope_type="ORGANIZATION" if index < 4 else "GLOBAL", category_id=category.id if category else None,
                    category_key=key, fields=[], settings={}, name=f"Long category transition {index}",
                    slug=f"long-transition-{run_id}-{index}") for index, (category, key) in enumerate((
                        (categories[0], "legacy-key"), (review_global, "legacy-key"),
                        (retire_source, "legacy-key"), (retire_source, "registration"), (None, "legacy-key")))]
                db.add_all(long_templates)
                db.flush()
                db.add_all([FormTemplateReconciliation(template_id=row.id, template_version=1,
                    operation="DOCUMENT_VALIDATION", status="BLOCKED", actor_user_id=actor.id) for row in long_templates])
            if args.category_document:
                categories[0].sort_order = -1
                invalid_global = FormCategory(name="Historical global document fixture",
                    slug=f"invalid-global-{run_id}", sort_order=-1)
                db.add(invalid_global)
                db.flush()
                db.add(FormCategoryReconciliation(category_id=invalid_global.id, category_version=1,
                    operation="TAXONOMY_VALIDATION", status="VALID", actor_user_id=actor.id,
                    details={"historical_proof": "immutable"}))
                db.add(CatalogueDocumentReconciliation(organization_id=owner.id,
                    resource_type="FORM_CATEGORY", resource_id=categories[0].id, resource_version=1,
                    operation="DOCUMENT_VALIDATION", status="VALID", actor_user_id=actor.id,
                    details={"historical_proof": "immutable"}))
                invalid_templates = [FormTemplate(organization_id=owner.id, scope_type="ORGANIZATION",
                    category_id=category.id, category_key=key, fields=[], settings={},
                    name=f"Historical category consumer {index}", slug=f"invalid-consumer-{run_id}-{index}")
                    for index, (category, key) in enumerate(((categories[0], "registration"),
                        (invalid_global, "legacy-unresolved")))]
                db.add_all(invalid_templates)
                db.flush()
                db.add_all([FormTemplateReconciliation(template_id=row.id, template_version=1,
                    operation="DOCUMENT_VALIDATION", status="VALID" if index == 0 else "BLOCKED",
                    actor_user_id=actor.id) for index, row in enumerate(invalid_templates)])
            if args.bounded_projection:
                db.flush()
                base = (1 << 128) - 4096
                templates = [FormTemplate(id=uuid.UUID(int=base + i), organization_id=owner.id,
                    scope_type="ORGANIZATION", category_id=categories[0].id,
                    category_key="registration" if i == 204 else "legacy-key", fields=[], settings={},
                    name=f"Runtime bounded projection {i}", slug=f"bounded-{run_id}-{i}") for i in range(205)]
                db.add_all(templates)
                db.flush()
                db.add_all([FormTemplateReconciliation(template_id=row.id, template_version=1,
                    operation="DOCUMENT_VALIDATION", status="BLOCKED" if i == 0 else "VALID",
                    actor_user_id=actor.id) for i, row in enumerate(templates)])
            db.commit()
            fixture = dict(database=name, login=login, platform=str(platform.id), owner=str(owner.id), actor=str(actor.id),
                migration_revision=target_revision)
            if args.broker_recovery:
                from datetime import date
                from app.modules.rbac.models.access_foundation import OperationalWorkspace
                from app.modules.events.models.event import Event
                from app.modules.programme.models import ProgrammeEvaluationPlan
                workspace = OperationalWorkspace(organization_id=owner.id, name="Broker rubric fixture")
                db.add(workspace)
                db.flush()
                event = Event(organization_id=owner.id, operational_workspace_id=workspace.id,
                    created_by=actor.id, name="Broker rubric fixture", short_code=f"B{run_id[:9]}",
                    start_date=date(2026, 10, 26), end_date=date(2026, 10, 27), location="Local fixture", timezone="UTC")
                db.add(event)
                db.flush()
                plan = ProgrammeEvaluationPlan(organization_id=owner.id, event_id=event.id,
                    name="Broker persisted rubric", rubric=[{"key": "quality", "label": "Quality", "max": 10, "weight": 100}],
                    reviewer_ids=[], status="ACTIVE")
                db.add(plan)
                db.commit()
                fixture["rubric_plan"] = str(plan.id)
            if args.bounded_projection:
                fixture.update(bounded_projection=True, projection_slug=categories[0].slug,
                    blocked_template=str(templates[0].id), purpose_template=str(templates[-1].id))
            if args.category_document:
                fixture.update(category_document=True, invalid_owned_category=str(categories[0].id),
                    invalid_global_category=str(invalid_global.id),
                    invalid_operational_template=str(invalid_templates[0].id),
                    invalid_legacy_template=str(invalid_templates[1].id))
            if args.long_category_key:
                fixture["long_category_key"] = dict(owned_category=str(categories[0].id),
                    global_category=str(review_global.id), retire_source=str(retire_source.id),
                    target_category=str(retire_target.id), target_slug=retire_target.slug,
                    owned_slug="o" + run_id + "x" * 67, global_slug="g" + run_id + "x" * 67,
                    templates=[str(row.id) for row in long_templates])
            if args.catalogue_authority or args.worker_target_lifecycle:
                revoker = User(organization_id=platform.id, email=f"checkpoint-revoker-{run_id}@example.test",
                    first_name="Fixture", last_name="Revoker", role="super_admin", platform_role="SUPER_ADMIN", is_active=True)
                db.add(revoker)
                db.commit()
                fixture["revoker"] = str(revoker.id)
        password = secrets.token_urlsafe(40)
        raw = control.raw_connection()
        try:
            with raw.cursor() as cursor:
                upsert_login(cursor, login, password, "event_runtime")
            raw.commit()
            login_created = True
        finally:
            raw.close()
        runtime = url.set(username=login, password=password)
        environment.update(DATABASE_URL_SYNC=runtime.render_as_string(hide_password=False),
            DATABASE_URL_ASYNC=runtime.set(drivername="postgresql+asyncpg").render_as_string(hide_password=False))
        with fixture_path.open("x", encoding="utf-8") as handle:
            json.dump(fixture, handle)
        child_args = [sys.executable, __file__, "--child", str(fixture_path)]
        if args.broker_recovery:
            child_args.append("--broker-recovery")
        if args.catalogue_authority:
            child_args.append("--catalogue-authority")
        if args.worker_target_lifecycle:
            child_args.append("--worker-target-lifecycle")
        if args.bounded_projection:
            child_args.append("--bounded-projection")
        if args.category_document:
            child_args.append("--category-document")
        if args.long_category_key:
            child_args.append("--long-category-key")
        probe = subprocess.run(child_args, cwd=ROOT,
            env=environment, capture_output=True, text=True, timeout=660 if args.broker_recovery else 180)
        runtime_path = fixture_path.with_name(fixture_path.stem + "-runtime.json")
        evidence = json.loads(runtime_path.read_text())
        result.update(runtime_artifact=runtime_path.name, runtime_status=evidence["status"], runtime_stage=evidence["stage"])
        assert probe.returncode == 0 and evidence["status"] == "PASSED"
        if args.long_category_key:
            from ops.category_a_category_key_migration import rehearse_long_rollback_refusal
            result["long_key_rollback"] = rehearse_long_rollback_refusal(clone, ROOT, environment)
        result.update(status="PASSED", migration_revision=target_revision, actual_restricted_login=True)
    except Exception as error:
        result["error_type"] = type(error).__name__
    finally:
        if clone:
            clone.dispose()
        if created:
            try:
                quarantine_database(control, name)
                result["database_quarantined"] = True
            except Exception as error:
                result.update(status="FAILED", quarantine_error_type=type(error).__name__)
        if login_created:
            try:
                with control.connect().execution_options(isolation_level="AUTOCOMMIT") as c:
                    assert c.scalar(text("SELECT count(*) FROM pg_stat_activity WHERE usename=:name"), {"name": login}) == 0
                    c.execute(text(f"DROP ROLE {c.dialect.identifier_preparer.quote(login)}"))
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
