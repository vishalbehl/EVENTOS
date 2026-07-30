# Capability Control Production Rollout Runbook

## Purpose

This runbook governs the per-organization transition from legacy commercial
checks to the canonical feature, entitlement, flag, and limit resolver.
Rollout is tenant-scoped. Never enable all organizations in one operation.

The Command Center Organizer Console **Internal Admin** workspace is the
operator control surface. Its rollout and diagnostics APIs are authoritative;
an empty UI after an API failure is not evidence of a healthy tenant.

## Release prerequisites

Before the first tenant enters shadow mode:

1. Deploy the same tested backend and portal revisions.
2. Confirm Alembic reports exactly one head and the database is at that head:

   ```powershell
   .venv\Scripts\python.exe -m alembic heads
   .venv\Scripts\python.exe -m alembic current
   ```

3. Run the disposable-database migration contract gate:

   ```powershell
   .venv\Scripts\python.exe scripts\verify_capability_migrations.py
   .venv\Scripts\python.exe scripts\verify_capability_migrations.py `
     --start-revision 20260722_0940
   ```

   Both runs must reach the current head with zero capability-owned ORM/schema
   differences. The verifier drops its temporary database automatically.

4. Verify provider secret references and provider verification for every
   enabled provider-backed feature. Entitlement alone must not make an
   unverified provider usable.
5. Confirm the capability catalogue coverage report has:
   - no missing catalogue keys;
   - no unknown catalogue keys;
   - no ungated registered operations;
   - no unenforced limits.
6. Confirm the worker and scheduler are running. The scheduler fans out nightly
   shadow comparisons and expires temporary controls and reservations.
7. Confirm alert delivery for resolver failures, shadow divergence, metering
   drift, unusual gate-denial volume, and stale comparisons.
8. Retain compatibility columns and legacy reads until every active tenant has
   completed the enforced observation window.

## Tenant rollout procedure

### 1. Select a safe tenant

Start with an internal or sandbox organization. Record:

- organization ID;
- activated event count;
- active contract count;
- enabled provider-backed capabilities;
- current support/security incidents;
- operator, approver, reason, and case reference.

Do not use a production customer as the first validation tenant.

### 2. Inspect the preflight state

Open **Organizer Console → Internal Admin → Production rollout gate**.

The tenant is ready for shadow mode only when:

- the organization and event scopes are correct;
- the authoritative API is available;
- the activated-event inventory is credible;
- no unresolved catalogue coverage issue exists.

Starting shadow mode queues the governed contract/usage backfill when an
activated event lacks a canonical contract. The backfill is idempotent.

For a command-line dry run against one explicitly approved tenant:

```powershell
@'
import asyncio, json
from app.tasks.organization_console_rollout_tasks import backfill_organization_console

organization_id = "REPLACE_WITH_APPROVED_ORGANIZATION_ID"
print(json.dumps(
    asyncio.run(backfill_organization_console(organization_id, apply=False)),
    indent=2,
    default=str,
))
'@ | .venv\Scripts\python.exe -
```

The dry run must not create contracts, usage entries, flags, or comparisons.
Review the reported contract and usage-baseline counts before applying through
the governed rollout control.

Generate the canonical read-only promotion manifest with:

```powershell
.venv\Scripts\python.exe scripts\organizer_console_rollout.py `
  REPLACE_WITH_APPROVED_ORGANIZATION_ID --preflight
```

The command exits `0` only when `ready_for_enforcement` is true and exits `2`
when promotion blockers exist. Its blockers are the same blockers enforced by
the Organizer Console rollout mutation; the CLI is not a second policy engine.
Provider and missing-reconciliation states are reported as operational warnings
because runtime provider availability remains distinct from commercial
entitlement resolution.

### 3. Enable shadow mode

Use **Start shadow mode** with a concrete reason and case reference. Keep
canonical enforcement disabled.

Validate:

- every activated event has one active canonical contract;
- the latest comparison sample contains every activated event;
- `diverged = 0`;
- `stale = 0`;
- capability resolution failures are zero;
- canonical and legacy access decisions agree;
- limits agree exactly;
- provider-backed capabilities still fail closed without verified providers.
- `preflight.ready_for_enforcement` is true;
- every preflight warning is acknowledged in the rollout evidence.

Shadow comparisons are fresh for 26 hours. A missing or stale event comparison
blocks enforcement.

### 4. Observe

Observe at least one complete business cycle appropriate to the tenant,
including representative registration, communication, storage, API/webhook,
integration, export, and administrative workflows.

Review these Internal Admin diagnostics:

| Signal | Promotion gate |
|---|---|
| Missing or unknown catalogue keys | `0` |
| Ungated operations | `0` |
| Unenforced limits | `0` |
| Shadow divergences | `0` |
| Resolution failures | `0` |
| Metering drift | Investigated and reconciled |
| Stale comparisons | `0` |
| Legacy resolver calls | Explained and decreasing |
| Provider failures | Expected fail-closed or remediated |

Investigate denial spikes by stable reason code. `NOT_ENTITLED`,
`QUOTA_EXHAUSTED`, `SUSPENDED`, `SECURITY_RESTRICTED`,
`ROLLOUT_DISABLED`, `PROVIDER_UNAVAILABLE`, `RESOLUTION_UNAVAILABLE`, and
`CONTRACT_REQUIRED` require different operator responses.

### 5. Enable canonical enforcement

Use **Enable canonical enforcement** only after the UI permits it. The backend
independently rejects promotion unless every activated event has a current
matching comparison and a contract.

Record the approval/audit reference and verify immediately:

- Organizer Portal capability responses report `ENFORCED`;
- navigation, page, and action decisions agree;
- direct API attempts cannot bypass the gate;
- cache resolution versions change after a governed mutation;
- reservations convert to consumption once and release on failure;
- no cross-tenant event identifier is accepted.

### 6. Enforced observation window

Monitor the tenant continuously through the agreed observation window. Expand
to the next tenant cohort only when the current cohort has:

- zero unexplained entitlement divergence;
- zero resolver fail-open behavior;
- acceptable denial and error rates;
- reconciled usage;
- verified recovery evidence.

## Rollback

Rollback is organization-scoped:

1. Disable canonical enforcement for the affected organization while retaining
   shadow mode.
2. If a capability is unsafe, apply a time-limited emergency restriction or
   kill switch. Restrictions never grant commercial access.
3. Preserve contracts, comparisons, usage ledgers, reservations, approvals,
   and audit records. Do not delete or rewrite evidence.
4. Invalidate the tenant capability cache and verify a new resolution version.
5. Confirm Organizer Portal reports `SHADOW` or the intended restricted state.
6. Reconcile usage and inspect all diagnostics from the incident window.
7. Correct the catalogue, contract, provider, meter, or resolver source of
   truth; rerun fresh comparisons before re-enforcement.

Do not roll back database migrations merely to disable canonical enforcement.
Migration rollback requires a separately reviewed database recovery procedure.

## Incident rules

- **Resolution unavailable:** fail closed, keep the unavailable state visible,
  and restore resolver dependencies. Never substitute an empty capability set
  as healthy data.
- **Shadow divergence:** keep enforcement disabled, inspect source lineage, and
  correct the canonical contract or legacy mapping.
- **Quota drift:** stop affected finite operations if oversubscription is
  possible, run reconciliation, and use an auditable adjustment/reset epoch.
- **Provider unavailable:** keep the commercial entitlement unchanged and
  restore provider configuration; do not use a flag to grant access.
- **Cross-tenant evidence:** suspend rollout for the cohort and begin the tenant
  isolation incident procedure immediately.

## Required rollout evidence

For each tenant retain:

- preflight and post-promotion rollout snapshots;
- migration revision;
- deployed backend and portal revisions;
- backfill report;
- latest event-by-event comparison results;
- diagnostics snapshot;
- reconciliation evidence;
- provider verification evidence;
- operator and independent approver;
- reason and case reference;
- rollback test result;
- promotion and observation timestamps.

Legacy fields and migration flags may be retired only after all active tenants
have completed enforcement and the retained evidence proves no active request
path depends on them.
