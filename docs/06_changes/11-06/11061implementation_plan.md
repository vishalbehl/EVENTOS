# Implementation Plan - Production-Grade Rate Limiting & Feature Gating

This plan outlines the design and implementation details for a robust, production-grade rate limiting and feature gating system. We will replace fragile URL regex checks with a decorator-based entitlement check, deploy a Redis-backed sliding window rate limiter, track API usage metrics via Redis/Celery buffers, and expose a timeline usage reporting endpoint.

## User Review Required

> [!WARNING]
> This change alters the middleware stack order and introduces a new Alembic migration to add `organization_id` to the `developer.rate_limits` table. Existing plan-tier limits will act as default fallbacks for organizations without overrides.

## Open Questions

None. The requirements are clear, and the existing codebase structure allows for clean integrations of both the new middleware and decorators.

---

## Proposed Changes

### 1. Feature Gating & Decorators

#### [NEW] [feature_gate.py](file:///d:/DEV/conf-platform/services/backend/app/core/dependencies/feature_gate.py)
- Create the `@require_feature("FEATURE_KEY")` dependency decorator.
- Internally uses `ActiveUser` and `DB` dependencies.
- Resolves whether the user's organization is entitled to the feature by invoking `EntitlementService.has_feature`.
- **Super Admin Bypass**: Skips verification if the user is a platform admin (`user.is_platform_admin == True` or `user.role == "super_admin"` or `user.platform_role == "SUPER_ADMIN"`).
- Raises a custom exception `EntitlementRequiredException` (HTTP 403) with the following structure:
  ```json
  {
    "error": "ERR_ENTITLEMENT_REQUIRED",
    "feature": "FEATURE_KEY",
    "upgrade_url": "/billing/upgrade"
  }
  ```

#### [MODIFY] [main.py](file:///d:/DEV/conf-platform/services/backend/app/main.py)
- Add a custom exception handler for `EntitlementRequiredException` returning the exact error body directly as JSON without wrapping it in a `"detail"` attribute.

---

### 2. Database & Migrations

#### [NEW] [Alembic Migration](file:///d:/DEV/conf-platform/services/backend/alembic/versions/20260611_0200_rate_limits_org_override.py)
- Migration revision to alter `developer.rate_limits` table:
  - Add nullable `organization_id` column (UUID) referencing `platform.organizations(id)` with cascade deletion.
  - Create index on `organization_id` for query optimization.

#### [MODIFY] [developer_registry.py](file:///d:/DEV/conf-platform/services/backend/app/modules/developer/models/developer_registry.py)
- Update `RateLimit` SQLAlchemy model mapping to include the new `organization_id` nullable column and its relationship/foreign key reference.

---

### 3. Redis Sliding Window Rate Limiter

#### [NEW] [rate_limiter.py](file:///d:/DEV/conf-platform/services/backend/app/middleware/rate_limiter.py)
- Create `RateLimiterMiddleware` (ASGI middleware) enforcing per-organization sliding window rate limits.
- Checks Redis ZSETs using rolling timestamps to avoid fixed-window spikes:
  - Rolling minute window: `rl:{org_id}:minute` (window = 60s)
  - Rolling day window: `rl:{org_id}:day` (window = 86400s)
- **Resolution Flow**:
  1. Retrieve rate limits (`req_per_min`, `req_per_day`) for `org_id` by checking `developer.rate_limits` for an override first, falling back to the subscriber plan tier.
  2. Cache theResolved Limits in Redis key `rate:limit:config:{org_id}` for 300 seconds to prevent DB request overhead.
  3. Validate against ZSET cardinality. If exceeded, return `HTTP 429 Too Many Requests` with:
     - `Retry-After` header.
     - Body: `{"detail": "Rate limit exceeded. Too many requests."}`
  4. Inject standard headers in both successful and rate-limited HTTP responses:
     - `X-RateLimit-Limit`
     - `X-RateLimit-Remaining`
     - `X-RateLimit-Reset`
- **Exclusion Filters**:
  - Skip check for Super Admin users.
  - Skip check for internal path patterns (e.g. `/health`, `/docs`, `/redoc`, `/openapi.json`, `/ws`).

#### [MODIFY] [main.py](file:///d:/DEV/conf-platform/services/backend/app/main.py)
- Register `RateLimiterMiddleware` in the FastAPI middleware stack.
- Position it after `AuthMiddleware` so authentication context (such as `org_id` and role claims) is already resolved and attached to request state.

---

### 4. Legacy Route Feature Gate Deprecation

#### [MODIFY] [plan_guard.py](file:///d:/DEV/conf-platform/services/backend/app/middleware/plan_guard.py)
- Replace `ENTITLEMENT_MAPPING` regex list with `FEATURE_MAP` dictionary mapping feature keys to URL prefixes.
- Mark `FEATURE_MAP` as **DEPRECATED** in docstrings, pointing developers to the `@require_feature` decorator.
- Update `PlanGuardMiddleware` logic to resolve features using prefix matching against `FEATURE_MAP`.

---

### 5. API Usage Analytics Tracking

#### [MODIFY] [rate_limiter.py](file:///d:/DEV/conf-platform/services/backend/app/middleware/rate_limiter.py)
- When a request passes the rate limits successfully, increment a Redis counter:
  - Increment key: `api_usage:{org_id}:{normalized_endpoint}` (where normalized endpoint replaces UUIDs with `{id}`).
  - Add the key to a Redis set `api_usage_keys` to track keys scheduled for database synchronization.

#### [MODIFY] [platform_tasks.py](file:///d:/DEV/conf-platform/services/backend/app/tasks/platform_tasks.py)
- Add periodic Celery task `flush_api_usage`.
- Pulls keys from `api_usage_keys`, retrieves counters via Redis pipeline atomically, deletes processed keys, and aggregates values into the `analytics.api_usage` table.

#### [MODIFY] [worker.py](file:///d:/DEV/conf-platform/services/backend/app/worker.py)
- Configure Celery beat schedule to invoke `app.tasks.platform_tasks.flush_api_usage` every 300 seconds (5 minutes).

#### [MODIFY] [__init__.py](file:///d:/DEV/conf-platform/services/backend/app/tasks/__init__.py)
- Re-export the new `flush_api_usage` task.

---

### 6. Billing Usage Endpoint

#### [NEW] [billing.py](file:///d:/DEV/conf-platform/services/backend/app/modules/billing/routers/billing.py)
- Implement `GET /billing/usage` route for active organizers.
- Returns live usage and plan caps:
  - `events_used` / `events_max`
  - `users_used` / `users_max`
  - `registrations_used` / `registrations_max`
  - `storage_used_bytes` / `storage_quota_bytes` (from pre-computed `organization_usage` table)
  - `api_calls_today` / `daily_limit` (queries the Redis daily ZSET cardinality `rl:{org_id}:day`)

#### [MODIFY] [__init__.py](file:///d:/DEV/conf-platform/services/backend/app/routers/__init__.py)
- Include and register the new billing router.

---

## Verification Plan

### Automated Tests
- Create `tests/test_rate_limiting_and_gating.py` verifying:
  - **Feature Gate**: Validates decorator allows Super Admins, blocks unentitled accounts, and returns exact custom JSON 403 error.
  - **Alembic Column**: Confirms the new `organization_id` column works on model operations.
  - **Sliding Window Middleware**: Validates Redis sliding window ZSET counters, returns HTTP 429 when limits are breached, and returns standard rate-limiting headers.
  - **API Usage Buffer**: Validates Redis INCR counter updates, and confirms Celery periodic task correctly flushes buffers to Postgres.
  - **Billing Endpoint**: Validates `GET /billing/usage` responds with active/live quotas compared against subscription plan caps.

### Manual Verification
- Run database migrations: `.venv\Scripts\alembic upgrade head`.
- Verify tests pass using pytest.
