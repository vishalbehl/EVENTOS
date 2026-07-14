# Route-to-API Contract Inventory

## Contract standard

Every Command Center route must map its reads and mutations to a named backend module and authoritative database source in `COMMAND_CENTER_FEATURE_MATRIX.csv` before implementation acceptance.

All contracts use the authenticated API client, RFC 9457 problem responses, stable error codes, request/correlation IDs, scoped React Query keys, and explicit mutation invalidation. Long-running work returns `202 Accepted` with a durable job identifier.

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
| AI workspace | AI and workflow | models, prompts, agents, runs and approval policy |
| Builder and marketplace | website builder, templates, blueprints, themes, marketplace | versioned site and catalogue state |

## Provisional 2026-07-14 Contracts

| Route | Current API | Status | Required before completion |
|---|---|---|---|
| `/business/crm` | `/superadmin/crm/accounts`, `/contacts`, `/leads`, `/opportunities`, `/pipeline-stages`, and record archive/restore operations | `PARTIAL` lifecycle-capable | Activities, tasks, notes, conversion, granular permission policy, browser journey, WCAG review, and forced-RLS deployment evidence |
| `/business/subscription/entitlements` | `/superadmin/billing-admin/entitlements` | `PARTIAL` typed cursor tenant read | Snapshot/activation explanation and usage/remaining details |
| `/finance/credit-notes` | `/superadmin/billing-admin/credit-notes` | `PARTIAL` typed cursor tenant read | Issue/apply/cancel policy, invoice consistency, idempotency, step-up and reconciliation |
| `/finance/financial-audit-trail` | `/superadmin/billing-admin/financial-audit-trail` | `PARTIAL` typed cursor tenant read | Immutable-storage decision, integrity evidence and authorized export |
| `/identity-security/audit-logs` | platform audit API | `PARTIAL` | Tested server filters, correct bidirectional cursor behavior, export authorization and accessibility review |
| `/reports/exports` | `/superadmin/reports/exports`, status and download endpoints | `PARTIAL` | Live broker/object-storage E2E, retention cleanup, manual WCAG review, and production alert evidence |

CRM and billing support reads require `organization_id` plus `X-Support-Reason`, execute under transaction-local tenant context, and write sensitive `PLATFORM_SUPPORT_DATA_READ` audit events. CRM mutations additionally require `Idempotency-Key`; updates and lifecycle operations require the current record version and audited reason, while archive/restore routes apply the privileged step-up dependency. Unbounded cross-tenant runtime lists remain prohibited.

The capability inventory currently detects duplicate declarations for platform `/audit`, platform `/impersonation-logs`, and presentation poster `/batch-status`. Route ownership and mounted-path uniqueness must be resolved before these contracts can be accepted.

## Acceptance restrictions

- A page cannot call provider APIs directly.
- A page cannot infer authorization from hidden controls.
- A failed request cannot fall back to sample records in production.
- A mutation requires a domain-specific hook, server-side permission, cache invalidation, and audit evidence.
- Tenant, event, and resource identifiers are verified by the backend and never trusted from headers alone.
- Cross-tenant administrative reads require explicit platform permission, reason or purpose where policy requires it, access audit, bounded pagination, and existence-safe errors.
