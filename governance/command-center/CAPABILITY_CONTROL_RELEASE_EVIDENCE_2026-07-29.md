# Capability Control Release Evidence — 2026-07-29

## Current assessment

The unified capability-control implementation is code-complete enough for
sandbox and tenant-scoped shadow validation. It is **not yet approved for a
global production rollout**.

The remaining gates are production/database and deployment evidence, not a
missing canonical resolver or missing Command Center control surface.

## Verified in this workspace

### Migration state

From `services/backend`:

```text
python -m alembic current
20260728_1150 (head)

python -m alembic heads
20260728_1150 (head)
```

The configured local database is at the repository's single Alembic head.

### Capability migration contract

The disposable-database verifier now executes both:

```powershell
.venv\Scripts\python.exe scripts\verify_capability_migrations.py
.venv\Scripts\python.exe scripts\verify_capability_migrations.py `
  --start-revision 20260722_0940
```

Both the empty install and the supported pre-capability upgrade boundary reach
`20260728_1150` and report:

```json
{
  "tables": 17,
  "columns": 161,
  "indexes": 5,
  "unique_constraints": 2,
  "model_schema_differences": 0,
  "status": "PASSED"
}
```

The verifier uses a uniquely named disposable PostgreSQL database, validates
the name before any destructive operation, and drops it automatically. The
same two paths are enforced by
`.github/workflows/backend-capability-migrations.yml`.

The migration verifier's contract-to-model tests pass (`2 passed`), and all
temporary verification databases were confirmed removed after execution.

### Governed backfill dry run

Target: dedicated capability sandbox organization
`9e7c9ccc-6f3c-40c6-b39a-67bea5338c20`.

```json
{
  "organization_id": "9e7c9ccc-6f3c-40c6-b39a-67bea5338c20",
  "apply": false,
  "contracts": 0,
  "usage_baselines": 0,
  "comparisons": 0,
  "events": 1
}
```

The dry run found no missing contract or usage baseline and made no changes.

### Shadow comparison

The same sandbox organization produced:

```json
{
  "organization_id": "9e7c9ccc-6f3c-40c6-b39a-67bea5338c20",
  "matched": 1,
  "diverged": 0
}
```

This proves the current sandbox event's legacy and canonical access/limit
projection agrees. It is not evidence for other organizations.

### Canonical rollout preflight

The rollout API, Command Center Internal Admin workspace, and rollout CLI now
share one backend preflight service. Promotion blockers cover:

- inactive organization;
- missing active event contracts;
- missing, stale, or diverged event comparisons;
- missing/unknown catalogue keys;
- ungated registered operations or unenforced limits;
- current resolver failures;
- unresolved latest metering reconciliation drift.

Provider verification and missing reconciliation evidence are visible
operational warnings rather than commercial-resolution blockers. Provider
operations continue to fail closed independently.

The capability sandbox currently reports:

```text
ready_for_enforcement: true
blockers: 0
activated/contracted/compared/matched: 1/1/1/1
catalogue gaps: 0
ungated operations: 0
unenforced limits: 0
```

It also truthfully reports missing usage reconciliation and recent historical
shadow-divergence diagnostics as warnings; the latest comparison is matched.

Integrated rollout verification passes:

```text
Organizer Console + contention + provider pipeline: 37 passed
Command Center tests: 29 files, 86 passed
Command Center type-check: passed
Command Center production build: passed, 80 routes generated
```

### Focused backend acceptance pack

Command:

```powershell
.venv\Scripts\python.exe -m pytest -q `
  tests\test_capability_control.py `
  tests\test_organization_console.py `
  tests\test_provider_delivery_pipeline.py `
  tests\test_webhooks.py `
  tests\test_billing_admin_lifecycle.py
```

Result:

```text
82 passed, 59 warnings in 175.20s
```

The pack covers canonical catalogue and operation coverage, typed plans and
add-ons, flags, independent approval, expiry, restrictions, reservations,
idempotency, provider fail-closed behavior, rollout gating, Organizer Console
controls, webhooks, and governed billing lifecycle operations.

Warnings are existing Pydantic class-config and Redis `setex` deprecations; no
acceptance test failed.

An additional multi-session PostgreSQL contention test now proves that 12
competing reservations against a three-room allowance serialize on the event
lock: exactly three reservations succeed and nine receive
`QUOTA_EXHAUSTED`. This test passes independently and is part of the
capability-control suite.

Post-change tenant isolation, runtime-boundary, rate-limit/gating, and security
regression suites also pass:

```text
30 passed, 18 warnings in 41.73s
```

### Previously completed application verification in this implementation

- Command Center contract generation/check, architecture checks, type-check,
  unit/component tests, and production build.
- Organizer Portal production build.
- Speaker Portal type-check and production build.
- Venue Registration type-check and production build.
- Backend full-suite evidence is now one authoritative post-change run:

  ```text
  510 passed, 2 skipped, 297 warnings in 478.81s
  ```

  The skipped tests are retained suite skips; there are no failures. Warnings
  are primarily tracked framework/Redis deprecations and do not change the
  pass result.

## Open release gates

### Platform release dependency — repository-wide Alembic parity

`python -m alembic check` reports substantial model/schema drift across the
repository. Examples include missing tables/indexes and default/index/FK
differences in audit, developer, identity, platform, templates, and venue
domains.

The capability-control-owned subset is now independently clean and CI-gated.
The remaining output is a platform-wide migration baseline issue rather than
evidence that capability migrations are missing. It still blocks an
application-wide schema-readiness claim and must be closed by the owning
domains before a full-platform production release.

Required closure:

1. classify every reported operation as a missing migration, intentionally
   unmanaged model, naming-convention noise, or legacy schema artifact;
2. add migrations or Alembic include/compare policy as appropriate;
3. make `alembic check` clean against a production-like restored database;
4. prove clean install and supported-version upgrade paths;
5. test failed-backfill recovery and document database rollback boundaries.

### P0 — Production tenant evidence

The sandbox comparison is 1/1 matched. Every production tenant still requires:

- governed dry-run review;
- canonical contract coverage for every activated event;
- fresh event-by-event comparisons;
- zero unresolved divergence;
- usage reconciliation;
- provider verification;
- staged enforcement with retained audit evidence.

### P0 — Real provider verification

SMS, WhatsApp, push, email, payment, and other enabled provider-backed paths
need environment-specific secret references, verification, delivery callbacks,
retry/dead-letter evidence, and reconciliation. The code correctly fails closed
when a required provider is not verified.

### P1 — Production non-functional evidence

Complete and retain:

- browser end-to-end evidence against the deployed revision;
- concurrency/load tests for high-volume reservations and consumption;
- tenant-isolation and security regression evidence;
- alert delivery and on-call acknowledgement tests;
- restore/rollback drill evidence;
- acceptable error, denial, reconciliation, and job-failure baselines.

### P1 — Legacy retirement

Do not remove compatibility fields, legacy reads, or migration flags until all
active tenants have completed the enforced observation window with no active
request path depending on them.

## Rollout decision

| Scope | Decision |
|---|---|
| Local implementation validation | Pass |
| Dedicated sandbox shadow comparison | Pass |
| Tenant-scoped internal shadow rollout | Ready, subject to operator approval |
| Selected production tenant rollout | Capability migration gate passed; blocked pending environment and tenant evidence |
| Global canonical enforcement | Blocked |
| Legacy field/resolver retirement | Blocked |

Use
`governance/command-center/CAPABILITY_CONTROL_ROLLOUT_RUNBOOK.md` for the
tenant-by-tenant promotion and rollback procedure.
