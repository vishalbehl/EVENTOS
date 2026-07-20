# EventX OS Enterprise Target-State Architecture and Production Standards Plan

## Document Status

This is the architecture freeze candidate for EventX OS. It preserves the long-term enterprise direction while separating immediate security work, secure production foundations, operational maturity, customer-triggered enterprise capabilities, and future hyperscale architecture.

EventX OS will scale from measured demand, observed bottlenecks, and contractual requirements. Target-state technologies are not automatic implementation requirements.

Responsible roles:

- **Engineering Owner:** solo developer or technical lead.
- **Product and Risk Owner:** founder or accountable business owner.
- **Security Assessor:** independent security specialist.
- **Privacy and Legal Owner:** accountable owner supported by legal counsel.
- **Accessibility Assessor:** trained or independent accessibility reviewer.
- **Cloud Operations Owner:** Engineering Owner until a dedicated role exists.

# Layer 1: Current-State Baseline

## Current-State Baseline and Known Blocking Findings

| Area | Current state |
|---|---|
| Hosting | Local/manual Docker Compose and development scripts. Production Compose is not a complete production topology. |
| Traffic and concurrency | **Requires Baseline Measurement.** |
| Cloud applications | Command center, organiser portal, registration portal, and speaker portal exist at varying production maturity. |
| Venue applications | Venue Server and several venue/device applications exist at mixed maturity and remain outside the initial cloud certification scope. |
| Backend | Large FastAPI modular monolith with broad domain coverage and inconsistent authorization/service boundaries. |
| Workers | Celery processing exists, but task ownership, idempotency, queue durability, retry policy, and tenant fairness are inconsistent. |
| Database | PostgreSQL, SQLAlchemy, and a large Alembic history. Recent migrations require end-to-end validation. |
| Authentication | Custom JWT, rotating refresh tokens, API keys, portal tokens, developer tokens, and device credentials. |
| MFA | Schema/design exists, but privileged enforcement is incomplete. |
| Tenant isolation | Application filtering and tenant context exist. Complete database-enforced RLS has not been proven. |
| Real-time interfaces | WebSocket and Socket.IO connection, room, and command authorization gaps exist. |
| Observability | Logs and audit records exist; distributed tracing, production SLOs, metrics, and centralized alerting are incomplete. |
| Deployment | Manual builds and scripts; no verified production CI/CD, Terraform, image signing, or controlled rollback. |
| Accessibility | No complete WCAG 2.2 AA baseline or automated/manual release gate. |
| Compliance | Compliance-oriented models and documents exist, but no operating assurance or legal-evidence program is proven. |

## Phase 0A: Emergency Risk Closure

Complete first, without waiting for broader architectural cleanup:

- Rotate all historically exposed or potentially exposed JWT, encryption, database, internal-service, provider, and application secrets.
- Revoke historical credentials and prove they no longer authenticate or decrypt active protected data.
- Authenticate every WebSocket and Socket.IO connection.
- Authorize every event/room join and real-time command.
- Enforce MFA and step-up authentication for privileged accounts and sensitive actions.
- Remove runtime `ALTER TABLE` and startup DDL.
- Remove debug and sensitive identity, tenant, token, and database output.
- Disable unsafe real-time or privileged functionality until its controls pass.

## Phase 0B: Baseline Stabilization

- Repair and validate the complete Alembic graph.
- Consolidate duplicated authentication and authorization behavior.
- Remove unverified tenant-header trust.
- Replace silent exception swallowing with explicit degraded states, logging, metrics, and alerts.
- Consolidate duplicate middleware and process-local security state.
- Establish reproducible backend, worker, PostgreSQL, Redis, and frontend test environments.
- Produce route, model, migration, job, secret, provider, storage, and critical-journey inventories.
- Measure traffic, concurrency, uploads, WebSockets, queue depth, provider volume, and database behavior.

## Phase 0C: Security Validation

- Create a repository-specific threat model.
- Run SAST, SCA, secret scanning, container scanning, API/DAST testing, and tenant-escape testing.
- Validate authentication, authorization, file handling, webhooks, payments, real-time interfaces, and service identities.
- Assign owners and remediation SLAs.
- Remediate and retest all Critical and High findings.
- Preserve evidence for every false-positive or accepted-risk decision.

## Phase 0 Blocking Register

| ID | Blocker |
|---|---|
| `P0-SEC-01` | Historical secret exposure and credential revocation |
| `P0-SEC-02` | WebSocket and Socket.IO authentication/authorization |
| `P0-SEC-03` | Privileged MFA enforcement |
| `P0-DB-01` | Runtime schema mutation |
| `P0-DB-02` | Unproven Alembic graph |
| `P0-AUTH-01` | Duplicated authentication and authorization logic |
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
- Security finding register.
- Reproducible CI test environment.

# Layer 2: Enterprise Target-State Architecture

## Architecture Principles

- Organization is the root commercial and tenant owner.
- Event licensing is activation-driven and snapshot-first.
- Shared tenant databases use mandatory PostgreSQL RLS.
- Tenant context is verified and transaction-local.
- Authorization decisions are deterministic, centralized, and auditable.
- Durable workflows are idempotent and reconcilable.
- Privacy, accessibility, security, and auditability are design inputs.
- Logical ownership does not require immediate physical service separation.
- Infrastructure complexity is introduced only when evidence justifies it.

## Non-Negotiable Architecture Invariants

| Invariant | Enforcement |
|---|---|
| No runtime DDL | Migration review, startup test, and code scan |
| No tenant query without verified context | TenantContextGuard and integration tests |
| No persistent pooled-connection tenant state | Transaction-local context and connection-reuse tests |
| Runtime DB roles cannot bypass RLS | Migration and database-role tests |
| No trusted client-provided tenant identity | Authentication-context tests |
| No cross-tenant cache key | Tenant-aware cache wrapper and tests |
| Redis is not authorization or licensing truth | Cache-loss tests and service boundaries |
| Event access comes from activation snapshot | Resolver and regression tests |
| No latest-subscription or pooled entitlement fallback | Static search and resolver tests |
| Venue systems never access cloud DB directly | Network architecture and infrastructure policy |
| Machine identities carry explicit tenant/event scope | Service-identity validation tests |
| Cardholder data never enters EventX OS | Payment architecture and telemetry tests |
| Unverified webhooks cannot change domain state | Signature/replay/idempotency tests |
| Quarantined files cannot be consumed | File-state constraints and service tests |
| Only `READY` files enter operational workflows | File lifecycle guard |
| Secrets and raw tokens never enter telemetry | Redaction tests and telemetry policy |
| Every privileged action is attributable | MFA, reason capture, audit, and session identity |
| Tenant-owned data has an authoritative owner | Schema inventory and migration checks |

## Source-of-Truth Matrix

| Concern | Authoritative source |
|---|---|
| Organization identity | Organization record |
| Organization membership | Organization membership tables |
| Event workspace access | Event assignment/access-node tables |
| User authentication state | Identity records and session/refresh-token ledger |
| RBAC authorization | Permission and assignment models through authorization service |
| Commercial purchase | Organization subscription |
| Commercial right | Entitlement grant |
| Grant availability and consumption | Grant consumption ledger |
| Event licensing | Event activation |
| Runtime feature access | Current entitlement snapshot set |
| Runtime numeric limit | Current limit snapshot |
| Usage | UsageService provider for the metric |
| Event lifecycle | Event lifecycle state and transition history |
| Payment state | Internal payment ledger plus verified provider events |
| Communication consent | Communication consent ledger |
| Communication suppression | Suppression ledger/policy |
| Webhook receipt | Immutable provider webhook event record |
| File safety | File processing state |
| File operational readiness | File readiness and validation state |
| Job state | Durable job execution record |
| Audit history | Immutable audit/security event store |
| Tenant routing | Global tenant directory when introduced |
| Search and analytics | Derived indexes/projections, never transactional truth |

## Logical Data Responsibility Planes

| Plane | Responsibilities |
|---|---|
| Control Plane | Organizations, subscriptions, grants, routing, platform administration, billing configuration, and compliance configuration |
| Event Plane | Events, registrations, speakers, sessions, rooms, schedules, assignments, badges, and certificates |
| Operational Plane | Jobs, commands, usage, communications, webhooks, file processing, integrations, imports, exports, and metering |
| Audit and Security Plane | Audit events, security events, privileged access, impersonation, evidence, and access reviews |

These are logical ownership boundaries and do not require separate databases immediately.

## Authorization Decision Pipeline

```text
Request
  → Identity authentication
  → Tenant resolution
  → TenantContextGuard
  → Organization membership
  → Event assignment, where applicable
  → RBAC permission
  → Activation status, for licensed event operations
  → Feature entitlement
  → Usage limit
  → Resource ownership and lifecycle state
  → Business operation
  → Audit event
```

Endpoint policies may omit irrelevant stages but must not reorder or bypass required stages.

Examples:

- Public event page: public policy → event publication state → resource access.
- Create speaker: identity → tenant → membership → event assignment → permission → activation → feature → speaker limit → event lifecycle → mutation → audit.
- Venue synchronization: machine identity → tenant → event/site/device assignment → permission → TenantContextGuard → sequence/idempotency → mutation → audit.
- Platform administration: privileged identity → MFA/step-up → platform permission → explicit target tenant → reason/expiry → operation → audit.

## Event Lifecycle

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

Emergency or corrective transitions require explicit privileged workflows and audit records.

| State | Primary rules |
|---|---|
| `DRAFT` | Basic event metadata may exist without paid workspace activation. No public registration or venue operation. |
| `CONFIGURING` | Active event license required for paid configuration. Draft content remains mutable. |
| `REGISTRATION_OPEN` | Registration rules, ticket capacity, payments, consent, and communications are active. Transfer hard-lock rules apply after meaningful usage. |
| `REGISTRATION_CLOSED` | New public registrations blocked except authorized override. Operational preparation continues. |
| `READY_FOR_VENUE` | Required schedule, room, presentation, device, and synchronization readiness gates must pass. |
| `LIVE` | Safety-critical mutations restricted. Emergency changes require elevated permission, reason, validation, and real-time audit. |
| `COMPLETED` | Live mutations stop. Attendance reconciliation, certificates, reports, and approved post-event communication remain allowed. |
| `ARCHIVED` | Data becomes read-mostly and follows retention, export, legal-hold, and deletion policies. |

Lifecycle state governs registration, subscription transfer, schedule mutation, room assignment, file locking, venue sync, communications, certificates, retention, and archival.

## Multi-Tenant Architecture

### TenantContextGuard

Every tenant transaction must:

1. Authenticate a user, service, or device.
2. derive tenant scope from verified identity and authorization.
3. begin a transaction.
4. set tenant context using transaction-local `SET LOCAL` semantics.
5. execute tenant queries only after context is established.
6. clear context automatically at transaction end.
7. fail closed if tenant context is missing.

Runtime roles cannot have `BYPASSRLS`. Migration, runtime, support, audit-export, and operational roles remain separate.

Connection-reuse tests must prove that a connection used for Organization A cannot expose Organization A context or data when reused for Organization B, including after commit, rollback, exception, cancellation, and worker reuse.

### Staged RLS Rollout

1. Tenant ownership inventory.
2. `organization_id` and ownership completeness.
3. Tenant-aware indexes.
4. TenantContextGuard.
5. Alembic-managed RLS policies.
6. Shadow/report-only verification.
7. Cross-tenant attack testing.
8. Canary enforcement.
9. General enforcement.
10. `FORCE ROW LEVEL SECURITY`.

RLS may be completed before AWS migration. The same migration graph and policies must move unchanged to AWS.

### Future Tenant Routing

A future global tenant directory may route organizations to shared cells or dedicated databases without changing domain APIs. Initial work must preserve compatible identifiers, repositories, migrations, storage namespaces, and licensing contracts but must not build full cell routing.

## Cache Isolation Model

Required key patterns:

```text
tenant:{organization_id}:...
tenant:{organization_id}:event:{event_id}:...
tenant:{organization_id}:user:{user_id}:permissions
tenant:{organization_id}:event:{event_id}:entitlements:{snapshot_version}
```

Rules:

- No globally keyed tenant resource cache.
- Every tenant cache API requires tenant scope explicitly.
- Event resources require both tenant and event namespace.
- Authorization caches have bounded TTL.
- Membership and permission changes invalidate authorization caches.
- Snapshot changes invalidate entitlement caches.
- Event lifecycle changes invalidate lifecycle-sensitive caches.
- Cache misses fall back safely to authoritative storage.
- Redis is never the source of truth for authorization, licensing, consent, payment, or file safety.
- Cache corruption or loss must not grant access.

## Event Subscription Architecture

The finalized subscription v4 architecture remains fixed:

```text
Organization
  → Organization Subscription
  → Entitlement Grant
  → Grant Consumption Ledger
  → Event Activation
  → Versioned Snapshot Set
      → Feature Snapshot Items
      → Limit Snapshot Items
  → EntitlementResolver
  → UsageService
  → LimitGuard
  → FeatureGate
```

Runtime access must not use latest-subscription lookup, subscription union, or pooled organization entitlement. Activation, consumption, snapshots, limits, lifecycle transitions, idempotency, and reservation concurrency remain authoritative and auditable.

## Cloud and Venue Trust Boundary

- Venue Server never connects directly to the cloud database.
- Venue and device credentials never bypass RLS.
- Machine identities carry organization, event, site/device, permission, expiry, key version, and rotation metadata.
- Cloud API validates machine identity and assignment.
- Cloud API establishes normal TenantContextGuard.
- Synchronization uses stable operation IDs, replay protection, sequence metadata, and conflict provenance.
- Credentials are independently revocable.
- Venue-to-cloud tests cover wrong tenant, wrong event, revoked device, replay, expiry, and cross-tenant payloads.

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
UPLOADING → UPLOAD_FAILED
SCANNING → INFECTED
SCANNING → SCAN_FAILED
PROCESSING → PROCESSING_FAILED
```

Rules:

- New uploads enter private quarantine storage.
- Only malware-clean files proceed to processing.
- Only `READY` files are downloadable or usable operationally.
- Failed or infected files remain isolated.
- Overrides require privileged permission, reason, audit, and policy approval; malware-positive files cannot be overridden into operational use.
- File state transitions are idempotent and constrained.

Presentation session readiness requires:

```text
READY
+ DEPENDENCY_VALIDATED
+ MEDIA_VALIDATED
+ APPROVED
+ SYNCED_TO_VENUE
= SESSION_READY
```

## Workload Profiles

Capacity is measured separately for:

- Organizer administration.
- Public event browsing.
- Registration-launch bursts.
- Event-morning check-in.
- Speaker upload deadlines.
- Live conference WebSockets.
- Campaign sends.
- Certificate generation and release.
- Badge generation.
- Exports and reports.

Each profile records concurrency, requests per second, read/write mix, payload size, WebSocket count, upload volume, queue depth, provider calls, burst duration, latency objective, and recovery behavior.

The long-term target remains one million MAU and 100,000 concurrent users. Each capacity stage tests the greater of twice measured p95 peak, the next signed contractual target, or the next approved forecast.

## Durable Asynchronous Architecture

The secured modular monolith and existing workers may deploy before a complete queue redesign.

Transactional outbox, SQS, dead-letter queues, worker separation, deduplication, fairness, and queue-specific scaling are introduced for workflows where database commits and external side effects cannot safely diverge or where measured workload requires independent scaling.

Target pools include communications, imports, files/media, reports/exports, billing, certificates/badges, and maintenance.

## Webhook Architecture

```text
Webhook received
  → Signature verification
  → Timestamp and replay validation
  → Raw event persistence
  → Provider event deduplication
  → 200/202 acknowledgement
  → Asynchronous processing
  → Domain update
  → Audit and reconciliation
```

Every provider integration defines:

- Signature algorithm and secret rotation.
- Replay window.
- Provider event ID uniqueness.
- Tenant resolution rules.
- Raw-payload classification and retention.
- Idempotent processing.
- Retry and dead-letter behavior.
- Ordering assumptions.
- Reconciliation job.
- Audit and failure alerting.

Unverified webhook data cannot mutate payment, identity, delivery, file, or domain state.

## Identity Target State

Immediate work hardens current identity, MFA, refresh-token rotation, revocation, service identities, WebSocket authentication, authorization, and audit.

Future contract-triggered capabilities include OIDC, SAML, SCIM, passkeys, domain discovery, account linking, and managed identity migration.

Any migration requires an approved design for user IDs, passwords, duplicate emails, memberships, account linking, refresh-token invalidation, MFA migration, recovery, break-glass accounts, and audit continuity.

## Recovery Classes

| Class | Data/services | Target-state recovery |
|---|---|---|
| `RC1` | Identity, authorization, registrations, billing activation, entitlement snapshots, event configuration, critical audit | SLO 99.95%, RPO ≤5 minutes, RTO ≤30 minutes |
| `RC2` | Jobs, communications, webhooks, files metadata, sync state, usage ledgers | RPO ≤15 minutes, RTO ≤2 hours |
| `RC3` | Search, analytics, reports, thumbnails, projections | Rebuildable; RPO up to 24 hours |
| `RC4` | Caches and temporary data | No durability guarantee; safe recreation |

## Dependency Degradation Matrix

| Dependency | Degraded behavior |
|---|---|
| Redis | Safe database fallback where practical; loss cannot grant access |
| Email/SMS/WhatsApp | Delayed dispatch state, preserved consent decision, queued retry |
| Payment provider | Pending state, no duplicate charge, later reconciliation |
| Search | Scoped PostgreSQL fallback where practical |
| Analytics | Failure never blocks event operations |
| Malware scanning | Files remain quarantined |
| WebSockets | Polling fallback for critical status |
| Object storage | New uploads block safely; metadata remains consistent |
| DR region | Primary continues; loss of recovery posture alerts immediately |

## Data Classification and Telemetry Governance

Classes:

- Public.
- Internal.
- Confidential.
- Restricted Personal Data.
- Payment Data.
- Security/Audit Data.
- Compliance Evidence.

Each class defines storage region, encryption, backup, retention, transfer, logging, deletion, access, and legal-hold behavior.

Telemetry must not contain secrets, raw tokens, passwords, card data, unrestricted payloads, or unnecessary personal data. Logs, traces, IP addresses, contact information, event metadata, and error tracking remain subject to India residency and privacy controls.

## Communication Consent and Channel Governance

A unified consent ledger covers `EMAIL`, `SMS`, `WHATSAPP`, and `PUSH`.

It records participant, tenant/event scope, channel, purpose, consent or legal basis, source, timestamps, withdrawal, policy version, suppression, and evidence.

Dispatch checks consent, purpose, tenant policy, suppression, provider eligibility, templates, frequency, quiet hours, jurisdiction, and withdrawal.

## Mobile Scope

Initial cloud scope includes browser-based command center, organiser, registration, and speaker portals.

Native attendee, moderator, kiosk, station, and other device applications require a later Mobile Security and Distribution Program covering secure token storage, offline personal data, push privacy, deep links, revocation, local encryption, device compromise, signing, updates, and deletion propagation.

## Compliance Model

- **Legal and regulatory:** DPDP and GDPR where applicable.
- **Payment scope:** hosted/tokenized payment architecture and PCI SAQ-A validation.
- **Assurance:** ISO 27001 or SOC 2 selected from customer/RFP evidence.

ISO 27001 and SOC 2 are not pursued simultaneously unless commercial evidence justifies both. Privacy-by-design work begins early regardless of assurance timing.

## FinOps

Track cost per event, registration, thousand communications, stored GB, presentation, WebSocket connection-hour, tenant, dedicated tenant, DR standby, and observability percentage.

Require cost tags, budgets, anomaly alerts, lifecycle rules, retention economics, right-sizing, and cost ADR review before expensive always-on infrastructure.

# Layer 3: Platform Engineering Standards

## Feature Flags and Kill Switches

| Type | Purpose | Example |
|---|---|---|
| Release flag | Controlled code rollout | `NEW_CERTIFICATE_WORKER_V2` |
| Experiment flag | Time-bounded product experiment | `REGISTRATION_LAYOUT_EXPERIMENT` |
| Operational kill switch | Immediately disable unsafe/degraded behavior | `DISABLE_WHATSAPP_DISPATCH` |
| Tenant entitlement | Commercial access from activation snapshot | `WHITE_LABEL_ENABLED` |

Rules:

- Entitlements never serve as release flags.
- Release flags never grant commercial access.
- Kill switches are auditable and restricted.
- Every release/experiment flag has owner, creation date, expiry, and removal plan.
- RLS, resolver, UsageService, payment, registration, queue, venue sync, and identity migrations use controlled rollout flags.
- Security invariants cannot be permanently disabled by feature flags.

## Schema Ownership

| Module | Owned data |
|---|---|
| Identity | Users, sessions, refresh tokens, MFA, service identities |
| Platform/RBAC | Organizations, memberships, permissions, assignments |
| Billing | Subscriptions, grants, consumptions, activations, snapshots |
| Events | Event configuration and lifecycle |
| Registration | Participants, registrations, tickets, payments domain records |
| Speakers | Speakers, submissions, abstracts, presentation relationships |
| Communications | Consent, suppression, campaigns, delivery |
| Files | Uploads, scanning, processing, readiness |
| Operations/Jobs | Jobs, commands, retries, executions |
| Audit/Security | Audit, security events, privileged access, evidence |

Modules do not directly mutate another module’s tables except through an explicitly owned service boundary or documented transactional orchestration. Cross-module reads use defined query/service interfaces.

## API Standards

- Version externally consumed APIs.
- Use RFC 9457-style problem responses and stable codes.
- Include request and correlation IDs.
- Use cursor pagination for large collections.
- Require idempotency for sensitive mutations.
- Use optimistic concurrency where conflicting edits matter.
- Long-running domain endpoints return `202 Accepted` and a job ID.
- `GET /jobs/{job_id}` provides status, progress, result, cancellation where supported, and failure reason.
- Consistent rate-limit headers are mandatory.

## Runtime, Database, and Search Standards

- ECS Fargate is the default initial managed-runtime candidate.
- EKS requires ADR approval.
- Alembic is the sole schema authority.
- Migrations use expand/migrate/contract.
- Partitioning requires measured evidence.
- PostgreSQL indexed/full-text search is default.
- OpenSearch requires measured latency, scale, or capability evidence.

## Security Finding Governance

| Severity | Treatment |
|---|---|
| Critical | Deployment blocked; no normal exception |
| High | Deployment blocked unless formally approved, time-limited exception with compensating controls |
| Medium | Owned treatment plan and due date |
| Low | Managed policy backlog |

Every finding records owner, SLA, evidence, false-positive review, compensating controls, exception approver/expiry, and retest status.

## Accessibility Standard

Shared components enforce semantic structure, keyboard support, focus behavior, visible focus, labels, announcements, dialog correctness, contrast, reduced motion, non-color communication, target size, reflow, and zoom support.

Automated axe and Playwright checks begin early. Full manual WCAG 2.2 AA critical-journey assessment is a Phase 3 gate.

## Infrastructure, Observability, and Privacy Standards

- Terraform-managed infrastructure.
- Short-lived deployment credentials.
- Signed images and SBOMs.
- Non-root containers and least privilege.
- Canary deployment and tested rollback.
- OpenTelemetry-compatible metrics, traces, and logs.
- Tenant-safe correlation and telemetry redaction.
- Every new data field defines classification, purpose, retention, deletion, transfer, telemetry, and audit behavior.

## ADR Register

| ADR | Decision |
|---|---|
| `ADR-001` | ECS Fargate versus EKS |
| `ADR-002` | RDS PostgreSQL versus Aurora PostgreSQL |
| `ADR-003` | Harden current authentication versus managed identity migration |
| `ADR-004` | Socket.IO/WebSocket topology and shared-state model |
| `ADR-005` | Celery/Redis to SQS worker transition |
| `ADR-006` | Transaction-local TenantContextGuard implementation |
| `ADR-007` | Private presigned multipart upload architecture |
| `ADR-008` | Venue machine identity and credential rotation |
| `ADR-009` | PostgreSQL search baseline and OpenSearch trigger |
| `ADR-010` | Backup-only, pilot-light, or warm-standby DR |
| `ADR-011` | Cache isolation wrapper and invalidation model |
| `ADR-012` | Webhook ingestion and raw-event retention |
| `ADR-013` | Feature-flag provider and kill-switch governance |

Each ADR records context, options, decision, security impact, privacy impact, cost, migration, rollback, trigger for reconsideration, and owner.

# Layer 4: Trigger-Driven Implementation Roadmap

## Phase 0: Security Closure and Reproducible Baseline

Execution order:

1. Phase 0A Emergency Risk Closure.
2. Phase 0B Baseline Stabilization.
3. Phase 0C Security Validation.

Exit evidence:

- Secret revocation register.
- Authenticated real-time tests.
- Privileged MFA tests.
- Clean startup without DDL.
- Alembic clean-install and upgrade reports.
- Canonical authorization design.
- Reproducible CI environment.
- Threat model and governed finding register.
- Zero unresolved Critical findings.
- Zero unresolved High findings without formally approved exception.

Owner: Engineering Owner, with Security Assessor and Product/Risk approval.

Rollback: disable affected privileged, real-time, integration, or mutation paths until closure.

## Phase 1: SaaS Tenancy and Licensing Foundation

Work:

- Ownership metadata and tenant indexes.
- TenantContextGuard.
- RLS shadow, attack, canary, enable, and force stages.
- Database-role separation.
- Cache isolation wrapper and invalidation.
- Venue/service identity tenant scoping.
- Subscription v4 completion.
- Grant consumption, activation, snapshots, UsageService, LimitGuard, and FeatureGate.
- Audit integrity.
- Basic OpenTelemetry.
- Proven backup restoration.

Exit evidence:

- Cross-tenant HTTP, DB, cache, WebSocket, worker, export, storage, and venue-sync tests.
- Connection-reuse isolation tests.
- RLS policy coverage report.
- Deterministic licensing tests.
- Successful restoration report.

Owner: Engineering Owner; Security Assessor validates isolation.

Rollback: revert canary organizations, disable new activation mutations, preserve existing snapshots, and restore prior deployment.

## Phase 2: Reliable Production Cloud

Work:

- AWS landing zone, IAM, KMS, secrets, networking, logs, PostgreSQL, object storage, and cache.
- ECS Fargate/EKS ADR.
- Terraform and CI/CD.
- Image scanning, signing, and health endpoints.
- Canary deployment and rollback.
- Monitoring, alerting, incident runbooks, and cost controls.
- Load testing at measured peak plus safety margin.

Exit evidence:

- Approved ADRs.
- Reproducible infrastructure.
- Canary and rollback rehearsal.
- SLO dashboards and alert tests.
- Load-test report.
- Backup and restore proof.
- Incident exercise.

Owner: Engineering and Cloud Operations Owner.

Rollback: application rollback, infrastructure module rollback, database expand/contract recovery, and traffic restoration.

## Phase 3: Durable Workflows, Accessibility, and Operational Maturity

Work:

- Transactional outbox for critical workflows.
- SQS/DLQ adoption where triggered.
- Worker separation, deduplication, fairness, and reconciliation.
- Webhook standard implementation.
- File lifecycle enforcement.
- Dependency degradation testing.
- Recovery-class testing.
- WCAG 2.2 AA critical-journey remediation.
- Consent, suppression, retention, deletion, breach, and rights workflows.
- Evidence automation.

Exit evidence:

- Retry/redelivery/poison-message tests.
- Webhook replay and reconciliation tests.
- File-state transition tests.
- Provider outage exercises.
- Accessibility assessment.
- Recovery-class exercises.
- Privacy workflow evidence.

Owner: Engineering Owner with Accessibility and Privacy owners.

Rollback: pause queues, disable providers with kill switches, reconcile jobs, and return affected workflows to previous implementation.

## Phase 4: Enterprise Capabilities

Triggered by signed customer, procurement, regulatory, or contractual requirements.

Potential capabilities:

- SAML/OIDC.
- SCIM.
- Passkeys.
- Dedicated databases/KMS.
- Advanced audit export.
- Contractual SLA reporting.
- Enhanced DR.
- Selected ISO 27001 or SOC 2 program.

Each capability requires commercial justification, ADR, threat-model update, migration design, support model, price/cost model, evidence, and rollback.

## Phase 5: Hyperscale Architecture

Triggered by measured scale or isolation requirements.

Potential capabilities:

- Cell control plane.
- Multi-cell deployments.
- Selective table partitioning.
- OpenSearch.
- EKS migration.
- Advanced queue fairness.
- High-scale WebSockets.
- Regional traffic management.
- Read routing.
- 1M MAU and 100k concurrency validation.

Exit requires staged performance evidence, acceptable cost, failure-domain analysis, and proof that simpler architecture is insufficient.

## Architecture Activation Triggers

| Capability | Activation trigger |
|---|---|
| EKS | ECS workload count, scaling diversity, specialized processing, WebSocket behavior, deployment frequency, or Kubernetes expertise justifies migration through ADR |
| OpenSearch | PostgreSQL search fails approved latency/capability targets after tuning |
| Table partitioning | Growth, retention, maintenance, query-plan, or benchmark evidence |
| Cell routing | Noisy-neighbor incidents, database limits, tenant scale, geography, or dedicated contracts |
| Dedicated tenant DB | Contractual, regulatory, performance, or operational isolation |
| SAML/SCIM | Signed enterprise identity requirement |
| Warm DR | Contractual SLA or quantified outage exposure justifies cost |
| Advanced WebSockets | Connection/fan-out/reconnect requirements exceed current topology |
| SQS/outbox | Workflow cannot tolerate lost or duplicate side effects, or measured queues require independent scaling |
| 100k validation | Signed forecast, measured trajectory, or commercial launch requires it |

## Do Not Build Yet Unless Triggered

- Full tenant cell control plane.
- OpenSearch cluster.
- EKS platform.
- SCIM provisioning.
- Automated dedicated-database fleet.
- Warm cross-region DR.
- Global traffic routing.
- 100k WebSocket platform.
- Multi-region write architecture.
- Universal microservice decomposition.
- Universal table partitioning.
- Simultaneous ISO 27001 and SOC 2 programs.

## Parallel Venue Reliability Program

Proceed independently from cloud certification timing:

- Dependency and absolute-path scanning.
- Malware and embedded-media validation.
- Priority/urgency synchronization.
- Session-readiness gating.
- Hot standby Venue Server.
- Shadow room machine.
- Emergency technician controls.
- Timing alerts, monitoring, and runbooks.
- Secure machine identities.
- Tenant-safe cloud synchronization.

Cloud and venue share identity, tenant context, authorization, audit, synchronization, and incident contracts while retaining separate certification scopes.

## Roadmap Governance

At each phase boundary:

- Review workload measurements, incidents, customer requirements, findings, accessibility, privacy, and cost.
- Re-evaluate activation triggers.
- Approve only justified capabilities.
- Record decisions in ADRs.
- Update invariants, source-of-truth matrix, threat model, data inventory, and recovery classes.
- Preserve event licensing, tenant isolation, and API compatibility.
- Do not implement a target-state capability solely because it appears in this document.
