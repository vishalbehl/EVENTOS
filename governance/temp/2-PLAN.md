# Event OS Enterprise Target-State Architecture and Production Standards Plan

## Purpose

This plan preserves the long-term Event OS architecture while separating immediate production work from capabilities activated by measured scale, customer contracts, regulatory obligations, or demonstrated technical bottlenecks.

Event OS will scale from evidence. It will not pre-build Kubernetes, OpenSearch, multi-cell routing, dedicated databases, advanced identity federation, or hyperscale infrastructure before those capabilities are justified.

Responsible roles used in this plan:

- **Engineering Owner:** current solo developer or technical lead.
- **Product and Risk Owner:** founder or accountable business owner.
- **Security Assessor:** independent security consultant or qualified reviewer.
- **Privacy and Legal Owner:** internal accountable person supported by external counsel.
- **Accessibility Assessor:** independent or trained accessibility reviewer.
- **Cloud Operations Owner:** Engineering Owner initially; dedicated role when team size permits.

# Layer 1: Current-State Baseline

## Current-State Baseline and Known Blocking Findings

### Platform Baseline

| Area | Current state |
|---|---|
| Hosting | Local/manual Docker Compose and development scripts. The production Compose override only adds restart behavior and is not a production topology. |
| Production traffic | **Requires Baseline Measurement.** No verified request, concurrency, WebSocket, upload, queue, or campaign-volume baseline exists. |
| Cloud applications | Command center, organiser portal, registration portal, and speaker portal exist. Their end-to-end production maturity requires journey-by-journey verification. |
| Venue applications | Several venue applications and the Venue Server exist at mixed maturity. They are outside the initial cloud certification scope but remain security-sensitive API consumers. |
| Backend | Large FastAPI modular monolith with broad router and model coverage. Domain boundaries exist but authorization and middleware behavior are inconsistent. |
| Workers | Celery-based background processing exists in both backend and worker areas. Retry and routing support exists, but idempotency, ownership, durability, and operational consistency are incomplete. |
| Database | PostgreSQL with SQLAlchemy and a large Alembic history. Recent billing/subscription migrations require complete execution validation. |
| Runtime schema behavior | Startup code currently performs runtime `ALTER TABLE`, bypassing Alembic ownership. |
| Authentication | Custom HS256 JWT access tokens, opaque rotating refresh tokens, API keys, developer tokens, portal tokens, and device credentials. Access-token lifetime is currently long for privileged use. |
| MFA | MFA-related schema/design exists, but mandatory privileged-account enforcement is not established. |
| Tenant isolation | Application-level organization filtering, request context, and PostgreSQL context-setting exist. Documentation claims RLS, but no complete verified RLS policy migration set has been established. |
| Tenant context | A client-provided `X-Organization-ID` fallback exists and must not be trusted for authorization or tenant selection. |
| Real-time security | Native WebSocket and Socket.IO paths contain unauthenticated or insufficiently authorized connection, room-join, and command behavior. |
| Observability | Application logs, audit data, and selected operational models exist. Distributed tracing, production metrics, SLOs, centralized alerting, and dependency monitoring are not established. |
| Deployment | Manual scripts and container builds. No verified CI/CD pipeline, Terraform foundation, signed-image policy, deployment promotion flow, or automated rollback. |
| Accessibility | Shared UI patterns exist, but no complete WCAG 2.2 AA baseline, automated accessibility gate, or manual critical-journey assessment exists. |
| Security assurance | Selected security tests exist, but no completed repository-wide threat model, formal scan, penetration test, or governed finding register exists. |
| Compliance | Compliance-oriented schemas and documents exist, but no operating ISMS, verified legal data inventory, evidence program, or selected assurance-framework sequence exists. |

### Phase 0 Blocking Findings

Each blocker requires an owner, remediation evidence, retest result, and closure approval.

| ID | Confirmed blocker | Required closure |
|---|---|---|
| `P0-SEC-01` | Historical or potentially exposed application, encryption, JWT, database, provider, and internal-service secrets | Inventory affected secrets, rotate them, revoke old values, inspect logs and history, and prove historical credentials no longer authenticate or decrypt active protected data. |
| `P0-SEC-02` | WebSocket and Socket.IO authentication and authorization gaps | Authenticate every connection, bind an identity to the connection, authorize every event/room join and command, reject stale or revoked credentials, and add cross-tenant real-time tests. |
| `P0-SEC-03` | Privileged MFA not consistently enforced | Require MFA for platform administrators, tenant owners, impersonation, sensitive exports, secret changes, and other privileged actions. |
| `P0-DB-01` | Runtime `ALTER TABLE` and startup DDL | Remove runtime schema mutation and make Alembic the sole schema-change authority. |
| `P0-DB-02` | Alembic migration graph not fully proven | Validate clean install, current upgrade, production-like upgrade, migration ordering, data backfills, failure recovery, and schema/model parity. |
| `P0-AUTH-01` | Duplicated authentication and authorization logic | Establish one canonical authentication context, one authorization service boundary, and one route-enforcement pattern. |
| `P0-TENANT-01` | Unsafe trust in client-provided tenant headers | Remove tenant selection from unverified headers. Only verified user, service, or device identity may establish tenant context. |
| `P0-TENANT-02` | RLS documentation and implementation mismatch | Inventory tenant tables and prove actual RLS state before claiming database-enforced isolation. |
| `P0-OPS-01` | Silent exception swallowing and unsafe fallbacks | Replace silent failures with explicit degraded states, structured logs, metrics, alerts, and fail-closed behavior for security-critical paths. |
| `P0-OPS-02` | Duplicate middleware and process-local security state | Consolidate rate limiting and request security behavior; move production counters and shared state to managed infrastructure. |
| `P0-LOG-01` | Debug prints and potentially sensitive diagnostic output | Remove debug output from request, identity, tenant, database, and production startup paths. |
| `P0-SCAN-01` | No reproducible formal security assessment | After baseline repair, execute threat modelling, SAST, SCA, secret scanning, IaC/container review, DAST, tenant-escape testing, and independent validation of Critical/High findings. |

## Baseline Measurement Deliverables

Phase 0 must produce:

- Application and route inventory with authentication, tenant scope, permission, data classification, and owner.
- Database inventory with tenant ownership, retention class, indexes, RLS readiness, and migration provenance.
- Secret and cryptographic-key inventory with owner, storage location, rotation date, and revocation mechanism.
- Background-job inventory with queue, retry behavior, idempotency, tenant context, side effects, and failure handling.
- External-provider inventory covering data transferred, region, processor role, credentials, webhook validation, and degradation behavior.
- Workload baseline covering latency, concurrency, WebSockets, uploads, queue depth, database load, and provider volume.
- Critical user-journey inventory for cloud portals.
- Mobile and venue scope register.
- Security finding register and threat model.
- Reproducible development and CI test environment.

# Layer 2: Enterprise Target-State Architecture

## Target-State Principles

- Organization remains the root commercial and tenant owner.
- Event licensing remains activation-driven and snapshot-first.
- PostgreSQL RLS is mandatory for shared multi-tenant databases.
- Every tenant transaction establishes verified transaction-local tenant context.
- Runtime systems enforce least privilege, deterministic authorization, and auditable decisions.
- Synchronous requests remain bounded; durable workflows use idempotent asynchronous processing.
- Infrastructure evolves through measured demand and contractual requirements.
- Logical domain ownership does not require immediate physical service or database separation.
- Privacy, accessibility, security, and auditability are design inputs rather than later remediation projects.

## Logical Data Responsibility Planes

| Plane | Responsibilities |
|---|---|
| Control Plane Data | Organizations, subscription ownership, entitlement grants, tenant configuration, future tenant routing, platform administration, billing configuration, and compliance configuration. |
| Event Plane Data | Events, registrations, participants, speakers, sessions, rooms, schedules, workspace assignments, tickets, badges, and certificates. |
| Operational Data | Commands, jobs, usage ledgers, email and webhook delivery, file processing, integrations, imports, exports, reconciliation, and metering. |
| Audit and Security Data | Immutable audit events, security events, privileged access, impersonation, administrative actions, access reviews, and compliance evidence. |

These are ownership and access boundaries. They may remain in the same PostgreSQL deployment initially.

## Multi-Tenant Data Architecture

### Shared Database Target

- Every tenant-owned table carries non-null tenant lineage or inherits it through a database-verifiable ownership relationship.
- Shared tenant tables use enabled and forced PostgreSQL RLS.
- Runtime roles have no `BYPASSRLS` and cannot disable policies.
- Migration, runtime, support, audit-export, and operational roles remain separate.
- Common tenant queries use tenant-leading indexes such as `(organization_id, event_id, ...)`.
- Super-administration uses step-up authentication, explicit privileged workflows, audit records, reason capture, expiry, and minimal scope.

### TenantContextGuard

Every transaction accessing tenant-owned data must:

1. Authenticate a user, service, or device identity.
2. Derive organization scope from verified identity and authorization data.
3. Begin a transaction.
4. establish tenant context with transaction-local `SET LOCAL` semantics.
5. Perform tenant-scoped queries only after context is set.
6. Clear context automatically when the transaction ends.
7. Reject tenant-owned access when verified context is absent.

Persistent session-level tenant state must never be trusted across pooled connections.

Mandatory tests must reuse the same physical database connection for Organizations A and B and prove:

- Organization A context is absent after its transaction.
- Organization B cannot read or mutate Organization A data.
- Failed and rolled-back transactions do not leak tenant context.
- Worker, WebSocket, export, support, and service-identity paths behave identically.

### Staged RLS Rollout

1. Inventory tenant ownership and exceptions.
2. Complete `organization_id` and ownership lineage.
3. Add tenant-aware indexes.
4. Introduce TenantContextGuard.
5. Create RLS policies through Alembic.
6. Run shadow/report-only policy verification.
7. Execute automated cross-tenant attack testing.
8. Enable RLS for internal canary users and selected organizations.
9. Enable RLS for all shared tenants.
10. Apply `FORCE ROW LEVEL SECURITY`.
11. Continuously test migrations for policy coverage.

RLS may be hardened on the current PostgreSQL platform before AWS migration. AWS migration and RLS enforcement are separate workstreams. The same policies and migration graph must deploy unchanged to the AWS target.

### Future Tenant Routing

The target architecture includes a global tenant directory mapping an organization to:

- A shared deployment cell.
- A dedicated enterprise database.
- A future regional deployment.

Initial implementation must not build full cell routing. Current identifiers, APIs, migrations, repositories, event activation rules, and storage naming must avoid assumptions that make future routing impossible.

## Event Subscription and Entitlement Architecture

The finalized subscription v4 architecture is non-negotiable:

```text
Organization
  → Organization Subscription
  → Entitlement Grant
  → Grant Consumption Ledger
  → Event Activation
  → Versioned Snapshot Set
      → Feature Snapshot Items
      → Limit Snapshot Items
  → Runtime Enforcement
      → EntitlementResolver
      → UsageService
      → LimitGuard
      → FeatureGate
```

Runtime rules:

- Organization subscriptions remain commercial purchase records.
- Event activation remains the authoritative event-to-license binding.
- Every activation binds to a specific grant consumption.
- Runtime event access resolves only through the activation’s current snapshot set.
- Latest-subscription lookup, subscription union, and pooled organization event entitlement are forbidden.
- Snapshots are append-only, versioned, deterministic, checksummed, and auditable.
- Snapshot refresh occurs through explicit jobs or administrative workflows.
- Grant reservation uses database-controlled concurrency.
- Activation, transfer, deactivation, refresh, and grant issuance are idempotent.
- UsageService owns usage calculation; LimitGuard combines snapshots and usage before mutation.
- Event workspace seats count only internal assigned organizer-side users.

## Cloud and Venue Trust Boundary

Venue systems may remain outside the initial cloud assurance scope, but they cannot bypass cloud controls.

- Venue Server never connects directly to the cloud database.
- Venue systems never receive an RLS bypass role or shared application secret.
- Every venue node and device uses a machine identity containing organization, event, site/device, permissions, expiry, key version, and rotation metadata.
- Cloud synchronization occurs through authenticated Cloud API endpoints.
- Cloud API validates machine identity, establishes TenantContextGuard, checks event/device assignment, applies authorization, and uses the normal RLS runtime role.
- Sync payloads include stable operation IDs, sequence metadata, replay protection, and conflict provenance.
- Credentials are revocable per site/device without affecting other tenants.
- Venue-to-cloud tests cover wrong organization, wrong event, revoked device, expired credential, replay, sequence conflict, and attempted cross-tenant synchronization.

## Scale Model and Workload Profiles

The long-term goal remains one million MAU and 100,000 concurrent users. Capacity is validated progressively using measured production peaks and contractual forecasts.

For each profile, record concurrent users, requests per second, read/write mix, payload sizes, WebSocket count, uploads, queue depth, burst duration, provider calls, latency objective, and recovery behavior.

| Workload profile | Required independent measurements |
|---|---|
| Organizer administration | Active organizers, dashboard reads, configuration writes, exports, query complexity, and event workspace WebSockets. |
| Public event browsing | Anonymous sessions, cacheability, geographic distribution, page/API request rate, and content payload size. |
| Registration launch | Burst registrations, payment initiation, capacity contention, webhook rate, idempotency collisions, and oversell risk. |
| Event-morning check-in | Scans per second, duplicate scans, intermittent connectivity, badge generation, local/cloud synchronization, and queue lag. |
| Speaker deadline | Concurrent uploads, average/maximum file size, multipart volume, malware backlog, conversion load, and storage throughput. |
| Live conference | WebSocket connections, room joins, event fan-out, commands per second, reconnect storms, and polling fallback load. |
| Campaign send | Recipient count, dispatch rate, provider limits, consent checks, retries, suppression, and webhook delivery volume. |
| Certificate release | Generation count, CPU/memory cost, storage writes, download burst, email dispatch, and retry behavior. |
| Badge generation | Template complexity, batch size, rendering throughput, printer/device delivery, and regeneration rate. |
| Export/report jobs | Dataset size, query duration, memory, temporary storage, cancellation, and concurrent job count. |

Capacity stages are selected as the greater of:

- Twice the measured p95 production peak.
- The next signed contractual requirement.
- The next approved growth forecast.

The 100,000-concurrency test is a Phase 5 target, not a prerequisite for initial secure production.

## Durable Asynchronous Processing

### Initial State

The modular monolith and existing workers may deploy first after security and reliability repair.

### Reliability Evolution

Workflows adopt transactional outbox, SQS, dead-letter queues, idempotency, and workload-separated workers when they:

- Perform external side effects.
- Cannot safely be lost after a database commit.
- Experience duplicate execution or retry ambiguity.
- Create user-visible backlogs.
- Compete with latency-sensitive work.
- Require independent scaling or tenant fairness.

Target worker pools include communications, imports, media/files, reports/exports, billing, certificates/badges, and maintenance.

Every durable workflow defines:

- Tenant and event scope.
- Idempotency and deduplication key.
- Retryable and terminal errors.
- Retry backoff and maximum attempts.
- Dead-letter handling.
- Poison-message process.
- Cancellation behavior.
- Reconciliation process.
- Queue age and depth alerts.
- Tenant fairness and provider rate limits.

## Identity Target State

Immediate identity work hardens the current architecture. Future capabilities are activated by enterprise contracts or procurement requirements.

Target capabilities include:

- OIDC and SAML federation.
- SCIM provisioning and deprovisioning.
- Passkeys/WebAuthn.
- Domain-based identity discovery.
- Enterprise account linking.
- Customer-managed identity policies.
- Dedicated break-glass administration.

Before identity-provider migration, approve a migration design covering user IDs, password strategy, duplicate emails, account linking, tenant memberships, token invalidation, MFA migration, recovery, break-glass access, and audit continuity.

## Service Recovery Classification

| Class | Services and data | Target-state recovery |
|---|---|---|
| `RC1 Critical` | Identity, authorization, tenant directory, event configuration, registrations, billing activation, grant consumption, entitlement snapshots, and critical audit records | Target SLO 99.95%; RPO ≤5 minutes; RTO ≤30 minutes; frequent restore and failover testing. |
| `RC2 Operational` | Job state, communications, webhook delivery, file metadata, usage ledgers, imports, and sync state | RPO ≤15 minutes; RTO ≤2 hours; replay and reconciliation required. |
| `RC3 Rebuildable` | Search indexes, analytics projections, generated reports, thumbnails, and derived summaries | Rebuild from authoritative data; RPO up to 24 hours; RTO based on business impact. |
| `RC4 Ephemeral` | Caches, temporary files, transient metrics buffers, and disposable previews | No durability guarantee; automatic recreation and safe cache-miss behavior. |

Each service records SLO, RPO, RTO, dependencies, backup mechanism, restoration procedure, failover owner, and last test date.

## Dependency Degradation and Graceful Failure Matrix

| Dependency | Required degraded behavior |
|---|---|
| Redis/cache | Fall back to database-safe behavior where practical; disable optional caching; security rate limiting must use an approved fail-safe mode. |
| Email provider | Accept eligible dispatch as delayed, preserve idempotency and consent decision, retry through queue, expose status, and alert on sustained failure. |
| SMS/WhatsApp provider | Delay safely, preserve consent and suppression decisions, respect provider expiry windows, and avoid silent channel substitution. |
| Payment provider | Preserve pending state, prevent duplicate charges, verify webhooks, reconcile later, and never mark payment complete from an unverified client response. |
| PostgreSQL search | Remains authoritative default search. |
| OpenSearch | Fall back to scoped PostgreSQL search where supported; otherwise expose temporary search degradation without blocking core event operations. |
| Analytics | Queue or drop non-critical projections according to policy; never block registration or event management. |
| Malware scanning | Keep files quarantined and unavailable for processing or download until scanning succeeds. |
| WebSocket infrastructure | Use polling or refresh fallback for critical status; commands requiring real-time guarantees must expose acknowledgement and reconciliation. |
| Object storage | Block new uploads safely, preserve metadata state, avoid orphan records, and keep existing event configuration usable where possible. |
| DR region | Continue primary-region operation, alert loss of recovery posture, and restore DR readiness without pretending failover is available. |

## Data Classification, Residency, and Telemetry Governance

| Class | Controls |
|---|---|
| Public | Approved public content; integrity protection; standard backups; public delivery only through approved channels. |
| Internal | Employee and operational information; authenticated access; encryption in transit and at rest; limited external transfer. |
| Confidential | Contracts, commercial data, tenant configuration, and non-public event data; least privilege, audit logging, controlled retention. |
| Restricted Personal Data | Participant, speaker, identity, contact, attendance, and sensitive profile data; India-approved storage, strict access, purpose limitation, deletion propagation, and processor review. |
| Payment Data | Hosted/tokenized provider references only; no cardholder data storage; PCI scope controls and provider reconciliation. |
| Security/Audit Data | Authentication events, IP addresses, administrative actions, device identity, and threat indicators; immutable storage, restricted access, long retention, and redaction controls. |
| Compliance Evidence | Policies, approvals, reviews, test evidence, incidents, and audit packages; immutable/versioned storage and defined evidence retention. |

Telemetry governance applies to logs, traces, metrics, error tracking, request payloads, IP addresses, email addresses, phone numbers, tokens, event metadata, and stack traces.

- Tokens, secrets, passwords, raw payment data, and unrestricted request bodies must never enter telemetry.
- Personal data fields require allowlisted capture and redaction.
- Telemetry processors and storage regions must satisfy India residency decisions.
- Retention differs by telemetry class and operational need.
- Debug logging is disabled in production.
- Access to security telemetry is separately audited.

## Communication Consent and Channel Governance

Use a unified consent and suppression model for `EMAIL`, `SMS`, `WHATSAPP`, and `PUSH`.

The consent ledger records:

- Participant identity reference.
- Organization and event scope.
- Channel.
- Communication purpose.
- Consent or legal-basis status.
- Consent source and evidence.
- Consent timestamp.
- Withdrawal timestamp.
- Policy version.
- Suppression reason.
- Evidence reference.

Dispatch eligibility evaluates:

- Purpose and channel.
- Consent or documented legal basis.
- Tenant communication policy.
- Global and event suppression.
- Provider eligibility and approved templates.
- Frequency and quiet-hour policy.
- Participant withdrawal.
- Jurisdiction and processor constraints.

WhatsApp additionally requires approved templates where applicable, consent evidence, processor/subprocessor assessment, opt-out handling, suppression propagation, delivery retention, and provider webhook verification.

## Mobile Application Scope

Initial cloud scope includes browser-based command center, organiser, registration, and speaker portals.

Attendee-native, moderator, kiosk, station, and other mobile/device applications are excluded from the initial cloud assurance scope. They may consume cloud APIs only through approved identities and contracts.

A later Mobile Security and Distribution Program must cover:

- Secure token storage.
- Local personal and offline data.
- Push-notification privacy.
- Deep-link validation.
- Session revocation.
- Local encryption and deletion propagation.
- Application signing and integrity.
- Compromised/rooted device assumptions.
- Store distribution and update policy.

## Compliance Target State

### Legal and Regulatory Requirements

- India DPDP and GDPR are legal programs where applicability is established.
- Early design includes data inventory, consent provenance, purpose limitation, retention, deletion propagation, processor inventory, breach workflow, rights requests, and evidence.
- Legal applicability and deadlines are validated by the Privacy and Legal Owner.

### Payment Scope Requirements

- Use hosted or tokenized payment flows.
- Do not store cardholder data.
- Verify payment webhooks and signatures.
- Maintain idempotent payment state and reconciliation.
- Validate and document PCI DSS SAQ-A scope annually where applicable.

### Assurance Frameworks

- ISO 27001 and SOC 2 are customer assurance programs, not automatic simultaneous projects.
- Before Phase 4, review lost deals, open RFPs, customer questionnaires, contractual clauses, and target markets.
- Select the first framework based on evidence of what prevents deals from closing.
- Establish ISMS or SOC evidence only to the level justified by the selected framework and customer timeline.

## FinOps and Capacity Economics

Track:

- Cost per active event.
- Cost per registration.
- Cost per thousand communications by channel.
- Cost per gigabyte stored.
- Cost per presentation processed.
- Cost per WebSocket connection-hour.
- Cost per tenant.
- Cost per dedicated enterprise tenant.
- DR standby cost.
- Observability cost as a percentage of infrastructure spend.

Required controls include environment/tenant/cell tags, budget alerts, anomaly detection, storage lifecycle policies, telemetry-retention review, quarterly right-sizing, and architectural cost review before EKS node groups, OpenSearch clusters, dedicated databases, or warm duplicated environments.

# Layer 3: Platform Engineering Standards

## Runtime Selection Standard

ECS Fargate is the default initial managed container candidate for a small team.

An ADR must compare ECS Fargate and EKS using:

- Number and type of independently scaled workloads.
- Kubernetes expertise and operational staffing.
- Deployment frequency.
- WebSocket behavior.
- Media-processing and specialized hardware requirements.
- Queue-driven autoscaling.
- Networking and policy complexity.
- Portability requirements.
- Cost and operational burden.

EKS remains the target option when evidence justifies Kubernetes.

## Database Standards

- Alembic is the only schema authority.
- Migrations follow expand, migrate, contract.
- Production backfills are resumable, observable, and bounded.
- RLS policy coverage is tested in CI.
- Cursor pagination is required for large collections.
- Optimistic concurrency is used where conflicting administrative edits are credible.
- Table partitioning requires evidence from growth, retention, maintenance, query plans, or benchmarks.
- Read replicas are introduced only for proven read bottlenecks and consistency-tolerant queries.

## Search Standards

PostgreSQL indexed and full-text search is the default.

OpenSearch requires an ADR demonstrating one or more of:

- PostgreSQL search misses an approved p95 latency target after indexing and query tuning.
- Cross-domain ranking, fuzzy search, faceting, or language analysis exceeds PostgreSQL requirements.
- Search index scale or query isolation threatens transactional workloads.
- Customer requirements justify the operational cost.

## API and Job Standards

- Version externally consumed APIs.
- Use RFC 9457-style problem responses with stable codes.
- Include request and correlation identifiers.
- Require consistent rate-limit headers.
- Use cursor pagination for large collections.
- Require idempotency for commercially or operationally sensitive mutations.
- Use domain-specific asynchronous endpoints such as campaign dispatches, certificate runs, imports, exports, and file-processing runs.
- Return `202 Accepted` with a job identifier for accepted asynchronous work.
- Use unified `GET /jobs/{job_id}` for status, progress, result, cancellation where supported, and failure reason.
- Do not require a universal `POST /commands` abstraction.

## Authentication and Authorization Standards

- One canonical request identity and authorization context.
- Centralized tenant, event assignment, RBAC, feature, and limit enforcement.
- MFA and step-up authentication for privileged actions.
- Revocable refresh tokens and sessions.
- Hashed, scoped, expiring API credentials.
- Explicit machine identities for integrations and venue systems.
- Audited impersonation and break-glass activity.
- Authorization tests generated from route and permission inventories.

## Security Finding Governance

| Severity | Required treatment |
|---|---|
| Critical | Deployment blocked. No normal exception path. Immediate owner assignment, remediation, evidence, and retest required. |
| High | Deployment blocked unless a time-limited exception is approved by the Product and Risk Owner with Security Assessor input and compensating controls. |
| Medium | Documented risk treatment, owner, due date, and remediation plan required. |
| Low | Managed backlog with policy-defined review and prioritization. |

Every finding records owner, affected assets, evidence, remediation SLA, false-positive reasoning, compensating controls, exception approver, expiry, and retest status. False-positive closure requires reproducible evidence.

## Accessibility Standards

Shared UI components enforce:

- Semantic structure.
- Keyboard navigation.
- Focus management and visible focus.
- Labels and accessible names.
- Error and status announcements.
- Correct dialog behavior.
- Contrast and non-color communication.
- Reduced motion.
- Target sizing.
- Reflow and zoom support.

Automated axe and Playwright checks begin in Phase 0/1. Full manual WCAG 2.2 AA critical-journey assessment matures in Phase 3.

## Infrastructure and Delivery Standards

- Infrastructure managed through Terraform.
- Separate development, staging, production, security/log archive, and shared-service boundaries where economically justified.
- Short-lived deployment credentials.
- Protected branches and reviewed production changes.
- Container and dependency scanning.
- Signed images and SBOMs.
- Non-root containers and minimal runtime permissions.
- Health, readiness, and startup probes.
- Canary or controlled rollout with tested rollback.
- Secrets stored in managed secret systems, not repository files or image layers.

## Observability Standards

- OpenTelemetry-compatible traces, metrics, and logs.
- Tenant-safe correlation across HTTP, jobs, queues, providers, and audit records.
- Service SLOs and error-budget tracking.
- Queue age, retry, database saturation, provider failure, entitlement denial, and security anomaly alerts.
- No unrestricted personal data or secrets in telemetry.
- Operational dashboards must distinguish platform-wide and tenant-specific impact without exposing one tenant to another.

## Privacy-by-Design Standards

Every new data field or workflow defines:

- Data classification.
- Purpose and legal basis.
- Tenant and event scope.
- Retention and deletion behavior.
- Export and rights-request behavior.
- Telemetry restrictions.
- Processor/subprocessor transfer.
- Audit requirements.

# Layer 4: Trigger-Driven Implementation Roadmap

## Phase 0: Security Closure and Reproducible Baseline

### Work

- Close all named Phase 0 blockers.
- Rotate and revoke exposed or historically unsafe secrets.
- Secure WebSocket and Socket.IO connections, room joins, and commands.
- Enforce privileged MFA.
- Remove runtime DDL.
- Repair and validate Alembic.
- Consolidate identity and authorization paths.
- Remove client tenant-header trust.
- Eliminate silent production fallbacks.
- Build authoritative inventories and workload measurements.
- Establish reproducible backend, worker, PostgreSQL, and Redis tests.
- Run formal threat modelling and security scanning.
- Remediate all Critical and High findings.

### Gate

| Requirement | Evidence | Owner | Dependency | Rollback/remediation |
|---|---|---|---|---|
| Reproducible baseline | CI run, environment definition, test report | Engineering Owner | Working Python/Node environments | Block release and repair environment |
| Migration integrity | Clean install and upgrade reports | Engineering Owner | Disposable PostgreSQL | Restore snapshot; correct migration graph |
| Secret closure | Rotation/revocation register and negative-auth tests | Engineering Owner, Product and Risk Owner | Provider access | Disable affected integration until proven safe |
| Real-time security | Auth, room, command, and cross-tenant tests | Engineering Owner, Security Assessor | Canonical identity context | Disable real-time mutation and use polling |
| Privileged MFA | MFA enforcement and recovery test | Engineering Owner | Existing MFA implementation | Restrict privileged access |
| Security closure | Finding register with Critical/High retests | Security Assessor | Reproducible baseline | Deployment blocked |

### Exit Criteria

The system is reproducible, migrations are trustworthy, privileged access is protected, real-time interfaces are authorized, unsafe tenant trust is removed, and no unresolved Critical or High security finding remains.

## Phase 1: SaaS Tenancy and Licensing Foundation

### Work

- Complete ownership metadata and tenant indexes.
- Implement TenantContextGuard.
- Create and verify RLS policies.
- Run shadow verification, attack testing, canary enforcement, and forced RLS.
- Separate database roles.
- Secure service and venue machine identities.
- Complete subscription v4 migrations and runtime implementation.
- Enforce grant consumption, activation binding, snapshots, UsageService, LimitGuard, and FeatureGate.
- Verify audit integrity.
- Add basic OpenTelemetry instrumentation.
- Establish and test backup/restore.

### Gate

| Requirement | Evidence | Owner | Dependency | Rollback/remediation |
|---|---|---|---|---|
| Tenant inventory complete | Table ownership and RLS coverage report | Engineering Owner | Phase 0 migrations | Block new tenant tables |
| TenantContextGuard safe | Connection-reuse and rollback tests | Engineering Owner, Security Assessor | Canonical DB session path | Disable rollout and revert canary |
| Forced RLS safe | HTTP, worker, export, storage, cache, WebSocket, and venue isolation tests | Engineering Owner | Shadow/canary success | Return affected tenants to prior canary stage |
| Licensing deterministic | Activation and snapshot test suite | Engineering Owner | Subscription v4 migrations | Disable activation mutation, preserve snapshots |
| Backup restorable | Timed restoration evidence | Cloud Operations Owner | Backup target | Keep production release blocked |

### Exit Criteria

Cross-tenant access fails safely across all access paths, licensing is activation-driven and deterministic, and authoritative data can be restored.

## Phase 2: Reliable Production Cloud

### Work

- Establish AWS landing zone and account boundaries.
- Implement Terraform state, modules, networking, IAM, KMS, secrets, logs, managed PostgreSQL, private object storage, and managed cache.
- Complete ECS Fargate versus EKS ADR; default to ECS Fargate unless evidence supports EKS.
- Build repeatable CI/CD, scanning, signing, health endpoints, deployment promotion, canary, and rollback.
- Add production metrics, logs, traces, dashboards, and alerts.
- Implement backup, restore, incident, and provider-failure runbooks.
- Run load tests against measured current peak plus safety margin.
- Establish cost allocation and budget alerts.

### Gate

| Requirement | Evidence | Owner | Dependency | Rollback/remediation |
|---|---|---|---|---|
| Runtime ADR approved | ECS/EKS decision record | Engineering Owner, Product and Risk Owner | Workload baseline | Revisit when trigger changes |
| Reproducible infrastructure | Terraform plan/apply and drift report | Cloud Operations Owner | AWS landing zone | Restore previous module version |
| Safe deployment | Canary and rollback rehearsal | Engineering Owner | CI/CD | Automatic or manual rollback |
| Observable production | SLO dashboards and alert tests | Engineering Owner | Telemetry governance | Block launch if critical services are blind |
| Current-scale capacity | Load test at measured peak plus margin | Engineering Owner | Workload profiles | Scale resources or optimize bottleneck |
| Restore capability | Recovery-class restoration test | Cloud Operations Owner | Backups | Delay launch |

### Exit Criteria

Deployments are repeatable, current demand is supported with margin, rollback and restore are proven, and production behavior is observable.

## Phase 3: Durable Workflows, Accessibility, and Operational Maturity

### Work

- Add transactional outbox to critical commit-plus-side-effect workflows.
- Introduce SQS, dead-letter queues, worker separation, deduplication, reconciliation, fairness, and queue scaling where triggered.
- Complete critical-journey WCAG 2.2 AA remediation and manual testing.
- Implement dependency degradation behavior.
- Test service-specific recovery.
- Establish privacy rights, retention, deletion, breach, and processor workflows.
- Implement communication consent and suppression governance.
- Automate operational and compliance evidence.

### Gate

| Requirement | Evidence | Owner | Dependency | Rollback/remediation |
|---|---|---|---|---|
| Durable workflows | Redelivery, duplicate, poison, and reconciliation tests | Engineering Owner | Reliable production cloud | Pause affected queue and reconcile |
| Accessibility | Automated and manual journey reports | Accessibility Assessor | Stable cloud portals | Block inaccessible critical journey release |
| Graceful degradation | Provider outage exercises | Engineering Owner | Dependency matrix | Disable affected optional feature |
| Recovery classes proven | Class-specific recovery tests | Cloud Operations Owner | Backup and runbooks | Correct class design or recovery process |
| Privacy operations | DSAR, retention, deletion, and consent evidence | Privacy and Legal Owner | Data inventory | Suspend non-compliant processing |

### Exit Criteria

Critical asynchronous workflows survive retries, provider failures degrade safely, critical journeys meet accessibility requirements, and privacy/operational evidence is continuously generated.

## Phase 4: Enterprise Capabilities

### Activation Triggers

- Signed customer requirement for SAML, OIDC, SCIM, dedicated isolation, customer-managed keys, audit export, contractual SLA, or specialized residency.
- RFP evidence showing a specific assurance framework blocks deals.
- Regulatory or contractual requirements that cannot be satisfied by the shared platform.

### Potential Work

- SAML/OIDC federation and SCIM.
- Passkeys and enterprise domain discovery.
- Dedicated databases and KMS keys.
- Enterprise audit export.
- Contractual SLA reporting.
- Enhanced DR.
- Selected ISO 27001 or SOC 2 assurance program.
- Enterprise provisioning and deprovisioning.

### Gate

Each capability requires a customer/business case, ADR, threat model update, migration plan, support model, evidence requirements, pricing model, and rollback strategy.

### Exit Criteria

The contracted capability is implemented, tested, operationally supportable, and evidenced without weakening shared-platform isolation.

## Phase 5: Hyperscale Architecture

### Activation Triggers

| Capability | Trigger |
|---|---|
| OpenSearch | PostgreSQL search misses approved latency/capability targets after tuning, or transactional isolation requires a separate search platform. |
| Table partitioning | Demonstrated table growth, retention, vacuum/maintenance cost, query-plan degradation, or benchmark evidence. |
| Cell routing | Noisy-neighbor incidents, database limits, tenant count, geographic requirements, or dedicated enterprise contracts. |
| Dedicated database | Contractual, regulatory, performance, or operational isolation requirement. |
| EKS | Workload count, scaling diversity, specialized processing, WebSocket behavior, deployment frequency, and available Kubernetes expertise justify it through ADR. |
| Advanced WebSocket platform | Connection scale, reconnect storms, fan-out, latency, or reliability exceed the managed container/Redis design. |
| Warm cross-region DR | Contracted recovery SLA, material revenue exposure, or quantified outage risk justifies standby cost. |
| 100k concurrency validation | Signed forecast, measured growth trajectory, or commercial launch requires the target. |

### Work

- Global tenant directory and cell routing.
- Multi-cell deployment.
- Selective partitioning.
- OpenSearch where approved.
- EKS migration where approved.
- Advanced queue fairness and read routing.
- High-scale WebSocket infrastructure.
- Regional traffic management.
- Validated 1M MAU and 100k-concurrency capacity.

### Gate

Hyperscale deployment requires staged performance tests, cost review, failure-domain analysis, capacity model, rollback plan, and proof that simpler architecture no longer meets requirements.

### Exit Criteria

The platform meets the activated scale requirement at acceptable reliability and cost without tenant isolation or operational regressions.

## Parallel Venue Reliability Program

This program runs alongside cloud phases and is not delayed by certification scope.

Required work includes:

- Presentation dependency and absolute-path scanning.
- Malware scanning.
- Broken internal-media validation.
- Critical-priority and urgency-escalated synchronization.
- Session-readiness gating.
- Hot standby Venue Server.
- Shadow room machine.
- Emergency technician controls.
- Incident runbooks.
- Timing alerts and operational monitoring.
- Secure machine identities and cloud synchronization contracts.

Cloud and venue share identity, tenant context, event authorization, audit, synchronization, and incident-boundary contracts while retaining separate certification scopes.

## Roadmap Governance

At the end of every phase:

- Review workload measurements, incidents, customer requirements, security findings, accessibility status, cost data, and commercial pipeline.
- Re-evaluate activation triggers.
- Approve only the next justified capability.
- Record decisions in ADRs.
- Update threat model, data inventory, recovery classification, and runbooks.
- Preserve backward-compatible licensing, tenant, and domain contracts.
- Do not begin a target-state capability solely because it appears in this plan.
