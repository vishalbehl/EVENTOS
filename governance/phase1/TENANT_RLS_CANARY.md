# Tenant RLS Canary

## Current Stage

- Eight direct organization-owned tables, nineteen event-derived operational
  tables, and four explicit mixed-scope tables are registered as canaries.
- RLS and tenant policies are enabled through Alembic.
- `FORCE ROW LEVEL SECURITY` is intentionally not enabled.
- Development currently uses a PostgreSQL superuser and therefore bypasses RLS.
- Production startup requires `REQUIRE_RLS_SAFE_RUNTIME_ROLE=true` and fails if
  the connected role is superuser, has `BYPASSRLS`, or canary policies are missing.
- The local `Event_runtime` group is `NOLOGIN`, non-superuser, and cannot bypass RLS.
- The rollback-only live canary proves no-context denial, tenant A/B read isolation,
  cross-tenant update filtering, and wrong-owner insert denial for both direct
  billing records and event-derived room records.
- Privileged users remain tenant-scoped by default. Cross-tenant support uses the
  step-up-protected impersonation workflow, which temporarily establishes and
  then restores verified transaction-local tenant context.
- Mixed-scope billing canaries reject rows whose direct organization and optional
  event or activation ownership disagree.

## Event-Derived Coverage

- Schedule roots: rooms, sessions, speakers.
- Registration: participants, registrations, ticket types, roles, payments, imports.
- Presentations: files, bundles, posters.
- Workspace access: user event assignments.
- Communications: campaigns and announcements.
- Integrations: webhooks.
- Venue: synchronization jobs, SRR stations, and SRR check-ins.

## Deferred Mixed Scope

Tables with nullable `event_id`, platform defaults, or organization-wide reuse are
not assigned an event-only policy. This includes reusable email/print templates,
email logs, OTP/security records, analytics projections, calendars, and other
mixed-scope resources. Each requires an explicit source-of-truth and scope policy.

## Verification Commands

```powershell
.venv\Scripts\python.exe scripts\provision_database_roles.py --apply
.venv\Scripts\python.exe scripts\audit_tenant_rls.py
.venv\Scripts\python.exe scripts\verify_rls_canary.py
$env:RUN_RLS_LIVE_CANARY='1'
.venv\Scripts\python.exe -m pytest tests/test_phase1_rls_live_canary.py -q
```

The verifier creates temporary organizations and operation records inside one
transaction and always rolls the transaction back.

## Promotion Gate

1. Provision a non-owner login and grant `Event_runtime`.
2. Run `scripts/audit_tenant_rls.py` and retain the JSON evidence.
3. Run HTTP, worker, WebSocket, export, storage, and venue cross-tenant tests.
4. Run canary traffic with SQLAlchemy tenant filtering and RLS together.
5. Review denied-query telemetry without logging personal data or SQL parameters.
6. Promote additional direct-owner tables through a new migration.
7. Design event-derived policies separately before child-table rollout.
8. Enable `FORCE ROW LEVEL SECURITY` only after owner-path and migration-role tests.

Never use `Event_migration` for API or worker traffic.
