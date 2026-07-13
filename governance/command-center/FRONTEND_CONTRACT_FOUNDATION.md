# Frontend Contract Foundation

## API boundary

- `apiClient` is the only general HTTP boundary for Command Center domain hooks and services.
- It reads authentication from the live auth store, attaches request and correlation IDs, enforces a 30-second default timeout, and preserves compatibility helpers.
- A single-flight refresh operation rotates access and refresh tokens after `401`; failure clears the local session.
- Failures are represented by `ApiError` with status, stable code, RFC 9457 problem details, request ID, correlation ID and retry classification.
- Provider SDKs and direct `fetch` calls must not be introduced in page components.

## Query boundary

- Canonical keys are declared in `lib/query-keys.ts` and include organization/event scope before resource and filters.
- Filter objects are normalized before entering keys.
- Mutations invalidate their owned resource and affected projections explicitly.
- Authentication, permission, validation, conflict and not-found failures are not automatically retried.
- Retryable network and server failures receive at most two retries.
- Redis, React Query and browser state are never authorization, licensing or payment truth.

## Migration policy

Existing hooks remain compatible while domains migrate to canonical keys. A domain is complete only when raw duplicate keys and wrong-domain invalidations are removed and its cache invalidation contract is documented.
