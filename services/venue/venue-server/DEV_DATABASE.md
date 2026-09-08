# Venue Server development database

The Venue Server development stack owns a local PostgreSQL database. The API
connects to the `venue-db` Compose service at the internal hostname
`venue-db:5432`; host applications can connect through `localhost:5433`.

The stack uses PostgreSQL `15.19` (the current patch line compatible with the
existing volume), Redis `8.10.1`, PgAdmin `9.17`, and the newest official
MinIO release tag currently available. The API uses Python `3.13.15`, the
newest runtime compatible with the currently pinned native dependencies.
PostgreSQL major upgrades are not performed automatically because they
require a dump/restore migration.

## Start the database, PgAdmin, and API

From this directory:

```powershell
$env:VENUE_AUTH_KEY="dev-venue-key"
$env:VENUE_AUTH_SECRET="dev-venue-secret"
docker compose up -d --build
```

Services:

- Venue API: `http://127.0.0.1:8001`
- PostgreSQL: `localhost:5433`
- PgAdmin: `http://127.0.0.1:5050` (server mode with login)
- MinIO: `http://127.0.0.1:9002`

Default development PgAdmin login:

- Email: `admin@eventos.com`
- Password: `admin123`

PgAdmin provides one `Venue Server` connection to the existing Docker
PostgreSQL instance. It connects to the default `postgres` maintenance
database; the Venue App onboarding flow creates `venue_db` in this same server.
If you need to register it manually, use:

- Host: `venue-db`
- Port: `5432`
- Database: `venue_db`
- Username: `postgres`
- Password: `venue_password`

The database schema is applied by the Venue API startup/migration process.
Validate it with:

```powershell
docker compose exec venue-api python scripts/schema_preflight.py --check
```

Do not use `docker compose down -v` unless you intentionally want to delete
the Venue PostgreSQL, MinIO, and PgAdmin volumes.
