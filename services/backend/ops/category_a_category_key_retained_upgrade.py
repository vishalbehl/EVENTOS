"""Expand only the two approved local retained rehearsals; preserve all data."""
import json
import os
from pathlib import Path
import sys
import uuid

sys.path.insert(0, str(Path(__file__).parents[1]))
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from app.config import settings
from ops.category_a_category_key_migration import VERSION, PREVIOUS, COLUMN, snapshot, assert_preserved, migrate

ROOT = Path(__file__).parents[1]
TARGETS = ("category_a_rehearsal_20261015", "category_a_pre3440_rehearsal_20261015")


def main():
    base = make_url(settings.DATABASE_URL_SYNC)
    if settings.is_production or base.host not in {"localhost", "127.0.0.1"}:
        raise RuntimeError("Only the explicitly named local rehearsals are permitted")
    path = ROOT / "test-results" / f"category-a-retained-key-expansion-{uuid.uuid4().hex}.json"
    result = dict(status="FAILED", environment="local_retained_rehearsals", applied_history_rewritten=False,
        production_acceptance="NOT_RUN", databases=[])
    with path.open("x", encoding="utf-8") as output:
        try:
            for name in TARGETS:
                engine = create_engine(base.set(database=name))
                item = dict(database=name, status="FAILED")
                result["databases"].append(item)
                try:
                    with engine.begin() as connection:
                        assert connection.scalar(text("SELECT current_database()")) == name
                        assert connection.scalar(text("SELECT count(*) FROM pg_stat_activity WHERE "
                            "datname=current_database() AND pid<>pg_backend_pid()")) == 0
                    before = snapshot(engine)
                    revision = before["data"]["migration_revision"]
                    assert revision in {PREVIOUS, VERSION}
                    previous_length = 50 if revision == PREVIOUS else 100
                    assert f"|character varying({previous_length})|" in before["definitions"][COLUMN]
                    item["from_revision"] = revision
                    environment = dict(os.environ, MIGRATION_DATABASE_URL_SYNC=
                        base.set(database=name).render_as_string(hide_password=False))
                    command = migrate(ROOT, environment, "upgrade", VERSION)
                    assert command.returncode == 0
                    after = snapshot(engine)
                    item.update(assert_preserved(before, after, from_length=previous_length,
                        to_length=100, revision=VERSION, metadata_only=True))
                    item.update(status="PASSED", to_revision=VERSION, before=before["data"], after=after["data"])
                finally:
                    engine.dispose()
            result["status"] = "PASSED"
        except Exception as error:
            result["error_type"] = type(error).__name__
        finally:
            json.dump(result, output, indent=2)
    print(json.dumps(dict(status=result["status"], artifact=path.name,
        databases=[{key: row.get(key) for key in ("database", "status", "from_revision", "to_revision",
            "retained_tables", "retained_rows")} for row in result["databases"]])))
    return 0 if result["status"] == "PASSED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
