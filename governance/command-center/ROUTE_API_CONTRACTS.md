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

## Acceptance restrictions

- A page cannot call provider APIs directly.
- A page cannot infer authorization from hidden controls.
- A failed request cannot fall back to sample records in production.
- A mutation requires a domain-specific hook, server-side permission, cache invalidation, and audit evidence.
- Tenant, event, and resource identifiers are verified by the backend and never trusted from headers alone.
