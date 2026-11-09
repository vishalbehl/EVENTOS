"""Read-only path assessment; never stamp, skip or rewrite migration history."""
from pathlib import Path

from alembic.script import ScriptDirectory
from sqlalchemy import text

SESSION_REVISION = "20261008_3440"


def require_context_expansion(connection) -> dict:
    scripts = ScriptDirectory(str(Path(__file__).parents[1] / "alembic"))
    if connection.scalar(text("SELECT to_regclass('public.alembic_version')")) is None:
        raise RuntimeError("Migration baseline is absent. Apply the approved fresh-schema path before cohort reconciliation.")
    applied = tuple(connection.execute(text("SELECT version_num FROM public.alembic_version")).scalars())
    if len(applied) != 1:
        raise RuntimeError("Expected one applied migration head; reconcile migration branches before rollout.")
    # Graph ancestry, not lexical comparison of revision names.
    ancestors = {revision.revision for revision in scripts.iterate_revisions(applied[0], "base")}
    if SESSION_REVISION not in ancestors:
        raise RuntimeError(
            "PRE_3440_POPULATED_PATH_REQUIRES_APPROVAL: historical 3440 performs a single-transaction session backfill. "
            "Do not stamp/skip/rewrite it. Approve and rehearse a compatible upgrade path or retain fail-closed maintenance mode."
        )
    return {"applied_revision": applied[0], "session_expansion": "APPLIED",
        "historical_migration_modified": False}
