# Local production-like environment

Backend engineering conventions are documented in
`services/backend/docs/ENGINEERING_STANDARDS.md`.

Start and stop the environment from the repository root:

```powershell
.\ops\staging.ps1 up
.\ops\staging.ps1 status
.\ops\staging.ps1 down
```

The command preserves Docker volumes. Use `.\ops\staging.ps1 backup` before maintenance. Database restore requires an explicit dump path and typing `RESTORE`.

Local endpoints:

- API: `https://localhost:8443` (Caddy development TLS) or `http://127.0.0.1:8000` (Docker backend)
- Prometheus: `http://127.0.0.1:9090`
- MinIO API: `http://<staging-host-ip>:9000`
- MinIO console: `http://<staging-host-ip>:9001`

Caddy uses an internal development CA. For browser trust, export the root certificate from the `staging_caddy_data` volume and import it into the local machine's trusted root store. For command-line smoke tests, `curl -k` is acceptable; do not use that setting in production.

Operational commands:

```powershell
.\ops\staging.ps1 migrate
.\ops\staging.ps1 seed
.\ops\staging.ps1 seed-test-identity
.\ops\staging.ps1 seed-load -Profile large
.\ops\staging.ps1 backup
.\ops\staging.ps1 backup-verify
.\ops\staging.ps1 load
.\ops\staging.ps1 dashboard-load
.\ops\staging.ps1 failure-checks
.\ops\staging.ps1 failure-checks -Run
.\ops\staging.ps1 db-hot-plans
.\ops\staging.ps1 rollback-check -RollbackImage conf-platform-backend:previous
.\ops\staging.ps1 release-check
```

Failure checks are dry-run by default. They restart one dependency at a time only with `-Run` and do not remove data volumes.

`release-check` creates a temporary upload-test identity when staging test
credentials are not supplied, validates authenticated uploads and dashboard
loads, then removes only the generated upload records and objects. Notification
delivery remains an external gate until `ALERTMANAGER_WEBHOOK_URL` is configured.

`rollback-check` requires an explicit locally available backend image tag. It
starts backend and workers with that image, checks readiness, and restores the
normal staging image in a `finally` path. It does not modify database or object
storage volumes. Use a previously built immutable tag for a true version-
compatibility rehearsal.
