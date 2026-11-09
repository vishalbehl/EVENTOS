"""Local restored-clone containment rehearsal; does not deploy application binaries."""
from dataclasses import asdict
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import secrets
import sys
import uuid

sys.path.insert(0, str(Path(__file__).parents[1]))
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import DBAPIError
from app.config import settings
from app.core.database_security import enforce_runtime_database_login
from ops.bootstrap_cloud_database import upsert_login
from ops.category_a_backup_restore_rehearsal import (
    EXPECTED_REVISION,
    FOREIGN,
    OWNER,
    SOURCE,
    fingerprint,
    quarantine_database,
)


def validate_restore_evidence(evidence, *, expected_revision="20261019_3640"):
    """Validate an isolated backup artifact for its explicit consumer revision.

    Older migration probes deliberately use the retained 3640 template. The
    forward-recovery entry point passes the current release revision instead of
    silently treating an old template as current recovery evidence.
    """
    if not isinstance(evidence, dict) or evidence.get("status") != "PASSED":
        raise ValueError("A passing local backup artifact is required")
    name = evidence.get("restored_database", "")
    if not isinstance(name, str) or not re.fullmatch(r"category_a_restore_\d{8}_[0-9a-f]{12}", name):
        raise ValueError("Only an isolated restored database is permitted")
    if (evidence.get("environment") != "local_isolated_rehearsal"
            or evidence.get("source_database") != SOURCE
            or evidence.get("restored_database_quarantined") is not True
            or evidence.get("migration_revision") != expected_revision):
        raise ValueError("Backup evidence does not identify the approved quarantined clone")
    return name


def assert_connections_blocked(url):
    probe = create_engine(url, connect_args={"connect_timeout": 5})
    try:
        try:
            with probe.connect():
                pass
        except DBAPIError as error:
            # Authentication/network failures are not containment evidence.
            # libpq/psycopg2 may omit SQLSTATE for startup FATAL messages.
            # Accept only this exact, database-specific local PG diagnostic;
            # never treat arbitrary OperationalError/auth/timeouts as success.
            expected = f'FATAL:  database "{url.database}" is not currently accepting connections'
            lines = [line.strip() for line in str(error.orig).splitlines()]
            diagnostic_matches = any(line == expected or line.endswith("failed: " + expected) for line in lines)
            if getattr(error.orig, "pgcode", None) != "55000" and not diagnostic_matches:
                raise RuntimeError("Expected PostgreSQL database containment rejection") from None
        else:
            raise RuntimeError("Quarantined database unexpectedly accepted a connection")
    finally:
        probe.dispose()


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Provide one passing local backup evidence file")
    evidence_path = Path(sys.argv[1]).resolve(strict=True)
    evidence_bytes = evidence_path.read_bytes()
    evidence = json.loads(evidence_bytes)
    name = validate_restore_evidence(evidence, expected_revision=EXPECTED_REVISION)
    operator_url = make_url(settings.DATABASE_URL_SYNC).set(database=SOURCE)
    if settings.is_production or operator_url.host not in {"localhost", "127.0.0.1"}:
        raise SystemExit("Only local rehearsal infrastructure is permitted")
    clone_url = operator_url.set(database=name)
    control = create_engine(operator_url, connect_args={"connect_timeout": 5})
    clone = runtime = None
    run_id = uuid.uuid4().hex
    result = dict(status="FAILED", environment="local_isolated_rehearsal", run_id=run_id,
        restored_database=name, backup_evidence_sha256=hashlib.sha256(evidence_bytes).hexdigest(),
        recovery_strategy="fail_closed_forward_only", application_binary_rollback="UNAVAILABLE",
        application_deployment="NOT_RUN", edge_worker_storage_containment="NOT_RUN",
        staging_or_production_acceptance="NOT_RUN", started_at=datetime.now(timezone.utc).isoformat())
    opened = False
    stage = "containment_preflight"
    try:
        login = "category_a_rehearsal_runtime_20261015"
        with control.connect() as connection:
            assert connection.scalar(text("SELECT rolsuper FROM pg_roles WHERE rolname=current_user"))
            assert connection.scalar(text("SELECT datallowconn FROM pg_database WHERE datname=:name"), {"name": name}) is False
            assert connection.scalar(text("SELECT count(*) FROM pg_stat_activity WHERE datname=:name OR usename=:login"), {"name": name, "login": login}) == 0
        password = secrets.token_urlsafe(40)
        raw = control.raw_connection()
        try:
            with raw.cursor() as cursor:
                upsert_login(cursor, login, password, "event_runtime")
            raw.commit()
        finally:
            raw.close()
        runtime_url = clone_url.set(username=login, password=password)
        assert_connections_blocked(runtime_url)
        result["runtime_connections_denied_during_containment"] = True
        stage = "isolated_forward_validation"
        # No API, worker or external provider is started. Open only this clone
        # for direct operator/runtime checks, then always quarantine it again.
        with control.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
            quoted = connection.dialect.identifier_preparer.quote(name)
            connection.execute(text(f"ALTER DATABASE {quoted} ALLOW_CONNECTIONS true"))
            opened = True
        clone = create_engine(clone_url, connect_args={"connect_timeout": 5})
        with clone.connect().execution_options(isolation_level="REPEATABLE READ") as connection, connection.begin():
            connection.execute(text("SET TRANSACTION READ ONLY"))
            restored = fingerprint(connection)
        for key in ("tables", "schema_security_sha256", "sequences", "migration_revision"):
            assert restored[key] == evidence[key], "Clone differs from verified recovery point"
        result["runtime_security"] = asdict(enforce_runtime_database_login(runtime_url))
        runtime = create_engine(runtime_url, connect_args={"connect_timeout": 5})
        with runtime.connect() as connection:
            assert connection.scalar(text("SELECT count(*) FROM organizer_access.operational_workspaces")) == 0
            connection.execute(text("SELECT set_config('app.current_organization_id',:owner,true)"), {"owner": str(OWNER)})
            assert connection.scalar(text("SELECT count(*) FROM organizer_access.operational_workspaces WHERE organization_id=:owner"), {"owner": OWNER}) >= 1
            assert connection.scalar(text("SELECT count(*) FROM organizer_access.operational_workspaces WHERE organization_id=:foreign"), {"foreign": FOREIGN}) == 0
            connection.rollback()
            assert connection.scalar(text("SELECT count(*) FROM organizer_access.operational_workspaces")) == 0
        result.update(status="PASSED", data_schema_security_unchanged=True,
            scoped_runtime_read_and_transaction_reset_verified=True,
            migration_revision=restored["migration_revision"], tables_verified=len(restored["tables"]),
            rows_verified=sum(table["rows"] for table in restored["tables"].values()))
    except Exception as error:
        result.update(failed_stage=stage, error_type=type(error).__name__)
    finally:
        if runtime is not None:
            runtime.dispose()
        if clone is not None:
            clone.dispose()
        try:
            if opened:
                quarantine_database(control, name)
            assert_connections_blocked(clone_url)
            result["final_database_containment_verified"] = True
        except Exception as error:
            if "failed_stage" in result:
                result["initial_failure"] = {key: result[key] for key in ("failed_stage", "error_type")}
            result.update(status="FAILED", failed_stage="final_containment", error_type=type(error).__name__)
        control.dispose()
    result.update(completed_at=datetime.now(timezone.utc).isoformat(),
        probe_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest())
    output = Path(__file__).parents[1] / f"test-results/category-a-forward-recovery-{run_id}.json"
    with output.open("x", encoding="utf-8") as artifact:
        json.dump(result, artifact, indent=2)
    print(json.dumps(result, indent=2))
    print(f"Evidence: {output.name}")
    return 0 if result["status"] == "PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
