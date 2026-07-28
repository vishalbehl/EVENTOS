# Organization Management Redesign Report

## Delivered

- Replaced the legacy organization detail screen with a compact, URL-backed tenant dossier.
- Added Overview, Commercial, Capabilities, Add-ons, Events, People & access, Billing, Audit, and Configuration views.
- Separated purchased event capacity, reserved units, consumed activations, remaining units, and actual event records.
- Added a capability provenance ledger for plan, add-on, and organization override sources.
- Added an aggregate `GET /platform/organizations/{org_id}/dossier` endpoint to prevent a fragmented frontend request waterfall.
- Added durable metadata for time-bound feature extensions and commercially accurate add-on assignments.

## Database

Apply revision `20260719_0910` after the onboarding revisions. It adds feature-extension validity/reason/version fields and add-on quantity, price snapshot, currency, subscription, actor, reason, and version fields. Existing records retain their effective behavior through server defaults.

## Data truth

- Subscription history is sourced from `billing.organization_subscriptions`.
- Event capacity is sourced from active event-unit entitlement grants.
- Activation state is sourced from `billing.event_activations`.
- Actual event count is sourced from event records and is never treated as purchased capacity.
- Effective capability sources combine plan features, active add-on features, and unexpired organization overrides.
- Missing records render explicit empty or not-measured states; the UI does not invent operational values.

## Validation checklist

- Backend modules and migration compile successfully with `python -m py_compile`.
- Alembic reports `20260719_0910` as the single migration head.
- Command-center TypeScript check passes.
- Command-center Next.js production build passes and emits `/organizations/[orgId]`.
- Existing tenant-isolation suite passes: 3 tests.
- Targeted ESLint passes for the dossier page and service contract.
- Organization Console screens use authoritative database records only. Development demonstration data is not installed by the application.
- Authenticated light/dark screenshot review still requires a running local stack and a seeded Super Admin session.
