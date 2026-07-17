# Command Center V1 Completion Audit and Execution Plan

Assessment date: 2026-07-16

Status: `ACTIVE_V1_BASELINE`

## 1. Decision Record

The initial Command Center release excludes:

- AI Workspace.
- Website Builder and theme engine.
- Marketplace.
- Platform Templates.
- Blueprints.
- Operations project tracking, complex resource planning, deployment execution,
  and operations analytics.
- Developer analytics, cost analytics, public developer marketplace, automated
  integration installation, advanced provider analytics, and self-service
  enterprise SSO integrations.

The excluded frontend, backend, model, service, router, task, and test sources
were removed from the repository on 2026-07-16. They are not routable,
registered, exposed in generated contracts, scheduled, linked from navigation,
or counted as incomplete initial-release scope. Existing database tables and
Alembic history were not changed by this source cleanup.

## 2. Removal Audit

| Capability | Repository state | Initial-release state |
|---|---|---|
| AI Workspace | Source removed | Not available |
| Website Builder and Theme Engine | Source removed | Not available |
| Platform Templates and Marketplace | Source removed | Not available |
| Blueprints | Source removed | Not available |
| Builder tasks | Source removed | Not scheduled |
| Deferred Operations pages | Source removed | Not available |

Business pricing templates are a separate active capability. Their
`RoomTemplate`, `RegistrationTemplate`, and `SrrTemplate` models now live in
`app/modules/pricing/template_models.py` and retain the existing `templates`
database schema without a migration.

## 3. Audited Completion Baseline

### 3.1 Route evidence

| Status | Routes | Weight | Weighted contribution |
|---|---:|---:|---:|
| `COMPLETE` | 17 | 100% | 17.00 |
| `PARTIAL` | 40 | 50% | 20.00 |
| `MOCKED` | 20 | 15% | 3.00 |
| `MISSING_API` | 8 | 5% | 0.40 |
| **Total** | **85** | | **40.40 / 85 = 47.5%** |

The strict route score measures Definition-of-Done evidence page by page. It is
deliberately lower than program readiness because many secondary settings and
operational routes are visible but still lack complete contracts and journeys.

### 3.2 Program readiness

| Workstream | V1 weight | Completion | Weighted score |
|---|---:|---:|---:|
| Completion baseline | 10% | 95% | 9.50% |
| Design system and shell | 10% | 100% | 10.00% |
| Frontend foundation | 10% | 100% | 10.00% |
| Critical defect closure | 12% | 100% repository | 12.00% |
| Commercial, subscription, finance | 18% | 100% repository | 18.00% |
| Operations Center | 12% | 44% | 5.28% |
| Developer Platform | 8% | 32% | 2.56% |
| Support, communications, applications | 8% | 32% | 2.56% |
| Settings and identity hardening | 7% | 18% | 1.26% |
| Production hardening | 5% | 20% | 1.00% |
| **Total active V1 readiness** | **100%** | | **72.1%** |

This percentage is a planning indicator, not a release certificate. External
provider, infrastructure, security, restore, performance, and manual
accessibility evidence remains mandatory before production sign-off.

## 4. Phase Status and Remaining Work

| Phase | Current | Completed | Remaining acceptance work |
|---|---:|---|---|
| 0 - Baseline | 95% | Active route/API inventory, mock register, removed-scope boundary, dependency map | Attach final live/manual evidence and acceptance owners |
| 1 - Design System | 100% | Tokens, shell, shared states, accessibility foundation | Regression only |
| 2 - Frontend Foundation | 100% | Auth client, generated DTOs, cache contracts, unit/E2E foundation | Hosted CI evidence only |
| 3 - Critical Defects | 100% repository | Identity, support, audit, authorization, export safety | Deployed infrastructure and independent review evidence |
| 4 - Commercial and Finance | 100% repository | CRM, quote/proposal, licensing, finance, provider receipt contracts | Live provider and deployed worker/storage evidence |
| 5 - Operations Center | 44% | Intentional eight-page V1 boundary and some real current telemetry | Complete authoritative operational control contracts below |
| 6 - Developer Platform | 32% | Partial key, webhook and integration foundations; truthful unavailable catalogue/log states | Complete secure integration control plane below |
| 7 - Support, Communications, Applications | 32% | Strong support lifecycle and announcements | Knowledge, consent dispatch, provider delivery, application registry |
| 8 - Settings and Security | 18% | Access reviews and break-glass foundations | Versioned settings, rollback, permission matrix, security evidence |
| 10 - Production Hardening | 20% | Build, focused tests, Playwright/axe and contract checks | Full isolation, load, restore, outage, scan and manual review gates |
| Removed future capabilities | Out of scope | Source removed from the repository | Redesign only through a future approved product/architecture decision |

## 5. Operations Center Audit

V1 Operations contains only eight surfaces.

| Surface | Current evidence | Completion | Required completion contract |
|---|---|---:|---|
| Overview | Partial real platform summaries | 50% | Authoritative service states, incident summary, live-event impact, queue pressure, freshness and degradation |
| Job Monitor | Real read path with incomplete control evidence | 50% | Durable job aggregate, tenant/event scope, attempts, sanitized errors, retry/cancel policy, idempotency and audit |
| Database Health | Real current snapshot foundations | 50% | Pool, locks, slow queries, migration head, RLS verification, backups, restore test and step-up-controlled actions |
| Storage and Queue Health | Real queue read path; storage contract incomplete | 50% | Object usage, quarantine, write failures, presigned failures, DLQ, oldest job, retention and tenant-safe drill-down |
| Search Job History | Partial real job history | 50% | Freshness, failed records, scoped retry and step-up/idempotent reindex controls |
| Operational Requests | Explicitly unavailable after mock removal | 5% | Durable request lifecycle, owner, SLA, risk, approval, organization/event scope, resolution and audit |
| Risk Analysis | Truthful partial state | 50% | Durable risk register, score, owner, mitigation, acceptance authority, evidence and audit |
| Venue Readiness | Partial readiness view | 50% | Outsourced supplier per event, attestation, machine identity, credential expiry/rotation/revocation, sync evidence and Go/No-Go |

Operations execution order:

1. Establish one durable job/read model and real service-health DTOs.
2. Complete storage/quarantine, queue, database, and search read paths.
3. Add safe retry/cancel/reindex controls with idempotency, reason and audit.
4. Implement operational request and risk lifecycles.
5. Complete event-scoped outsourced supplier and venue-readiness evidence.
6. Add outage, stale-telemetry, tenant-isolation, step-up and Playwright tests.

Operations exit gate:

- No invented uptime, history, capacity, or readiness values.
- Every action has permission, scope, idempotency, reason and audit rules.
- Venue Supplier A for Event A cannot access Event B or Supplier B credentials.
- Failed dependencies show degraded or delayed state rather than fake success.

## 6. Developer Platform Audit

| Surface | Current evidence | Completion | Required completion contract |
|---|---|---:|---|
| API Catalog | Analytics placeholder removed; catalogue contract defined | 5% | Generate reviewed versioned documentation from active OpenAPI, scopes, errors, limits, idempotency and changelog |
| API Keys | Partial key UI and backend foundations | 50% | API client ownership, one-time secret, hash storage, scopes, IP rules, expiry, rotation, revoke, last use, step-up and audit |
| Webhooks | Partial foundations | 50% | Subscription CRUD, signing rotation, delivery ledger, retry, DLQ, replay, redaction, reconciliation and tenant isolation |
| Integrations | Partial provider catalogue | 50% | Secret-manager credentials, health check, capability scope, expiry, rotation, disable/reauthorize and audit |
| Logs | Explicitly unavailable after mock removal | 5% | Immutable sanitized request/provider/delivery records, filters, cursor pagination, retention, protected export and integrity evidence |

Developer execution order:

1. Publish the API catalogue from generated contracts.
2. Finish API-client and key lifecycle with one-time secret handling.
3. Complete webhook subscription and delivery/replay infrastructure.
4. Add essential integration credential and health workflows.
5. Implement sanitized immutable logs and governed exports.
6. Run replay, signature, revocation, redaction, rate-limit and cross-tenant tests.

Developer exit gate:

- Secrets are shown once and never logged or returned again.
- Customer developers see only their organization; global oversight is limited
  to approved internal roles.
- Webhook delivery and replay are durable and idempotent.
- No analytics or health claim appears without authoritative telemetry.

## 7. Remaining V1 Execution Waves

### Wave A - Operations Reliability

Complete Phase 5 in the order listed above. This is the next implementation
priority because initial production requires visibility and safe remediation.

### Wave B - Integration Control Plane

Complete Phase 6 with API keys and webhooks first. Broader integrations activate
only when a real V1 provider or customer contract requires them.

### Wave C - Support, Communications, and Applications

Complete knowledge workflows, unified consent/suppression dispatch, provider
delivery operations, and the cloud/venue application registry. AI is excluded.

### Wave D - Settings and Security

Complete versioned configuration, preview/rollback, permission coverage, session
revocation, privileged assurance and protected audit evidence.

### Wave E - Production Release Evidence

Run full tenant-isolation, provider outage, concurrency, performance, security,
backup/restore, rollback, browser, screen-reader and responsive gates.

## 8. Future Capability Reintroduction Gate

Removed capabilities may not return to navigation or runtime through copied or
historical source. A new implementation requires:

1. Approved ADR and product owner scope decision.
2. Database-schema, retained-table, data-retention, and migration review.
3. Tenant/RLS, authorization, audit and cache-isolation review.
4. Durable job, idempotency, provider and failure-state design.
5. Current OpenAPI and typed frontend contracts.
6. Accessibility and responsive acceptance.
7. Backend, worker, component and Playwright success/denial tests.
8. Explicit router/task registration and feature-release control.

## 9. Evidence Commands

```powershell
python governance/command-center/generate_inventory.py --check
cd apps/cloud/command-center
npm.cmd run contracts:check
npm.cmd run quality:contracts
npm.cmd run type-check
npm.cmd run lint
npm.cmd run test
npm.cmd run build
```

Backend verification must use `services/backend/.venv/Scripts/python.exe`.

Current verified evidence:

- Generated contract drift check passes; deferred API paths are absent.
- Active navigation and command-search scans contain no deferred links.
- Inventory check passes with 85 active routes and 697 active backend endpoints.
- Removed capability routes, imports, tasks, tests, and source directories are absent.
- Twelve tenant-runtime boundary tests pass after deferred task removal.
- TypeScript passes; ESLint reports zero errors and 67 pre-existing warnings.
- All 68 Vitest tests pass.
- The isolated Next.js production build passes and generates 73 static pages;
  the active development server was left running and untouched.

## 10. Audit Conclusion

The V1 scope is now smaller and more credible. Commercial and security-critical
repository phases remain complete, while Operations, Developer Control,
communications, settings and release evidence are visibly incomplete. Removed
capabilities no longer appear as broken initial-release promises and cannot be
activated accidentally through routes, generated contracts, navigation, model
imports, or task registration.
