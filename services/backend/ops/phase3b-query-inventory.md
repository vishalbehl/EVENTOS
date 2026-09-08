# Phase 3B Query-Boundary Inventory

Status: implementation scope for the Phase 3B weighted batch.

Phase 3B moves the remaining active pure read paths identified in the current
checkout into explicit query services. Existing frontend-facing response bodies
remain unchanged. New envelope contracts are additive under `/v2` routes.

## Migrated read paths

| Read path | Authorization boundary | Query boundary | Result controls |
| --- | --- | --- | --- |
| `GET /pricing/superadmin/catalog/pricing-rules` | `require_super_admin` | `PricingCatalogQueryService.list_rules` | `load_only`; max 100; `(name, id)` order |
| `GET /pricing/superadmin/catalog/pricing-rules/{rule_id}` | `require_super_admin` | `PricingCatalogQueryService.get_rule` | `load_only`; single-row lookup |
| `GET /pricing/superadmin/catalog/templates/{slug}` | `require_active_user` (existing contract) | `PricingCatalogQueryService.get_template` | explicit type-specific projection; single-row lookup |
| `GET /pricing/superadmin/catalog/templates` | `require_super_admin` | `PricingCatalogQueryService.list_templates` | explicit type-specific projections; max 100 per type; `(name, id)` order |
| `GET /organiser/needs-attention` | authenticated current organisation | `OrganiserAttentionQueryService.list_candidates` and `.list_task_states` | organisation predicate; bounded event/task projections; deterministic ordering |
| `GET /organiser/events/{event_id}/needs-attention` | authenticated current organisation or existing super-admin exception | `OrganiserAttentionQueryService.get_event_target` and `.get_candidate` | identity scope before projection; event/org predicate; explicit columns |

## Additive response-envelope paths

These routes are new contracts and do not alter the legacy list/dictionary
responses consumed by the frontend:

| Route | Envelope data |
| --- | --- |
| `GET /pricing/superadmin/catalog/v2/pricing-rules` | list of pricing-rule payloads |
| `GET /pricing/superadmin/catalog/v2/templates` | grouped template payload dictionary |

Each envelope includes the existing `ResponseEnvelope` success shape, the
incoming `X-Request-ID` when present, and a server freshness timestamp.

## Explicitly retained direct reads

The current active-router inventory also contains direct database access that
is intentionally not classified as a pure query-service migration in this
batch:

- public proposal share access, which records access telemetry while reading;
- export and attachment downloads, which perform resource authorization and
  storage-stream preparation;
- database health, `pg_stat_statements`, and live slow-query diagnostics;
- command handlers that perform a lock-capable read as part of a mutation.

The platform and platform-health routes already delegate their active domain
read portions to query services. Unreachable legacy fallback blocks are not
executed and remain a separate cleanup concern; they do not change the active
query boundary.

## Acceptance evidence

- source modules compile with Python bytecode generation;
- boundary tests assert no router-owned `execute`/`scalars` calls remain in the
  migrated route regions;
- projections assert tenant predicates, explicit selected fields, bounded
  limits, and deterministic ordering;
- legacy routes preserve their response bodies;
- envelope shape is verified independently and through additive route
  declarations.
