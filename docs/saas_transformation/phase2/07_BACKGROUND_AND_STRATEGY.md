# Phase 2: Platform Strategy & Execution

This document outlines the background processing, caching, testing, and rollout strategies for the implemented Phase 2 Control Plane.

## 1. Background Jobs & Aggregation
The Platform Control Plane relies on two primary background tasks (implemented in `app/tasks/platform_tasks.py`) designed to run via Celery or APScheduler:
- **`generate_daily_usage_snapshots`**: Runs at 00:00 UTC. Converts the live denormalized `UsageMetric` into an immutable `UsageSnapshot` for exact billing and historical graph rendering.
- **`calculate_all_organizations_health`**: Runs hourly. Uses the `OrganizationHealthService` to aggregate storage usage, unhandled support tickets, and billing states to update the `OrganizationHealth` score (0-100).

## 2. Caching Strategy
The `EntitlementService` and `PlanGuardMiddleware` intercept every request, making them a potential bottleneck.
- **L1 Cache (In-Memory):** Store the resolved `Set[str]` of entitlements in the FastAPI request state or an async lru_cache for the duration of the request.
- **L2 Cache (Redis):** Cache the output of `EntitlementService.resolve_entitlements(org_id)` in Redis.
  - **Key:** `entitlements:{organization_id}`
  - **TTL:** 10 minutes.
  - **Invalidation:** Whenever an Organization's Plan is upgraded, an Add-On is purchased, or a Super Admin applies a `FeatureOverride`, a publish event must invalidate this specific Redis key to instantly reflect the new permissions.

## 3. Testing Strategy
Given the complexity of the 10-step authorization pipeline:
1. **Entitlement Matrix Tests:** Pytest suites specifically focused on the `EntitlementService`. Asserting that `Registration` plan + `Venue Addon` correctly yields `ADDON_VENUE_OPERATIONS` but safely omits `ENT_API_ACCESS`.
2. **Middleware Mocking:** Test `PlanGuardMiddleware` by mocking the Redis entitlement cache and asserting that `HTTP 402` or `HTTP 403` is correctly thrown when appropriate.
3. **Impersonation Leakage:** Write strict security tests ensuring an impersonated token (with an `impersonator_id` claim) absolutely cannot access another organization's data.

## 4. Migration & Rollout Plan (Automated)
The provided script `scripts/seed_saas_platform.py` executes the entire migration automatically.
1. **Data Normalization:** Translates the old hardcoded plan logic into the `FeatureCatalog`, `SubscriptionPlan`, and `Addon` tables.
2. **Tenant Grandfathering:** Scans the database for organizations without a subscription. Automatically generates an `OrganizationSubscription` attaching them to the `CONFERENCE_PROFESSIONAL` plan.
3. **Add-On Attachment:** Explicitly links the `Venue Operations` Add-On via the `OrganizationAddon` table to guarantee that existing physical events suffer absolutely zero downtime.

This strategy ensures a highly scalable SaaS backend perfectly aligned with a modular product-led growth model.