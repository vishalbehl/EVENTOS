"""3650 only, two named local rehearsals; compare every retained table's rows."""
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
from ops.category_a_backup_restore_rehearsal import fingerprint

ROOT = Path(__file__).parents[1]
TARGETS = ("category_a_rehearsal_20261015", "category_a_pre3440_rehearsal_20261015")
RUN_TABLE = "design.catalogue_reconciliation_runs"
NEW_TABLE = "design.catalogue_reconciliation_work"


def legacy_runs(connection):
    digest = hashlib.sha256()
    for value in connection.execute(text("SELECT (to_jsonb(t)-'enumeration_cursor'-'enumeration_complete')::text "
            "FROM design.catalogue_reconciliation_runs t ORDER BY id")).scalars():
        encoded = value.encode()
        digest.update(len(encoded).to_bytes(8, "big"))
        digest.update(encoded)
    return digest.hexdigest()


def main():
    base = make_url(settings.DATABASE_URL_SYNC)
    if settings.is_production or base.host not in {"localhost", "127.0.0.1"}:
        raise RuntimeError("Only explicitly named local rehearsals are permitted")
    run_id = uuid.uuid4().hex
    path = ROOT / "test-results" / f"category-a-retained-checkpoint-upgrade-{run_id}.json"
    result = dict(status="FAILED", run_id=run_id, environment="local_retained_rehearsals",
        history_rewritten=False, production_acceptance="NOT_RUN", databases=[])
    # Reserve a new artifact before any mutation. Never overwrite older evidence.
    with path.open("x", encoding="utf-8") as output:
        try:
            for name in TARGETS:
                engine = create_engine(base.set(database=name))
                item = dict(database=name, status="FAILED")
                result["databases"].append(item)
                try:
                    with engine.begin() as connection:
                        assert connection.scalar(text("SELECT current_database()")) == name
                        assert connection.scalar(text("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()")) == 0
                        before = fingerprint(connection)
                        assert before["migration_revision"] in {"20261019_3640", "20261021_3650"}
                        prior_runs = legacy_runs(connection)
                    item["from_revision"] = before["migration_revision"]
                    environment = dict(os.environ, MIGRATION_DATABASE_URL_SYNC=
                        base.set(database=name).render_as_string(hide_password=False))
                    migration = subprocess.run([sys.executable, "-m", "alembic", "upgrade", "20261021_3650"],
                        cwd=ROOT, env=environment, capture_output=True, text=True, timeout=180)
                    assert migration.returncode == 0
                    with engine.begin() as connection:
                        after = fingerprint(connection)
                        assert after["migration_revision"] == "20261021_3650"
                        assert legacy_runs(connection) == prior_runs
                        ignored = {"public.alembic_version", RUN_TABLE, NEW_TABLE}
                        original = {k: v for k, v in before["tables"].items() if k not in ignored}
                        retained = {k: v for k, v in after["tables"].items() if k not in ignored}
                        assert original == retained and before["sequences"] == after["sequences"]
                        assert before["tables"][RUN_TABLE]["rows"] == after["tables"][RUN_TABLE]["rows"]
                        assert after["tables"][NEW_TABLE]["rows"] == 0
                        assert connection.scalar(text("SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='design.catalogue_reconciliation_work'::regclass"))
                        assert connection.scalar(text("SELECT count(*) FROM pg_policy WHERE polrelid='design.catalogue_reconciliation_work'::regclass")) == 3
                        assert not connection.scalar(text("SELECT has_table_privilege('event_runtime','design.catalogue_reconciliation_work','TRUNCATE')"))
                    item.update(status="PASSED", to_revision=after["migration_revision"],
                        retained_tables_compared=len(original), retained_rows_compared=sum(v["rows"] for v in original.values()),
                        legacy_run_projection_unchanged=True, sequences_unchanged=True,
                        before=before, after=after, forced_rls_and_three_policies=True)
                finally:
                    engine.dispose()
            result["status"] = "PASSED"
        except Exception as error:
            result["error_type"] = type(error).__name__
        finally:
            json.dump(result, output, indent=2)
    print(json.dumps(dict(status=result["status"], artifact=path.name,
        databases=[{k: row.get(k) for k in ("database", "status", "from_revision", "to_revision")} for row in result["databases"]])))
    return 0 if result["status"] == "PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
