from __future__ import annotations

import pytest

import app.models  # noqa: F401 - register every mapped table
from app.database import Base
from scripts.verify_capability_migrations import (
    REQUIRED_COLUMNS,
    REQUIRED_INDEXES,
    REQUIRED_UNIQUE_CONSTRAINTS,
    TEMP_DATABASE_PREFIX,
    _validated_database_name,
)


def test_capability_migration_contract_matches_orm_metadata() -> None:
    """The clean-install verifier must track the current capability models."""

    for (schema, table_name), required_columns in REQUIRED_COLUMNS.items():
        table = Base.metadata.tables.get(f"{schema}.{table_name}")
        assert table is not None, f"Verifier references unmapped table {schema}.{table_name}"
        mapped_columns = {column.name for column in table.columns}
        assert required_columns <= mapped_columns, (
            f"Verifier references unknown columns on {schema}.{table_name}: "
            f"{sorted(required_columns - mapped_columns)}"
        )

    for (schema, table_name), required_indexes in REQUIRED_INDEXES.items():
        table = Base.metadata.tables[f"{schema}.{table_name}"]
        mapped_indexes = {index.name for index in table.indexes}
        assert required_indexes <= mapped_indexes

    for (
        schema,
        table_name,
    ), required_constraints in REQUIRED_UNIQUE_CONSTRAINTS.items():
        table = Base.metadata.tables[f"{schema}.{table_name}"]
        mapped_constraints = {
            constraint.name
            for constraint in table.constraints
            if constraint.name is not None
        }
        assert required_constraints <= mapped_constraints


def test_capability_migration_verifier_only_accepts_disposable_database_names() -> None:
    safe = f"{TEMP_DATABASE_PREFIX}abc123"
    assert _validated_database_name(safe) == safe

    for unsafe in (
        "eventos_db",
        f"{TEMP_DATABASE_PREFIX}ABC",
        f"{TEMP_DATABASE_PREFIX}bad-name",
        f'{TEMP_DATABASE_PREFIX}x";drop_database',
    ):
        with pytest.raises(ValueError):
            _validated_database_name(unsafe)
