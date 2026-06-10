# Phase 1 Implementation Plan — Jobs, Search & Audit Core

This plan covers the full implementation of Phase 1 from the EventX OS 4-phase roadmap.
Phase 1 establishes the platform's **background processing infrastructure**, **global search indexing**, and **audit trail completeness** — the essential backbone for all future domain features.

---

## User Review Required

> [!IMPORTANT]
> Phase 1 does NOT touch any existing business logic. It activates skeleton schemas (`jobs`, `search`, `audit`) and adds the Job Monitor UI to the Super Admin dashboard. All new features strictly follow multi-tenant SaaS isolation and DDD boundaries.

> [!NOTE]
> Existing Celery workers (`file_tasks`, `notification_tasks`, `import_tasks`, etc.) already exist in `services/workers/tasks/`. Phase 1 wires them to the `jobs` schema tracking system and expands them with a `search_indexer` task.

---

## Open Questions

None. Ready to execute.

---

## Proposed Changes

### Section 1 — Backend: `jobs` Module (Activate Background Job Platform)

The `jobs` schema models already exist (`BackgroundJob`, `JobExecution`, `JobFailure`, `JobSchedule`, `JobLock`). We need to add schemas, services, and routers to activate full CRUD and monitoring.

#### [NEW] `app/modules/jobs/schemas/job_schemas.py`
- Pydantic models for `BackgroundJobOut`, `JobExecutionOut`, `JobFailureOut`, `JobScheduleOut`

#### [NEW] `app/modules/jobs/services/job_service.py`
- `JobService` class with async methods:
  - `list_jobs()` — list all registered background job types
  - `list_executions(job_id, status, limit)` — paginated execution history
  - `list_failures(execution_id)` — failure stack traces
  - `get_job_stats()` — aggregate counts (queued, running, succeeded, failed) for dashboard widgets

#### [NEW] `app/modules/jobs/routers/jobs.py`
- `GET /jobs` — list all registered jobs (Super Admin only)
- `GET /jobs/{job_id}/executions` — execution history with status filter
- `GET /jobs/{job_id}/executions/{execution_id}/failures` — inspect failure traces
- `GET /jobs/stats` — aggregate job stats for the dashboard widget

#### [MODIFY] `app/routers/__init__.py`
- Register the new `jobs.router` under the `api_router`

---

### Section 2 — Worker Integration: Job Execution Tracking

Every Celery task must now record its execution to the `jobs` schema. We achieve this via **Celery signals** — a non-invasive, centralized approach that does not modify individual task files.

#### [MODIFY] `services/workers/celery_app.py`
- Add Celery signal handlers using `@task_prerun`, `@task_success`, `@task_failure`, `@task_retry`:
  - **`task_prerun`** → Create `JobExecution` with `status="running"` and `started_at=now()`
  - **`task_success`** → Update `JobExecution.status="success"`, set `finished_at=now()`
  - **`task_failure`** → Update `JobExecution.status="failed"`, create `JobFailure` with error + stack trace
  - **`task_retry`** → Update `JobExecution.status="retrying"`
- Map task names to their `BackgroundJob.task_path` IDs via a lookup dictionary seeded on startup

#### [NEW] `services/workers/lib/job_tracker.py`
- Helper utilities: `get_or_create_background_job(task_name)`, `record_execution_start()`, `record_execution_end()`
- Uses a sync SQLAlchemy session (`workers/db.py`) to write tracking records

---

### Section 3 — Backend: `search` Module (Activate Global Search)

The `search` schema models exist (`SearchIndex`, `SearchDocument`, `SearchJob`). We wire them with a full-text search service using PostgreSQL `tsvector`.

#### [NEW] `app/modules/search/schemas/search_schemas.py`
- Pydantic models: `SearchQueryIn`, `SearchResultOut`, `SearchJobOut`

#### [NEW] `app/modules/search/services/search_service.py`
- `SearchService` with:
  - `search(organization_id, query, entity_types, limit)` — queries `search_documents.content` using PostgreSQL `to_tsvector` / `plainto_tsquery`
  - `index_document(org_id, entity_type, entity_id, content_dict)` — upserts into `search_documents`
  - `trigger_reindex(org_id, entity_type)` — creates a `SearchJob` record and queues the Celery indexer task

#### [NEW] `app/modules/search/routers/search.py`
- `GET /search?q=&types=events,speakers,participants` — global multi-entity search (tenant-scoped)
- `POST /search/reindex` — Super Admin trigger for full reindex of an organization
- `GET /search/jobs` — list indexing job status

#### [MODIFY] `app/routers/__init__.py`
- Register the new `search.router` under the `api_router`

---

### Section 4 — Worker: Search Indexer Task

#### [NEW] `services/workers/tasks/search_tasks.py`
- `@app.task index_entity(org_id, entity_type, entity_id)` — indexes a single entity
- `@app.task reindex_organization(org_id, entity_types)` — full reindex loop
  - Entity types supported in Phase 1: `events`, `speakers`, `participants`
  - Reads source records from DB, transforms to searchable `content` dict, writes to `search_documents`
  - Updates `SearchJob.status` on completion/failure

#### [MODIFY] `services/workers/celery_app.py`
- Add `search` queue for indexing tasks
- Add `workers.tasks.search_tasks.*` route → `search` queue

---

### Section 5 — Audit Core: Complete `audit` Skeleton Tables

The `audit` schema has 4 active tables and 5 unused: `worker_logs`, `security_logs`, `data_exports`, `system_changes`, `access_reviews`.

#### [NEW] `app/modules/audit/models/audit_extensions.py`
- SQLAlchemy models for `WorkerJobLog`, `SecurityLog`, `DataExport`, `SystemChange`

#### [MODIFY] `services/workers/lib/job_tracker.py`
- When writing a `JobFailure`, also write a `WorkerJobLog` to `audit.worker_logs` with the error context

#### [MODIFY] `app/middleware/audit_log.py`
- On sensitive actions (user creation, deletion, role changes, billing changes), additionally write a `SystemChange` record to `audit.system_changes`

#### [NEW] `app/modules/audit/routers/audit.py`
- `GET /audit/worker-logs` — Super Admin: view background job error logs
- `GET /audit/security-logs` — Super Admin: view security events timeline
- `GET /audit/system-changes` — Super Admin: view platform config changes

#### [MODIFY] `app/routers/__init__.py`
- Register the new `audit.router` under the `api_router`

---

### Section 6 — Super Admin Frontend: Job Monitor Dashboard

#### [NEW] Frontend page: `apps/admin/src/pages/jobs/JobMonitorPage`
- Premium dark-mode dashboard card showing:
  - **Job Stats Widget:** 4 counters (Queued / Running / Succeeded / Failed) with animated number tickers
  - **Active Jobs Table:** Live-updating table of running executions with progress spinner per row
  - **Job History Table:** Paginated table of all executions, filterable by status/task name, sortable by time
  - **Failure Drawer:** Click any failed execution → slide-in drawer with stack trace syntax-highlighted in red
  - **Real-time updates via polling** (every 5 seconds) using React Query `refetchInterval`
- Glassmorphic card design, neon accent colors for status badges (green=success, orange=running, red=failed)

#### [NEW] Frontend page: `apps/admin/src/pages/search/SearchReindexPage`
- Super Admin search management page showing:
  - **Per-organization index health:** last indexed, document count, index status
  - **Trigger Reindex button** for any organization
  - **Index Job History:** timeline of reindex operations

---

## Verification Plan

### Automated Tests
- Run existing backend tests to confirm nothing is broken:
  ```powershell
  cd d:\DEV\conf-platform\services\backend
  .venv\Scripts\python -m pytest tests/ -v --tb=short
  ```
- New tests to add:
  - `tests/test_jobs.py` — test job listing, execution recording, stat aggregates
  - `tests/test_search.py` — test search query, document indexing, job creation

### Manual Verification
- Start the dev server and confirm new `/jobs`, `/search`, `/audit` routes appear in `/docs`
- Confirm Celery signals correctly write execution records when tasks run
- Confirm global search returns tenants' events/speakers correctly filtered by `organization_id`
- Verify Super Admin Job Monitor UI renders correctly with live-updating data
