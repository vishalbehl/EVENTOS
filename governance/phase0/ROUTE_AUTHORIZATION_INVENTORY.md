# Route Authorization Inventory

Status: SEEDED, FULL ROUTE-BY-ROUTE REVIEW REQUIRED

Snapshot:

- Date: 2026-07-11
- Static route scan: 664 `APIRouter` or route decorator matches under `services/backend/app`

## Inventory Method

Command:

```powershell
rg -n "@(router|app)\.(get|post|put|patch|delete)|APIRouter\(" services/backend/app -g "*.py"
```

Phase 0 closure requires converting this seeded inventory into a route-by-route
authorization table. The table must classify public routes, authenticated routes,
tenant-scoped routes, event-scoped routes, privileged routes, export routes, and
provider/webhook routes.

## Highest-Volume Route Modules

| Module area | Reason to prioritize |
|---|---|
| `modules/platform` | Largest route surface; likely includes super-admin/control-plane behavior |
| `modules/rbac` | Organization/event membership and assignment decisions |
| `modules/registration` | Public and authenticated participant flows |
| `modules/presentations` | File/storage and venue-adjacent behavior |
| `modules/billing` | Activation, subscription, entitlement, and commercial controls |
| `modules/notifications` | Email/webhook/channel dispatch behavior |
| `modules/venue` | Venue sync and event-operational controls |
| `modules/files` | Upload/download and storage capability behavior |
| `modules/audit` | Security/audit visibility and export controls |

## Required Review Columns

| Route | Method | Module | Public/authenticated | Tenant source | Org check | Event check | RBAC/permission | Feature/limit gate | Audit required | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| To be completed from static route scan |  |  |  |  |  |  |  |  |  | |

## Required Review Questions

- Is the tenant derived from verified identity or authorized resource lookup?
- Does the route reject cross-tenant resource access without revealing existence?
- Does event-scoped mutation require event assignment?
- Does paid functionality use activation/snapshot-first entitlement checks?
- Does the route audit sensitive mutation or export behavior?
- Does public registration access use only public event policy and never tenant headers?
- Does export/report/download access re-check authorization at download time?

## Current Closure Status

This inventory is not complete for Phase 0 closure. It is intentionally marked
open because 664 route matches require a careful route-by-route pass and tests
for the sensitive classes above.
