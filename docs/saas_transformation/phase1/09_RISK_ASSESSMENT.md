# 9. Risk Assessment

Transforming an existing application into a product-led commercial SaaS with decoupled add-ons involves significant architectural shifts.

## 1. Disruption of Legacy Users
**Risk:** When enforcing subscription plans and add-on flags, existing users might lose access to features like Venue Sync or Presentation Approvals, causing severe disruption.
**Mitigation:** 
- Execute a strict grandfathering migration script that places all pre-existing organizations onto the `CONFERENCE_PROFESSIONAL` plan and explicitly injects the `ADDON_VENUE_OPERATIONS` feature flag.
- Utilize the "Log-Only" deployment phase of `PlanGuard` to confirm existing user traffic is not flagged as unauthorized.

## 2. Incomplete UI Degradation
**Risk:** If the frontend is not perfectly synchronized with the `PlanGuard` middleware, users on the Registration plan might see buttons for "Send to Venue" or "Review Presentation." Clicking these will result in an ungraceful API HTTP 403 error.
**Mitigation:**
- Centralize all frontend feature toggles into a single React Context/Zustand store powered strictly by the `/entitlements/resolve` API.
- Institute strict QA scripts specifically testing the UX of a pure Registration plan tenant to ensure no advanced Conference or Venue UI elements bleed through.

## 3. Venue Operations Decoupling Complexity
**Risk:** Venue Operations (Edge Servers, local sync) currently shares deep logic with the cloud core. Isolating it purely via a feature flag could leave orphaned background tasks running for tenants who don't possess the add-on.
**Mitigation:**
- Apply the Entitlement Framework to Celery task dispatchers as well. Background jobs related to venue sync queues or SRR thumbnails should immediately return/abort if the host organization lacks the `ADDON_VENUE_OPERATIONS` flag.

## 4. Performance Bottlenecks from `PlanGuard`
**Risk:** Checking subscription status and feature flags on every single API request adds latency.
**Mitigation:**
- Cache the `/entitlements/resolve` payload heavily using Redis.
- Implement localized TTL caching within the FastAPI application state to reduce network hops for high-frequency routes (like check-in scanning).