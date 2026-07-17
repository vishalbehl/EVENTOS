# Phase 5 Scoped Diff Manifest

Date: 2026-07-16

## Scope

Phase 5 owns the eight active `operations-center` routes, the typed Command Center operations contracts, the backend `operations_control` module, governed extensions to platform/search/venue/technology-service/deployment-risk records, migration `operations_center_control_0780`, focused tests, generated API contracts, and the documentation entries listed below.

## Authoritative Sources

| Concern | Source of truth |
|---|---|
| Operational requests | `technology_services.service_requests` plus assignment/SLA records |
| Risks | `deployment_management.risks`, actions, comments and authorized evidence |
| Suppliers | `procurement.vendors` plus event-specific venue supplier assignments |
| Venue trust | event-scoped venue devices, credential-operation lineage and sync jobs |
| Jobs | domain job tables through typed source adapters and `jobs.job_control_requests` |
| Search | `search.search_jobs` |
| Storage | tenant-owned file/asset processing records; provider quota only when verified |
| Database/queues | read-only observed telemetry with explicit freshness/availability |

## Review Boundary

Included behavior is limited to Phase 5 files and the model/router extensions required by those contracts. Pre-existing deleted V2 capabilities, earlier Phase 1-4 changes, organizer-portal edits, generated runtime artifacts, and local stored assets are not reverted or claimed as Phase 5 implementation.

## Failure Contracts

- Missing providers are `UNAVAILABLE` or `UNVERIFIED`, never healthy.
- Unsupported/terminal job actions return `JOB_ACTION_UNSUPPORTED`.
- Reused idempotency keys with changed input return `IDEMPOTENCY_CONFLICT`.
- Stale request/risk versions return `VERSION_CONFLICT`.
- Cross-tenant and cross-event resources return existence-safe `NOT_FOUND`.
- Quarantined or unready assets cannot become risk evidence or downloadable operational output.
- Credential secrets are returned once on issuance/rotation and never persisted as retrievable plaintext.

## Verification Boundary

Repository completion requires migration-head validation, backend tests, Python compilation, generated-contract drift checks, TypeScript, scoped ESLint, unit tests, production build, Playwright, axe and diff checks. Live broker, object storage, backup/restore, managed database, worker and supplier-device signals are Phase 10 deployment evidence and must not be represented as repository-generated health.
