# Venue Server schema preflight

Production and staging must use Alembic revisions. The service refuses to
start when `alembic_version` is missing or is not the configured head.

Some older local appliances were initialized with SQLAlchemy `create_all()`.
Those databases can contain the right tables while still being unversioned.
Do not run `alembic upgrade head` against one of those databases without a
backup and schema review: the initial migration also creates the base tables.

Run the read-only check from this directory:

```text
python scripts/schema_preflight.py --check
```

Only after confirming a database backup and reviewing the report may an
operator baseline a complete legacy `create_all()` database at the initial
revision:

```text
python scripts/schema_preflight.py --apply --legacy-initial-baseline --confirm-unversioned --backup-file D:\Backups\venue-before-migration.dump
```

Then run `alembic upgrade head` and rerun the check. This baseline command does
not apply schema changes and it refuses databases missing core initial tables.
If the report says `migration_required`, use the normal Alembic upgrade path
instead. A head baseline is permitted only when the current model shape is
complete; do not use it for a partially upgraded database.
