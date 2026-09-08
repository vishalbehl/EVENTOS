# Phase 3C Repository and Cursor Inventory

Status: accepted implementation scope for the Phase 3C weighted batch.

## Repository contract coverage

The shared repository boundary keeps transaction ownership with the caller,
applies organization predicates before reads, rejects unsupported update
fields, bounds list and bulk operations, and exposes predictable not-found
results. Event-owned repositories use the event plus organization predicate
when a tenant scope is supplied.

The platform organization repositories for teams, departments, and roles now
use the shared page-size validator for cursor reads. They fetch one additional
row, use a deterministic `(created_at, id)` key, and do not commit internally.
Existing offset methods remain compatibility paths.

## Cursor coverage

| Domain | Cursor contract | Tenant boundary |
| --- | --- | --- |
| Teams | `/platform/teams/cursor` | organization id in repository |
| Departments | `/platform/departments/cursor` | organization id in repository |
| Roles | `/platform/roles/cursor` and support cursor route | organization id and support scope |
| Organiser members | `/organiser/members/cursor` | organization member predicate and event assignment scope |
| Organiser roles and assignments | existing `/access/*/page` routes | organization query service |
| Participants, registrations, badges, imports | existing `/page` routes | event plus organization repository/query scope |
| Audit, search, notifications, operations | existing cursor/page routes | tenant or authorized platform scope |

The organiser member cursor uses `(invited_at DESC, id DESC)`. A committed
integration test proves equal timestamps, an intervening insert that sorts
ahead of the first page, no duplicate across pages, malformed cursor rejection,
and oversized page rejection.

## Compatibility policy

Legacy offset routes remain available where existing clients use them. They are
bounded and documented as compatibility paths; new traversal uses cursor
routes. No response envelope or existing frontend response body was changed in
this batch.

## Acceptance evidence

- repository contract and domain repository tests passed;
- Phase 3C consolidated regression selection passed **105/105**;
- post-change repository/cursor acceptance selection passed **26/26**;
- source compilation and diff checks passed;
- staging Alembic head remained `20260909_1100`;
- staging health and metrics remained available;
- only the backend image was refreshed; supporting containers were preserved.
