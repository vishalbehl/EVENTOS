# Command Center Phase 3 Change Manifest

Status: ACTIVE GUARDRAIL

Latest durable commercial-export evidence (2026-07-14): `/reports/exports` no longer creates sample browser files or fake success messages. Super Admin requests are organization-scoped, reasoned, idempotent, persisted in the RLS-protected export ledger, dispatched to the imports queue, rendered by workers as XLSX/CSV/PDF from authoritative records, and downloaded only through audited short-lived object-storage links. Celery registration is verified. Backend API tests pass (3), worker report tests pass (10), frontend export tests pass (2), the complete frontend suite passes (23), targeted lint passes, TypeScript passes, and Python compilation passes. Live broker/object-storage E2E and manual accessibility evidence remain before the route can be `COMPLETE`.

Latest quote-domain evidence (2026-07-13): quote persistence, immutable revisions, version-bound approval, proposal snapshots, and proposal sharing are tenant-RLS protected. Approved quotes convert idempotently to the existing CRM proposal aggregate; durable export records queue ReportLab PDF generation and gate audited downloads. Step-up-protected administrators can issue and revoke expiring proposal links. Signed bearer capabilities are stored only as hashes, travel to the public API through an authorization header, and remain in the browser URL fragment so server URL logs never receive them. Public views create access evidence; terminal client decisions are idempotent, auditable, proposal-locking, and revoke competing links. Backend commercial tests pass (6), worker PDF tests pass (7), frontend tests pass (13), TypeScript passes, live route checks return public page `200` and missing share authorization `401`, and Alembic is upgraded to `proposal_sharing_0630`. Regulated e-signature identity proofing, proposal amendment/comparison, cancellation, delegation, and configurable multi-step approval policy remain outside this completed workflow slice.

Purpose: allow larger Phase 3 implementation batches without mixing unrelated work, fake UI completion, or broken backend contracts.

This manifest governs Phase 3 Critical Defect Closure for Command Center. A change is in scope only if it fixes wrong-domain hooks, fake production behavior, unsafe admin mutations, missing authorization/audit behavior, or explicit incomplete contract handling for the routes listed below.

## Batch Scope

### Primary routes

| Route | Current Phase 3 focus | Allowed state after batch |
|---|---|---|
| `/identity-security/users` | High-risk user actions, impersonation, session revocation, MFA reset, export truthfulness | Real API-backed actions with confirmation/reason/audit, or disabled with explicit unavailable reason |
| `/identity-security/roles` | Role catalogue and role mutation correctness | Real role APIs only; no copied global-user behavior |
| `/identity-security/permissions` | Permission catalogue and matrix correctness | Real permission APIs only; no copied global-user behavior |
| `/identity-security/audit-logs` | Audit pagination, integrity metadata, export truthfulness | Server-backed read path; no fake tamper/hash/export claims |
| `/organizations/[orgId]` | Org detail, billing, users, domains, status, settings, audit, unsafe actions | Real source-of-truth data where APIs exist; explicit unavailable states where contracts are missing |
| `/support-center/announcements` | Announcement and maintenance-window correctness | Real communications APIs only; no ticket-hook substitution |
| `/support-center/announcements/[ticketId]` | Announcement detail correctness | Real communications APIs only; legacy URL may be supported but must not imply ticket semantics |
| `/support-center/tickets` | Support ticket board truthfulness | Real support tickets only; no seeded demo tickets or fabricated SLA metrics |
| `/support-center/tickets/[ticketId]` | Support ticket workspace truthfulness | Real support ticket/comment APIs only; no fallback ticket, mock reply, or local-only triage mutation |
| `/operations-center/jobs` | Jobs monitor endpoint correctness | Real aggregate over existing domain job tables, or explicit unavailable sources; no fake empty job pool |
| `/operations-center/requests` | Operations request desk truthfulness | Explicit unavailable/read-only until Super Admin-safe global service-request contract exists |
| `/operations-center` | Operations aggregate truthfulness | Explicit unavailable until all aggregate metrics have authoritative sources and degraded-source reporting |
| `/operations-center/database` | Database telemetry truthfulness | Real current snapshots only; no generated historical metrics or fabricated query fields |
| `/operations-center/storage` | Storage and queue telemetry truthfulness | Real fail-closed queue depths; storage unavailable until authoritative telemetry exists |
| `/operations-center/search` | Search operations truthfulness | Real job history; privileged reindex disabled until reason, idempotency, queue acknowledgement, and audit exist |
| `/operations-center/projects` | Operations project truthfulness | Explicit unavailable until platform-admin aggregate, tenant ownership, lifecycle, and audit contracts exist |
| `/operations-center/resources` | Internal/supplier resource truthfulness | Explicit unavailable until event-scoped supplier/resource, privacy, authorization, and audit contracts exist |
| `/operations-center/risk-analysis` | Risk and emergency-action truthfulness | Explicit unavailable until durable risk records and step-up-protected audited commands exist |
| `/operations-center/venue-readiness` | Outsourced venue readiness truthfulness | Explicit unavailable until supplier attestations, machine identity, sync, evidence, and isolation contracts exist |
| `/operations-center/deployments` | Deployment/runbook truthfulness | Explicit unavailable until tenant-safe durable execution, approval, rollback, and audit contracts exist |
| `/ai-workspace/agents` | AI agent workspace truthfulness | Explicit unavailable until durable agent registry, policy, run, approval, and audit contracts exist |
| `/ai-workspace/prompt-library` | Prompt library truthfulness | Explicit unavailable until prompt CRUD, versioning, scope, approval, and audit contracts exist |
| `/super-admin/platform/templates` | Platform template catalogue truthfulness | Explicit unavailable until persisted template lifecycle, versioning, install, and audit contracts exist |
| `/super-admin/platform/templates/marketplace` | Template marketplace truthfulness | Explicit unavailable until listing, install, purchase, compatibility, and audit contracts exist |
| `/super-admin/platform/blueprints` | Blueprint catalogue truthfulness | Explicit unavailable until blueprint install jobs, tenant scoping, rollback, and audit contracts exist |
| `/super-admin/platform/themes` | Theme and design-token truthfulness | Explicit unavailable until versioned theme lifecycle, publish, rollback, assignment, and audit contracts exist |
| `/super-admin/platform/components` | Builder component-schema truthfulness | Explicit unavailable until persisted schema lifecycle, compatibility, dependency, and audit contracts exist |
| `/super-admin/builder/sites*` | Builder site admin truthfulness | Explicit unavailable until persisted site, domain, SEO, navigation, editor, blog, publish, and audit contracts exist |
| Proposal preview and quote revision comparison pages | Proposal/quote truthfulness | No fake PDF previews, fake share success, or fabricated comparison rows |
| `/developer-platform/api-keys` | Rate-limit policy truthfulness | Explicit unavailable until persisted rate-limit policy and usage contracts exist |
| `/developer-platform/apis` | API analytics and API-key truthfulness | Explicit unavailable until telemetry, key lifecycle, and revocation contracts are complete |
| `/developer-platform/webhooks` | Webhook delivery truthfulness | Explicit unavailable until webhook subscription, delivery, replay, DLQ, and audit contracts exist |
| `/developer-platform/integrations` | Integration health truthfulness | Explicit unavailable until provider credential, health-check, rotation, and audit contracts exist |
| `/developer-platform/logs` | Provider/security log truthfulness | Explicit unavailable until immutable provider-log, verification, export, and audit contracts exist |
| `/platform-settings/general` | General configuration and secret truthfulness | Explicit unavailable until runtime enforcement, versioning, rollback, and secret-manager contracts exist |
| `/platform-settings/branding` | Branding-domain correctness | Explicit unavailable; copied general/SMTP controls removed until a branding lifecycle exists |
| `/platform-settings/localization` | Localization-domain correctness | Explicit unavailable; copied general/SMTP controls removed until locale/translation lifecycle exists |
| `/platform-settings/authentication` | Security-policy enforcement truthfulness | Explicit unavailable until stored policy is consumed and step-up/version/rollback/audit exist |
| `/platform-settings/notifications` | Notification-template truthfulness | Explicit unavailable until durable template, preview, publish, test-delivery, and audit contracts exist |
| `/finance/invoices` | Invoice action truthfulness | Real ledger and audited void action; PDF and reminder controls disabled until durable contracts exist |
| `/business/pricing/vendor-pricing` | Supplier rate-card truthfulness | Explicit unavailable until event-scoped supplier pricing, effective dates, authorization, and audit contracts exist |
| `/business/pricing/margin-rules` | Commercial rule mutation safety | Explicit unavailable until rules have normalized persistence, versioning, reason capture, and immutable audit coverage |
| `/business/sales/quotes/[id]/cost-breakdown` | Quote total and action truthfulness | Explicit unavailable until a canonical persisted cost-breakdown API and durable duplicate, PDF, and dispatch operations exist |
| `/business/sales/proposals/[id]/version-history` | Proposal version truthfulness | Explicit unavailable until immutable persisted versions, comparison, generation, download, and audit contracts exist |
| `/business/sales/service-requests/[id]/requirements` | Requirements and attachment truthfulness | Explicit unavailable until a Super Admin-safe requirements, remarks, file-upload, export, authorization, and audit contract exists |
| `/business/sales/quotes/[id]/approval` | Quote approval truthfulness | Explicit unavailable until persisted approval workflow, assignment, decision reason, step-up, audit, and concurrency contracts exist |
| `/operations-center/analytics` | Operational analytics truthfulness | Explicit unavailable until authoritative financial, SLA, deployment, supplier, and telemetry projections exist |
| `/applications/feature-flags` | Control-domain separation | Explicit unavailable; tenant entitlements must not be presented as release flags or operational kill switches |
| `/applications/registry` | Application registry truthfulness | Explicit unavailable until persisted releases, environments, ownership, health, and deployment evidence exist |
| `/ai-workspace/dashboard` | AI telemetry truthfulness | Explicit unavailable until usage, cost, provider, run, and failure ledgers are authoritative |
| `/ai-workspace/models` | AI model administration truthfulness | Explicit unavailable until provider credentials, model versions, routing policy, health, cost, and audit contracts exist |
| `/ai-workspace/automation` | AI automation truthfulness | Explicit unavailable until durable rules, approval gates, executions, limits, and audit contracts exist |
| `/` | Privileged authentication truthfulness | Real password plus TOTP login; no embedded credentials, decorative MFA, delayed fake checkpoint, or unauthorized token persistence |
| `/dashboard/overview` | Landing metric and health truthfulness | Real aggregate data only; no unsupported NPS or whole-platform health/freshness claims |
| `/dashboard/live-activity` | Security event truthfulness | One canonical persisted security-event contract; no fabricated actor, organization, risk score, or duplicate route |
| `/dashboard/platform-health` | Dependency health truthfulness | Current verified snapshots only; no invented uptime, trends, Redis diagnostics, WebSocket state, or healthy fallback |
| `/business/sales/service-requests` | Service-request board contract correctness | Explicit KPI and Kanban routes before UUID detail routes; real persisted fields and platform-admin event scoping only |
| `/business/sales/quotes/create` | Quote creation route truthfulness | Route must exist but remain disabled until persisted quote, pricing, approval, audit, and idempotency contracts exist |
| `/business/sales/quotes/[id]/edit` | Quote editing truthfulness | Do not expose the legacy local calculation form against nonexistent quote APIs |
| `/business/sales/quotes` | Persisted quote catalogue | Real tenant-scoped quote records, server-authoritative totals, lifecycle state, and version metadata |
| Commercial quote contract | Quote persistence and deterministic pricing | Commercial schema owns quote, line-item, revision, and idempotency data; totals are calculated only by the backend |
| Quote proposal documents | Approved quote conversion and PDF evidence | Existing CRM proposal aggregate is extended; immutable versions copy the approved quote snapshot; durable exports own document generation and download state |

### Secondary routes for scan-only review

These may be inspected during Phase 3 but must not be modified unless added to this manifest first:

| Route group | Reason |
|---|---|
| `/operations-center/*` | Phase 5 operations completion |
| `/developer-platform/*` | Phase 6 developer platform |
| `/ai-workspace/*` | Phase 7 AI workspace |
| `/super-admin/platform/*` | Phase 9 builder/templates/marketplace |

## Allowed Files

Frontend:

- `apps/cloud/command-center/app/(dashboard)/identity-security/users/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/identity-security/roles/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/identity-security/permissions/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/identity-security/audit-logs/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/organizations/[orgId]/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/support-center/announcements/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/support-center/announcements/[ticketId]/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/support-center/tickets/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/support-center/tickets/[ticketId]/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/operations-center/jobs/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/operations-center/requests/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/operations-center/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/operations-center/database/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/operations-center/storage/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/operations-center/search/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/operations-center/projects/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/operations-center/resources/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/operations-center/risk-analysis/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/operations-center/venue-readiness/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/operations-center/deployments/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/ai-workspace/agents/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/ai-workspace/prompt-library/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/business/sales/proposals/[id]/preview/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/business/sales/quotes/[id]/revisions/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/developer-platform/api-keys/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/developer-platform/apis/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/developer-platform/webhooks/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/developer-platform/integrations/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/developer-platform/logs/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/platform-settings/general/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/platform-settings/branding/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/platform-settings/localization/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/platform-settings/authentication/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/platform-settings/notifications/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/finance/invoices/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/business/pricing/vendor-pricing/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/business/pricing/margin-rules/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/business/sales/quotes/[id]/cost-breakdown/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/business/sales/proposals/[id]/version-history/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/business/sales/service-requests/[id]/requirements/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/business/sales/quotes/[id]/approval/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/operations-center/analytics/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/applications/feature-flags/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/applications/registry/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/ai-workspace/dashboard/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/ai-workspace/models/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/ai-workspace/automation/page.tsx`
- `apps/cloud/command-center/app/(auth)/page.tsx`
- `apps/cloud/command-center/services/auth-service.ts`
- `apps/cloud/command-center/lib/api-client.ts`
- `apps/cloud/command-center/lib/api-client.test.ts`
- `apps/cloud/command-center/store/use-auth-store.ts`
- `apps/cloud/command-center/e2e/auth-entry.spec.ts`
- `apps/cloud/command-center/app/(dashboard)/dashboard/overview/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/dashboard/live-activity/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/dashboard/platform-health/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/business/sales/service-requests/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/business/sales/quotes/create/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/business/sales/quotes/[id]/edit/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/business/sales/quotes/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/business/sales/proposals/[id]/preview/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/business/sales/proposals/[id]/version-history/page.tsx`
- `apps/cloud/command-center/components/quotes/QuoteForm.tsx`
- `apps/cloud/command-center/components/proposals/ProposalForm.tsx`
- `apps/cloud/command-center/app/(dashboard)/business/sales/proposals/create/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/business/sales/proposals/[id]/edit/page.tsx`
- `apps/cloud/command-center/app/(dashboard)/business/sales/proposals/[id]/documents/page.tsx`
- Auth service and auth store tests directly covering privileged login and persistence.
- `apps/cloud/command-center/app/super-admin/platform/templates/page.tsx`
- `apps/cloud/command-center/app/super-admin/platform/templates/marketplace/page.tsx`
- `apps/cloud/command-center/app/super-admin/platform/blueprints/page.tsx`
- `apps/cloud/command-center/app/super-admin/platform/themes/page.tsx`
- `apps/cloud/command-center/app/super-admin/platform/components/page.tsx`
- `apps/cloud/command-center/app/super-admin/builder/sites/page.tsx`
- `apps/cloud/command-center/app/super-admin/builder/sites/[id]/blog/page.tsx`
- `apps/cloud/command-center/app/super-admin/builder/sites/[id]/domains/page.tsx`
- `apps/cloud/command-center/app/super-admin/builder/sites/[id]/editor/page.tsx`
- `apps/cloud/command-center/app/super-admin/builder/sites/[id]/navigation/page.tsx`
- `apps/cloud/command-center/app/super-admin/builder/sites/[id]/seo/page.tsx`
- `apps/cloud/command-center/services/super-admin-service.ts`
- `apps/cloud/command-center/app/proposal-share/page.tsx`
- `apps/cloud/command-center/services/platform-access-service.ts`
- `apps/cloud/command-center/services/platform-communications-service.ts`
- `apps/cloud/command-center/components/super-admin/ui/ConfirmDestructiveAction.tsx`
- `apps/cloud/command-center/components/super-admin/ui/UnavailableRouteState.tsx`
- Existing tests for the files above, or new tests directly covering them.

Backend:

- `services/backend/app/modules/platform/router.py`
- `services/backend/app/modules/platform_health/router.py`
- `services/backend/app/modules/technology_services/router.py`
- `services/backend/app/modules/technology_services/schemas.py`
- `services/backend/app/modules/platform/communications_router.py`
- `services/backend/app/modules/platform/support_router.py`
- `services/backend/app/modules/platform/roles/router.py`
- `services/backend/app/modules/platform/roles/schemas.py`
- `services/backend/app/modules/platform/roles/service.py`
- `services/backend/app/modules/platform/permissions/router.py`
- `services/backend/app/modules/platform/permissions/schemas.py`
- `services/backend/app/modules/platform/permissions/service.py`
- `services/backend/app/routers/__init__.py`
- `services/backend/app/config.py`
- `services/backend/app/modules/rbac/routers/global_settings.py`
- `services/backend/app/modules/rbac/schemas/settings.py`
- `services/backend/app/modules/platform/models/system_setting.py`
- `services/backend/app/database.py`
- `services/backend/app/models/__init__.py`
- `services/backend/app/modules/commercial/models.py`
- `services/backend/app/modules/commercial/quote_schemas.py`
- `services/backend/app/modules/commercial/quote_service.py`
- `services/backend/app/modules/commercial/quotes_router.py`
- `services/backend/alembic/versions/*commercial_quotes*.py`
- `services/backend/alembic/versions/*proposal_sharing*.py`
- `services/backend/tests/test_commercial_quotes.py`
- `services/backend/app/modules/crm/models/crm_domain_tables.py`
- `services/backend/app/modules/audit/models/audit_domain_tables.py`
- `services/workers/tasks/report_tasks.py`
- `services/workers/tests/test_report_tasks.py`
- `services/workers/requirements.txt`
- `services/backend/tests/test_global_settings.py`
- Backend tests directly covering platform access, communications, audit, organization, user-admin, operations jobs, or security action behavior.

Governance:

- `governance/command-center/*`

## Do-Not-Touch List

Do not modify these during Phase 3 batches unless the user explicitly approves a manifest expansion:

- `docs/**` deletion/restoration work.
- Generated TypeScript build info files: `**/tsconfig.tsbuildinfo`.
- Organizer portal, venue registration, venue server, workers, and backend modules outside the allowed backend list.
- Terraform and cloud infrastructure files.
- Alembic migrations, unless the batch introduces a required schema change and includes migration/test evidence.
- Broad formatting-only rewrites.
- Git history operations, resets, checkout, or destructive cleanup.

## Contract Rules

Every route change must satisfy one of these outcomes:

1. Real contract wired:
   - backend endpoint exists,
   - DTO shape is typed or validated,
   - server-side permission is enforced,
   - mutation writes audit evidence where applicable,
   - UI handles loading, empty, error, denied, success, and degraded states.

2. Explicitly unavailable:
   - UI control is disabled,
   - label says unavailable/not wired,
   - tooltip or helper text states the missing contract,
   - no fake success toast, fake job, fake PDF, fake export, fake hash, fake total, or fake provider state.

3. Read-only truthful:
   - page displays real fetched data,
   - missing fields render as `Not recorded`, `Unknown`, or `Not configured`,
   - no fabricated fallback values.

## Latest Mock Sweep Findings

Phase 3 support-ticket sweep result:

- `/support-center/tickets` no longer seeds demo tickets when the backend returns no data.
- `/support-center/tickets/[ticketId]` no longer fabricates a fallback ticket for unknown IDs.
- Ticket replies now use the real comment API only; the mock local comment success path was removed.
- Status, priority, assignment, escalation, and resolve controls are read-only/unavailable until real triage mutation APIs exist.
- Backend support ticket creation now persists `description` so the required model field is not silently omitted.

Remaining static/mock areas found by the broad scan but not completed in this support-ticket batch:

- `/ai-workspace/agents` and `/ai-workspace/prompt-library` contain mock-filtering comments and incomplete AI workspace contracts.
- `/super-admin/platform/templates`, `/super-admin/platform/templates/marketplace`, and `/super-admin/platform/blueprints` contain mock/static catalog data.
- `/super-admin/builder/sites*` contains local-only success toasts and simulated domain verification behavior.
- Proposal/quote preview and revision comparison pages contain mock preview/comparison framing.

Phase 3 operations-request sweep result:

- `/operations-center/requests` no longer renders `mockRequests`, fake quote pricing, or local-only approve/reject transitions.
- The route is explicitly unavailable until a Super Admin-safe service-request aggregate API, authorization contract, audit coverage, and durable quote dispatch workflow exist.
- Existing event-scoped organizer service-request APIs remain separate and were not incorrectly wired into this global Command Center route.

Phase 3 builder, AI, template, and proposal/quote sweep result:

- `/ai-workspace/agents` and `/ai-workspace/prompt-library` no longer expose local prompt creation forms, star/edit/delete icons, or incomplete AI workspace controls.
- `/super-admin/platform/templates`, `/super-admin/platform/templates/marketplace`, and `/super-admin/platform/blueprints` no longer render static catalogues, fake purchase/install flows, or fake success toasts.
- `/super-admin/builder/sites*` no longer performs local-only redirect/domain/blog/navigation/editor/SEO mutations or simulated DNS/publish success.
- Proposal preview no longer renders a mock PDF viewer, fake page map, or fake download/print/share controls.
- Quote revision comparison no longer renders fabricated category-delta rows; revision management remains limited to real revision APIs.

Phase 3 developer-platform sweep result:

- `/developer-platform/api-keys` no longer renders hard-coded rate-limit rules or fake refresh/modify controls.
- `/developer-platform/apis` no longer falls back to mock API keys, fake latency/status charts, or simulated key revocation.
- `/developer-platform/webhooks` no longer renders static delivery rows or fake redelivery success.
- `/developer-platform/integrations` no longer renders static provider health, simulated checks, or randomized latency success.
- `/developer-platform/logs` no longer simulates audit tamper detection or cryptographic verification.

Phase 3 platform theme and component sweep result:

- `/super-admin/platform/themes` no longer creates browser-only design tokens or claims theme settings were saved to the database.
- `/super-admin/platform/themes` now identifies the missing versioned registry, preview/publish, rollback, authorization, cache invalidation, and audit contracts.
- `/super-admin/platform/components` no longer renders a hard-coded component catalogue or reports fake JSON schema updates.
- `/super-admin/platform/components` now identifies the missing schema validation, versioning, compatibility, dependency, lifecycle, and audit contracts.

Phase 3 Operations Center telemetry and control sweep result:

- `/operations-center` no longer renders hard-coded project, risk, SLA, staffing, uptime, printer, incident, or heartbeat state.
- `/operations-center/database` now renders only real PostgreSQL snapshots; generated connection history, transaction charts, PIDs, and query state were removed.
- Database telemetry explicitly reports whether `pg_stat_statements` data is available instead of silently implying an empty result.
- `/operations-center/storage` now uses the real queue-depth contract and identifies storage telemetry as unavailable; all hard-coded storage totals, trends, workers, rates, and queue health were removed.
- Queue telemetry now returns a dependency error when Redis is unavailable instead of reporting every queue as healthy with zero depth.
- `/operations-center/search` remains a real persisted job-history view; manual reindex is disabled until its privileged mutation gains reason, idempotency, queue acknowledgement, and audit coverage.
- `/operations-center/projects`, `/resources`, `/risk-analysis`, and `/venue-readiness` no longer present fabricated operational records or execute browser-only control actions.
- `/operations-center/deployments` no longer simulates runbook execution, terminal output, secure status, environment placement, or successful commands in browser state.
- Venue readiness now documents the outsourced supplier boundary: suppliers are event-scoped, retain hardware ownership, and require expiring machine identities, attestations, synchronization evidence, and isolation tests.

Phase 3 platform-settings sweep result:

- `/platform-settings/branding` and `/localization` no longer render copied general, SMTP, Slack, timezone, maintenance, or currency controls under the wrong domains.
- `/platform-settings/notifications` no longer exposes hard-coded templates, fake save success, or a simulated test-email dispatch.
- `/platform-settings/authentication` no longer implies that persisted MFA, lockout, timeout, or IP-allowlist values are enforced when no runtime consumer exists.
- `/platform-settings/general` no longer exposes provider secrets or unenforced maintenance/broadcast controls.
- Global settings reads now require Super Admin authorization and return only secret-configured indicators, never SMTP passwords or webhook URLs.
- Global settings updates require a reason, emit sanitized audit evidence, and reject provider-secret writes until a dedicated secret-management workflow exists.
- System-setting debug representations no longer include raw values that could leak credentials into logs.

Phase 3 commercial and finance truthfulness sweep result:

- `/finance/invoices` retains its real server-backed ledger and now uses the existing reason-gated, audited void endpoint instead of a simulated timeout.
- Invoice PDF and reminder controls are visibly disabled until authorization-gated export and durable communication-job contracts exist.
- Invoice void completion invalidates the actual `admin-invoices` query family used by the ledger.
- `/business/pricing/vendor-pricing` no longer presents hard-coded suppliers or static rate cards; it documents the event-scoped outsourced-supplier contract required before enablement.
- `/business/pricing/margin-rules` no longer exposes unaudited financial-rule mutations backed by free-form description metadata.
- `/business/sales/quotes/[id]/cost-breakdown` no longer fabricates logistics, GST, line margins, totals, organization/event names, duplicate success, PDF output, or dispatch behavior.
- Quote cost breakdown remains disabled until its currently missing backend endpoint is replaced by a typed canonical persisted calculation contract.

Phase 3 workflow, requirements, and analytics truthfulness sweep result:

- Proposal version history no longer sends random change counts or exposes fake compare/download behavior; its frontend-only endpoint assumptions are explicitly documented as missing.
- Service-request requirements no longer creates simulated attachments with random sizes, exposes unauthorized download controls, or generates ungoverned browser-only exports.
- The existing organizer service-request API remains event-scoped and is not incorrectly treated as a global Super Admin requirements, remarks, or attachment contract.
- Quote approval no longer presents fabricated stakeholders, elapsed time, default approval evidence, workflow export, or nonexistent approval APIs.
- Operations Analytics no longer reports hard-coded revenue, margin, COGS, SLA, deployment, supplier-cost, AI insight, or report-export data.
- The authoritative feature matrix now classifies all four routes as `MISSING_API` with explicit unavailable UI evidence.

Phase 3 application-control and AI truthfulness sweep result:

- `/applications/feature-flags` no longer mutates tenant commercial entitlements while presenting them as deployment flags; release flags, experiments, kill switches, and entitlements remain separate control domains.
- `/applications/registry` no longer renders a hard-coded application catalogue, static versions, or an evidence-free always-online status.
- `/ai-workspace/dashboard` no longer treats an unmetered source as authoritative zero usage or renders unsupported request, token, cost, and success-rate charts.
- `/ai-workspace/models` no longer presents static provider/model rows as active configurations or stores routing and fallback controls only in browser state.
- `/ai-workspace/automation` now states the durable rule, execution, approval, limit, and audit contracts required before enablement.
- Placeholder platform application, AI dashboard, prompt, and model endpoints now remain Super Admin-only but fail explicitly with `501` instead of returning fabricated or ambiguous data.
- Backend integration tests cover both explicit unavailability and non-admin denial for all four placeholder endpoints.

Phase 3 privileged-authentication truthfulness sweep result:

- The Command Center login no longer embeds development credentials or exposes a production "Fast Login" control.
- The decorative MFA synchronization checkpoint was removed; the page now submits the real six-digit TOTP code required by privileged backend authentication.
- Successful verified administrators enter immediately through `router.replace`; no fake two-second security delay remains.
- Valid non-administrator identities are rejected before their tokens enter the Command Center store, and the issued session is revoked through its bounded access token.
- Explicit authorization headers are preserved by the API client so bounded revocation cannot be overwritten by stale local authentication.
- Sessions without "remember me" retain credentials only in memory; persisted storage contains no user or token material.
- Active impersonation tokens and identities are never persisted over the remembered administrator session.
- Unit tests cover MFA submission, administrator session establishment, non-admin revocation, explicit authorization, transient sessions, and impersonation persistence; the login E2E contract now requires the real MFA field and proves Fast Login is absent.

## High-Risk Mutation Rules

The following actions require confirmation and reason capture:

- impersonation,
- user activation/deactivation,
- session revocation / force logout,
- MFA/2FA reset,
- organization suspension/reactivation,
- billing override,
- feature or entitlement override,
- domain deletion,
- audit export,
- data export,
- destructive announcement or maintenance-window changes.

If backend reason capture is not available, either add it in the same batch or leave the control disabled.

## Banned Phase 3 Patterns

New or remaining production code must not contain:

- wrong-domain hooks, such as using support ticket APIs for announcements,
- fake success toasts for mutations that do not call a backend,
- hard-coded platform totals,
- fake audit hashes or fake tamper detection,
- fake invoice/payment status fallbacks,
- fake export/PDF/download buttons,
- one-click destructive actions,
- unreasoned high-risk admin actions,
- direct token/localStorage impersonation swaps,
- `window.open` without `noopener,noreferrer`,
- mock arrays used as production data,
- silent fallback to mock data after API failure.

## Verification Gates

Run after every Phase 3 batch:

```powershell
npm.cmd --prefix apps/cloud/command-center run type-check
npm.cmd --prefix apps/cloud/command-center run test
python -m py_compile services/backend/app/modules/platform/router.py services/backend/app/modules/platform/communications_router.py services/backend/app/routers/__init__.py
git diff --check -- <touched-files>
```

Run focused scans for touched files:

```powershell
Select-String -LiteralPath <touched-files> -SimpleMatch -Pattern `
  "mock", "fake success", "hardcoded", "PAID`"", "sha256_e3b", "127.0.0.1", `
  "Administrative support session", "window.open(`"/`", `"_blank`")", "localStorage.setItem(`"token`""
```

Acceptable scan hits:

- test files,
- governance documentation,
- explicit unavailable text,
- existing unrelated legacy text outside the touched scope.

## Batch Report Template

Each Phase 3 batch report must include:

- Manifest scope used.
- Files changed.
- Backend contracts added or changed.
- UI behavior changed.
- Disabled/unavailable controls and why.
- Audit/reason capture coverage.
- Verification commands and results.
- Residual risks.
- Whether any file had pre-existing unrelated dirty changes.

## Manifest Expansion Rule

If implementation requires a file outside `Allowed Files`, pause and update this manifest first with:

- file path,
- reason it is needed,
- expected contract,
- verification command,
- rollback/remediation note.

Do not silently expand scope during a large batch.

## Dashboard Truthfulness Batch Result

- `/dashboard/overview` now describes its health banner as database and Redis checks, uses the backend check timestamp, removes unsupported NPS, fixes support/audit navigation, and uses semantic interactive controls.
- `/dashboard/live-activity` now consumes one persisted `identity.security_events` contract with authoritative 24-hour severity totals, seven-day trend, filters, and pagination. Fabricated actor, organization, description, and risk values were removed.
- `/dashboard/platform-health` now renders only current dependency probes and PostgreSQL statistics. Invented uptime, sparklines, WebSocket state, Redis metrics, failover actions, and compliance claims were removed.
- `/platform/health` now has one route implementation backed by `collect_platform_health`; configuration-only email and object-storage checks are `unverified`, and collector failure returns `503` rather than all-healthy fallback data.
- Historical uptime, Redis diagnostics, WebSocket health, and incident automation remain explicitly unavailable until authoritative collectors and retained metrics exist.
- Security event and health contracts have direct backend integration coverage; browser journey and manual accessibility evidence remain Phase 3 exit work.

## Service Request Projection Repair Result

- Added explicit `/service-requests/kpi-strip` and `/service-requests/kanban-columns` routes before `/{request_id}`, eliminating UUID validation capture for both static paths.
- Platform Super Admin reads and creates now require an explicit selected `organization_id` and switch tenant context transaction-locally through `TenantContextGuard`; organizers cannot switch organizations.
- KPI output is derived from persisted request statuses and makes no unsupported percentage-change claim.
- Kanban cards expose only persisted request number, title, priority, type, status, and timestamps. Invented crew, estimated value, project dates, organization labels, and browser-only assignment fields were removed.
- Regression coverage verifies exact static routes, status movement, persisted response fields, and cross-tenant `404` behavior.

## Quote Route Closure Result

- `/business/sales/quotes/create` now resolves to an explicit production-disabled state instead of a Next.js `404`.
- `/business/sales/quotes/[id]/edit` no longer exposes the legacy `QuoteForm` against nonexistent quote APIs.
- The legacy form's hard-coded logistics, contingency, management fee, tax assumptions, mutable margins, and unrelated success navigation are not presented as working commercial behavior.
- Quote creation remains blocked until a persisted, versioned quote aggregate and canonical server-side pricing engine are implemented.
