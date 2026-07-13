# Phase 1 Exit Evidence

Date: 2026-07-11

## Scope

This evidence covers the Phase 1 SaaS tenancy and licensing foundation checks
for currently enabled backend runtime paths.

## Verified Controls

- Alembic head is `phase1_exports_0550`.
- Runtime RLS canary passed against `eventx_runtime`.
- Tenant-owned background jobs require explicit `organization_id_str` or fail
  closed.
- Celery beat schedules only the tenant-aware API usage flusher.
- API usage and rate-limit cache keys use the canonical tenant namespace.
- Analytics exports use durable `audit.data_exports` records and authorized
  backend download endpoints.
- Report workers no longer return or email direct storage presigned URLs.
- Shared storage helpers reject object keys outside the verified tenant
  namespace.
- Venue credential expiry, rotation, and revocation metadata are present and
  enforced by cloud HTTP/WebSocket device authentication.

## Commands Run

```powershell
.\.venv\Scripts\alembic.exe heads
.\.venv\Scripts\alembic.exe current
.\.venv\Scripts\python.exe scripts\verify_rls_canary.py --role eventx_runtime
.\.venv\Scripts\python.exe -m py_compile app/tasks/tenant_job_scope.py app/tasks/platform_tasks.py app/tasks/workflow_jobs.py app/tasks/platform_builder_tasks.py app/tasks/platform_commercial_tasks.py app/tasks/operations_jobs.py app/worker.py tests/test_tenant_runtime_boundaries.py
.\.venv\Scripts\python.exe -m pytest -q tests/test_tenant_runtime_boundaries.py
.\.venv\Scripts\python.exe -m pytest -q tests/test_rate_limiting_and_gating.py tests/test_tenant_runtime_boundaries.py tests/test_phase1_rls_foundation.py tests/test_phase3_developer.py
git diff --check -- services/backend/app/tasks/tenant_job_scope.py services/backend/app/tasks/platform_tasks.py services/backend/app/tasks/workflow_jobs.py services/backend/app/tasks/platform_builder_tasks.py services/backend/app/tasks/platform_commercial_tasks.py services/backend/app/tasks/operations_jobs.py services/backend/app/worker.py services/backend/tests/test_tenant_runtime_boundaries.py governance/phase1/TENANT_RUNTIME_BOUNDARIES.md
```

## Results

- Alembic current/head: `phase1_exports_0550`.
- Live RLS canary: passed and rolled back.
- Tenant runtime boundary tests: `12 passed`.
- Focused Phase 1 backend slice: `34 passed`.
- Diff check: passed with CRLF warnings only.

## Static Scan Notes

The Phase 1 bad-pattern scan found no remaining legacy developer rate-limit
cache keys, direct report-worker presigned URLs, tenant-header trust markers,
runtime DDL startup markers, or missing Celery beat module entries in the
enabled cloud runtime path.

Remaining presigned URL generation is limited to:

- the shared backend upload service, which now enforces tenant-prefixed object
  keys before upload, download, byte-read, or byte-write operations;
- the Venue Server local API path, which remains outside the cloud database
  trust boundary and must stay governed by the separate Venue Reliability
  Program.

## Deferred By Design

- Full control-plane fanout for dormant workflow/platform jobs remains a Phase 2
  or later design item. Those jobs are not scheduled globally and fail closed
  without explicit tenant scope or a future control-plane contract.
- Future public export formats beyond the current analytics summary XLSX must
  use the durable export record and authorized download endpoint pattern.
- Future bucket/download producers must use the shared storage helper or provide
  equivalent tenant namespace authorization before exposure.
