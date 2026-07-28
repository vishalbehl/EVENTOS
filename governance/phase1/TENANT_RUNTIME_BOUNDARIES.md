# Phase 1 Tenant Runtime Boundaries

Status: CLOSED FOR ENABLED PHASE 1 RUNTIME PATHS

This register tracks tenant isolation outside ordinary authenticated HTTP routes.
The enabled backend runtime paths have passed the Phase 1 boundary gate. Items
listed under future guardrails are intentionally blocked, deferred, or governed
by later control-plane work; they are not active Phase 1 blockers.

## Implemented Increment

### Transaction context

- PostgreSQL tenant state remains transaction-local.
- A SQLAlchemy `after_begin` hook reapplies verified tenant context after every
  commit or rollback.
- Missing context is represented by an empty database setting and RLS remains
  fail closed.
- A regression test proves context is restored on the next transaction.

### Presentation and communication workers

- New presentation-validation and email-campaign tasks require an explicit
  `organization_id` payload.
- Producers derive the organization from the already-authorized event.
- Workers establish tenant context before the first domain query.
- Resource IDs remain verified by tenant-scoped database access.

Legacy queued messages without organization scope are intentionally rejected
instead of being resolved through an unscoped resource lookup.

### Import and malware workers

- Excel-import jobs require an explicit organization payload and establish
  tenant context before loading the import job.
- Queue dispatch failure marks the import job failed and returns `503`; the
  previous process-local `asyncio.ensure_future` fallback was removed.
- Malware-scan jobs require an explicit organization payload and verify the
  loaded asset owner before scanning.
- The dedicated worker session stores tenant scope in both SQLAlchemy session
  metadata and the shared tenant context, and reapplies `SET LOCAL` after every
  transaction boundary.

### Cache isolation

- `TenantCacheKey` is the canonical tenant cache namespace builder.
- Event cache keys include organization and event UUIDs.
- Missing tenant context and unsafe namespace segments fail closed.
- Analytics snapshot and email analytics caches now use the canonical builder.
- API usage counters and both rate-limiter paths use canonical tenant-prefixed
  keys. Membership, rate-plan, and entitlement changes must invalidate the
  corresponding tenant config or snapshot cache keys before relying on cached
  decisions.

### Report and export workers

- Event summary and session-readiness report tasks require explicit
  organization scope.
- Workers verify the requested event belongs to the organization before any
  query or object upload.
- Summary reports also verify the requesting user belongs to that organization.
- Generated object keys are tenant and event prefixed:
  `organization_id/events/event_id/exports/...`.
- Public analytics export now uses durable `audit.data_exports` records, a
  queued worker job, an authorization-gated backend download endpoint, and
  explicit export request/download audit records.
- Report workers no longer return or email direct storage presigned URLs.
- Notification dispatch failures are logged; they no longer disappear through a
  silent exception fallback.

### Search workers and derived indexes

- Search indexing keeps the supplied organization ID through entity extraction,
  reindex job status, index writes, and database sessions.
- Speakers, participants, and sessions are verified through their owning event
  before a search document is created.
- Search indexes and jobs use direct organization RLS; search documents inherit
  scope through their parent search index.
- The runtime role has explicit `search` schema/table grants and no RLS bypass.
- The live canary validates search document visibility and rejects a document
  insertion through another organization's index.

### Media processing workers

- Presentation validation, thumbnail generation, and PDF-preview tasks require
  explicit organization scope and use tenant-scoped worker sessions.
- Validation chains organization scope into thumbnail generation.
- Generated thumbnail and PDF-preview keys are tenant prefixed.
- File records remain protected by RLS before any source object is read or
  derived object is written.

### Object storage

- New object keys require verified tenant context and use the organization UUID
  as the first path segment.
- Shared presigned upload, presigned download, byte-read, and byte-write helpers
  reject object keys outside the verified tenant namespace.
- Local-development upload and download URLs use expiring HMAC capabilities
  bound to method, bucket, key, organization, and expiry.
- Local storage paths are resolved beneath the configured root and reject
  traversal.
- The old recursive local-storage filename search fallback has been removed.

### Venue machine boundary

- Device heartbeat now requires the registered hashed device key.
- Heartbeat identity is bound to device and room scope.
- Cloud venue pull/push endpoints require device identity instead of the shared
  `X-Internal-Secret` credential.
- Venue Server cloud requests send `X-Device-Key` from `CLOUD_DEVICE_KEY`.
- Sync requests are bound to the device's assigned event and organization.
- Attendance writes verify participant and session ownership against the device
  event.
- Badge scan and print writes verify badge ownership through the participant's
  event.
- Unsupported synchronization entity types are rejected.
- Device credentials carry key version, expiry, rotation timestamp, revocation
  timestamp, and revocation reason. HTTP and WebSocket device authentication
  reject expired or revoked keys.

### Outsourced venue endpoints

- `venue.printers` now represents a temporary event deployment endpoint, not
  organization-owned inventory.
- Every endpoint is required to carry `organization_id` and `event_id`.
- Optional `vendor_id`, `room_id`, external reference, deployment window, and
  retirement timestamp record the outsourced deployment without storing vendor
  hardware inventory.
- Printer registration validates the selected room belongs to the event and any
  vendor is active.
- Badge print/reprint routes require both the badge and endpoint to belong to
  the current event and organization.
- The live RLS canary validates no-context denial, tenant visibility, blocked
  cross-tenant updates, and rejected cross-event endpoint insertion.

## Verification Evidence

- `tests/test_tenant_runtime_boundaries.py`
- `tests/test_files.py`
- `tests/test_phase1_rls_foundation.py`
- 37 focused boundary, file, and RLS tests passed.
- 47 related tenant, security, speaker, portal, campaign, and queue tests passed;
  2 environment-dependent tests skipped.
- 14 Venue Server tests passed.
- 12 dedicated-worker tenant/file tests passed.
- 18 dedicated-worker report, tenant, and file tests passed after report scope
  enforcement.
- 21 search, report, tenant-session, and file worker tests passed after search
  scope enforcement.
- 21 media, search, report, tenant-session, and file worker tests passed after
  media scope enforcement.
- 26 cache, import, analytics, tenant-boundary, and RLS tests passed.
- 41 related file, portal, tenant-isolation, and security tests passed; 2
  environment-dependent tests skipped.
- 32 backend cache, rate-limit, tenant-runtime, RLS, and developer boundary
  tests passed after canonical rate-limit migration.
- 10 worker report and tenant-boundary tests passed after durable export
  enforcement.
- 12 tenant runtime boundary tests passed after scheduled-job closure.
- 34 focused Phase 1 backend tests passed after scheduled-job closure.
- The RLS canary includes `venue.printers` and passed against `Event_runtime`.
- The RLS canary includes export visibility, cross-tenant export update, and
  cross-tenant export insert checks.
- Alembic current/head is `phase1_exports_0550`.
- Phase 1 exit evidence is recorded in `governance/phase1/PHASE1_EXIT_EVIDENCE.md`.
- Python compilation passed for all touched backend and Venue Server modules.

## Phase 1 Runtime Status

- No active Phase 1 blocker remains for currently enabled backend runtime paths.
- Runtime event licensing, tenant context, RLS canary coverage, cache isolation,
  storage boundaries, export boundaries, venue credential checks, and scheduled
  job boundaries are closed for the enabled backend paths.
- Dormant or future paths must not be enabled without satisfying the guardrails
  below.

## Deferred/Future Guardrails

- Dormant workflow/platform scheduled jobs no longer run as global beat jobs.
  Tenant-owned background jobs now require explicit `organization_id_str` or
  fail closed through `TenantJobScopeRequired`.
- Celery beat schedules only the tenant-aware API usage flusher. Workflow,
  notification, builder, operations, commercial, inventory, and marketplace
  jobs require explicit tenant dispatch or a future control-plane contract
  before production scheduling.
- Report, search, thumbnail, preview, poster, video, presentation-validation,
  cache, storage, export, venue credential, and scheduled-job boundaries are
  complete for the currently enabled Phase 1 runtime paths.
- Future bucket/download producers must go through the shared storage helper or
  document an equivalent tenant-namespace authorization check before exposure.
