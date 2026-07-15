# Frontend Contract Foundation

## API boundary

- `apiClient` is the only general HTTP boundary for Command Center domain hooks and services.
- It reads authentication from the live auth store, attaches request and correlation IDs, enforces a 30-second default timeout, and preserves compatibility helpers.
- A single-flight refresh operation rotates access and refresh tokens after `401`; failure clears the local session.
- Failures are represented by `ApiError` with status, stable code, RFC 9457 problem details, request ID, correlation ID and retry classification.
- Provider SDKs and direct `fetch` calls must not be introduced in page components.
- Authenticated binary downloads use `apiClient.download`; pages never read tokens from browser storage manually.
- `openapi/backend-openapi.json` and `types/openapi.generated.ts` are generated from the mounted FastAPI application and checked for deterministic drift.

## Query boundary

- Canonical keys are declared in `lib/query-keys.ts` and include organization/event scope before resource and filters.
- Filter objects are normalized before entering keys.
- Mutations invalidate their owned resource and affected projections explicitly.
- The full invalidation matrix is recorded in `QUERY_INVALIDATION_CONTRACTS.md`.
- Authentication, permission, validation, conflict and not-found failures are not automatically retried.
- Retryable network and server failures receive at most two retries.
- Redis, React Query and browser state are never authorization, licensing or payment truth.

## Migration policy

All Command Center domain hooks now use the canonical scoped-key wrapper. Raw query-key literals are rejected without a compatibility budget. A domain remains complete only while wrong-domain invalidations are absent and its cache invalidation contract stays documented.

## Control and test boundaries

- Release flags, experiments, and operational kill switches use `FeatureControl`; subscription access remains an activation-snapshot entitlement and is rejected at that boundary.
- Vitest uses fail-on-unhandled-request MSW fixtures.
- Playwright uses a reusable authenticated Super Admin fixture and runs axe against both public and authenticated shells.
- CI verifies generated contracts, raw-key/direct-fetch rules, production-mock regression, TypeScript, lint, unit tests, production build, Playwright, and axe.
