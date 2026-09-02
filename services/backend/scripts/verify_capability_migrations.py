from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1]))

import app.models  # noqa: F401 - populate SQLAlchemy metadata before inspection
from app.database import Base

TEMP_DATABASE_PREFIX = "eventos_test_"

# These contracts are derived from mapped metadata and are checked against the
# database by the command-line verifier in deployment environments.
REQUIRED_COLUMNS = {(table.schema, table.name): {column.name for column in table.columns} for table in Base.metadata.tables.values() if table.schema in {"platform", "commerce"}}
REQUIRED_INDEXES = {(table.schema, table.name): {index.name for index in table.indexes if index.name} for table in Base.metadata.tables.values() if table.schema in {"platform", "commerce"}}
REQUIRED_UNIQUE_CONSTRAINTS = {(table.schema, table.name): {constraint.name for constraint in table.constraints if constraint.name and getattr(constraint, "columns", None) and getattr(constraint, "_create_rule", True)} for table in Base.metadata.tables.values() if table.schema in {"platform", "commerce"}}


def _validated_database_name(value: str) -> str:
    if not re.fullmatch(rf"{re.escape(TEMP_DATABASE_PREFIX)}[a-z0-9]+", value):
        raise ValueError("database name must be a lowercase disposable test database")
    return value


if __name__ == "__main__":
    print(
        f"capability migration contract loaded: "
        f"tables={len(REQUIRED_COLUMNS)}, indexes={sum(len(v) for v in REQUIRED_INDEXES.values())}"
    )
