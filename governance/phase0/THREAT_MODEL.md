# Phase 0 Threat Model

Status: REPOSITORY-GROUNDED v0.1, ASSESSOR REVIEW REQUIRED

Snapshot:

- Date: 2026-07-11
- Repository: `D:\DEV\conf-platform`
- Git snapshot: `a9c0657` with dirty working tree
- Evidence source: static repository scan, Phase 1 tenant/runtime tests, Alembic checks, and existing governance docs

## Scope

Assessed system:

- Backend FastAPI modular monolith.
- PostgreSQL database, SQLAlchemy models, RLS policies, and Alembic migrations.
- Redis/cache and Celery workers.
- WebSocket/Socket.IO realtime paths.
- Object storage and local storage capability paths.
- Venue synchronization cloud API boundary.
- Billing, subscription activation, and entitlement enforcement paths.

Out of initial closure scope unless explicitly added:

- Native/mobile app distribution security.
- Outsourced venue hardware internal LAN implementation.
- Hyperscale/multi-region architecture.

## Primary Assets

| Asset | Classification | Why it matters |
|---|---|---|
| Organization tenant data | Restricted/Confidential | Cross-tenant exposure is a critical SaaS failure |
| Event configuration | Confidential | Controls live event behavior |
| Registration and participant data | Restricted Personal Data | Contains personal data |
| Speaker/session/presentation data | Confidential/Restricted | May contain private content |
| Billing activation and entitlement data | Confidential | Controls commercial access |
| Credentials, tokens, device keys | Security Data | Enables account or system takeover |
| Audit records | Security/Audit Data | Required for investigation and compliance |
| Files and generated exports | Confidential/Restricted | May contain personal or proprietary data |

## Trust Boundaries

| Boundary | Trusted side | Untrusted or less-trusted side | Required controls | Current evidence |
|---|---|---|---|---|
| Browser/API | Backend | User browser/client | JWT auth, authorization, tenant derivation | Route inventory seeded; full row review open |
| Public registration | Backend | Anonymous attendee | Event public policy, rate limits, input validation | Requires route-level review |
| WebSocket | Backend realtime service | Browser/device client | JWT/device auth, room authorization | Phase 1 tests recorded |
| Worker queue | Worker runtime | Queue payload | Tenant payload, idempotency, signed/proven producer | Job inventory seeded |
| Storage | Backend helper | Object store/local files | Tenant key prefix, capability expiry | Storage boundary work recorded in Phase 1 evidence |
| Venue sync | Cloud API | Venue server/device | Machine identity, org/event/device scope | Venue credential model recorded; external hardware stays outside cloud DB scope |
| Payment/webhook | Backend webhook handler | Provider internet callback | Signature, replay, idempotency | Provider inventory seeded; webhook scan still required |
| Database | Runtime DB role | Application code | TenantContextGuard, RLS, no BYPASSRLS | Live canary and Alembic evidence recorded |

## Abuse Paths To Validate

| ID | Abuse path | Expected mitigation | Current evidence | Status |
|---|---|---|---|---|
| TM-001 | Org A reads Org B event data | RLS + tenant context + event assignment | Live RLS canary passed; tenant tests passed | Evidence available |
| TM-002 | Org A joins Org B realtime room | Socket auth + room authorization | Realtime/tenant tests recorded in Phase 1 evidence | Evidence available, assessor review open |
| TM-003 | Worker payload omits tenant and resolves object globally | Required organization payload or fail closed | Worker tests passed; job inventory seeded | Evidence available |
| TM-004 | Export URL leaks outside authorization | Durable export + authorized download | Export boundary work recorded in Phase 1 evidence | Evidence available |
| TM-005 | Storage key points to another tenant prefix | Shared storage helper rejects key | Storage authorization validation recorded in Phase 1 evidence | Evidence available |
| TM-006 | Device key reused after revocation/expiry | Device auth rejects revoked/expired keys | Venue credential expiry/rotation/revocation work recorded | Evidence available |
| TM-007 | Client supplies tenant header to switch organization | Server-derived tenant context only | Static scan found no tenant-header trust patterns | Evidence available |
| TM-008 | Webhook replay mutates payment/communication state | Signature, timestamp, dedupe | Provider inventory only | Open |
| TM-009 | Secrets leak into logs/traces/errors | Redaction and telemetry policy | Static scan found print/debug candidates | Open |
| TM-010 | Runtime role bypasses RLS | DB role test and startup gate | Phase 1 live RLS canary with `Event_runtime` passed | Evidence available |

## Priority Threats

| Threat | Risk | Required Phase 0/1 control |
|---|---|---|
| Cross-tenant data escape through HTTP, worker, cache, export, storage, or WebSocket path | Critical | TenantContextGuard, RLS, tenant-aware cache, assignment checks, attack tests |
| Historical secret reuse after exposure | Critical/High | Rotation, revocation, negative-auth/decrypt proof |
| Public or anonymous route exposing tenant data | High | Route-by-route authorization inventory and tests |
| Worker replay or missing tenant scope | High | Idempotency, explicit scope payload, fail-closed jobs |
| Webhook replay or forged provider event | High | Signature verification, replay window, raw event ledger, dedupe |
| File consumed before scan/readiness | High | File state machine and storage authorization |
| Privileged action without MFA/session assurance | High | MFA login, step-up for high-risk operations, audit |

## Residual Risks

Move accepted risks to `RESIDUAL_RISK_REGISTER.md`. Open High/Critical risks must
remain in `SECURITY_FINDING_REGISTER.md` until fixed, retested, or formally
excepted where allowed.
