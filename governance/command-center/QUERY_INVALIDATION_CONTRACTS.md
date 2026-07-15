# Command Center Query and Invalidation Contracts

## Scope rules

- Tenant data starts with `tenant`, then the authenticated organization ID.
- Event data adds `event` and the event ID before the resource name.
- Cross-tenant platform administration starts with `platform-admin`; organization support views include the selected organization ID in the key.
- Filter objects are normalized by key name and omit empty values.
- Raw array declarations are rejected by `quality:contracts` so new hooks use `queryKeys`, `adminKeys`, or `platformKey`.

## Invalidation ownership

| Mutation | Required invalidation |
|---|---|
| Event create/delete | Tenant event collection |
| Event update | Tenant event collection and event detail |
| Speaker mutation | Event speaker collection and speaker talks where affected |
| Session mutation | Event session collection |
| Room mutation | Event room collection and dependent analytics where affected |
| Poster review/mutation | Event poster collection and file readiness where affected |
| File review | Event file collection |
| Organization mutation | Platform organization collection, selected organization detail, and affected commercial projection |
| Billing mutation | Owned billing collection, selected detail, activation/entitlement projection, and audit trail |

Invalidation is a freshness mechanism only. Cached data never grants authorization, licensing, payment, consent, or file-safety access.

## Pagination and concurrency

- `CursorPage<T>` is the standard large-collection response.
- `table-state.ts` owns cursor, sorting, filtering, search, and URL serialization behavior.
- Filter and sort changes reset the cursor.
- Versioned mutations carry `expected_version`; a missing or invalid version fails before dispatch.
- A `409` conflict is not retried automatically and must surface a recoverable stale-data state.
