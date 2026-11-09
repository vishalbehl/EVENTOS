"""Read-only verifier for an isolated Category A enterprise load cohort."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
from typing import Any

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url


ROOT = Path(__file__).parents[1]
EVIDENCE_ROOT = (ROOT / "test-results").resolve()
CONFIRMATION = "VERIFY-CATEGORY-A-LOAD-COHORT"
MINIMUMS = {"tenants": 1000, "memberships": 100000, "events": 100000}


SNAPSHOT_SQL = text("""
WITH cohort AS MATERIALIZED (
    SELECT id, organization_kind
      FROM platform.organizations
     WHERE slug LIKE :slug_pattern ESCAPE '\\'
       AND is_platform_org = false
       AND is_internal_unrestricted = false
       AND is_active = true
       AND archived_at IS NULL
       AND suspended_at IS NULL
), member_counts AS MATERIALIZED (
    SELECT m.organization_id, count(*) AS total,
           count(*) FILTER (WHERE m.is_active AND m.accepted_at IS NOT NULL) AS accepted
      FROM organizer_access.organization_members m
      JOIN cohort c ON c.id=m.organization_id
     GROUP BY m.organization_id
), event_counts AS MATERIALIZED (
    SELECT e.organization_id, count(*) AS total
      FROM events.events e JOIN cohort c ON c.id=e.organization_id
     WHERE e.deleted_at IS NULL
     GROUP BY e.organization_id
), ownership_conflicts AS MATERIALIZED (
    SELECT count(*) AS total
      FROM events.events e JOIN cohort c ON c.id=e.organization_id
      LEFT JOIN organizer_access.operational_workspaces w
        ON w.id=e.operational_workspace_id AND w.organization_id=e.organization_id
     WHERE e.deleted_at IS NULL AND w.id IS NULL
), binding_state AS MATERIALIZED (
    SELECT count(*) AS total,
           count(*) FILTER (WHERE NOT b.is_active OR w.id IS NULL OR m.id IS NULL) AS conflicts
      FROM organizer_access.workspace_role_bindings b
      JOIN cohort c ON c.id=b.organization_id
      LEFT JOIN organizer_access.operational_workspaces w
        ON w.organization_id=b.organization_id AND w.id=b.workspace_id AND w.status='ACTIVE'
      LEFT JOIN organizer_access.organization_members m
        ON m.organization_id=b.organization_id AND m.id=b.member_id
       AND m.is_active AND m.accepted_at IS NOT NULL
)
SELECT
    (SELECT count(*) FROM cohort) AS tenants,
    (SELECT coalesce(sum(total),0) FROM member_counts) AS memberships,
    (SELECT coalesce(sum(accepted),0) FROM member_counts) AS accepted_memberships,
    (SELECT coalesce(sum(total),0) FROM event_counts) AS events,
    (SELECT coalesce(max(total),0) FROM member_counts) AS largest_tenant_memberships,
    (SELECT coalesce(percentile_cont(0.5) WITHIN GROUP (ORDER BY total),0) FROM member_counts)
      AS median_tenant_memberships,
    (SELECT coalesce(max(total),0) FROM event_counts) AS largest_tenant_events,
    (SELECT coalesce(percentile_cont(0.5) WITHIN GROUP (ORDER BY total),0) FROM event_counts)
      AS median_tenant_events,
    (SELECT total FROM ownership_conflicts) AS workspace_ownership_conflicts,
    (SELECT total FROM binding_state) AS workspace_bindings,
    (SELECT conflicts FROM binding_state) AS workspace_binding_conflicts,
    (SELECT count(*) FROM cohort WHERE organization_kind='NORMAL') AS normal_organizations,
    (SELECT count(*) FROM cohort WHERE organization_kind='EMC') AS emc_organizations,
    (SELECT count(*) FROM cohort WHERE organization_kind='CLIENT') AS client_organizations
""")


def escape_like_prefix(prefix: str) -> str:
    return prefix.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"


def evaluate_snapshot(snapshot: dict[str, Any], *, minimums: dict[str, int] | None = None) -> list[str]:
    minimums = minimums or MINIMUMS
    failures: list[str] = []
    for key, minimum in minimums.items():
        value = snapshot.get(key)
        if not isinstance(value, int) or isinstance(value, bool) or value < minimum:
            failures.append(f"cohort requires at least {minimum} {key}")
    if snapshot.get("accepted_memberships") != snapshot.get("memberships"):
        failures.append("every load membership must be active and accepted")
    if snapshot.get("workspace_ownership_conflicts") != 0:
        failures.append("event/workspace ownership conflicts remain")
    if snapshot.get("workspace_bindings") != snapshot.get("memberships"):
        failures.append("every load membership must have one explicit workspace binding")
    if snapshot.get("workspace_binding_conflicts") != 0:
        failures.append("inactive or cross-owner workspace bindings remain")
    events = snapshot.get("events")
    memberships = snapshot.get("memberships")
    largest_events = snapshot.get("largest_tenant_events")
    largest_memberships = snapshot.get("largest_tenant_memberships")
    median_events = snapshot.get("median_tenant_events")
    median_memberships = snapshot.get("median_tenant_memberships")
    if (not isinstance(events, int) or not isinstance(largest_events, int)
            or not isinstance(median_events, (int, float))
            or largest_events < max(1, events // 10, int(median_events * 10))):
        failures.append("largest tenant must own at least 10 percent and 10x the median cohort events")
    if (not isinstance(memberships, int) or not isinstance(largest_memberships, int)
            or not isinstance(median_memberships, (int, float))
            or largest_memberships < max(1, memberships // 10, int(median_memberships * 10))):
        failures.append("largest tenant must own at least 10 percent and 10x the median cohort memberships")
    return failures


def inspect(database_url: str, *, prefix: str, environment: str, expected_database: str,
            expected_role: str, minimums: dict[str, int], rehearsal: bool) -> dict[str, Any]:
    url = make_url(database_url)
    if "+async" in url.drivername or url.drivername.endswith("+asyncpg"):
        raise ValueError("CATEGORY_A_DATASET_DATABASE_URL must use a synchronous PostgreSQL driver")
    engine = create_engine(url)
    try:
        with engine.connect() as connection:
            with connection.begin():
                connection.execute(text("SET TRANSACTION READ ONLY"))
                connection.execute(text("SET LOCAL statement_timeout = '120s'"))
                identity = connection.execute(text("""
                    SELECT current_database() AS database_name, current_user AS database_role,
                           rolsuper, rolbypassrls, rolcreatedb, rolcreaterole
                      FROM pg_roles WHERE rolname=current_user
                """)).mappings().one()
                row = connection.execute(SNAPSHOT_SQL,
                                         {"slug_pattern": escape_like_prefix(prefix)}).mappings().one()
    finally:
        engine.dispose()
    snapshot = {key: int(value) if value is not None else 0 for key, value in row.items()}
    failures = evaluate_snapshot(snapshot, minimums=minimums)
    if identity["database_name"] != expected_database:
        failures.append("connected database differs from the explicitly expected database")
    if identity["database_role"] != expected_role:
        failures.append("connected role differs from the explicitly expected operator role")
    if identity["database_role"].startswith("event_") and identity["database_role"].endswith("_runtime_login"):
        failures.append("application runtime role cannot perform whole-cohort verification")
    return {
        "schema": "category-a-load-dataset-v1", "environment": environment,
        "database_name": identity["database_name"], "database_role": identity["database_role"],
        "operator_privileges": {name: bool(identity[name]) for name in
                                ("rolsuper", "rolbypassrls", "rolcreatedb", "rolcreaterole")},
        "slug_prefix": prefix, "platform_organization_included": False,
        "snapshot": snapshot, "skewed_tenant_distribution": not any("largest tenant" in item for item in failures),
        "minimums": minimums, "rehearsal": rehearsal,
        "release_eligible": not rehearsal and environment == "staging" and not failures,
        "failures": failures, "verified_at": datetime.now(timezone.utc).isoformat(),
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--environment", required=True, choices=("staging", "local-isolated"))
    parser.add_argument("--expected-database", required=True)
    parser.add_argument("--expected-role", required=True)
    parser.add_argument("--slug-prefix", required=True)
    parser.add_argument("--expected-tenants", type=int, default=1000)
    parser.add_argument("--expected-memberships", type=int, default=100000)
    parser.add_argument("--expected-events", type=int, default=100000)
    parser.add_argument("--rehearsal", action="store_true")
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--confirm", required=True)
    args = parser.parse_args()
    if args.confirm != CONFIRMATION:
        parser.error(f"--confirm must be {CONFIRMATION}")
    if not (8 <= len(args.slug_prefix) <= 60) or not args.slug_prefix.startswith("category-a-load-"):
        parser.error("--slug-prefix must start with category-a-load- and be 8..60 characters")
    minimums = {"tenants": args.expected_tenants, "memberships": args.expected_memberships,
                "events": args.expected_events}
    if args.rehearsal:
        if args.environment != "local-isolated" or minimums["tenants"] < 2 \
                or minimums["memberships"] < minimums["tenants"] \
                or minimums["events"] < minimums["tenants"]:
            parser.error("rehearsal requires a local-isolated cohort with one membership/event per tenant")
    elif any(minimums[name] < required for name, required in MINIMUMS.items()):
        parser.error("release verification requires at least the 1000/100000/100000 cohort")
    output = args.output.resolve()
    if output.parent != EVIDENCE_ROOT or output.suffix.lower() != ".json":
        parser.error("--output must be a JSON file directly under services/backend/test-results")
    if output.exists():
        parser.error("--output already exists; evidence files are immutable")
    args.output = output
    args.minimums = minimums
    return args


def main() -> None:
    args = parse_args()
    database_url = os.environ.get("CATEGORY_A_DATASET_DATABASE_URL", "").strip()
    if not database_url:
        raise SystemExit("CATEGORY_A_DATASET_DATABASE_URL is required")
    url = make_url(database_url)
    if url.database != args.expected_database:
        raise SystemExit("database URL does not match --expected-database")
    if args.environment == "staging" and dict(url.query).get("sslmode") not in {"verify-full", "verify-ca", "require"}:
        raise SystemExit("staging verification requires TLS")
    result = inspect(database_url, prefix=args.slug_prefix, environment=args.environment,
                     expected_database=args.expected_database, expected_role=args.expected_role,
                     minimums=args.minimums, rehearsal=args.rehearsal)
    with args.output.open("x", encoding="utf-8") as output:
        json.dump(result, output, indent=2)
        output.write("\n")
    print(json.dumps(result, indent=2))
    raise SystemExit(1 if result["failures"] else 0)


if __name__ == "__main__":
    main()
