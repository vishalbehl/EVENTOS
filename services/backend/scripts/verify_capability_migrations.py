"""Prove the canonical capability-control migrations on a clean PostgreSQL DB.

The verifier creates a uniquely named temporary database on the configured
PostgreSQL server, upgrades it from an empty state to the single Alembic head,
and inspects the schema contract required by the unified capability system.
The temporary database is dropped by default, including after a failed check.

Run from ``services/backend``:

    python scripts/verify_capability_migrations.py

The configured database user must be allowed to create and drop databases.
Use ``--keep-database`` only for local failure diagnosis.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import uuid
from collections.abc import Iterable
from typing import Any

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import URL, make_url

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.config import settings
from app.database import Base
import app.models  # noqa: F401 - register all mapped tables for parity checks


TEMP_DATABASE_PREFIX = "eventos_capability_migration_verify_"

REQUIRED_COLUMNS: dict[tuple[str, str], set[str]] = {
    ("billing", "feature_catalog"): {
        "key",
        "value_type",
        "scope_type",
        "default_value",
        "allowed_values",
        "unit",
        "period",
        "enforcement_mode",
        "portal_routes",
        "backend_operations",
        "required_permissions",
        "metric_key",
        "dependencies",
        "conflicts",
        "owner_console",
        "owner_team",
        "risk_level",
        "lifecycle_status",
        "replacement_key",
        "version",
    },
    ("billing", "subscription_plans"): {
        "version",
        "lifecycle_status",
        "effective_at",
        "retired_at",
    },
    ("billing", "plan_features"): {
        "value_type",
        "entitlement_value",
        "scope_type",
        "enforcement_mode",
        "hard_ceiling",
        "version",
    },
    ("billing", "addons"): {
        "version",
        "lifecycle_status",
        "effective_at",
        "retired_at",
    },
    ("billing", "addon_features"): {
        "value_type",
        "entitlement_value",
        "operation",
        "scope_type",
        "validity_days",
        "stackable",
        "max_quantity",
    },
    ("platform", "platform_flag_definitions"): {
        "flag_key",
        "flag_type",
        "application",
        "environment",
        "value_type",
        "default_value",
        "target_capabilities",
        "rollout_percentage",
        "rollback_instructions",
        "starts_at",
        "expires_at",
        "version",
    },
    ("platform", "platform_flag_overrides"): {
        "flag_id",
        "scope_type",
        "organization_id",
        "event_id",
        "user_id",
        "value",
        "status",
        "rollout_percentage",
        "reason",
        "idempotency_key",
        "starts_at",
        "expires_at",
        "version",
    },
    ("platform", "event_commercial_contracts"): {
        "organization_id",
        "event_id",
        "version",
        "status",
        "plan_key",
        "plan_version",
        "entitlements",
        "hard_ceilings",
        "addons",
        "source",
        "effective_at",
    },
    ("platform", "entitlement_override_requests"): {
        "organization_id",
        "event_id",
        "entitlement_key",
        "operation",
        "requested_value",
        "status",
        "requested_by",
        "approved_by",
        "expires_at",
        "idempotency_key",
        "version",
    },
    ("platform", "capability_restrictions"): {
        "organization_id",
        "event_id",
        "capability_key",
        "restriction_type",
        "reason_code",
        "status",
        "effective_at",
        "expires_at",
        "requested_by",
        "approved_by",
        "idempotency_key",
        "version",
    },
    ("platform", "usage_ledger_entries"): {
        "organization_id",
        "event_id",
        "metric_key",
        "quantity",
        "unit",
        "source",
        "idempotency_key",
        "entry_type",
        "period_start",
        "period_end",
        "bucket_start",
        "epoch_id",
    },
    ("platform", "usage_counter_epochs"): {
        "organization_id",
        "event_id",
        "metric_key",
        "sequence",
        "baseline_value",
        "started_at",
        "closed_at",
    },
    ("platform", "usage_reservations"): {
        "organization_id",
        "event_id",
        "metric_key",
        "quantity",
        "unit",
        "status",
        "idempotency_key",
        "expires_at",
        "consumed_entry_id",
    },
    ("platform", "usage_reconciliation_runs"): {
        "organization_id",
        "event_id",
        "metric_key",
        "ledger_value",
        "authoritative_value",
        "drift",
        "status",
        "reconciled_at",
    },
    ("platform", "entitlement_shadow_comparisons"): {
        "organization_id",
        "event_id",
        "legacy_values",
        "contract_values",
        "differences",
        "resolution_version",
        "status",
        "compared_at",
    },
    ("platform", "capability_diagnostic_events"): {
        "organization_id",
        "event_id",
        "actor_user_id",
        "event_type",
        "severity",
        "reason_code",
        "capability_key",
        "operation_key",
        "limit_key",
        "source",
        "metadata_json",
        "occurred_at",
    },
    ("platform", "capability_revisions"): {
        "organization_id",
        "scope_type",
        "scope_id",
        "revision",
        "updated_at",
    },
}

REQUIRED_INDEXES: dict[tuple[str, str], set[str]] = {
    ("platform", "platform_flag_overrides"): {
        "ix_platform_flag_override_evaluation",
    },
    ("platform", "capability_restrictions"): {
        "ix_capability_restriction_resolution",
    },
    ("platform", "usage_reservations"): {
        "ix_usage_reservation_capacity",
    },
    ("platform", "capability_diagnostic_events"): {
        "ix_capability_diagnostic_scope_time",
        "ix_capability_diagnostic_type_reason",
    },
}

REQUIRED_UNIQUE_CONSTRAINTS: dict[tuple[str, str], set[str]] = {
    ("platform", "platform_flag_overrides"): {
        "uq_platform_flag_override_idempotency",
    },
    ("platform", "usage_reservations"): {
        "uq_usage_reservation_idempotency",
    },
}

CAPABILITY_TABLES = frozenset(REQUIRED_COLUMNS)


def _validated_database_name(value: str) -> str:
    if not value.startswith(TEMP_DATABASE_PREFIX):
        raise ValueError(
            f"Temporary database must start with {TEMP_DATABASE_PREFIX!r}"
        )
    if not re.fullmatch(r"[a-z0-9_]+", value):
        raise ValueError("Temporary database name contains unsafe characters")
    return value


def _admin_url(configured_url: str) -> URL:
    return make_url(configured_url).set(database="postgres")


def _database_url(configured_url: str, database_name: str) -> URL:
    return make_url(configured_url).set(database=database_name)


def _execute_database_ddl(admin_engine: Any, statement: str) -> None:
    with admin_engine.connect() as connection:
        connection.execute(text(statement))


def _drop_database(admin_engine: Any, database_name: str) -> None:
    _validated_database_name(database_name)
    with admin_engine.connect() as connection:
        connection.execute(
            text(
                "SELECT pg_terminate_backend(pid) "
                "FROM pg_stat_activity "
                "WHERE datname=:database_name AND pid <> pg_backend_pid()"
            ),
            {"database_name": database_name},
        )
        connection.execute(text(f'DROP DATABASE IF EXISTS "{database_name}"'))


def _names(items: Iterable[dict[str, Any]]) -> set[str]:
    return {str(item["name"]) for item in items if item.get("name")}


def _include_capability_object(
    object_: Any,
    name: str | None,
    type_: str,
    reflected: bool,
    compare_to: Any,
) -> bool:
    if type_ == "table":
        return (getattr(object_, "schema", None), name) in CAPABILITY_TABLES
    table = getattr(object_, "table", None)
    if table is not None:
        table_key = (getattr(table, "schema", None), table.name)
        if table_key not in CAPABILITY_TABLES:
            return False
        if type_ == "column":
            return bool(name and name in REQUIRED_COLUMNS[table_key])
        if type_ == "index":
            return bool(name and name in REQUIRED_INDEXES.get(table_key, set()))
        if type_ == "unique_constraint":
            return bool(
                name and name in REQUIRED_UNIQUE_CONSTRAINTS.get(table_key, set())
            )
        return type_ == "foreign_key_constraint"
    return False


def verify_model_parity(database_url: URL) -> int:
    """Reject ORM/migration drift owned by the capability-control subsystem."""

    engine = create_engine(database_url)
    try:
        with engine.connect() as connection:
            context = MigrationContext.configure(
                connection,
                opts={
                    "include_schemas": True,
                    "include_object": _include_capability_object,
                    "compare_type": True,
                    # Python defaults are intentionally paired with database
                    # defaults for safe rolling deploys. Their textual forms
                    # are not required to match for this structural contract.
                    "compare_server_default": False,
                    "target_metadata": Base.metadata,
                },
            )
            differences = compare_metadata(context, Base.metadata)
    finally:
        engine.dispose()

    if differences:
        rendered = "\n- ".join(repr(item) for item in differences)
        raise RuntimeError(
            "Capability ORM/migration parity failed:\n- " + rendered
        )
    return 0


def verify_schema(
    database_url: URL,
    expected_head: str,
    *,
    start_revision: str | None,
) -> dict[str, Any]:
    engine = create_engine(database_url)
    failures: list[str] = []
    checked_columns = 0
    checked_indexes = 0
    checked_unique_constraints = 0

    try:
        schema_inspector = inspect(engine)
        with engine.connect() as connection:
            actual_head = connection.scalar(text("SELECT version_num FROM alembic_version"))
        if actual_head != expected_head:
            failures.append(
                f"Alembic head mismatch: expected {expected_head}, found {actual_head}"
            )

        for (schema, table), required in REQUIRED_COLUMNS.items():
            if not schema_inspector.has_table(table, schema=schema):
                failures.append(f"Missing table {schema}.{table}")
                continue
            actual = _names(schema_inspector.get_columns(table, schema=schema))
            missing = sorted(required - actual)
            if missing:
                failures.append(
                    f"{schema}.{table} is missing columns: {', '.join(missing)}"
                )
            checked_columns += len(required)

        for (schema, table), required in REQUIRED_INDEXES.items():
            actual = _names(schema_inspector.get_indexes(table, schema=schema))
            missing = sorted(required - actual)
            if missing:
                failures.append(
                    f"{schema}.{table} is missing indexes: {', '.join(missing)}"
                )
            checked_indexes += len(required)

        for (schema, table), required in REQUIRED_UNIQUE_CONSTRAINTS.items():
            actual = _names(
                schema_inspector.get_unique_constraints(table, schema=schema)
            )
            missing = sorted(required - actual)
            if missing:
                failures.append(
                    f"{schema}.{table} is missing unique constraints: "
                    f"{', '.join(missing)}"
                )
            checked_unique_constraints += len(required)
    finally:
        engine.dispose()

    if failures:
        raise RuntimeError(
            "Capability migration verification failed:\n- " + "\n- ".join(failures)
        )

    verify_model_parity(database_url)

    return {
        "alembic_head": expected_head,
        "start_revision": start_revision or "EMPTY",
        "tables": len(REQUIRED_COLUMNS),
        "columns": checked_columns,
        "indexes": checked_indexes,
        "unique_constraints": checked_unique_constraints,
        "model_schema_differences": 0,
        "status": "PASSED",
    }


def run(
    database_name: str,
    *,
    keep_database: bool = False,
    start_revision: str | None = None,
) -> dict[str, Any]:
    database_name = _validated_database_name(database_name)
    configured_url = settings.DATABASE_URL_SYNC
    admin_engine = create_engine(
        _admin_url(configured_url),
        isolation_level="AUTOCOMMIT",
    )
    target_url = _database_url(configured_url, database_name)

    config = Config("alembic.ini")
    expected_head = ScriptDirectory.from_config(config).get_current_head()
    if not expected_head:
        raise RuntimeError("Alembic does not have a current head")

    try:
        _drop_database(admin_engine, database_name)
        _execute_database_ddl(
            admin_engine,
            f'CREATE DATABASE "{database_name}"',
        )

        # env.py reads this singleton when Alembic runs in this process.
        settings.DATABASE_URL_SYNC = target_url.render_as_string(hide_password=False)
        if start_revision:
            if ScriptDirectory.from_config(config).get_revision(start_revision) is None:
                raise ValueError(f"Unknown Alembic start revision: {start_revision}")
            command.upgrade(config, start_revision)
        command.upgrade(config, "head")
        return verify_schema(
            target_url,
            expected_head,
            start_revision=start_revision,
        )
    finally:
        settings.DATABASE_URL_SYNC = configured_url
        if not keep_database:
            _drop_database(admin_engine, database_name)
        admin_engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Verify capability-control migrations on a clean temporary DB"
    )
    parser.add_argument(
        "--database-name",
        default=f"{TEMP_DATABASE_PREFIX}{uuid.uuid4().hex[:12]}",
        help=f"Temporary database name; must start with {TEMP_DATABASE_PREFIX}",
    )
    parser.add_argument(
        "--keep-database",
        action="store_true",
        help="Retain the temporary database for local failure diagnosis",
    )
    parser.add_argument(
        "--start-revision",
        help=(
            "First upgrade the empty database to this supported historical "
            "revision, then upgrade it to head"
        ),
    )
    args = parser.parse_args()
    result = run(
        args.database_name,
        keep_database=args.keep_database,
        start_revision=args.start_revision,
    )
    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
