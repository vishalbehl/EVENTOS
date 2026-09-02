# Backend Production Operations Runbook

This runbook is the release and incident checklist for the modular backend.
PostgreSQL is authoritative; Redis and Celery are acceleration and execution
layers and may be rebuilt from database state.

## Release gate

Run from `services/backend`:

```powershell
.venv\Scripts\python.exe -m compileall -q app
.venv\Scripts\python.exe ops\validate_migration_chain.py
.venv\Scripts\python.exe ops\production_release_gate.py
.venv\Scripts\python.exe -m pytest tests/test_production_primitives.py tests/test_task_policy.py tests/test_performance_instrumentation.py -q
```

For a production release, also attach evidence for tenant isolation,
authorization, migration upgrade, changed-route load tests, and rollback.

## Database readiness

1. Confirm the migration head and run migrations during the deployment window.
2. Check pool checkout wait, active connections, transaction age, CPU, memory,
   replication lag, and disk headroom.
3. Confirm `pg_stat_statements` is enabled. Review top fingerprints by total
   time, mean time, calls, rows, and buffer reads.
4. Run `EXPLAIN (ANALYZE, BUFFERS)` on a representative staging dataset before
   shipping an index or query rewrite. Never paste production bind values into
   logs or tickets.

## Backups and restore drill

Record backup timestamp, restore start/end, recovered database version, row
count/checksum validation, recovery point, and recovery time. Restore into an
isolated environment, run migration verification and tenant-isolation tests,
then delete the temporary credentials and environment.

Object storage must have versioning and encrypted retention enabled. Redis is
recreated, not treated as a source of business truth.

## Runtime alerts

Alert on sustained route p95 breach, elevated 5xx rate, query-budget breach,
pool exhaustion, Redis failures, cache failure spikes, queue backlog, retry or
dead-letter growth, worker restart loops, upload quarantine spikes, provider
timeouts, backup failures, and tenant-boundary violations. Each alert must
link to an owner and an incident record.

## Graceful degradation

- Redis outage: safe reads bypass cache; locks and rate limits fail according to
  their endpoint policy and emit telemetry.
- Celery outage: commands remain durable; status is visible as queued or failed
  and work can be replayed idempotently.
- Object storage outage: do not mark uploads ready; retain a retryable state.
- Database outage: readiness fails; liveness remains independent of database
  connectivity.
- External provider timeout: keep the transaction short, persist the pending
  operation, and retry only classified transient failures.

## Rollback

1. Stop promotion and preserve request, worker, and migration identifiers.
2. Roll back application images only when the schema remains backward
   compatible.
3. Prefer a forward-fix migration for destructive or already-applied schema
   changes; never edit migration history in place.
4. Drain or pause affected queues, then resume with workers compatible with the
   deployed schema.
5. Verify health, error rate, query budgets, queue depth, and tenant isolation
   before reopening traffic.

## Failure drills

Quarterly, exercise Redis loss, worker termination, storage timeout, duplicate
webhook delivery, database failover, deployment during active jobs, and dead
letter replay. Record detection time, degraded behavior, recovery time, lost
work, and follow-up owner.
