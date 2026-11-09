"""Create a quarantined-backup-derived local fixture, run restricted-role saves.

Never updates an existing tenant/contract or starts an API/worker/provider.
Generated synthetic records remain only in the final quarantined local clone.
"""
from datetime import date, datetime, timedelta, timezone
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import uuid

sys.path.insert(0, str(Path(__file__).parents[1]))
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session
from app.config import settings
from ops.category_a_backup_restore_rehearsal import SOURCE, quarantine_database
from ops.category_a_forward_recovery_rehearsal import validate_restore_evidence


ROOT = Path(__file__).parents[1]
REVISION = "20261022_3670"


def migrate_clone(url) -> None:
    environment = dict(
        os.environ,
        MIGRATION_DATABASE_URL_SYNC=url.render_as_string(hide_password=False),
    )
    migration = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", REVISION],
        cwd=ROOT,
        env=environment,
        capture_output=True,
        text=True,
        timeout=180,
    )
    if migration.returncode:
        raise RuntimeError(
            "Isolated clone migration failed; inspect the quarantined evidence artifact"
        )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("backup_evidence", type=Path)
    parser.add_argument("--scenario", choices=("abstract", "delegated", "delegated-race"), default="abstract")
    parser.add_argument("--workspace-scope", action="store_true")
    args = parser.parse_args()
    if args.workspace_scope and args.scenario not in {"delegated", "delegated-race"}:
        parser.error("Workspace scope applies only to delegated acceptance")
    delegated = args.scenario in {"delegated", "delegated-race"}
    backup_path = args.backup_evidence.resolve(strict=True)
    if backup_path.stat().st_size > 1024 * 1024:
        raise SystemExit("Backup evidence is oversized")
    backup_bytes = backup_path.read_bytes()
    backup_evidence = json.loads(backup_bytes)
    template = validate_restore_evidence(backup_evidence)
    target = make_url(settings.DATABASE_URL_SYNC).set(database=SOURCE)
    if settings.is_production or settings.ALLOW_TEST_CAPABILITY_BYPASS or target.host not in {"localhost", "127.0.0.1"}:
        raise SystemExit("Only the local enforcement-enabled rehearsal is permitted")
    run_id = uuid.uuid4().hex
    name = f"category_a_restore_{datetime.now(timezone.utc):%Y%m%d}_{run_id[:12]}"
    runtime_login = f"category_a_form_{run_id[:12]}"
    directory = Path(__file__).parents[1] / "test-results"
    control = create_engine(target)
    clone = None
    created = False
    result = dict(status="FAILED", environment="local_isolated_rehearsal", run_id=run_id,
        scenario=args.scenario, scope="WORKSPACE" if args.workspace_scope else "EVENT",
        database=name, backup_database=template, backup_evidence_sha256=hashlib.sha256(backup_bytes).hexdigest(),
        backup_migration_revision=backup_evidence.get("migration_revision"),
        target_migration_revision=REVISION, applied_history_rewritten=False,
        runtime_login=runtime_login,
        started_at=datetime.now(timezone.utc).isoformat(), application_workers_providers="NOT_STARTED",
        production_acceptance="NOT_RUN")
    stage = "clone_preflight"
    try:
        with control.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
            assert connection.scalar(text("SELECT rolsuper FROM pg_roles WHERE rolname=current_user"))
            assert connection.scalar(text("SELECT datallowconn FROM pg_database WHERE datname=:name"), {"name": template}) is False
            assert connection.scalar(text("SELECT count(*) FROM pg_database WHERE datname=:name"), {"name": name}) == 0
            assert connection.scalar(text("SELECT count(*) FROM pg_stat_activity WHERE datname=:name"), {"name": template}) == 0
            quote = connection.dialect.identifier_preparer.quote
            connection.execute(text(f"CREATE DATABASE {quote(name)} TEMPLATE {quote(template)}"))
            created = True
        stage = "forward_migration"
        clone_url = target.set(database=name)
        migrate_clone(clone_url)
        stage = "fresh_fixture_provisioning"
        clone = create_engine(clone_url)
        import app.models
        from app.models import UserOrganizationMembership
        from app.modules.platform.models.organization import Organization
        from app.modules.identity.models.user import User
        from app.modules.events.models.event import Event
        from app.modules.rbac.models.access_foundation import OperationalWorkspace, OrganizationAccessRevision
        from app.modules.platform.models.organization_console import EventCommercialContract
        from app.modules.platform.models.platform_domain_tables import FeatureFlag
        from app.modules.registration.models.form_template import FormTemplate
        with Session(clone, expire_on_commit=False) as db:
            assert db.scalar(text("SELECT version_num FROM public.alembic_version")) == REVISION
            owner = Organization(name="Isolated form acceptance", slug=f"form-acceptance-{run_id}",
                organization_kind="CLIENT" if delegated else "NORMAL")
            db.add(owner)
            db.flush()
            assert not owner.is_platform_org and not owner.has_unrestricted_capabilities
            actor = User(organization_id=owner.id, email=f"abstract-{run_id}@example.test",
                first_name="Synthetic", last_name="Owner", role="organiser", is_active=True)
            workspace = OperationalWorkspace(organization_id=owner.id, name="Isolated acceptance")
            db.add_all([actor, workspace, OrganizationAccessRevision(organization_id=owner.id)])
            db.flush()
            db.add(UserOrganizationMembership(user_id=actor.id, organization_id=owner.id,
                org_role="owner", accepted_at=datetime.now(timezone.utc), is_active=True))
            event = Event(organization_id=owner.id, created_by=actor.id, operational_workspace_id=workspace.id,
                name="Isolated abstract acceptance", short_code=run_id[:8], start_date=date.today(),
                end_date=date.today() + timedelta(days=1), timezone="UTC", status="active")
            db.add(event)
            db.flush()
            # Explicit new fixture contract, not a mutation of existing history,
            # payment simulation, role bypass, or entitlement mock.
            db.add(EventCommercialContract(organization_id=owner.id, event_id=event.id, version=1,
                status="ACTIVE", plan_key="ISOLATED_ABSTRACT_ACCEPTANCE", plan_version="1", currency="INR",
                entitlements={key: {"type": "TIER", "value": value} for key, value in {
                    **({"FEAT_ABSTRACT_SUBMISSION": "BASIC"} if args.scenario == "abstract" else {}),
                    "FEAT_REGISTRATION_FORMS": "STANDARD"}.items()},
                hard_ceilings={}, addons=[], source={"isolated_acceptance_fixture": run_id}, created_by=actor.id))
            db.add(FeatureFlag(organization_id=owner.id, flag_key="organizer_console_entitlement_enforce", is_enabled=True))
            sources = {}
            for kind in (("REGISTRATION", "SURVEY", "SPEAKER_INTAKE") if delegated else ("valid", "wrong_purpose", "retired", "stale")):
                source = FormTemplate(organization_id=owner.id, created_by=actor.id,
                    name="Explicit isolated abstract source", slug=f"abstract-source-{kind}-{run_id}", scope_type="ORGANIZATION",
                    category_key={"REGISTRATION": "registration", "SURVEY": "survey", "SPEAKER_INTAKE": "speaker_intake"}[kind] if delegated
                        else "survey" if kind == "wrong_purpose" else "abstract", fields=[], settings={},
                    is_active=kind != "retired", version=2 if kind == "stale" else 1)
                db.add(source)
                db.flush()
                sources[kind] = str(source.id)
            db.commit()
            fixture = dict(purpose=f"isolated_{'delegated' if delegated else 'abstract'}_runtime_acceptance", database=name,
                organization_id=str(owner.id), actor_id=str(actor.id), event_id=str(event.id), source_ids=sources)
        fixture_path = directory / f"category-a-abstract-fixture-{run_id}.json"
        with fixture_path.open("x", encoding="utf-8") as artifact:
            json.dump(fixture, artifact, indent=2)
        result["fixture_artifact"] = fixture_path.name
        stage = "restricted_business_commands"
        child_script = {"delegated": "category_a_delegated_form_runtime_probe.py",
            "delegated-race": "category_a_delegated_revocation_race_probe.py",
            "abstract": "category_a_abstract_writer_runtime_probe.py"}[args.scenario]
        child = subprocess.run([sys.executable, str(Path(__file__).with_name(child_script)),
            "--isolated-fixture", str(fixture_path), *(["--workspace-scope"] if args.workspace_scope else [])],
            capture_output=True, text=True, timeout=180,
            env=dict(os.environ, CATEGORY_A_RUNTIME_LOGIN=runtime_login))
        matches = re.findall(r"^Evidence: (category-a-(?:abstract-writer|delegated-form|delegated-revocation)-runtime-[0-9a-f]{32}\.json)$", child.stdout, re.MULTILINE)
        if len(matches) != 1:
            raise RuntimeError("Runtime probe did not produce unique structured evidence")
        child_bytes = (directory / matches[0]).read_bytes()
        child_evidence = json.loads(child_bytes)
        result.update(runtime_artifact=matches[0], runtime_artifact_sha256=hashlib.sha256(child_bytes).hexdigest(),
            runtime_status=child_evidence.get("status"))
        assert child.returncode == 0 and child_evidence["status"] == "PASSED"
        assert child_evidence["database"] == name and child_evidence["organization_id"] == fixture["organization_id"]
        if args.scenario == "delegated-race":
            assert child_evidence["independent_final_state_verified"] is True
            assert child_evidence["committed_fixture_state_retained"] is True
        else:
            assert child_evidence["independent_original_state_and_receipts_restored"] is True
        result.update(status="PASSED", checks_verified=len(child_evidence["checks"]))
    except Exception as error:
        result.update(failed_stage=stage, error_type=type(error).__name__)
    finally:
        if clone is not None:
            clone.dispose()
        try:
            with control.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
                if connection.scalar(
                    text("SELECT count(*) FROM pg_roles WHERE rolname=:login"),
                    {"login": runtime_login},
                ):
                    assert connection.scalar(
                        text("SELECT count(*) FROM pg_stat_activity WHERE usename=:login"),
                        {"login": runtime_login},
                    ) == 0
                    quote = connection.dialect.identifier_preparer.quote
                    connection.execute(text(f"DROP ROLE {quote(runtime_login)}"))
                result["temporary_login_removed"] = True
        except Exception as error:
            result.update(status="FAILED", login_cleanup_error_type=type(error).__name__)
        if created:
            try:
                quarantine_database(control, name)
                result["final_clone_quarantined"] = True
            except Exception as error:
                result.update(status="FAILED", quarantine_error_type=type(error).__name__)
        control.dispose()
    result.update(completed_at=datetime.now(timezone.utc).isoformat(),
        probe_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest())
    output = directory / f"category-a-isolated-abstract-acceptance-{run_id}.json"
    with output.open("x", encoding="utf-8") as artifact:
        json.dump(result, artifact, indent=2)
    print(json.dumps(result, indent=2))
    print(f"Evidence: {output.name}")
    return 0 if result["status"] == "PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
