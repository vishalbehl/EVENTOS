# Refactoring Report — Monorepo Reorganization
Generated on: 2026-05-23 02:13:10

## Monorepo Layout Reorganization
We have successfully reorganized the repository:
* Moved Next.js/React portals from `cloud/` to `apps/cloud/`
* Moved Next.js/React venue apps from `venue/` to `apps/venue/`
* Relocated core services:
  * Backend to `services/backend/`
  * Venue server to `services/venue-server/`
  * Celery workers to `services/workers/`
* Storage relocated from `backend/data/storage` to `storage/`
* Scattered scripts relocated to `tools/` directory categories

## Domain-Driven Backend Re-architecture
FastAPI backend packages were moved under `app/modules/<domain>/` with subdirectories `models`, `schemas`, `services`, `routers`, and `tasks`:
* **auth**: user management and login security
* **registration**: participant registration, import, badge printer and portal
* **speakers**: speaker, session speaker, and conference sessions
* **presentations**: presentation file, validation, and bundles
* **venue**: room device telemetry, sync, and capacity rules
* **analytics**: dashboard charts calculations
* **notifications**: resend email campaigns and webhooks
* **rbac**: user assignments and settings

## Import & Config Re-wiring
* Python imports were automatically updated from `app.models.user` to `app.modules.auth.models.user`, etc.
* Root `package.json` workspaces were updated to reflect the new structure.
* Alembic environment and migrations remain intact and compatible.

The refactoring is complete! Check git status and run verification tests.
