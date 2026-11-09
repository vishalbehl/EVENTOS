"""Prepare a populated pre-3440 database without changing migration history.

Dry-run by default. The apply mode revokes every legacy refresh-token family,
increments affected users' authentication revisions, and removes only token
rows whose user/home organisation cannot satisfy migration 3440's foreign-key
and non-null requirements. It never creates memberships or infers authority.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sys
import uuid

sys.path.insert(0, str(Path(__file__).parents[1]))
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, text

REVISION = "20261008_3440"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--approval-reference", required=True)
    parser.add_argument("--build-id", required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if not 12 <= len(args.approval_reference.strip()) <= 200:
        parser.error("Approval reference must be 12-200 characters.")
    if not 7 <= len(args.build_id.strip()) <= 128:
        parser.error("Build identity must be 7-128 characters.")
    database_url = os.environ.get("MIGRATION_DATABASE_URL_SYNC", "")
    if not database_url:
        parser.error("Dedicated MIGRATION_DATABASE_URL_SYNC is required.")
    engine = create_engine(database_url, pool_size=1, max_overflow=0, pool_pre_ping=True)
    run_id = str(uuid.uuid4())
    try:
        with engine.begin() as connection:
            connection.execute(text("SET LOCAL lock_timeout='5s'"))
            connection.execute(text("SET LOCAL statement_timeout='60s'"))
            applied = tuple(connection.execute(text(
                "SELECT version_num FROM public.alembic_version")).scalars())
            if len(applied) != 1:
                raise RuntimeError("Expected exactly one applied Alembic head.")
            scripts = ScriptDirectory(str(Path(__file__).parents[1] / "alembic"))
            ancestors = {item.revision for item in scripts.iterate_revisions(applied[0], "base")}
            if REVISION in ancestors:
                print(json.dumps({"run_id": run_id, "status": "ALREADY_APPLIED",
                    "applied_revision": applied[0], "changed": False}))
                return 0
            columns = {row[0] for row in connection.execute(text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_schema='identity' AND table_name='refresh_tokens'"))}
            if {"active_organization_id", "acting_organization_id", "access_mode"} & columns:
                raise RuntimeError("PARTIAL_3440_SCHEMA_REQUIRES_OPERATOR_RECOVERY")
            counts = connection.execute(text("""
                SELECT count(*) AS total,
                       count(*) FILTER (WHERE NOT token.is_revoked AND token.expires_at > now()) AS active,
                       count(*) FILTER (WHERE actor.id IS NULL OR actor.organization_id IS NULL OR home.id IS NULL) AS invalid_home
                  FROM identity.refresh_tokens token
                  LEFT JOIN identity.users actor ON actor.id=token.user_id
                  LEFT JOIN platform.organizations home ON home.id=actor.organization_id
            """)).mappings().one()
            result = {"run_id": run_id, "build_id": args.build_id,
                "approval_reference": args.approval_reference, "applied_revision": applied[0],
                "legacy_tokens": int(counts["total"]),
                "active_sessions_to_revoke": int(counts["active"]),
                "invalid_token_rows_to_remove": int(counts["invalid_home"]),
                "migration_history_modified": False}
            if not args.apply:
                print(json.dumps({**result, "status": "READY_FOR_APPROVED_SESSION_REVOCATION",
                    "changed": False}))
                return 2 if counts["active"] or counts["invalid_home"] else 0
            # Serialize with login/refresh issuance. Deployment must be in
            # fail-closed maintenance mode while this short transaction runs.
            connection.execute(text("LOCK TABLE identity.refresh_tokens IN ACCESS EXCLUSIVE MODE"))
            # The table lock above already serializes token issuance. PostgreSQL
            # rejects FOR UPDATE on DISTINCT projections.
            users = connection.execute(text("SELECT DISTINCT user_id FROM identity.refresh_tokens")).scalars().all()
            if users:
                connection.execute(text("UPDATE identity.users SET auth_revision=auth_revision+1 "
                    "WHERE id=ANY(:users)"), {"users": list(users)})
            connection.execute(text("UPDATE identity.refresh_tokens SET is_revoked=true, "
                "revoked_at=COALESCE(revoked_at, now()), revoked_reason='category_a_context_upgrade' "
                "WHERE NOT is_revoked"))
            removed = connection.execute(text("DELETE FROM identity.refresh_tokens token USING identity.users actor "
                "LEFT JOIN platform.organizations home ON home.id=actor.organization_id "
                "WHERE token.user_id=actor.id AND (actor.organization_id IS NULL OR home.id IS NULL)"))
            removed_missing_user = connection.execute(text("DELETE FROM identity.refresh_tokens token "
                "WHERE NOT EXISTS (SELECT 1 FROM identity.users actor WHERE actor.id=token.user_id)"))
            print(json.dumps({**result, "status": "PRE_3440_SESSIONS_REVOKED",
                "changed": True, "affected_users": len(users),
                "removed_token_rows": int(removed.rowcount or 0) + int(removed_missing_user.rowcount or 0),
                "next_step": "Run the ordinary Alembic upgrade; do not stamp or edit revision 3440."}))
            return 0
    finally:
        engine.dispose()


if __name__ == "__main__":
    raise SystemExit(main())
