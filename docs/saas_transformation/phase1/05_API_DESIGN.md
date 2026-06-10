# 5. API Design

To support the product-led SaaS platform, PlanGuard entitlements, and modular Add-Ons, the API will be expanded while ensuring strict backward compatibility for all existing functionality.

## New Entitlement & Billing API Namespaces

### 1. `/platform/*` (Super Admin Use Only)
- `GET /platform/organizations` - List all tenants with pagination, active plans, and purchased add-ons.
- `PATCH /platform/organizations/{id}/status` - Suspend or activate a tenant.
- `POST /platform/organizations/{id}/add-ons` - Manually activate a custom quotation add-on (e.g., Venue Operations) by generating a feature flag.

### 2. `/billing/*` & `/subscriptions/*` (Organization Billing)
- `GET /billing/plans` - List `REGISTRATION`, `CONFERENCE_PROFESSIONAL`, and `ENTERPRISE` plan limits.
- `GET /subscriptions/current` - Fetch current active subscription details and quotas.
- `POST /billing/checkout-session` - Initiate a Stripe checkout session for core plans.
- `POST /billing/customer-portal` - Generate a Stripe Customer Portal link.
- `POST /billing/webhooks/stripe` - Unauthenticated webhook endpoint for Stripe async events.

### 3. `/entitlements/*` (Frontend UI Configuration)
- `GET /entitlements/resolve` - A critical endpoint for the frontend. Returns a comprehensive JSON object detailing exactly which UI elements, dashboard widgets, and sidebar routes should be rendered based on the intersection of the active base plan and any unlocked feature flags (Add-Ons).

### 4. `/organizations/*` (Tenant Management)
- `GET /organizations/{id}/usage` - Fetch real-time usage metrics against plan quotas.

### 5. `/impersonation/*` (Secure Access)
- `POST /impersonation/start` - Generates a short-lived JWT scoped to the target organization for support debugging.

## Backward Compatibility Assurance
Existing routes (e.g., `POST /api/v1/venue/sync`) remain untouched. However, the `PlanGuard` middleware injected into the FastAPI router dependency tree will intercept the call. If the organization lacks the `ADDON_VENUE_OPERATIONS` entitlement, the route returns an HTTP 403 `ERR_ADDON_REQUIRED` before any business logic is executed.