# Command Center Current Phase Status

Assessment date: 2026-07-14

## Scoring Rules

This status is evidence-based rather than file-count based. A visible page, router, or explicit unavailable state is useful progress, but it is not a completed feature until the source of truth, authorization, audit, operational states, accessibility, and automated journey evidence satisfy the project definition of done.

Route-level weighting used for the current baseline:

| Status | Weight |
|---|---:|
| `COMPLETE` | 100% |
| `PARTIAL` | 50% |
| `MOCKED` | 15% |
| `MISSING_API` | 5% |
| `BROKEN` or `MISSING_PAGE` | 0% |

## Current Completion Baseline

- Overall production-ready estimate: **39%**.
- Strict route-level weighted score after durable export completion: **30.7%** across 101 inventoried routes.
- Current worktree review surface: 126 tracked files changed and 48 untracked entries. Generated artifacts remain excluded from acceptance evidence.
- Frontend evidence: TypeScript, targeted ESLint, and all 24 Vitest tests pass. CRM lifecycle controls use the shared support scope, confirmation, API client, and query invalidation contracts.
- Backend evidence for CRM, billing-admin support reads, and commercial exports: 10 focused integration tests pass. CRM coverage includes mandatory scope/reason, non-admin denial, tenant isolation, cursor behavior, idempotency replay/conflict, optimistic concurrency, archive/restore, dependency protection, cross-tenant reference rejection, and sensitive mutation audit records.
- Migration evidence: Python compilation passes and Alembic reports one head, `crm_lifecycle_0640`.

## Phase Status

| Phase | Completion | Completed evidence | Remaining gate |
|---|---:|---|---|
| 0 - Completion Baseline | 88% | Route, backend capability, dependency, navigation, component, contract, and mock inventories exist | Add new routes, refresh stale statuses, and attach acceptance evidence |
| 1 - Design System and Shell | 68% | Premium design artifacts and shared page/state components exist | Complete app-wide adoption, responsive review, theme consistency, catalogue, and WCAG verification |
| 2 - Frontend Foundation | 76% | Authenticated API client, scoped query keys, error mapping, Vitest, ESLint, and initial E2E foundations exist | Typed schema generation, complete invalidation/pagination contracts, CI build, Playwright, and axe gates |
| 3 - Critical Defect Closure | 60% | Many fake operations now fail truthfully; auth and selected admin contracts improved | Users, roles, permissions, organizations, support, audit pagination tests, step-up, and audit closure |
| 4 - Commercial, Subscription, and Finance | 50% | Quote persistence, approval, immutable proposals, PDF jobs, secure sharing, client decisions, durable commercial exports, and tenant-scoped CRM account/contact/lead/opportunity lifecycle mutations | CRM activities/tasks/notes/conversion, proposal amendments, accepted-proposal conversion, subscriptions, activations, invoices, payments, credit-note lifecycle, and reconciliation |
| 5 - Operations Center | 30% | Truthful unavailable/degraded treatment exists for several unsupported controls | Durable jobs, storage/file safety, deployment, telemetry, search, risk, capacity, and supplier readiness |
| 6 - Developer Platform | 28% | Partial API-key, webhook, integration, and log foundations | Key lifecycle, signing/replay/DLQ, provider health, secret rotation, redaction, rate limits, and attack tests |
| 7 - Support, Communications, AI, and Applications | 10% | Limited scaffolding and explicit unavailable states | Support/knowledge workflows, consent-governed campaigns, durable AI operations, and application release management |
| 8 - Settings and Identity/Security | 12% | Initial settings and identity surfaces exist | Enforced versioned settings, rollback, access review, break-glass, audit export, and complete permission tests |
| 9 - Builder, Templates, and Marketplace | 10% | Route scaffolding and explicit unavailable states exist | Persisted draft/publish/version/install/compatibility/rollback/audit workflows |
| 10 - Production Hardening | 15% | Frontend type-check and unit/component suites currently pass | Backend, Playwright, accessibility, isolation, concurrency, outage, performance, security, restore, and rollback gates |

## 2026-07-14 Change Review

### Accepted as useful partial progress

- Added read-only CRM account, contact, lead, and opportunity surfaces.
- Added entitlement-grant inspection, credit-note list, financial-audit list, and billing intelligence hooks.
- Added server-driven audit filters and cursor controls to the audit-log page.
- Replaced CRM and billing-admin tenant-filter bypasses with mandatory organization scope, support-reason capture, transaction-local tenant context, sensitive audit records, fail-closed UI controls, and isolation tests.
- Replaced raw list and offset responses with typed Pydantic cursor pages, deterministic timestamp/ID keyset ordering, invalid-cursor errors, and incremental Command Center loading.
- Added CRM account, contact, lead, and opportunity create/update/archive/restore APIs and UI with tenant-scoped parent validation, optimistic versions, idempotency records, audited reasons, dependency-safe archives, archived-record visibility, and query invalidation.
- Added CRM lifecycle columns, tenant-scoped contact-email uniqueness, operation ledger, forced-RLS policy, and a single-head Alembic migration.
- Added reusable empty and loading states with component tests.
- Added ESLint flat configuration, error mapping, unsaved-change support, and navigation test scaffolding.
- Replaced the fake reports page with organization-scoped durable export records, idempotent queueing, worker-generated XLSX/CSV/PDF artifacts, audited short-lived downloads, polling UI, Celery registration, and backend/worker/frontend tests.

### Blocking corrections

1. CRM core records now have paginated lifecycle operations, but activities, tasks, notes, lead conversion, account detail journeys, granular CRM permissions, and forced-RLS deployment evidence remain.
2. Billing-admin lifecycle mutations, step-up controls, reconciliation, and lifecycle tests are missing; current typed cursor endpoints remain read-only.
4. Audit cursor/filter behavior needs integration and journey tests; targeted lint currently reports two hook-dependency warnings.
5. Generated `test-results/` and `tsconfig.tsbuildinfo` must not be treated as implementation evidence or included unintentionally in a production change.
6. The large mixed worktree must be separated into reviewable manifests or commits before release.
7. Backend inventory contains repeated declarations for platform audit, platform impersonation logs, and presentation poster batch-status routes. Confirm the mounted path and remove or intentionally version duplicate handlers before acceptance.
8. Commercial exports still require a live broker/object-storage E2E run, retention cleanup evidence, and production alert verification before `COMPLETE`.

## Immediate Documentation-Governed Execution Order

1. Implement billing-admin lifecycle mutations with idempotency, step-up, reason capture, reconciliation state, audit, and invalidation.
2. Add CRM activities, tasks, notes, and controlled lead-to-opportunity conversion after their source-of-truth models and permission contracts are confirmed.
3. Run commercial exports against the live broker and private object store and attach operational evidence.
