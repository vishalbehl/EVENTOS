"""Provision a deterministic, restartable Category A load cohort.

The command is insert-only except for recomputing ``event_count`` on cohort
organisations after all event batches commit. It is forbidden in production and
requires an explicit isolated database, approval reference and confirmation.
Credentials are accepted only through ``CATEGORY_A_DATASET_DATABASE_URL``.
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import time
from typing import Any

import psycopg2
from psycopg2.extras import RealDictCursor
from sqlalchemy.engine import make_url


ROOT = Path(__file__).parents[1]
EVIDENCE_ROOT = (ROOT / "test-results").resolve()
CONFIRMATION = "PROVISION-CATEGORY-A-ISOLATED-LOAD-COHORT"
EXPECTED_REVISION = "20261022_3670"
RELEASE_MINIMUMS = {"tenants": 1000, "memberships": 100000, "events": 100000}


@dataclass(frozen=True)
class ProvisioningConfig:
    environment: str
    expected_database: str
    slug_prefix: str
    tenants: int
    memberships: int
    events: int
    batch_size: int
    approval_reference: str
    rehearsal: bool

    @property
    def marker(self) -> dict[str, Any]:
        return {
            "fixture": "category-a-load-v1", "slug_prefix": self.slug_prefix,
            "tenants": self.tenants, "memberships": self.memberships, "events": self.events,
        }


def tenant_for_sequence(sequence: int, *, total: int, tenants: int) -> int:
    if not 1 <= sequence <= total or tenants < 2:
        raise ValueError("sequence and tenant count are outside the cohort")
    noisy = max(1, (total + 9) // 10)
    return 1 if sequence <= noisy else 2 + ((sequence - noisy - 1) % (tenants - 1))


def owner_sequence(tenant: int, *, total_memberships: int) -> int:
    if tenant < 1:
        raise ValueError("tenant must be positive")
    noisy = max(1, (total_memberships + 9) // 10)
    return 1 if tenant == 1 else noisy + tenant - 1


def validate_config(config: ProvisioningConfig) -> list[str]:
    failures: list[str] = []
    if config.environment not in {"local-isolated", "staging"}:
        failures.append("environment must be local-isolated or staging")
    if not config.expected_database or config.expected_database in {"eventos_db", "postgres", "template0", "template1"}:
        failures.append("expected database must be an explicitly isolated non-default database")
    if config.environment == "local-isolated" and not config.expected_database.startswith("category_a_"):
        failures.append("local isolated database name must start with category_a_")
    if (not 18 <= len(config.slug_prefix) <= 60
            or re.fullmatch(r"category-a-load-[a-z0-9]+(?:-[a-z0-9]+)*-", config.slug_prefix) is None):
        failures.append("slug prefix must be category-a-load-<run>- and 18..60 characters")
    if re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{2,62}", config.expected_database or "") is None:
        failures.append("expected database has an unsafe identifier shape")
    if not 12 <= len(config.approval_reference.strip()) <= 200:
        failures.append("approval reference must contain 12..200 characters")
    if not 100 <= config.batch_size <= 20000:
        failures.append("batch size must be between 100 and 20000")
    if config.tenants < 2 or config.memberships < config.tenants or config.events < config.tenants:
        failures.append("cohort requires at least two tenants and one membership/event per tenant")
    if config.rehearsal:
        if config.environment != "local-isolated":
            failures.append("short rehearsals are allowed only in local-isolated databases")
    else:
        for name, minimum in RELEASE_MINIMUMS.items():
            if getattr(config, name) < minimum:
                failures.append(f"release cohort requires at least {minimum} {name}")
    return failures


UUID_SQL = """(
    substr(md5(%(prefix)s || %(entity)s || value::text),1,8) || '-' ||
    substr(md5(%(prefix)s || %(entity)s || value::text),9,4) || '-' ||
    substr(md5(%(prefix)s || %(entity)s || value::text),13,4) || '-' ||
    substr(md5(%(prefix)s || %(entity)s || value::text),17,4) || '-' ||
    substr(md5(%(prefix)s || %(entity)s || value::text),21,12)
)::uuid"""


ORGANIZATION_INSERT = f"""
WITH rows AS (SELECT value FROM generate_series(%(start)s,%(end)s) value)
INSERT INTO platform.organizations (
    id,name,slug,primary_color,secondary_color,country,timezone,is_active,
    onboarding_completed,created_at,updated_at,is_platform_org,event_count,
    is_internal_unrestricted,organization_kind,onboarding_draft
)
SELECT {UUID_SQL}, 'Category A Load Tenant ' || value,
       %(prefix)s || lpad(value::text,7,'0'), '#334155', '#64748b', 'IN',
       'Asia/Kolkata', true, true, now(), now(), false, 0, false,
       CASE WHEN value %% 100=0 THEN 'EMC' WHEN value %% 10=0 THEN 'CLIENT' ELSE 'NORMAL' END,
       %(marker)s::jsonb
  FROM rows
ON CONFLICT (id) DO NOTHING
"""


WORKSPACE_INSERT = f"""
WITH rows AS (SELECT value FROM generate_series(%(start)s,%(end)s) value),
owned AS (
    SELECT value, {UUID_SQL} AS organization_id FROM rows
)
INSERT INTO organizer_access.operational_workspaces
    (id,organization_id,name,status,is_default,version,created_at)
SELECT (
    substr(md5(%(prefix)s || ':workspace:' || value::text),1,8) || '-' ||
    substr(md5(%(prefix)s || ':workspace:' || value::text),9,4) || '-' ||
    substr(md5(%(prefix)s || ':workspace:' || value::text),13,4) || '-' ||
    substr(md5(%(prefix)s || ':workspace:' || value::text),17,4) || '-' ||
    substr(md5(%(prefix)s || ':workspace:' || value::text),21,12)
)::uuid, organization_id, 'Default workspace', 'ACTIVE', true, 1, now()
  FROM owned
ON CONFLICT (id) DO NOTHING
"""


REVISION_INSERT = f"""
WITH rows AS (SELECT value FROM generate_series(%(start)s,%(end)s) value)
INSERT INTO organizer_access.organization_access_revisions (organization_id,revision)
SELECT {UUID_SQL}, 1 FROM rows
ON CONFLICT (organization_id) DO NOTHING
"""


def _distribution_cte(total_parameter: str) -> str:
    return f"""
WITH rows AS (SELECT value FROM generate_series(%(start)s,%(end)s) value),
mapped AS (
    SELECT value,
      CASE WHEN value <= greatest(1,(%({total_parameter})s + 9)/10)
           THEN 1 ELSE 2 + mod(value-greatest(1,(%({total_parameter})s + 9)/10)-1,%(tenants)s-1)
      END AS tenant
      FROM rows
)
"""


USER_INSERT = _distribution_cte("memberships") + f"""
INSERT INTO identity.users (
    id,organization_id,email,first_name,last_name,role,is_active,is_platform_admin,
    is_2fa_enabled,notification_preferences,created_at,version,auth_revision
)
SELECT (
    substr(md5(%(prefix)s || ':user:' || value::text),1,8) || '-' ||
    substr(md5(%(prefix)s || ':user:' || value::text),9,4) || '-' ||
    substr(md5(%(prefix)s || ':user:' || value::text),13,4) || '-' ||
    substr(md5(%(prefix)s || ':user:' || value::text),17,4) || '-' ||
    substr(md5(%(prefix)s || ':user:' || value::text),21,12)
)::uuid,
    (
      substr(md5(%(prefix)s || ':org:' || tenant::text),1,8) || '-' ||
      substr(md5(%(prefix)s || ':org:' || tenant::text),9,4) || '-' ||
      substr(md5(%(prefix)s || ':org:' || tenant::text),13,4) || '-' ||
      substr(md5(%(prefix)s || ':org:' || tenant::text),17,4) || '-' ||
      substr(md5(%(prefix)s || ':org:' || tenant::text),21,12)
    )::uuid,
    'cal-' || md5(%(prefix)s || ':member:' || value::text) || '@example.invalid',
    'Load', 'Member ' || value, 'organiser', true, false, false, '{{}}'::jsonb,
    now(), 1, 1
  FROM mapped
ON CONFLICT (id) DO NOTHING
"""


MEMBERSHIP_INSERT = _distribution_cte("memberships") + f"""
INSERT INTO organizer_access.organization_members (
    id,organization_id,user_id,org_role,invited_at,accepted_at,is_active,version,updated_at
)
SELECT (
    substr(md5(%(prefix)s || ':membership:' || value::text),1,8) || '-' ||
    substr(md5(%(prefix)s || ':membership:' || value::text),9,4) || '-' ||
    substr(md5(%(prefix)s || ':membership:' || value::text),13,4) || '-' ||
    substr(md5(%(prefix)s || ':membership:' || value::text),17,4) || '-' ||
    substr(md5(%(prefix)s || ':membership:' || value::text),21,12)
)::uuid,
    (
      substr(md5(%(prefix)s || ':org:' || tenant::text),1,8) || '-' ||
      substr(md5(%(prefix)s || ':org:' || tenant::text),9,4) || '-' ||
      substr(md5(%(prefix)s || ':org:' || tenant::text),13,4) || '-' ||
      substr(md5(%(prefix)s || ':org:' || tenant::text),17,4) || '-' ||
      substr(md5(%(prefix)s || ':org:' || tenant::text),21,12)
    )::uuid,
    (
      substr(md5(%(prefix)s || ':user:' || value::text),1,8) || '-' ||
      substr(md5(%(prefix)s || ':user:' || value::text),9,4) || '-' ||
      substr(md5(%(prefix)s || ':user:' || value::text),13,4) || '-' ||
      substr(md5(%(prefix)s || ':user:' || value::text),17,4) || '-' ||
      substr(md5(%(prefix)s || ':user:' || value::text),21,12)
    )::uuid,
    CASE WHEN value=1 OR value=greatest(1,(%(memberships)s+9)/10)+tenant-1
         THEN 'owner' ELSE 'member' END,
    now(), now(), true, 1, now()
  FROM mapped
ON CONFLICT (id) DO NOTHING
"""


WORKSPACE_BINDING_INSERT = _distribution_cte("memberships") + f"""
INSERT INTO organizer_access.workspace_role_bindings (
    id,organization_id,workspace_id,member_id,role,version,is_active
)
SELECT (
    substr(md5(%(prefix)s || ':workspace-binding:' || value::text),1,8) || '-' ||
    substr(md5(%(prefix)s || ':workspace-binding:' || value::text),9,4) || '-' ||
    substr(md5(%(prefix)s || ':workspace-binding:' || value::text),13,4) || '-' ||
    substr(md5(%(prefix)s || ':workspace-binding:' || value::text),17,4) || '-' ||
    substr(md5(%(prefix)s || ':workspace-binding:' || value::text),21,12)
)::uuid,
    (
      substr(md5(%(prefix)s || ':org:' || tenant::text),1,8) || '-' ||
      substr(md5(%(prefix)s || ':org:' || tenant::text),9,4) || '-' ||
      substr(md5(%(prefix)s || ':org:' || tenant::text),13,4) || '-' ||
      substr(md5(%(prefix)s || ':org:' || tenant::text),17,4) || '-' ||
      substr(md5(%(prefix)s || ':org:' || tenant::text),21,12)
    )::uuid,
    (
      substr(md5(%(prefix)s || ':workspace:' || tenant::text),1,8) || '-' ||
      substr(md5(%(prefix)s || ':workspace:' || tenant::text),9,4) || '-' ||
      substr(md5(%(prefix)s || ':workspace:' || tenant::text),13,4) || '-' ||
      substr(md5(%(prefix)s || ':workspace:' || tenant::text),17,4) || '-' ||
      substr(md5(%(prefix)s || ':workspace:' || tenant::text),21,12)
    )::uuid,
    (
      substr(md5(%(prefix)s || ':membership:' || value::text),1,8) || '-' ||
      substr(md5(%(prefix)s || ':membership:' || value::text),9,4) || '-' ||
      substr(md5(%(prefix)s || ':membership:' || value::text),13,4) || '-' ||
      substr(md5(%(prefix)s || ':membership:' || value::text),17,4) || '-' ||
      substr(md5(%(prefix)s || ':membership:' || value::text),21,12)
    )::uuid,
    CASE WHEN value=1 OR value=greatest(1,(%(memberships)s+9)/10)+tenant-1
         THEN 'admin' ELSE 'member' END,
    1, true
  FROM mapped
ON CONFLICT (id) DO NOTHING
"""


EVENT_INSERT = _distribution_cte("events") + f"""
INSERT INTO events.events (
    id,organization_id,operational_workspace_id,created_by,name,short_code,
    organizer_details,start_date,end_date,timezone,max_file_size_mb,allowed_formats,
    status,event_mode,license_tier,feature_toggles,currency,created_at,updated_at,version
)
SELECT (
    substr(md5(%(prefix)s || ':event:' || value::text),1,8) || '-' ||
    substr(md5(%(prefix)s || ':event:' || value::text),9,4) || '-' ||
    substr(md5(%(prefix)s || ':event:' || value::text),13,4) || '-' ||
    substr(md5(%(prefix)s || ':event:' || value::text),17,4) || '-' ||
    substr(md5(%(prefix)s || ':event:' || value::text),21,12)
)::uuid,
    (
      substr(md5(%(prefix)s || ':org:' || tenant::text),1,8) || '-' ||
      substr(md5(%(prefix)s || ':org:' || tenant::text),9,4) || '-' ||
      substr(md5(%(prefix)s || ':org:' || tenant::text),13,4) || '-' ||
      substr(md5(%(prefix)s || ':org:' || tenant::text),17,4) || '-' ||
      substr(md5(%(prefix)s || ':org:' || tenant::text),21,12)
    )::uuid,
    (
      substr(md5(%(prefix)s || ':workspace:' || tenant::text),1,8) || '-' ||
      substr(md5(%(prefix)s || ':workspace:' || tenant::text),9,4) || '-' ||
      substr(md5(%(prefix)s || ':workspace:' || tenant::text),13,4) || '-' ||
      substr(md5(%(prefix)s || ':workspace:' || tenant::text),17,4) || '-' ||
      substr(md5(%(prefix)s || ':workspace:' || tenant::text),21,12)
    )::uuid,
    (
      substr(md5(%(prefix)s || ':user:' ||
          (CASE WHEN tenant=1 THEN 1 ELSE greatest(1,(%(memberships)s+9)/10)+tenant-1 END)::text),1,8) || '-' ||
      substr(md5(%(prefix)s || ':user:' ||
          (CASE WHEN tenant=1 THEN 1 ELSE greatest(1,(%(memberships)s+9)/10)+tenant-1 END)::text),9,4) || '-' ||
      substr(md5(%(prefix)s || ':user:' ||
          (CASE WHEN tenant=1 THEN 1 ELSE greatest(1,(%(memberships)s+9)/10)+tenant-1 END)::text),13,4) || '-' ||
      substr(md5(%(prefix)s || ':user:' ||
          (CASE WHEN tenant=1 THEN 1 ELSE greatest(1,(%(memberships)s+9)/10)+tenant-1 END)::text),17,4) || '-' ||
      substr(md5(%(prefix)s || ':user:' ||
          (CASE WHEN tenant=1 THEN 1 ELSE greatest(1,(%(memberships)s+9)/10)+tenant-1 END)::text),21,12)
    )::uuid,
    'Category A Load Event ' || value, 'CA' || substr(md5(%(prefix)s || ':event:' || value::text),1,18),
    '{{}}'::jsonb, DATE '2030-01-01', DATE '2030-01-02', 'Asia/Kolkata', 50,
    ARRAY['pdf']::varchar[], 'active', false, 'enterprise', '{{}}'::jsonb, 'INR', now(), now(), 1
  FROM mapped
ON CONFLICT (id) DO NOTHING
"""


COUNT_SQL = """
WITH cohort AS (SELECT id FROM platform.organizations WHERE slug LIKE %(pattern)s ESCAPE '\\')
SELECT (SELECT count(*) FROM cohort) AS tenants,
       (SELECT count(*) FROM organizer_access.operational_workspaces w JOIN cohort c ON c.id=w.organization_id) AS workspaces,
       (SELECT count(*) FROM organizer_access.organization_access_revisions r JOIN cohort c ON c.id=r.organization_id) AS revisions,
       (SELECT count(*) FROM organizer_access.organization_members m JOIN cohort c ON c.id=m.organization_id) AS memberships,
       (SELECT count(*) FROM organizer_access.workspace_role_bindings b JOIN cohort c ON c.id=b.organization_id) AS workspace_bindings,
       (SELECT count(*) FROM events.events e JOIN cohort c ON c.id=e.organization_id WHERE e.deleted_at IS NULL) AS events
"""


def _parameters(config: ProvisioningConfig, *, start: int, end: int, entity: str) -> dict[str, Any]:
    return {
        "prefix": config.slug_prefix, "marker": json.dumps(config.marker, sort_keys=True),
        "start": start, "end": end, "entity": entity, "tenants": config.tenants,
        "memberships": config.memberships, "events": config.events,
    }


def _like_pattern(prefix: str) -> str:
    return prefix.replace("\\", "\\\\").replace("_", "\\_").replace("%", "\\%") + "%"


def _batches(total: int, size: int):
    for start in range(1, total + 1, size):
        yield start, min(total, start + size - 1)


def _execute_batches(connection, *, sql: str, total: int, config: ProvisioningConfig,
                     entity: str) -> dict[str, Any]:
    started = time.perf_counter()
    batches = 0
    for start, end in _batches(total, config.batch_size):
        with connection:
            with connection.cursor() as cursor:
                cursor.execute("SET LOCAL lock_timeout='10s'")
                cursor.execute("SET LOCAL statement_timeout='5min'")
                cursor.execute(sql, _parameters(config, start=start, end=end, entity=entity))
        batches += 1
    return {"batches": batches, "seconds": round(time.perf_counter() - started, 3)}


def _assert_identity_and_revision(connection, config: ProvisioningConfig) -> dict[str, Any]:
    with connection.cursor(cursor_factory=RealDictCursor) as cursor:
        cursor.execute("""
            SELECT current_database() AS database_name,current_user AS database_role,
                   rolsuper,rolbypassrls,rolcreatedb,rolcreaterole
              FROM pg_roles WHERE rolname=current_user
        """)
        identity = dict(cursor.fetchone())
        cursor.execute("SELECT array_agg(version_num ORDER BY version_num) AS revisions FROM alembic_version")
        revisions = cursor.fetchone()["revisions"] or []
    if identity["database_name"] != config.expected_database:
        raise RuntimeError("connected database does not match --expected-database")
    if revisions != [EXPECTED_REVISION]:
        raise RuntimeError(f"database must have the single expected migration head {EXPECTED_REVISION}")
    if identity["database_role"].startswith("event_") and identity["database_role"].endswith("_runtime_login"):
        raise RuntimeError("runtime application role cannot provision the load cohort")
    return {**identity, "migration_revisions": revisions}


def _assert_marker_compatible(connection, config: ProvisioningConfig) -> None:
    with connection.cursor() as cursor:
        cursor.execute("""
            SELECT count(*) FROM platform.organizations
             WHERE slug LIKE %(pattern)s ESCAPE '\\'
               AND onboarding_draft IS DISTINCT FROM %(marker)s::jsonb
        """, {"pattern": _like_pattern(config.slug_prefix),
                "marker": json.dumps(config.marker, sort_keys=True)})
        if cursor.fetchone()[0]:
            raise RuntimeError("existing cohort marker differs from requested distribution")


def provision(connection, config: ProvisioningConfig) -> dict[str, Any]:
    identity = _assert_identity_and_revision(connection, config)
    pattern = _like_pattern(config.slug_prefix)
    stages: dict[str, Any] = {}
    with connection.cursor() as cursor:
        cursor.execute("SELECT pg_advisory_lock(hashtextextended(%s,0))", (config.slug_prefix,))
    try:
        _assert_marker_compatible(connection, config)
        stages["organizations"] = _execute_batches(connection, sql=ORGANIZATION_INSERT,
            total=config.tenants, config=config, entity=":org:")
        stages["workspaces"] = _execute_batches(connection, sql=WORKSPACE_INSERT,
            total=config.tenants, config=config, entity=":org:")
        stages["access_revisions"] = _execute_batches(connection, sql=REVISION_INSERT,
            total=config.tenants, config=config, entity=":org:")
        stages["users"] = _execute_batches(connection, sql=USER_INSERT,
            total=config.memberships, config=config, entity=":unused:")
        stages["memberships"] = _execute_batches(connection, sql=MEMBERSHIP_INSERT,
            total=config.memberships, config=config, entity=":unused:")
        stages["workspace_bindings"] = _execute_batches(connection, sql=WORKSPACE_BINDING_INSERT,
            total=config.memberships, config=config, entity=":unused:")
        stages["events"] = _execute_batches(connection, sql=EVENT_INSERT,
            total=config.events, config=config, entity=":unused:")
        with connection:
            with connection.cursor() as cursor:
                cursor.execute("""
                    UPDATE platform.organizations o SET event_count=counts.total,updated_at=now()
                      FROM (SELECT organization_id,count(*)::int AS total FROM events.events
                             WHERE organization_id IN (SELECT id FROM platform.organizations
                               WHERE slug LIKE %(pattern)s ESCAPE '\\') AND deleted_at IS NULL
                             GROUP BY organization_id) counts
                     WHERE o.id=counts.organization_id
                """, {"pattern": pattern})
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(COUNT_SQL, {"pattern": pattern})
            counts = dict(cursor.fetchone())
        expected = {"tenants": config.tenants, "workspaces": config.tenants,
                    "revisions": config.tenants, "memberships": config.memberships,
                    "workspace_bindings": config.memberships, "events": config.events}
        if counts != expected:
            raise RuntimeError(f"provisioned cohort counts differ: expected={expected}, actual={counts}")
        return {"identity": identity, "counts": counts, "stages": stages}
    finally:
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_advisory_unlock(hashtextextended(%s,0))", (config.slug_prefix,))


def parse_args() -> tuple[argparse.Namespace, ProvisioningConfig]:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--environment", required=True, choices=("local-isolated", "staging"))
    parser.add_argument("--expected-database", required=True)
    parser.add_argument("--slug-prefix", required=True)
    parser.add_argument("--tenants", type=int, default=1000)
    parser.add_argument("--memberships", type=int, default=100000)
    parser.add_argument("--events", type=int, default=100000)
    parser.add_argument("--batch-size", type=int, default=10000)
    parser.add_argument("--approval-reference", required=True)
    parser.add_argument("--rehearsal", action="store_true")
    parser.add_argument("--confirm", required=True)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    config = ProvisioningConfig(environment=args.environment, expected_database=args.expected_database,
        slug_prefix=args.slug_prefix, tenants=args.tenants, memberships=args.memberships,
        events=args.events, batch_size=args.batch_size, approval_reference=args.approval_reference,
        rehearsal=args.rehearsal)
    failures = validate_config(config)
    if args.confirm != CONFIRMATION:
        failures.append(f"confirmation must be {CONFIRMATION}")
    output = args.output.resolve()
    if output.parent != EVIDENCE_ROOT or output.suffix.lower() != ".json":
        failures.append("output must be a JSON file directly under services/backend/test-results")
    elif output.exists():
        failures.append("output already exists; evidence files are immutable")
    if failures:
        parser.error("; ".join(failures))
    args.output = output
    return args, config


def main() -> None:
    args, config = parse_args()
    raw_url = os.environ.get("CATEGORY_A_DATASET_DATABASE_URL", "").strip()
    if not raw_url:
        raise SystemExit("CATEGORY_A_DATASET_DATABASE_URL is required")
    url = make_url(raw_url)
    if url.get_backend_name() != "postgresql" or url.database != config.expected_database:
        raise SystemExit("database URL does not match the expected PostgreSQL database")
    if config.environment == "staging" and dict(url.query).get("sslmode") not in {"verify-full", "verify-ca", "require"}:
        raise SystemExit("staging provisioning requires TLS")
    connection = psycopg2.connect(host=url.host, port=url.port or 5432, dbname=url.database,
        user=url.username, password=url.password, connect_timeout=10,
        application_name="category-a-load-provisioner", **dict(url.query))
    try:
        result = provision(connection, config)
    finally:
        connection.close()
    evidence = {
        "schema": "category-a-load-provision-v1", "environment": config.environment,
        "database": config.expected_database, "slug_prefix": config.slug_prefix,
        "approval_reference": config.approval_reference, "rehearsal": config.rehearsal,
        **result, "completed_at": datetime.now(timezone.utc).isoformat(),
    }
    with args.output.open("x", encoding="utf-8") as output:
        json.dump(evidence, output, indent=2, default=str)
        output.write("\n")
    print(json.dumps(evidence, indent=2, default=str))


if __name__ == "__main__":
    main()
