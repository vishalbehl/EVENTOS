# Phase 1 Walkthrough — Jobs, Search & Audit Core

## Overview

Phase 1 activates three previously skeleton schema domains (`jobs`, `search`, `audit`) across **6 implementation sections**: backend services/routers, Celery worker integration, and Super Admin frontend pages.

---

## Section 1 — Backend: `jobs` Module

### 📄 [`job_schemas.py`](file:///d:/DEV/conf-platform/services/backend/app/modules/jobs/schemas/job_schemas.py)

Pydantic schemas for the jobs monitoring API:

| Schema | Purpose |
|---|---|
| `BackgroundJobOut` | Represents a registered Celery task type |
| `JobExecutionOut` | Single execution instance with computed `duration_seconds` |
| `JobFailureOut` | Failure record with error message and stack trace |
| `JobStatsOut` | Aggregate counters for the dashboard: queued/running/succeeded/failed/retrying |
| `PaginatedJobExecutions` | Paginated wrapper for execution list |
| `PaginatedJobFailures` | Paginated wrapper for failure list |

### 📄 [`job_service.py`](file:///d:/DEV/conf-platform/services/backend/app/modules/jobs/services/job_service.py)

Async service layer — all reads, no writes (writes happen via Celery signals):

- `list_jobs()` — returns all registered task types
- `list_executions()` — paginated, filterable by `job_id` and `status`; JOINs `BackgroundJob` to denormalize `task_name` for display
- `list_failures()` — paginated failure records for a specific execution
- `get_stats()` — fires 6 concurrent `COUNT()` queries for the dashboard counters

### 📄 [`routers/jobs.py`](file:///d:/DEV/conf-platform/services/backend/app/modules/jobs/routers/jobs.py)

5 endpoints, all `SuperAdminOnly`:

| Method | Path | Description |
|---|---|---|
| `GET` | `/jobs/stats` | Dashboard aggregate counters |
| `GET` | `/jobs` | List all registered job types |
| `GET` | `/jobs/{job_id}/executions` | Paginated execution history for a job |
| `GET` | `/jobs/executions` | All recent executions (global view) |
| `GET` | `/jobs/executions/{execution_id}/failures` | Failure details with stack trace |

---

## Section 2 — Worker: Job Execution Tracking

### 📄 [`lib/job_tracker.py`](file:///d:/DEV/conf-platform/services/workers/lib/job_tracker.py)

The central tracking helper. Never imported by individual task files — only by Celery signals.

- `get_or_create_background_job(task_name)` — auto-registers unknown tasks on first encounter (no manual catalog maintenance required)
- `record_execution_start()` → creates `JobExecution` with `status=running`
- `record_execution_success()` → updates to `status=success` + sets `finished_at`
- `record_execution_failure()` → updates to `status=failed`, creates `JobFailure`, writes `audit.worker_logs`
- `record_execution_retry()` → updates to `status=retrying`

The key design: uses a `_write_worker_audit_log()` call on failure that writes to the **existing** `WorkerJobLog` model in `api_request_log.py` — this cross-schema write provides the long-term tamper-resistant audit trail.

### 📄 [`celery_app.py`](file:///d:/DEV/conf-platform/services/workers/celery_app.py) (modified)

**Non-invasive tracking via 4 Celery signals:**

```
task_prerun  → on_task_prerun  → record_execution_start()
task_success → on_task_success → record_execution_success()
task_failure → on_task_failure → record_execution_failure()
task_retry   → on_task_retry   → record_execution_retry()
```

A **thread-local dict** (`_execution_id_map`) correlates `celery_task_id → execution_id` across the task lifecycle. This avoids shared state between workers.

Also added: `search` Celery queue with dedicated exchange and routing for all `workers.tasks.search_tasks.*` tasks.

---

## Section 3 — Backend: `search` Module

### 📄 [`search_schemas.py`](file:///d:/DEV/conf-platform/services/backend/app/modules/search/schemas/search_schemas.py)

| Schema | Purpose |
|---|---|
| `SearchQueryIn` | Query string + optional entity type filter + limit |
| `SearchResultOut` | Single result: entity_type, entity_id, title, subtitle, excerpt |
| `SearchResponse` | Paginated search response |
| `SearchJobOut` | Status of a search reindex job |
| `ReindexTriggerIn` | Trigger payload: org_id + optional entity_types |

### 📄 [`search_service.py`](file:///d:/DEV/conf-platform/services/backend/app/modules/search/services/search_service.py)

Full PostgreSQL `tsvector` implementation:

1. **Lookup org's index IDs** for the requested entity types
2. **Query `SearchDocument`** with `to_tsvector('english', content::TEXT) @@ plainto_tsquery('english', q)`
3. **Order by `ts_rank`** for relevance-ranked results
4. **Build excerpt** from matching `description`/`bio`/`abstract` fields
5. `trigger_reindex()` creates a `SearchJob` record + enqueues the Celery task

### 📄 [`routers/search.py`](file:///d:/DEV/conf-platform/services/backend/app/modules/search/routers/search.py)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/search?q=...&types=...` | `ActiveUser` | Tenant-scoped full-text search |
| `POST` | `/search/reindex` | `SuperAdminOnly` | Trigger org reindex |
| `GET` | `/search/jobs` | `SuperAdminOnly` | List reindex job history |

> **Tenant isolation**: The search endpoint reads `current_user.organization_id` — no cross-org search possible.

---

## Section 4 — Worker: Search Indexer

### 📄 [`tasks/search_tasks.py`](file:///d:/DEV/conf-platform/services/workers/tasks/search_tasks.py)

Two Celery tasks on the `search` queue:

**`index_entity`** — indexes a single entity (max 3 retries, 30s delay):
1. Loads entity from the correct domain model
2. Extracts a flat dict of searchable fields
3. Upserts into `search.search_documents` via `_upsert_document()`

**`reindex_organization`** — full org reindex (max 1 retry, 120s delay):
1. Updates `SearchJob.status` → `indexing`
2. Iterates all entity IDs per type via `_get_all_entity_ids()`
3. Extracts + upserts each document
4. Updates status → `completed` or `failed`

Content extractors handle all 4 Phase 1 entity types: **events, speakers, participants, sessions**.

---

## Section 5 — Audit Core Extensions

### 📄 [`models/audit_extensions.py`](file:///d:/DEV/conf-platform/services/backend/app/modules/audit/models/audit_extensions.py)

A **re-export module** (not a new model file). The `audit.worker_logs` table already existed in [`api_request_log.py`](file:///d:/DEV/conf-platform/services/backend/app/modules/audit/models/api_request_log.py) with a full observability schema. We reuse it to avoid duplicate SQLAlchemy metadata conflicts.

### 📄 [`routers/audit.py`](file:///d:/DEV/conf-platform/services/backend/app/modules/audit/routers/audit.py)

3 Super Admin read-only endpoints for the Audit Trail dashboard:

| Endpoint | Data |
|---|---|
| `GET /audit/worker-logs` | Background job failure records |
| `GET /audit/security-logs` | Security events (filterable by severity) |
| `GET /audit/system-changes` | Platform config changes (filterable by entity type) |

---

## Section 6 — Frontend Pages

### 📄 [`/platform-admin/jobs/page.tsx`](file:///d:/DEV/conf-platform/apps/cloud/command-center/app/(dashboard)/platform-admin/jobs/page.tsx)

**Job Monitor Dashboard**:

- **Live stat cards** — Queued / Running / Succeeded / Failed (auto-refreshes every 5s)
- **Status filter pills** — filter execution table by status
- **Execution history table** — task name, status badge, start time, duration
- **Failure Drawer** — slide-in right panel showing full stack trace on click (only appears for `failed` rows on hover)

Design: dark glassmorphic, animated status icons (pulse for running, spin for retrying), color-coded glows on stat cards.

### 📄 [`/platform-admin/search/page.tsx`](file:///d:/DEV/conf-platform/apps/cloud/command-center/app/(dashboard)/platform-admin/search/page.tsx)

**Search Reindex Management**:

- **Org selector** dropdown populated from `/api/v1/organisations`
- **Entity type toggles** — 4 checkable pills (Events/Speakers/Participants/Sessions)
- **Active indexing banner** — auto-appears when a job has `status=indexing`
- **Trigger button** — fires `POST /search/reindex`, shows enqueued job ID on success
- **Job history table** — paginated, auto-refreshes every 5s

---

## Architecture Decisions

| Decision | Rationale |
|---|---|
| Celery signals for tracking | Non-invasive — zero changes to `file_tasks.py`, `notification_tasks.py`, etc. |
| PostgreSQL tsvector over Elasticsearch | Simpler ops — no external service, sufficient for Phase 1 scale |
| Re-export pattern for audit_extensions | Avoids SQLAlchemy "Table already defined" error from duplicate metadata |
| `_execution_id_map` with lock | Thread-safe correlation without shared Redis state between workers |
| `SuperAdminOnly` on all new routes | All Phase 1 features are platform-level ops, not tenant-visible |

---

## Files Created / Modified

### New Files
| File | Type |
|---|---|
| `app/modules/jobs/schemas/job_schemas.py` | Backend schema |
| `app/modules/jobs/services/job_service.py` | Backend service |
| `app/modules/jobs/routers/jobs.py` | Backend router |
| `app/modules/search/schemas/search_schemas.py` | Backend schema |
| `app/modules/search/services/search_service.py` | Backend service |
| `app/modules/search/routers/search.py` | Backend router |
| `app/modules/audit/models/audit_extensions.py` | Audit re-export |
| `app/modules/audit/routers/audit.py` | Audit router |
| `workers/lib/job_tracker.py` | Worker helper |
| `workers/tasks/search_tasks.py` | Celery task |
| `apps/cloud/command-center/app/(dashboard)/platform-admin/jobs/page.tsx` | Frontend |
| `apps/cloud/command-center/app/(dashboard)/platform-admin/search/page.tsx` | Frontend |

### Modified Files
| File | Change |
|---|---|
| `workers/celery_app.py` | Added `search` queue, 4 Celery tracking signals |
| `app/routers/__init__.py` | Registered `jobs_router`, `search_router`, `audit_router` |
