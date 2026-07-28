# Enterprise Production, Scale, Accessibility, and Compliance Plan

## Summary

Transform Event OS incrementally into an AWS-hosted, enterprise multi-tenant cloud platform supporting:

- One million monthly active users and up to 100,000 concurrent users.
- 99.95% availability, RPO of 5 minutes, and RTO of 30 minutes.
- Shared PostgreSQL tenants protected by mandatory RLS, with dedicated database/KMS tiers for regulated customers.
- India-only data residency using Mumbai as primary and Hyderabad as disaster-recovery region.
- WCAG 2.2 AA conformance.
- ISO 27001:2022, SOC 2, GDPR, India DPDP, and PCI DSS SAQ-A readiness.
- Cloud applications first: command center, organiser portal, registration portal, speaker portal, backend, and workers.
- Incremental modular-monolith refactoring, extracting only scale-critical asynchronous services.

“No security issues” will be treated as: no unresolved Critical or High findings, documented acceptance for Medium risks, successful penetration testing, and enforced security gates. ISO certification additionally requires organizational policies, evidence, audits, and management involvement beyond code changes.

## Mandatory Release Gates

| Area | Required release condition |
|---|---|
| Tenant isolation | Database-enforced RLS on every tenant table, cross-tenant tests passing, no trusted client tenant header |
| Security | Zero unresolved Critical/High SAST, DAST, dependency, container, IaC, or penetration-test findings |
| Reliability | Multi-AZ operation, tested cross-region restoration, RPO ≤5 minutes and RTO ≤30 minutes |
| Scale | Sustained synthetic peak workload at 100,000 concurrent sessions without SLO breach |
| API performance | p95 reads ≤300 ms and writes ≤500 ms, excluding explicitly asynchronous operations |
| Accessibility | Automated axe checks plus manual WCAG 2.2 AA assessment of every critical journey |
| Compliance | Approved ISMS scope, risk register, Statement of Applicability, control owners, and collected evidence |
| Deployment | Reproducible Terraform infrastructure, signed images, automated migrations, rollback and canary deployment |
| Quality | Unit, integration, contract, migration, isolation, accessibility, load, and recovery gates all passing |

## Implementation Program

### 1. Stabilize the Current Baseline

- Preserve and reconcile the current dirty subscription, billing, event-activation, and frontend changes before broader refactoring.
- Repair the Python environment and run the complete backend, worker, and migration suites against disposable PostgreSQL and Redis instances.
- Validate the entire Alembic graph from an empty database and from a sanitized production-like snapshot.
- Remove startup DDL, debug prints, silent exception swallowing, placeholder production behavior, duplicate rate-limit middleware, and undocumented legacy fallbacks.
- Generate authoritative inventories for routes, database tables, tenant ownership, background jobs, integrations, secrets, and public endpoints.
- Classify placeholder venue applications as excluded from this cloud release and prevent their accidental production deployment.
- Perform a formal repository security scan and threat model after the baseline is reproducible.

### 2. Enforce Tenant Isolation at the Database

- Add `organization_id` to every tenant-owned record and require composite indexes beginning with `organization_id` for common access paths.
- Enable and force PostgreSQL RLS on every shared tenant table, including billing, files, audit, jobs, integrations, and snapshot tables.
- Use separate database roles for migrations, application runtime, read replicas, support tooling, and audit export; runtime roles must not have `BYPASSRLS`.
- Set tenant context transaction-locally from verified identity claims before any tenant query executes.
- Remove the unauthenticated `X-Organization-ID` fallback. Machine clients must use signed service identities containing an authorized tenant scope.
- Replace broad super-admin RLS bypass with explicit, time-limited, audited privileged sessions and step-up MFA.
- Add a tenant-routing control plane that maps each organization to a shared cell or dedicated database without changing domain APIs.
- Keep identical schemas and migrations across shared and dedicated tenant databases.
- Add automated checks that reject new tenant models lacking ownership, RLS policy, indexes, retention classification, and isolation tests.

### 3. Harden Identity, Authorization, and Public Interfaces

- Introduce an OIDC/SAML identity broker using Amazon Cognito federation while retaining a compatibility bridge for existing accounts.
- Require MFA for platform administrators and tenant owners; support TOTP and WebAuthn/passkeys with recovery-code lifecycle controls.
- Shorten access-token lifetime, use asymmetric signing with KMS-managed rotation and JWKS, and retain opaque rotating refresh tokens with reuse detection.
- Move browser sessions toward Secure, HttpOnly, SameSite cookies through a BFF layer and enforce CSRF protection for cookie-authenticated mutations.
- Hash API keys and OAuth tokens at rest, require scopes, expiration, rotation, revocation, rate limits, and last-used audit metadata.
- Remove virtual “organiser” authorization for developer credentials; service identities receive explicit machine permissions only.
- Centralize authorization around tenant, event assignment, RBAC permission, feature entitlement, and limit checks.
- Authenticate WebSocket and Socket.IO connections before acceptance, authorize every room join, validate every command, and record security-relevant actions.
- Replace process-local WebSocket rooms and anomaly counters with Redis-backed shared state.
- Restrict OpenAPI documentation and administrative routes in production and apply Trusted Host, strict CORS, CSP, HSTS, and secure proxy handling.
- Put CloudFront, AWS WAF, Shield, bot controls, request-size limits, and abuse-specific throttles in front of public registration and authentication endpoints.

### 4. Build the Scalable Runtime Architecture

- Deploy stateless FastAPI and Next.js workloads to EKS across three availability zones using ALB ingress, pod disruption budgets, topology spread, HPA, and KEDA.
- Use Aurora PostgreSQL or RDS PostgreSQL Multi-AZ with RDS Proxy, read replicas, automated backups, point-in-time recovery, and replica-aware read routing.
- Partition high-volume audit, request, email, usage-ledger, registration-event, and job-execution tables by time and tenant-aware keys.
- Replace offset pagination on large resources with stable cursor pagination and eliminate unbounded list/export endpoints.
- Use ElastiCache Redis Cluster for caching, rate limiting, distributed locks, and real-time fan-out.
- Move durable commands to SQS queues with dead-letter queues; use EventBridge for domain-event routing and scheduled work.
- Introduce a transactional outbox so database commits and emitted commands cannot diverge.
- Require idempotency keys and deduplication records for billing, registration, payment, email, import, export, file, and integration mutations.
- Split worker pools by workload: notifications, imports, media/file processing, reports, billing, and maintenance.
- Define concurrency, timeout, retry, poison-message, cancellation, and tenant-fairness policies for every queue.
- Upload files directly to private S3 using short-lived multipart URLs; quarantine uploads until MIME validation and malware scanning finish.
- Use S3 lifecycle rules, versioning, retention policies, and Object Lock for immutable compliance evidence and audit exports.
- Add OpenSearch only for cross-domain search and large text workloads; PostgreSQL remains the transactional source of truth.
- Apply per-tenant quotas and fair-use scheduling so one customer cannot exhaust database pools, workers, storage, email, or external-provider capacity.

### 5. Standardize APIs and Operational Commands

- Version public APIs and publish OpenAPI contracts with compatibility and deprecation rules.
- Adopt RFC 9457-style problem responses with stable error codes, request ID, correlation ID, tenant-safe context, and remediation details.
- Add `Idempotency-Key`, cursor pagination, optimistic concurrency/version fields, and consistent rate-limit headers.
- Represent long-running work through `POST /commands`, `GET /jobs/{id}`, cancellation, status, progress, result, and failure-reason contracts.
- Add `/health/live`, `/health/ready`, `/health/startup`, dependency status, and build/version endpoints; never expose secrets or tenant data.
- Keep event subscription enforcement snapshot-first and activation-driven, with no latest-subscription or organization-wide entitlement fallback.
- Publish domain events with schema versions and compatibility tests.
- Make data export, deletion, retention, access review, consent withdrawal, and breach-response workflows first-class APIs.

### 6. Observability, Reliability, and Incident Operations

- Instrument APIs, workers, queues, database calls, WebSockets, and external integrations with OpenTelemetry.
- Send metrics and logs to CloudWatch and managed Prometheus/Grafana; correlate every request, command, task, and audit record.
- Define SLOs for authentication, registration, event workspace access, billing activation, uploads, email dispatch, and public portal availability.
- Alert on error-budget burn, tenant-isolation anomalies, queue age, retry storms, database saturation, WebSocket failures, payment discrepancies, and entitlement denials.
- Forward security events to Security Hub/SIEM and enable GuardDuty, Inspector, CloudTrail, Config, Macie, and centralized immutable log storage.
- Build runbooks for credential compromise, tenant data exposure, payment failure, queue backlog, database failover, region loss, malware, and public traffic attacks.
- Maintain warm disaster-recovery infrastructure in Hyderabad with encrypted cross-region backups and rehearsed DNS/traffic failover.
- Test database restore monthly, service failover quarterly, and full disaster recovery at least annually.

### 7. Accessibility and Frontend Quality

- Establish WCAG 2.2 AA as a shared design-system contract across all cloud portals.
- Fix semantic structure, keyboard navigation, focus management, visible focus, skip links, headings, labels, errors, status announcements, and dialog behavior.
- Enforce contrast, text resizing, reflow, reduced motion, target size, timeout warnings, and non-color status communication.
- Make registration, payment, login/MFA, event creation, workspace management, speaker upload, and subscription activation fully screen-reader operable.
- Add axe and Playwright accessibility checks to each portal and lint JSX accessibility rules in CI.
- Test critical journeys manually with keyboard-only navigation, NVDA/Chrome, VoiceOver/Safari, zoom at 200–400%, and mobile screen readers.
- Publish an accessibility statement, known-limitations process, support channel, and remediation SLA.

### 8. ISO 27001 and Broader Compliance Readiness

- Define the ISMS scope as the AWS cloud platform, production data, personnel, suppliers, SDLC, and supporting operational systems; venue systems remain out of scope until separately certified.
- Create the asset inventory, information classification scheme, risk methodology, risk register, treatment plan, control owners, and ISO 27001:2022 Statement of Applicability.
- Establish policies for access control, cryptography, secure development, supplier management, incident response, backups, business continuity, acceptable use, retention, privacy, and change management.
- Automate evidence collection for deployments, approvals, access reviews, vulnerability scans, backups, restore tests, incidents, training, and supplier reviews.
- Run quarterly privileged-access reviews and tenant-admin access attestations.
- Implement GDPR and India DPDP workflows for consent, purpose, legal basis, data access, correction, portability, deletion, retention, and breach notification.
- Store regional data only in India and prevent unsupported cross-region replication or third-party transfer.
- Maintain a subprocessor register, DPAs, transfer assessments, privacy notices, records of processing, and deletion verification.
- Keep card data outside Event OS by using hosted/tokenized payment pages; verify webhook signatures and maintain PCI SAQ-A scope documentation.
- Complete internal audit, management review, corrective actions, evidence sampling, and independent penetration testing before certification assessment.

## CI/CD and Infrastructure Controls

- Provision EKS, networking, WAF, databases, Redis, queues, S3, KMS, observability, and DR using reviewed Terraform modules.
- Create separate AWS accounts for production, staging, development, security/log archive, and shared services.
- Use GitHub Actions with protected environments, mandatory reviews, CODEOWNERS, signed commits/tags, short-lived OIDC deployment credentials, and no static cloud keys.
- Run formatting, typing, unit, integration, contract, migration, accessibility, SAST, secret scanning, SCA, container scanning, IaC scanning, and SBOM generation on every change.
- Sign images and provenance attestations, enforce admission policies, run containers as non-root, use read-only filesystems, and restrict network/service-account permissions.
- Use expand-and-contract database migrations, backward-compatible APIs, canary deployments, automatic rollback, and feature flags with expiry owners.
- Block production deployment when migrations, evidence generation, security gates, or recovery checks fail.

## Test and Acceptance Program

- Tenant tests must attempt cross-organization reads and writes through HTTP, WebSocket, workers, direct SQL, exports, storage keys, caches, search, and support tooling.
- Authorization tests must cover every role, event assignment, feature flag, entitlement limit, service identity, impersonation, and administrative action.
- Migration tests must cover empty install, upgrade from every supported production version, rollback where safe, and production-scale backfill.
- Concurrency tests must verify idempotency, queue redelivery, payment webhook replay, entitlement consumption, registration capacity, and duplicate command handling.
- Load tests must model 100,000 concurrent sessions with an initial 80% read, 15% write, and 5% asynchronous-command mix, including event-day bursts and WebSocket traffic.
- Chaos tests must terminate pods, workers, Redis nodes, database connections, and availability zones without violating agreed SLOs.
- Security gates must include SAST, DAST, SCA, secret scanning, container/IaC scanning, API fuzzing, tenant escape testing, and annual independent penetration testing.
- Accessibility tests must cover all critical user journeys with automated and manual evidence.
- Compliance tests must prove retention, DSAR, deletion, backup restore, audit integrity, access review, key rotation, and incident evidence generation.

## Rollout Order

1. Reproducible baseline, clean migrations, CI, and complete inventory.
2. Immediate Critical/High security fixes, authenticated real-time interfaces, and production-safe configuration.
3. Database RLS rollout in report-only/shadow verification, followed by forced enforcement.
4. AWS Terraform foundation, EKS staging, managed data services, secrets, and observability.
5. Durable command/outbox architecture, worker separation, idempotency, and scale-focused database changes.
6. Cloud portal accessibility remediation and automated WCAG gates.
7. Production canary migration with dual monitoring and rollback capability.
8. Load, chaos, failover, restore, penetration, and privacy workflow acceptance.
9. ISO/SOC evidence collection period, internal audit, management review, and external readiness assessment.
10. Venue platform hardening and certification as a separate follow-on program.

## Assumptions and Defaults

- AWS regions are Mumbai primary and Hyderabad warm disaster recovery.
- Customer personal data remains in India; unsupported EU-residency commitments are not offered.
- Shared database tenancy uses mandatory RLS; dedicated databases are an enterprise tier using the same application contract.
- Existing APIs remain compatible during migration through adapters and explicit deprecation periods.
- Billing event activations and entitlement snapshots remain the runtime licensing authority.
- PostgreSQL is the transactional source of truth; caches, search indexes, meters, and analytics are derived and recoverable.
- Cloud portals and services are the first production/compliance scope; venue applications cannot be represented as certified until their separate program completes.
- The current repository assessment is reconnaissance, not a completed exhaustive security audit; the formal scan and independent penetration test are mandatory Phase 1 evidence.
