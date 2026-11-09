"""Explicit named local cohort upgrade, verified snapshot, fail-closed recovery.

Default is read-only. No arbitrary database argument, stamping, downgrade,
role grants or historical document repairs are supported.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import uuid

sys.path.insert(0, str(Path(__file__).parents[1]))
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from app.config import settings
from ops.category_a_current_cohort_refresh import SOURCE, ROOT, REVISION, preflight
from ops.category_a_backup_restore_rehearsal import fingerprint, quarantine_database

PREVIOUS = "20261021_3660"


def contain_retained_cohort(control):
    # Do not broaden the restored-clone helper's target allowlist. This is an
    # explicit separate containment operation on the one approved test cohort.
    with control.connect().execution_options(isolation_level="AUTOCOMMIT") as db:
        if db.scalar(text("SELECT count(*) FROM pg_stat_activity WHERE datname=:name"), {"name": SOURCE}):
            raise RuntimeError("Named cohort has live sessions; containment needs operator coordination")
        quoted = db.dialect.identifier_preparer.quote(SOURCE)
        db.execute(text(f"ALTER DATABASE {quoted} ALLOW_CONNECTIONS false"))
        if db.scalar(text("SELECT datallowconn FROM pg_database WHERE datname=:name"), {"name": SOURCE}) is not False:
            raise RuntimeError("Cohort containment not confirmed")


def snapshot(engine):
    with engine.connect().execution_options(isolation_level="REPEATABLE READ") as db, db.begin():
        db.execute(text("SET TRANSACTION READ ONLY"))
        return fingerprint(db)


def execute():
    prepared = preflight(expected_revision=PREVIOUS)
    if prepared["pending_runs"] or prepared["pending_work"]:
        raise RuntimeError("Drain pending reconciliation before migration")
    base = make_url(settings.DATABASE_URL_SYNC).set(database=SOURCE)
    if settings.is_production or base.host not in {"localhost", "127.0.0.1"}:
        raise RuntimeError("Only the approved named local cohort is permitted")
    identity = uuid.uuid4().hex
    backup_name = f"category_a_restore_{datetime.now(timezone.utc):%Y%m%d}_{identity[:12]}"
    output = ROOT / "test-results" / f"category-a-retained-upgrade-{identity}.json"
    source, control, backup = create_engine(base), create_engine(base.set(database="postgres")), None
    result = dict(status="FAILED", stage="drain_preflight", source_database=SOURCE,
        previous_revision=PREVIOUS, target_revision=REVISION, backup_database=backup_name,
        applied_history_rewritten=False, production_acceptance="NOT_RUN")
    result["migration_sha256"] = hashlib.sha256((ROOT / "alembic/versions/20261022_3670_programme_rubric_reconciliation.py").read_bytes()).hexdigest()
    created = migration_started = False
    try:
        with control.begin() as db:
            if db.scalar(text("SELECT count(*) FROM pg_stat_activity WHERE datname=:name"), {"name": SOURCE}):
                raise RuntimeError("Drain named cohort database sessions before migration")
        before = snapshot(source)
        source.dispose()
        with control.connect().execution_options(isolation_level="AUTOCOMMIT") as db:
            if db.scalar(text("SELECT count(*) FROM pg_database WHERE datname=:name"), {"name": backup_name}):
                raise RuntimeError("Backup target already exists")
            quote = db.dialect.identifier_preparer.quote
            db.execute(text("SET statement_timeout='60s'"))
            db.execute(text(f"CREATE DATABASE {quote(backup_name)} TEMPLATE {quote(SOURCE)}"))
            created = True
        result["stage"] = "backup_verification"
        backup = create_engine(base.set(database=backup_name))
        if snapshot(backup) != before or snapshot(source) != before:
            raise RuntimeError("Backup/source changed before migration; do not proceed")
        backup.dispose()
        quarantine_database(control, backup_name)
        result.update(backup_verified=True, backup_quarantined=True)
        result["before"] = before
        with source.begin() as db:
            old_work = db.execute(text("SELECT id,to_jsonb(w) AS document FROM design.catalogue_reconciliation_work w ORDER BY id")).all()
        source.dispose()
        result["stage"] = "additive_upgrade"
        migration_started = True
        environment = dict(os.environ, MIGRATION_DATABASE_URL_SYNC=base.render_as_string(hide_password=False))
        migrated = subprocess.run([sys.executable, "-m", "alembic", "upgrade", REVISION],
            cwd=ROOT, env=environment, capture_output=True, text=True, timeout=180)
        if migrated.returncode:
            raise RuntimeError("Migration failed; retain backup and use forward recovery")
        after = snapshot(source)
        result["after"] = after
        exempt = {"public.alembic_version", "design.catalogue_reconciliation_work"}
        if ({k: v for k, v in before["tables"].items() if k not in exempt}
                != {k: v for k, v in after["tables"].items() if k not in exempt}
                or before["sequences"] != after["sequences"] or after["migration_revision"] != REVISION):
            raise RuntimeError("Unexpected data/sequence/revision change")
        with source.begin() as db:
            if old_work != db.execute(text("SELECT id,to_jsonb(w)-'coverage_version' AS document FROM design.catalogue_reconciliation_work w ORDER BY id")).all():
                raise RuntimeError("Historical stream state changed")
            if db.scalar(text("SELECT count(*) FROM design.catalogue_reconciliation_work WHERE coverage_version<>1")):
                raise RuntimeError("Historical stream coverage was relabelled")
        result["stage"] = "current_cohort_preflight"
        ready = preflight()
        result.update(status="MIGRATED_NOT_RELEASED", stage="completed",
            data_and_sequences_preserved=True, old_streams_preserved_as_coverage_1=True,
            cohort_organizations=len(ready["cohort"]), pending_runs=ready["pending_runs"],
            pending_work=ready["pending_work"], default_platform_customer_flow="NOT_RUN")
    except Exception as error:
        result["error_type"] = type(error).__name__
        if migration_started:
            source.dispose()
            try:
                contain_retained_cohort(control)
                result["source_contained_for_forward_recovery"] = True
            except Exception as containment:
                result["containment_error_type"] = type(containment).__name__
    finally:
        source.dispose()
        if backup is not None:
            backup.dispose()
        if created:
            try:
                quarantine_database(control, backup_name)
                result["backup_quarantined"] = True
            except Exception as error:
                result.update(status="FAILED", backup_quarantine_error_type=type(error).__name__)
        control.dispose()
        result["operator_source_sha256"] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
        with output.open("x", encoding="utf-8") as artifact:
            json.dump(result, artifact, indent=2)
        print(json.dumps({**{key: value for key, value in result.items() if key not in {"before", "after"}},
            "evidence_artifact": output.name}))
    return 0 if result["status"] == "MIGRATED_NOT_RELEASED" else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--execute", action="store_true")
    args = parser.parse_args()
    if args.execute:
        raise SystemExit(execute())
    print(json.dumps(preflight(expected_revision=PREVIOUS), indent=2))
