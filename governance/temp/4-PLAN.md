# Event OS Enterprise Target-State Architecture and Production Standards Plan

## Document Control

```text
Status: ARCHITECTURE BASELINE v1.0

Major architecture changes:
Require an approved ADR.

Roadmap changes:
Allowed through phase review.

Activation triggers:
Reviewed at every phase boundary.

Architecture invariant changes:
Require security and architecture review.
```

This document separates immediate security closure, secure production foundations, operational maturity, customer-triggered enterprise capabilities, and future hyperscale architecture.

Event OS scales from measured demand, observed bottlenecks, and contractual requirements. Target-state technologies are not automatic implementation requirements.

Responsible roles:

- **Engineering Owner:** solo developer or technical lead.
- **Product and Risk Owner:** founder or accountable business owner.
- **Security Assessor:** independent security specialist.
- **Privacy and Legal Owner:** accountable owner supported by counsel.
- **Accessibility Assessor:** trained or independent reviewer.
- **Cloud Operations Owner:** Engineering Owner until a dedicated role exists.

# Layer 1: Current-State Baseline

## Current-State Baseline and Known Blocking Findings

| Area | Current state |
|---|---|
| Hosting | Local/manual Docker Compose and development scripts; no complete production topology |
| Traffic and concurrency | **Requires Baseline Measurement** |
| Cloud applications | Command center, organiser, registration, and speaker portals at varying maturity |
| Venue applications | Venue Server and device applications at mixed maturity and outside initial cloud certification scope |
| Backend | Large FastAPI modular monolith with inconsistent authorization and service boundaries |
| Workers | Celery processing exists; ownership, durability, idempotency, and retry consistency require validation |
| Database | PostgreSQL, SQLAlchemy, and extensive Alembic history requiring complete execution validation |
| Authentication | JWT, rotating refresh tokens, API keys, portal tokens, developer tokens, and device credentials |
| MFA | Schema/design exists; privileged enforcement is incomplete |
| Tenant isolation | Application filtering and tenant context exist; complete RLS enforcement is unproven |
| Real-time interfaces | Authentication and room/command authorization gaps exist |
| Observability | Logs and audits exist; production SLOs, tracing, metrics, and centralized alerts are incomplete |
| Deployment | Manual builds/scripts; no verified Terraform, CI/CD, image signing, canary, or rollback |
| Accessibility | No complete WCAG 2.2 AA baseline |
| Compliance | Compliance-oriented models/documents exist; no proven operating assurance program |

## Phase 0A: Emergency Risk Closure

- Rotate historically exposed or potentially exposed secrets.
- Revoke historical credentials and prove they no longer authenticate or decrypt active protected data.
- Authenticate every WebSocket and Socket.IO connection.
- Authorize every event/room join and real-time command.
- Require MFA for privileged-account login.
- Require recent step-up authentication for high-risk operations.
- Remove runtime `ALTER TABLE` and startup DDL.
- Remove sensitive debug output.
- Disable unsafe privileged or real-time functionality until controls pass.

High-risk operations requiring step-up include:

- Impersonation.
- Secret rotation.
- Tenant override.
- Bulk personal-data export.
- RLS support access.
- Billing override.
- Entitlement grant issuance.
- Emergency `LIVE` event mutation.
- Security-policy or privileged-role changes.

Normal privileged actions within a valid MFA-assured session do not require a new MFA challenge unless risk policy or session age requires it.

## Phase 0B: Baseline Stabilization

- Repair and validate the Alembic graph.
- Consolidate authentication and authorization behavior.
- Remove unverified tenant-header trust.
- Replace silent exception swallowing and unsafe fallbacks.
- Consolidate duplicate middleware and process-local shared state.
- Establish reproducible backend, worker, database, Redis, and frontend tests.
- Produce route, schema, job, secret, provider, storage, and user-journey inventories.
- Produce a system dependency map.
- Measure traffic, concurrency, uploads, WebSockets, queue depth, provider volume, and database behavior.

Example dependency-map entries:

```text
Registration
├── Identity
├── Event lifecycle
├── Ticket capacity
├── Payment ledger/provider
├── Consent
├── Communication outbox
└── Audit

LIVE venue operation
├── Event lifecycle
├── Venue identity
├── Synchronization state
├── Presentation readiness
├── Real-time infrastructure
└── Audit
```

## Phase 0C: Security Validation

- Produce a repository-specific threat model.
- Run SAST, SCA, secret, container, API/DAST, and tenant-escape testing.
- Validate authentication, authorization, files, webhooks, payments, real-time paths, and service identities.
- Assign finding owners and remediation SLAs.
- Remediate and retest all Critical and High findings.
- Preserve evidence for false-positive and accepted-risk decisions.

## Phase 0 Blocking Register

| ID | Blocker |
|---|---|
| `P0-SEC-01` | Historical secret exposure and credential revocation |
| `P0-SEC-02` | WebSocket and Socket.IO authentication/authorization |
| `P0-SEC-03` | Privileged MFA and high-risk step-up enforcement |
| `P0-DB-01` | Runtime schema mutation |
| `P0-DB-02` | Unproven Alembic graph |
| `P0-AUTH-01` | Duplicated authentication and authorization |
| `P0-TENANT-01` | Unverified client tenant-header trust |
| `P0-TENANT-02` | RLS documentation and implementation mismatch |
| `P0-OPS-01` | Silent failures and unsafe production fallbacks |
| `P0-OPS-02` | Duplicate middleware and process-local shared state |
| `P0-LOG-01` | Sensitive debug output |
| `P0-SCAN-01` | Missing formal threat model and security assessment |

## Baseline Deliverables

- Route and authorization inventory.
- Database ownership and RLS inventory.
- Migration validation report.
- Secret and key register.
- Background-job and side-effect inventory.
- Provider and processor inventory.
- Workload baseline.
- Critical user-journey inventory.
- Mobile and venue scope register.
- System dependency map.
- Security finding register.
- Reproducible CI environment.

# Layer 2: Enterprise Target-State Architecture

## Architecture Principles

- Organization is the root tenant and commercial owner.
- Event licensing is activation-driven and snapshot-first.
- Shared databases use mandatory PostgreSQL RLS.
- Tenant context is verified and transaction-local.
- Authorization is deterministic, centralized, and auditable.
- Synchronous business invariants have one transaction owner.
- External side effects use durable workflows.
- Infrastructure complexity is introduced only when justified.

## Non-Negotiable Architecture Invariants

| Invariant | Enforcement |
|---|---|
| No runtime DDL | Startup test and code scan |
| No tenant query without verified context | TenantContextGuard and integration tests |
| No persistent pooled-connection tenant state | Transaction-local context and reuse tests |
| Runtime DB role cannot bypass RLS | Database-role tests |
| No unverified tenant identity header | Authentication-context tests |
| No cross-tenant cache key | Tenant-aware cache wrapper |
| Redis is not authorization or licensing truth | Cache-loss tests |
| Event access comes from activation snapshot | Resolver tests |
| No latest-subscription entitlement fallback | Static and regression tests |
| Venue systems never access cloud DB directly | Network policy |
| Cardholder data never enters Event OS | Payment and telemetry tests |
| Unverified webhook cannot mutate domain state | Webhook tests |
| Quarantined files cannot be consumed | File-state constraints |
| Secrets and raw tokens never enter telemetry | Redaction tests |
| Privileged actions are attributable | Identity, reason, audit, and session assurance |
| Tenant-owned data has an authoritative owner | Schema inventory |
| Cross-module side effects do not extend synchronous transactions | Service and outbox tests |
| Database time governs transactional ordering | Persistence and ordering tests |

## Source-of-Truth Matrix

| Concern | Authoritative source |
|---|---|
| Organization identity | Organization record |
| Organization membership | Organization membership tables |
| Event workspace access | Event assignments/access nodes |
| Authentication state | Identity and session/token ledger |
| Authorization | Permission and assignment models through authorization service |
| Commercial purchase | Organization subscription |
| Commercial right | Entitlement grant |
| Grant consumption | Grant consumption ledger |
| Event licensing | Event activation |
| Runtime feature access | Current entitlement snapshot |
| Runtime numeric limit | Current limit snapshot |
| Usage | UsageService metric provider |
| Event lifecycle | Lifecycle state, operational status, and transition history |
| Payment state | Internal payment ledger plus verified provider events |
| Communication consent | Consent ledger |
| Communication suppression | Suppression ledger/policy |
| Webhook receipt | Immutable provider webhook record |
| File safety | File processing state |
| File operational readiness | File validation/readiness state |
| Job state | Durable job execution record |
| Audit history | Immutable audit/security store |
| Tenant routing | Global tenant directory when introduced |
| Search and analytics | Derived indexes and projections |

## Logical Data Responsibility Planes

| Plane | Responsibilities |
|---|---|
| Control Plane | Organizations, subscriptions, grants, administration, routing, billing, and compliance configuration |
| Event Plane | Events, registrations, speakers, sessions, rooms, schedules, assignments, badges, and certificates |
| Operational Plane | Jobs, communications, webhooks, files, integrations, imports, exports, and metering |
| Audit and Security Plane | Audit events, security events, privileged access, impersonation, and evidence |

These are logical ownership boundaries and do not require immediate physical separation.

## Authorization Decision Pipeline

```text
Request
  → Identity authentication
  → Tenant resolution
  → TenantContextGuard
  → Organization membership
  → Event assignment where applicable
  → RBAC permission
  → Activation status
  → Feature entitlement
  → Usage limit
  → Resource ownership
  → Lifecycle/operational state
  → Business operation
  → Audit event
```

### Authorization Denial Model

Stable internal reasons:

```text
AUTH_REQUIRED
TENANT_CONTEXT_REQUIRED
MEMBERSHIP_REQUIRED
EVENT_ASSIGNMENT_REQUIRED
PERMISSION_DENIED
EVENT_NOT_ACTIVATED
FEATURE_NOT_ENTITLED
LIMIT_EXCEEDED
RESOURCE_NOT_OWNED
INVALID_LIFECYCLE_STATE
STEP_UP_REQUIRED
```

External responses must not reveal cross-tenant resource existence.

Example:

```text
Internal: RESOURCE_NOT_OWNED
External: 404 NOT_FOUND
```

Internal denial details may appear only in protected audit or administrative tooling.

## Event Lifecycle

Primary lifecycle:

```text
DRAFT
→ CONFIGURING
→ REGISTRATION_OPEN
→ REGISTRATION_CLOSED
→ READY_FOR_VENUE
→ LIVE
→ COMPLETED
→ ARCHIVED
```

Independent operational status:

```text
ACTIVE
SUSPENDED
POSTPONED
CANCELLED
```

Operational status modifies permitted behavior without forcing an invalid lifecycle transition.

| Operational status | Behavior |
|---|---|
| `ACTIVE` | Normal lifecycle behavior |
| `SUSPENDED` | New growth/mutations restricted according to continuity policy |
| `POSTPONED` | Public dates and dependent workflows paused; rescheduling workflow required |
| `CANCELLED` | New operational activity blocked; refund, communication, retention, and closure workflows remain available |

Lifecycle and operational status govern registration, subscription transfer, schedule changes, room assignment, file locking, venue synchronization, notifications, certificates, and retention.

## TenantContextGuard and RLS

Every tenant transaction must:

1. Authenticate an identity.
2. derive tenant scope from verified authorization data.
3. begin a transaction.
4. establish context using transaction-local `SET LOCAL`.
5. execute tenant queries only afterward.
6. clear context at transaction end.
7. fail closed when context is absent.

Runtime roles cannot have `BYPASSRLS`. Migration, runtime, support, audit-export, and operational roles remain separate.

Connection-reuse tests cover commit, rollback, exception, cancellation, and worker reuse.

RLS rollout:

1. Ownership inventory.
2. `organization_id` completeness.
3. Tenant-aware indexes.
4. TenantContextGuard.
5. Alembic-managed policies.
6. Shadow verification.
7. Cross-tenant attack tests.
8. Canary enforcement.
9. General enforcement.
10. Forced RLS.

AWS migration and RLS enforcement remain separate workstreams.

## Cache Isolation

```text
tenant:{organization_id}:...
tenant:{organization_id}:event:{event_id}:...
tenant:{organization_id}:user:{user_id}:permissions
tenant:{organization_id}:event:{event_id}:entitlements:{snapshot_version}
```

- No globally keyed tenant resource cache.
- Authorization caches have bounded TTL.
- Membership changes invalidate permission caches.
- Snapshot changes invalidate entitlement caches.
- Cache loss or corruption cannot grant access.
- Redis is never authoritative for authorization, licensing, payment, consent, or file safety.

## Event Subscription Architecture

The finalized subscription v4 architecture remains fixed:

```text
Organization
→ Organization Subscription
→ Entitlement Grant
→ Grant Consumption Ledger
→ Event Activation
→ Versioned Snapshot Set
→ EntitlementResolver
→ UsageService
→ LimitGuard
→ FeatureGate
```

Latest-subscription lookup, subscription union, and pooled event entitlement are prohibited.

## Transaction Boundary Ownership

One domain service owns the transaction for each synchronous business invariant.

Example:

```text
Registration transaction owner
├── registration state
├── participant state
├── capacity consumption
├── internal payment-ledger transition where applicable
├── audit/outbox insertion
└── commit
```

External payment calls, email, analytics, certificate work, and other side effects execute after commit through outbox or durable workflows.

Cross-module services must not create long synchronous call chains spanning unrelated side effects.

## Idempotency Scope

Default operation scope:

```text
organization_id
+ operation_type
+ idempotency_key
```

Event operation scope:

```text
organization_id
+ event_id
+ operation_type
+ idempotency_key
```

Requirements:

- Store a canonical request fingerprint.
- Same key and same fingerprint returns the prior response/result reference.
- Same key with different fingerprint returns `IDEMPOTENCY_CONFLICT`.
- In-progress retry returns current operation status.
- Retryable failure may resume according to operation policy.
- Terminal failure replay returns the stored failure unless explicit restart is allowed.
- Retention is based on business risk and provider replay windows.
- Payment and commercial-operation records retain idempotency evidence for the applicable financial/audit retention period.
- Registration, activation, campaign, certificate, badge, import, and venue-sync operations use explicit scopes.

## Cloud and Venue Trust Boundary

Venue systems never access cloud databases or receive RLS bypass. Machine identities carry organization, event, site/device, permission, expiry, key version, and rotation metadata.

Cloud API validates identity and assignment, establishes TenantContextGuard, applies authorization, and records idempotent synchronization and audit history.

## File Lifecycle

```text
UPLOADING
→ UPLOADED
→ QUARANTINED
→ SCANNING
→ CLEAN
→ PROCESSING
→ READY
```

Failure states:

```text
UPLOAD_FAILED
INFECTED
SCAN_FAILED
PROCESSING_FAILED
```

Only `READY` files may enter operational workflows.

Presentation session readiness requires:

```text
READY
+ DEPENDENCY_VALIDATED
+ MEDIA_VALIDATED
+ APPROVED
+ SYNCED_TO_VENUE
= SESSION_READY
```

## Webhook Architecture

```text
Receive
→ Verify signature
→ Validate timestamp/replay window
→ Persist raw classified event
→ Deduplicate provider event ID
→ Acknowledge
→ Process asynchronously
→ Update domain state
→ Audit and reconcile
```

Every provider defines signature rotation, replay window, event uniqueness, tenant resolution, retention, idempotency, retry, dead-letter, ordering, reconciliation, and alerting.

## Clock and Ordering Standard

- Database time is authoritative for transactional ordering.
- All persisted timestamps use UTC.
- Event/user timezone controls display and schedule interpretation.
- Provider timestamps are evidence, not authoritative processing order.
- Client timestamps are informational unless a domain rule explicitly requires them.
- Strictly ordered workflows use sequence numbers, aggregate versions, or provider event versions.
- Audit records preserve received time, provider/client claimed time, and processing time where relevant.
- Clock skew must not bypass token expiry, replay windows, event transitions, or payment reconciliation.

## Workload and Scale Model

Independent profiles cover organizer administration, public browsing, registration launch, event-morning check-in, speaker uploads, live WebSockets, campaigns, certificates, badges, and exports.

Each records concurrency, request mix, payload, WebSockets, uploads, queue depth, provider calls, burst duration, and latency.

The long-term target remains one million MAU and 100,000 concurrent users. Testing advances through measured stages.

## Recovery and Degradation

| Class | Data/services | Target |
|---|---|---|
| `RC1` | Identity, registrations, billing activation, entitlements, event configuration, critical audit | 99.95%; RPO ≤5m; RTO ≤30m |
| `RC2` | Jobs, communications, webhooks, file metadata, sync, usage | RPO ≤15m; RTO ≤2h |
| `RC3` | Search, analytics, reports, thumbnails | Rebuildable |
| `RC4` | Caches and temporary data | Recreated safely |

Provider degradation follows delayed/reconcilable states. Malware-scan failure keeps files quarantined. WebSocket failure uses polling fallback. Analytics never blocks core event operations.

## Data Deletion Precedence

```text
Legal Hold
  overrides
Deletion Schedule

Verified Legal/Regulatory Retention
  overrides
Normal Retention Policy

Approved Deletion Request
  triggers
Controlled Deletion Workflow
```

Deletion propagates to primary data, derived data, search indexes, caches, controllable exports, and provider systems where contractually supported.

Supported actions are distinct:

- Delete.
- Anonymize.
- Pseudonymize.
- Restrict processing.
- Archive.

Every workflow records scope, authority, evidence, affected systems, exceptions, completion, and verification.

## Data Classification, Communications, Mobile, Compliance, and FinOps

Data classes remain Public, Internal, Confidential, Restricted Personal, Payment, Security/Audit, and Compliance Evidence.

Unified channel governance covers email, SMS, WhatsApp, and push through consent and suppression ledgers.

Initial cloud scope includes browser portals. Native/mobile/device applications require a later Mobile Security and Distribution Program.

DPDP/GDPR are legal programs, PCI SAQ-A is payment scope, and ISO 27001/SOC 2 are assurance programs selected through customer/RFP evidence.

FinOps tracks cost per event, registration, communication volume, storage, processing, WebSocket hour, tenant, DR, and observability.

# Layer 3: Platform Engineering Standards

## Feature Flags and Kill Switches

| Type | Example |
|---|---|
| Release flag | `NEW_CERTIFICATE_WORKER_V2` |
| Experiment flag | `REGISTRATION_LAYOUT_EXPERIMENT` |
| Operational kill switch | `DISABLE_WHATSAPP_DISPATCH` |
| Tenant entitlement | `WHITE_LABEL_ENABLED` |

Entitlements, release flags, experiments, and kill switches remain separate systems and decision domains.

## Schema Ownership

Identity, platform/RBAC, billing, events, registration, speakers, communications, files, jobs, and audit/security modules own their respective schemas.

Other modules mutate owned data only through defined service boundaries or an explicitly documented transaction orchestrator.

## API Standards

- Version public APIs.
- Use RFC 9457-style problem responses.
- Use stable denial/error codes.
- Include request and correlation IDs.
- Use cursor pagination.
- Apply optimistic concurrency where needed.
- Return `202 Accepted` for long-running domain operations.
- Observe jobs through `GET /jobs/{job_id}`.

## Runtime and Database ADR Criteria

ECS Fargate remains the default initial managed-runtime candidate. EKS requires ADR justification.

`ADR-002` must compare RDS PostgreSQL and Aurora PostgreSQL using:

- Expected write load.
- Connection pattern.
- Failover requirements.
- Read-replica needs.
- Operational cost.
- RDS Proxy compatibility.
- Required extensions.
- Migration complexity.
- Measured database size.
- Team operational capacity.

Ordinary managed PostgreSQL remains acceptable when it satisfies measured requirements.

## Security Finding Governance

Critical findings block deployment without a normal exception path. High findings block unless a formally approved, expiring exception and compensating control exist. Medium and Low findings require policy-driven ownership and treatment.

False-positive closure requires reproducible evidence.

## Accessibility, Infrastructure, Observability, and Privacy

- Shared components enforce WCAG 2.2 AA behavior.
- Terraform owns infrastructure.
- Images are scanned, signed, and minimally privileged.
- OpenTelemetry-compatible telemetry is tenant-safe and redacted.
- Every field defines classification, purpose, retention, deletion, transfer, telemetry, and audit behavior.

## ADR Register

| ADR | Decision |
|---|---|
| `ADR-001` | ECS Fargate versus EKS |
| `ADR-002` | RDS PostgreSQL versus Aurora PostgreSQL |
| `ADR-003` | Harden current authentication versus managed identity migration |
| `ADR-004` | Socket.IO/WebSocket topology |
| `ADR-005` | Celery/Redis to SQS transition |
| `ADR-006` | Transaction-local TenantContextGuard |
| `ADR-007` | Private presigned multipart uploads |
| `ADR-008` | Venue machine identity and rotation |
| `ADR-009` | PostgreSQL search and OpenSearch trigger |
| `ADR-010` | Backup-only, pilot-light, or warm-standby DR |
| `ADR-011` | Cache isolation and invalidation |
| `ADR-012` | Webhook ingestion and retention |
| `ADR-013` | Feature flags and kill switches |
| `ADR-014` | Audit event storage and immutability |

`ADR-014` evaluates PostgreSQL append-only controls, immutable object-storage export, retention, verification chains, query needs, privileged access, recovery, cost, and compliance evidence requirements.

# Layer 4: Trigger-Driven Implementation Roadmap

## Phase 0: Security Closure and Reproducible Baseline

Order:

1. Emergency Risk Closure.
2. Baseline Stabilization.
3. Security Validation.

Exit evidence includes secret revocation, real-time authorization, privileged MFA/step-up, clean startup, validated Alembic, canonical authorization, dependency map, reproducible CI, threat model, and governed Critical/High closure.

## Phase 1: SaaS Tenancy and Licensing Foundation

Implement tenant ownership, indexes, TenantContextGuard, RLS stages, role separation, cache isolation, venue/service identities, subscription v4, UsageService, LimitGuard, FeatureGate, audit integrity, telemetry, and backup restoration.

Exit requires cross-tenant tests across HTTP, database connections, caches, workers, WebSockets, exports, storage, and venue synchronization.

## Phase 2: Reliable Production Cloud

Implement AWS landing zone, Terraform, IAM/KMS/secrets, managed PostgreSQL selected through ADR, private storage, cache, managed container runtime selected through ADR, CI/CD, signing, health checks, canary, rollback, monitoring, alerts, incident response, load tests, and cost controls.

## Phase 3: Durable Workflows, Accessibility, and Operational Maturity

Implement transactional outbox where required, SQS/DLQ where triggered, worker separation, webhook standard, file lifecycle, dependency degradation, recovery tests, accessibility assessment, privacy workflows, communication governance, and evidence automation.

## Phase 4: Enterprise Capabilities

Activated by customer, procurement, regulatory, or contractual requirements:

- SAML/OIDC.
- SCIM.
- Passkeys.
- Dedicated databases/KMS.
- Advanced audit export.
- Contractual SLAs.
- Enhanced DR.
- Selected ISO 27001 or SOC 2 program.

## Phase 5: Hyperscale Architecture

Activated only by measured scale or isolation requirements:

- Cell routing.
- Multi-cell deployments.
- Selective partitioning.
- OpenSearch.
- EKS migration.
- Advanced WebSocket scaling.
- Regional traffic management.
- Read routing.
- 1M MAU and 100k concurrency validation.

## Do Not Build Yet Unless Triggered

- Full cell control plane.
- OpenSearch cluster.
- EKS platform.
- SCIM.
- Automated dedicated-database fleet.
- Warm cross-region DR.
- Global traffic routing.
- 100k WebSocket platform.
- Multi-region writes.
- Universal microservice decomposition.
- Universal table partitioning.
- Simultaneous ISO 27001 and SOC 2 programs.

## Parallel Venue Reliability Program

Continue presentation validation, malware scanning, priority synchronization, readiness gating, standby systems, emergency controls, timing alerts, monitoring, machine identities, and tenant-safe synchronization independently from cloud certification timing.

## Governance

At every phase boundary:

- Review workloads, incidents, customers, security, accessibility, privacy, and costs.
- Re-evaluate activation triggers.
- Approve justified capabilities through ADRs.
- Update invariants, source-of-truth matrix, dependency map, threat model, recovery classes, and data inventory.
- Preserve tenant isolation and snapshot-first licensing.
- Do not implement target-state capabilities solely because they appear in this baseline.
