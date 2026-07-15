# Command Center Phases 1-4 Integrated Completion Plan

Status: `IN_PROGRESS`

Owner: Codex implementation agent

Start date: 2026-07-14

Planning window: 14-23 working days

## Delivery Commitment

Codex owns repository implementation, migrations, automated tests, documentation, and verification for Phases 1-4. The user is not expected to write code.

The work runs as one continuous release train. Work-package boundaries exist to keep changes reviewable and prevent an invalid UI, API, authorization, or database contract from contaminating otherwise valid fixes. Completion does not require a new user instruction between work packages.

Execution pauses only for:

- A conflicting external worktree change that cannot be safely merged.
- A destructive or commercially ambiguous data migration.
- Missing provider credentials or unavailable live infrastructure required for evidence.
- A product decision with materially different customer, billing, privacy, or security consequences.

## Time Estimate

| Scope | Estimate | Notes |
|---|---:|---|
| Repository implementation and automated verification | 12-18 working days | Coding, migrations, unit/integration tests, Playwright foundations, accessibility automation, documentation, and production builds |
| Live and manual evidence | 2-5 working days | Provider webhooks, private storage/broker execution, browser journeys, and manual accessibility assessment when environments are available |
| Total planning window | 14-23 working days | Assumes uninterrupted repository access and timely access to required external environments |

Time is an estimate, not acceptance evidence. A work package closes only when its measurable exit gate passes.

## Authoritative Baseline

| Phase | Baseline | Target | Current state |
|---|---:|---:|---|
| Phase 1 - Design System and Shell | 68% | 100% | `COMPLETE` |
| Phase 2 - Frontend Foundation | 76% | 100% | `COMPLETE` |
| Phase 3 - Critical Defect Closure | 74% | 100% | `IN_PROGRESS` (98%) |
| Phase 4 - Commercial, Subscription, and Finance | 72% | 100% | `IN_PROGRESS` (96%) |

The percentages above mirror `CURRENT_PHASE_STATUS.md`. They must be updated together after evidence is verified.

## Work-Package Status

| ID | Work package | Phase coverage | Status | Exit evidence |
|---|---|---|---|---|
| `P14-01` | Baseline and change control | 1-4 | `COMPLETE` | 103-route and 729-endpoint inventories, generated-artifact policy, integrated change ledger, reproducible test/build baseline, and one Alembic head |
| `P14-02` | Design-system foundation | 1 | `COMPLETE` | Semantic tokens, responsive shell, accessible overlays/navigation, command search, live notification state, density, catalogue, 52 frontend tests, five Playwright journeys, axe, and production build |
| `P14-03` | Frontend contract foundation | 2 | `COMPLETE` | Deterministic FastAPI OpenAPI generation, generated TypeScript DTOs, zero raw query keys, canonical scoped key factories and invalidation contracts, cursor/version contracts, authenticated Playwright fixtures, axe integration, dependency audit, and CI gates; 67 unit tests, six browser journeys, and production build pass |
| `P14-04` | Identity, authorization, and organizations | 3 | `IN_PROGRESS` | Tenant-scoped roles/permissions, version conflict, platform-role/session/MFA/status controls, reason/step-up/audit, fail-closed deletion, provisioning, membership/assignment/seat enforcement, tenant-filter isolation, dual-control access reviews, and authenticated denial journeys are implemented; deployment cache evidence remains |
| `P14-05` | Support and audit closure | 3 | `IN_PROGRESS` | Tenant-scoped ticket lifecycle, private notes, secure attachment quarantine/scan/readiness, scoped durable audit exports, announcement/maintenance assurance, audit/isolation tests, zero mock debt, and browser denial journeys are implemented; live infrastructure and manual evidence remain |
| `P14-06` | Commercial and CRM completion | 4 | `IN_PROGRESS` | CRM core, activity/task/note lifecycles, bounded audited account workspace and controlled lead conversion are implemented; granular platform-staff permissions, quote/proposal live conversion, canonical totals, and full E2E remain |
| `P14-07` | Subscription and licensing completion | 4 | `IN_PROGRESS` | Transfer/deactivation, continuity policy, consumption lineage, snapshot refresh/integrity, step-up, idempotency and backend lifecycle tests are implemented; dedicated browser and forced-RLS deployment evidence remain |
| `P14-08` | Finance completion | 4 | `IN_PROGRESS` | Manual reconciliation, versioned refund lineage, and durable version-bound invoice PDF generation/download are implemented; verified provider webhook ingestion, outage/replay tests, and full financial E2E remain |
| `P14-09` | App-wide responsive and accessibility adoption | 1-4 | `IN_PROGRESS` | Current 103-route composition contract and shell checks pass; repeat responsive, axe, and manual critical-journey review after Phase 3-4 domain changes |
| `P14-10` | Integrated release verification | 1-4 | `IN_PROGRESS` | Generated contracts, zero-debt mock gate, zero-error lint, 68 frontend tests, 11 worker tests, nine Playwright/axe journeys, 86-page build, 34 focused backend tests and migration validation pass; full live domain/security/manual gates remain |

Allowed states are `PENDING`, `IN_PROGRESS`, `BLOCKED_EXTERNAL`, `BLOCKED_DECISION`, and `COMPLETE`.

## Execution Order

1. Finish `P14-01` and lock the current implementation baseline.
2. Build the reusable design and frontend contract foundations in `P14-02` and `P14-03`.
3. Close high-risk identity, organization, support, and audit defects in `P14-04` and `P14-05`.
4. Complete commercial, CRM, licensing, and finance behavior in `P14-06`, `P14-07`, and `P14-08`.
5. Apply the final shared design, responsive, and accessibility pass in `P14-09` after domain behavior stabilizes.
6. Run the complete release gate and evidence update in `P14-10`.

Independent work may run in parallel only after its shared API, authorization, audit, and data-ownership contracts are stable.

## Phase 1 Completion Scope

- Finalize semantic design tokens and consistent light/dark behavior.
- Complete responsive shell, navigation, command search, notifications, profile, and impersonation states.
- Standardize headers, KPI cards, tables, forms, dialogs, drawers, charts, timelines, and audit panels.
- Standardize loading, empty, degraded, permission-denied, and recoverable error states.
- Add density, confirmation, unsaved-change, validation, and server-error behavior.
- Publish the component catalogue and prohibit unjustified one-off patterns.
- Verify keyboard, focus, labels, announcements, contrast, reflow, reduced motion, and target sizing.

## Phase 2 Completion Scope

- Generate or validate frontend DTOs against backend OpenAPI schemas.
- Consolidate authenticated API, refresh, timeout, request, correlation, and problem-response handling.
- Complete tenant-aware query keys, mutation invalidation, cursor pagination, URL state, and optimistic concurrency.
- Keep release flags, experiments, kill switches, and entitlements separate.
- Complete Vitest, controlled MSW fixtures, Playwright authenticated states, and axe integration.
- Enforce type-check, lint, unit tests, production build, forbidden mock markers, Playwright, and axe in CI.

## Phase 3 Completion Scope

- Complete real users, roles, permissions, memberships, organizations, sessions, and sensitive user actions.
- Complete support tickets, announcements, maintenance windows, and audit pagination.
- Enforce server-side permission, tenant, resource, step-up, reason, and immutable audit requirements.
- Conceal cross-tenant resource existence and invalidate authorization caches after security changes.
- Remove remaining fake success, client-only mutation, wrong-domain hook, and silent production fallback behavior.
- Add integration and browser coverage for success, denial, stale version, tenant isolation, and audit evidence.

## Phase 4 Completion Scope

- Complete CRM activities, tasks, notes, account journeys, and controlled conversion.
- Complete service-request, quote, proposal, revision, approval, document, and conversion workflows.
- Preserve one canonical pricing calculation across UI, persistence, PDFs, proposals, and reports.
- Complete activation transfer, deactivation, continuity, consumption lineage, snapshot refresh, and integrity workflows.
- Add verified payment-provider webhook receipt, signature/replay validation, deduplication, processing, and reconciliation.
- Complete refunds, invoice PDF/export, authorization-gated downloads, and financial/provider outage handling.
- Pass quote-to-subscription-to-activation-to-invoice-to-payment end-to-end journeys.

## Status Update Protocol

Every implementation batch must update:

1. This file's work-package state and evidence log.
2. `CURRENT_PHASE_STATUS.md` phase percentages, evidence, blockers, and execution order.
3. `COMMAND_CENTER_FEATURE_MATRIX.csv` for affected routes.
4. `ROUTE_API_CONTRACTS.md` for changed public contracts.
5. `MOCK_REMOVAL_REGISTER.md` when fake/static behavior is removed or discovered.
6. `DEPENDENCY_EXECUTION_MAP.md` when a dependency is completed or changes.

Percentages increase only after tests and acceptance evidence pass. A blocked external system is recorded explicitly and does not become a false completion.

## Evidence Log

| Date | Work package | Change | Verification | Status impact |
|---|---|---|---|---|
| 2026-07-14 | `P14-01` | Created the integrated execution and status contract from the evidence-based Phase 1-4 baseline | Plan linked to authoritative status and governance index | Program started; no phase percentage changed |
| 2026-07-14 | `P14-01` | Refreshed the route/backend inventories and locked app-wide composition checks | 102 frontend routes; 674 backend endpoints; one production build; one Alembic head retained from backend baseline | Baseline work package complete |
| 2026-07-14 | `P14-02` | Completed semantic tokens, light/dark themes, responsive shell, focus-trapped mobile navigation, command search, real-time notification state, profile/theme/density controls, impersonation state, shared forms/errors/audit/timeline/table/chart patterns, route announcements, catalogue, and adoption enforcement | TypeScript pass; ESLint zero errors; 19 Vitest files and 52 tests pass; five Playwright journeys pass; axe contrast pass; 320px reflow pass; 85-page production build pass | Phase 1 increased from 68% to 100%; work package complete |
| 2026-07-14 | `P14-03` | Generated the mounted FastAPI OpenAPI contract and TypeScript schemas; established platform/tenant query factories and a non-regression gate for legacy raw keys; added authenticated downloads, cursor URL-state, optimistic-version, feature-control, invalidation, mock-regression, Playwright fixture, CI, and dependency-audit contracts; removed the duplicate poster batch-status route | Deterministic contract drift and duplicate-operation checks pass; TypeScript pass; 23 Vitest files and 63 tests pass; ESLint zero errors; six Playwright/axe journeys pass; 85-page Next 16.2.6 build passes; Python compile passes; production audit reports zero Critical/High findings | Phase 2 is 94%; 113 legacy raw keys and their invalidation contracts remain bounded and visible |
| 2026-07-15 | `P14-04` | Added explicit tenant-scoped Super Admin role and permission administration; version-conflict and in-use protections; step-up, reason, session revocation, and audit for user status, MFA, logout, platform-role, and organization mutations; blocked destructive tenant deletion; removed fabricated organization health/revenue and unsafe public-signup provisioning | Seven backend authorization/isolation tests and two frontend access-contract tests pass; all 23 frontend files and 63 tests pass; generated contracts, type-check, zero-error lint, contract/mock gates, and the 85-page production build pass | Phase 3 is 74%; membership/assignment, audited idempotent provisioning, browser denial, support/audit, and deployment evidence remain |
| 2026-07-15 | `P14-03` | Migrated all 113 legacy raw query keys to the canonical scoped wrapper and removed the compatibility budget; regenerated OpenAPI and TypeScript contracts | Contract/mock gates, contract drift, type-check, zero-error lint, 24 Vitest files and 65 tests, six Playwright/axe journeys, and 85-page production build pass | Phase 2 increased from 94% to 100%; work package complete |
| 2026-07-15 | `P14-04` | Added idempotent audited tenant provisioning, organization membership lifecycle, session-revoking removal, tenant-scoped event workspace assignment with plan-seat enforcement, assignment uniqueness migration, and tenant-filter cache isolation fix | Nine backend authorization/isolation tests, focused sequential-tenant ORM regression, two frontend organization-admin tests, Python compile, generated-contract drift, and Alembic upgrade to `event_assignment_unique_0710` pass | Phase 3 increased from 74% to 84%; support/audit, browser denial, access review, and deployment evidence remain |
| 2026-07-15 | `P14-04`, `P14-05`, `P14-07`, `P14-10` | Added dual-control access reviews/break-glass; real tenant-scoped support SLA, assignment, escalation, lifecycle, replies and private notes; idempotent activation transfer/deactivation; removed resolved support routes from the production mock allowlist | 16 focused backend tests and 67 frontend tests pass; OpenAPI drift, contract/mock gates, zero-error ESLint, 86-page production build, six Playwright/axe journeys, Python compilation and Alembic upgrade to `access_review_governance_0730` pass | Phase 3 increased from 84% to 92%; Phase 4 increased from 72% to 80%; remaining work moves to the second consolidated batch |
| 2026-07-15 | `P14-05`, `P14-06`, `P14-08`, `P14-10` | Added durable scoped audit exports, announcement/maintenance mutation assurance, controlled lead-to-opportunity conversion, commercial refund parent lineage, reconciliation and authenticated denial journeys | 30 focused backend tests, 67 frontend tests, eight Playwright/axe journeys, 103-route/706-endpoint inventory checks, OpenAPI drift, contract/mock gates, TypeScript, zero-error lint, 86-page build, Python compilation and Alembic upgrade to `commercial_refund_lineage_0740` pass | Phase 3 increased from 92% to 96%; Phase 4 increased from 80% to 88%; remaining contracts stay explicit |
| 2026-07-15 | `P14-05`, `P14-06`, `P14-10` | Completed CRM activity/task/note lifecycles, secure ticket attachment upload/quarantine/scan/readiness/download controls, and removed the final registered production mock-debt files | 32 focused backend tests, 67 frontend tests, nine Playwright/axe journeys, 103-route/725-endpoint inventory checks, OpenAPI drift, zero-debt contract/mock gates, TypeScript, zero-error lint, 86-page build, Python compilation, diff validation and Alembic head `support_attachment_safety_0760` pass | Phase 3 increased from 96% to 98%; Phase 4 increased from 88% to 93%; remaining work requires live infrastructure/provider or deeper domain evidence |
| 2026-07-15 | `P14-06`, `P14-08`, `P14-10` | Repaired opportunity pagination, added the audited bounded CRM account workspace, and implemented immutable version-bound invoice PDF jobs with private audited downloads | 34 focused backend tests, 68 frontend tests, 11 worker report tests, nine Playwright/axe journeys, 103-route/729-endpoint inventory checks, OpenAPI drift, zero-debt contract/mock gates, TypeScript, zero-error lint, 86-page build, diff validation and Alembic head `support_attachment_safety_0760` pass | Phase 4 increased from 93% to 96%; provider webhooks, granular staff permissions, outage tests and full commercial E2E remain |

## Final Acceptance Gate

- Every Phase 1-4 route uses real source-of-truth data without production mock fallback.
- Every administrative mutation is authenticated, tenant-safe, permission-controlled, and audited.
- Sensitive mutations enforce step-up and reason capture.
- Typed API, pagination, invalidation, idempotency, and error contracts are consistent.
- Frontend type-check, lint, unit tests, production build, Playwright, and axe gates pass.
- Backend service, authorization, isolation, idempotency, concurrency, and migration suites pass.
- Critical journeys receive responsive and manual accessibility review.
- Commercial totals match UI, persistence, PDFs, proposals, and reports.
- Event licensing remains activation-driven and snapshot-first.
- No known Critical/High defect, broken P0/P1 journey, fake mutation, or undocumented acceptance exception remains.
