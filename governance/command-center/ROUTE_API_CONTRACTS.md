# Route-to-API Contract Inventory

## Contract standard

Every Command Center route must map its reads and mutations to a named backend module and authoritative database source in `COMMAND_CENTER_FEATURE_MATRIX.csv` before implementation acceptance.

All contracts use the authenticated API client, RFC 9457 problem responses, stable error codes, request/correlation IDs, scoped React Query keys, and explicit mutation invalidation. Long-running work returns `202 Accepted` with a durable job identifier.

The mounted FastAPI contract is exported to `apps/cloud/command-center/openapi/backend-openapi.json` and generates `types/openapi.generated.ts`. CI fails when either artifact drifts, operation IDs collide, a domain hook introduces direct `fetch`, or a raw query-key declaration bypasses the canonical platform/tenant factories.

## Domain ownership map

| UI domain | Backend owner | Authoritative concern |
|---|---|---|
| Dashboard and organizations | platform, analytics, RBAC | organization, membership, event and operational summaries |
| Sales and pricing | commercial, pricing, procurement | requests, quotes, proposals, catalogues and pricing snapshots |
| Subscriptions | billing | subscriptions, grants, consumptions, activations and snapshots |
| Finance | billing and payments | invoices, ledger, provider events, refunds, taxes and credit notes |
| Operations | operations planning, resources, deployments, jobs, files | durable operational state and readiness |
| Identity and security | identity, RBAC, audit | users, sessions, roles, permissions, security events and audit |
| Developer platform | developer, notifications/webhooks | API clients, keys, webhooks, integrations and delivery logs |
| Support and communications | support, notifications | tickets, knowledge, announcements, campaigns and consent |
| Removed capabilities | AI, website builder, platform templates, blueprints, themes, marketplace | Not part of the active route or API contract; source removed and any future replacement requires a new ADR |

## Provisional 2026-07-14 Contracts

| Route | Current API | Status | Required before completion |
|---|---|---|---|
| `/business/crm` | `/superadmin/crm/accounts`, `/accounts/{id}/workspace`, `/contacts`, `/leads`, `/leads/{id}/convert`, `/opportunities`, `/activities`, `/tasks`, `/notes`, `/pipeline-stages`, and lifecycle operations | `PARTIAL` core, bounded account workspace, engagement-lifecycle and controlled-conversion capable | Granular platform-staff permission policy, full browser journey, WCAG review, and forced-RLS deployment evidence |
| `/business/subscription/entitlements` | `/superadmin/billing-admin/entitlements`, grant capacity/status/consumptions, `/subscriptions`, `/activations`, activation inspection, snapshot refresh, transfer and deactivation | `COMPLETE_REPOSITORY` lifecycle-capable, explainable and browser verified | Forced-RLS deployment evidence remains a release-environment gate |
| `/finance/invoices` | `/superadmin/billing-admin/invoices`, invoice detail, payment/refund/status, and version-bound artifact request/status/download | `COMPLETE_REPOSITORY` lifecycle, reconciliation, refund, durable PDF and browser verified | Live object-storage/worker evidence remains a release-environment gate |
| `/finance/payments` | `/superadmin/billing-admin/payments`, `/superadmin/billing-admin/provider-webhooks`, payment reconciliation and `/payments/{id}/refund`; public provider callback at `/billing/provider-webhooks/{gateway_id}` | `COMPLETE_REPOSITORY` verified receipt, replay protection, deterministic reconciliation, refund lineage and outage tested | Provider sandbox callbacks remain external certification evidence |
| `/finance/credit-notes` | `/superadmin/billing-admin/credit-notes`, credit-note status and tenant invoice selector | `COMPLETE_REPOSITORY` versioned, reconciled and audited lifecycle | Live deployment evidence remains a release-environment gate |
| `/finance/financial-audit-trail` | `/superadmin/billing-admin/financial-audit-trail` plus governed audit exports | `COMPLETE_REPOSITORY` typed cursor tenant read and durable evidence path | Immutable-storage deployment decision remains Phase 10 evidence |
| `/identity-security/audit-logs` | platform audit API plus `/superadmin/audit-exports`, status and download endpoints | `COMPLETE_REPOSITORY` cursor, export, outage and retention tested | Live broker/object-storage and independent manual assessment remain release evidence |
| `/identity-security/users` | `/platform/global-users`, user status/session/MFA/platform-role and impersonation APIs | `COMPLETE_REPOSITORY` protected security lifecycle | Deployed session/cache and independent assessment remain release evidence |
| `/identity-security/roles` | `/superadmin/access/roles` | `COMPLETE_REPOSITORY` tenant-scoped lifecycle and browser mutation verified | Deployed authorization evidence remains a release gate |
| `/identity-security/permissions` | `/superadmin/access/permissions` and scoped role mappings | `COMPLETE_REPOSITORY` tenant-scoped matrix with database-authoritative decisions | Deployed authorization evidence remains a release gate |
| `/identity-security/access-reviews` | `/superadmin/security-governance/access-reviews` | `COMPLETE_REPOSITORY` versioned dual-control governance and browser verified | Scheduled certification belongs to Phase 8 |
| `/organizations` and `/organizations/[orgId]` | platform organization reads/status/detail update, idempotent provisioning, membership lifecycle, event assignment, billing/event/member sources | `PARTIAL` truthful administration | Complete cursor pagination, invitation delivery/acceptance journey, browser denial journeys, and remaining settings contracts |
| `/reports/exports` | `/superadmin/reports/exports`, status and download endpoints | `PARTIAL` | Live broker/object-storage E2E, retention cleanup, manual WCAG review, and production alert evidence |
| `/support-center/tickets` and `/support-center/tickets/[ticketId]` | `/support/tickets/admin`, ticket detail, versioned lifecycle, assignment/escalation, comments, attachment request/list/complete/download endpoints | `COMPLETE_REPOSITORY` tenant-scoped support and secure attachment lifecycle | Live object-storage/scanner and independent manual assessment remain release evidence |
| `/support-center/announcements` | `/platform/communications/announcements` and `/maintenance` | `COMPLETE_REPOSITORY` step-up/reason/audit and browser mutation assured | Deployed authorization and independent manual assessment remain release evidence |
| `/operations-center` | `/platform/operations/overview` | `COMPLETE_REPOSITORY` bounded source composition with explicit health and freshness | Live provider telemetry remains deployment evidence |
| `/operations-center/jobs` | `/platform/operations/jobs`, job detail, retry and cancel | `COMPLETE_REPOSITORY` typed adapters, sanitization, capability controls, cooperative cancellation and linked retries | Live worker/broker telemetry remains deployment evidence |
| `/operations-center/database` | `/platform/operations/database` | `COMPLETE_REPOSITORY` read-only connection, lock, migration, RLS, backup and restore evidence projection | Managed-database backup/restore signals remain deployment evidence |
| `/operations-center/storage` | `/platform/operations/storage`, `/queues` | `COMPLETE_REPOSITORY` authoritative asset state aggregation and explicit unavailable queue/provider signals | Live object-store and broker evidence remains deployment evidence |
| `/operations-center/requests` | `/platform/operations/requests` and assign/patch/transition commands | `COMPLETE_REPOSITORY` cursor, optimistic concurrency, assignment, priority and lifecycle controls | Production SLA alert routing remains operational evidence |
| `/operations-center/risk-analysis` | `/platform/operations/risks` plus action/comment/evidence/accept/resolve | `COMPLETE_REPOSITORY` deployment-risk extension with READY-only evidence and governed decisions | Independent risk authority assignment remains operational policy evidence |
| `/operations-center/search` | `/search/jobs`, `/search/reindex` | `COMPLETE_REPOSITORY` governed idempotent step-up reindex with explicit dispatch failure | Live search worker evidence remains deployment evidence |
| `/operations-center/venue-readiness` | `/platform/operations/venue/*` and event-scoped device credential APIs | `COMPLETE_REPOSITORY` event-specific supplier, attestation, contact, incident, device and sync isolation | Supplier/device live attestations remain operational evidence |

CRM and billing support reads require `organization_id` plus `X-Support-Reason`, execute under transaction-local tenant context, and write sensitive `PLATFORM_SUPPORT_DATA_READ` audit events. CRM and billing mutations require `Idempotency-Key`, current versions where applicable, audited business reasons, and privileged step-up dependencies. Billing lifecycle writes also append financial-audit records and preserve activation snapshots during commercial restriction propagation. Unbounded cross-tenant runtime lists remain prohibited.

Activation runtime reads are snapshot-only. The inspector exposes the current snapshot pointer, append-only version history, canonical checksum, feature/limit source, UsageService strategy, used and remaining allowance, transfer policy, grant consumption, and denial reason. Missing current snapshots return `SNAPSHOT_REQUIRED`; ordinary requests never rebuild entitlements from plan tables.

Activation transfer and deactivation admin commands require explicit tenant support scope, recent step-up, an idempotency key, and an audit reason. They delegate to the authoritative activation service so meaningful-usage transfer policy, grant-consumption lineage, snapshot creation, continuity behavior, and replay semantics cannot diverge in the Command Center.

Support administration requires explicit organization support scope and transaction-local tenant context. Lifecycle, assignment and escalation mutations require step-up, current version and reason; internal notes are excluded from tenant-facing comment reads. Access-review decisions use the same scoped boundary, and break-glass requests reject self-approval without directly granting roles or RLS bypass.

Support attachments use presigned direct upload into a tenant-namespaced private bucket. Completion verifies authoritative object size and content type, moves the asset to `QUARANTINED`, creates a pending scan record, and hands work to the shared malware scanner. Download is denied until the file lifecycle reaches `READY`; request replay, cross-tenant concealment, mismatch failure, and audit behavior have backend coverage.

Organization invoice settlement uses `billing.subscription_transactions` as the commercial payment ledger. Participant registration payments remain a separate registration-domain concern. Invoice and commercial-payment reads require audited tenant scope; payment recording, reconciliation, reversal, and invoice voiding require step-up, idempotency, reason capture, version checks, security audit, and financial audit. Provider events may update this ledger only through a later verified webhook workflow.

Invoice PDFs are generated from immutable version-bound snapshots stored with durable `audit.data_exports` records. The request is step-up protected and idempotent, worker output is stored in the tenant namespace of the private exports bucket, status is observable, and only short-lived audited downloads are returned. Ordinary UI code never synthesizes invoice totals or browser-only PDF content.

The capability inventory currently detects duplicate declarations for platform `/audit` and platform `/impersonation-logs`; route ownership and mounted-path uniqueness must be resolved before those contracts are accepted. The duplicate presentation poster `/batch-status` declaration was removed, and generated OpenAPI operation IDs now validate as unique.

## Acceptance restrictions

- A page cannot call provider APIs directly.
- A page cannot infer authorization from hidden controls.
- A failed request cannot fall back to sample records in production.
- A mutation requires a domain-specific hook, server-side permission, cache invalidation, and audit evidence.
- Tenant, event, and resource identifiers are verified by the backend and never trusted from headers alone.
- Cross-tenant administrative reads require explicit platform permission, reason or purpose where policy requires it, access audit, bounded pagination, and existence-safe errors.
