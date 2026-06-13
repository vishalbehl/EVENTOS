# Walkthrough — Section D: Operations

All changes required for the Platform Operations (Section D) have been completed, verified, and all tests now pass successfully.

## Changes Made

### Backend

#### 1. [router.py](file:///d:/DEV/conf-platform/services/backend/app/modules/platform/router.py)

- **Extended Health Endpoint (`/platform/health`)**:
  - Implemented a complete system status endpoint that checks the health of four core components:
    - **PostgreSQL**: Checks connectivity and measures query response latency.
    - **Redis Cluster**: Pings Redis and retrieves current client connection metrics.
    - **Celery Workers**: Inspects active Celery workers via the Celery control application.
    - **Stripe API**: Calls the Stripe status page endpoint to verify external payment processing status.
  - Determines an `overall` system health status (`healthy`, `degraded`, or `down`) based on service check results.

- **Database Stats Endpoint (`/platform/operations/database`)**:
  - Exposes database connection and performance metrics:
    - Retrieves active connection stats (total, active, idle).
    - Measures size metrics of all tables and index sizes.
    - Computes cache hit ratio and identifies dead tuples.
    - Gracefully inspects slow queries from `pg_stat_statements`. Included a check on `pg_views` to make sure it doesn't fail if the `pg_stat_statements` view/extension is missing.

- **Background Jobs Endpoint (`/platform/operations/jobs`)**:
  - Queries `jobs.job_executions` joined with `jobs.background_jobs` and `jobs.job_failures`.
  - Normalizes uppercase UI filters (e.g. `COMPLETED`, `FAILED`, `PENDING`) to database-level lowercase states (`success`, `failed`, `queued`, `running`, `retrying`).
  - Returns paginated jobs execution list containing computed `duration_ms`, `completed_at`, `error_message`, and associated job names.
  - Calculates a 24-hour job health summary (success rate, average duration, and task execution counts).

### Frontend

#### 1. [super-admin-service.ts](file:///d:/DEV/conf-platform/apps/cloud/command-center/services/super-admin-service.ts)

- **React Query Hooks added**:
  - `usePlatformHealth`: Fetches health details and refetches every 60 seconds.
  - `useDatabaseStats`: Fetches DB connection metrics and refetches every 30 seconds.
  - `useBackgroundJobs`: Fetches background job executions and summaries. Automatically switches poll interval from 10 seconds to 30 seconds when filtering parameters are active.

---

## Verification Results

### Automated Tests Passed

We executed the newly created operations tests suite:
```powershell
.venv\Scripts\python.exe -m pytest tests/test_operations.py -v
```

All **4 tests** passed successfully:

1. `test_platform_health_endpoint` — **PASSED**
   - Verifies PostgreSQL, Redis, Celery, and Stripe are checked.
   - Confirms HTTP mocking intercepts the external Stripe status call correctly without polluting other tests.
2. `test_platform_database_stats_endpoint` — **PASSED**
   - Assures metrics like connection counts, size, cache hit ratio, and dead tuples are reported properly.
3. `test_platform_background_jobs_endpoint` — **PASSED**
   - Verifies dummy job creation, listing, uppercase status mapping, and 24h summary metrics.
4. `test_operations_endpoints_require_admin` — **PASSED**
   - Restricts non-platform admin roles (such as organizer) with `403 Forbidden` status.
