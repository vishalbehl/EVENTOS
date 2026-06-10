# 3. Phase 2 API Design

The API surface is expanded significantly to empower the Super Admin Control Plane, the internal CRM, and the dynamic frontend navigation.

## 1. Platform CRM & Health APIs
Accessible only to `SUPER_ADMIN` and `SUPPORT_ADMIN`.

- `GET /api/v1/platform/crm/organizations`
  - Returns enriched organization list including MRR, Health Score, and Plan.
- `GET /api/v1/platform/crm/organizations/{id}/health`
  - Returns detailed health metrics and active warnings.
- `GET /api/v1/platform/crm/organizations/{id}/timeline`
  - Fetches the `activity_timeline` for the organization.
- `GET /api/v1/platform/revenue/intelligence`
  - Returns MRR, ARR, Churn rate, and expansion revenue aggregations.

## 2. Feature Catalog & Overrides
Accessible to `SUPER_ADMIN`.

- `GET /api/v1/platform/features`
  - Lists the entire `feature_catalog`.
- `PUT /api/v1/platform/organizations/{id}/features/overrides`
  - Payload: `[{ "feature_id": "uuid", "is_enabled": true }]`
  - Creates or updates `organization_features` overrides.

## 3. Add-On Marketplace APIs
- `GET /api/v1/addons`
  - Lists all available add-ons in the marketplace and their pricing.
- `POST /api/v1/organizations/{id}/addons/purchase`
  - Initiates a Stripe Checkout session specifically for a marketplace Add-On.
- `GET /api/v1/organizations/{id}/addons`
  - Lists active, purchased add-ons for the tenant.

## 4. Usage Analytics
- `GET /api/v1/organizations/{id}/analytics/usage`
  - Returns time-series usage data (Daily/Weekly/Monthly) from `usage_snapshots`.
- `POST /api/v1/telemetry/usage-event`
  - Internal endpoint for microservices to log discrete usage events (e.g., an email sent).

## 5. Dynamic Navigation Engine
- `GET /api/v1/entitlements/navigation`
  - **Crucial Frontend Endpoint:** Evaluates the user's Plan, Add-Ons, Overrides, and RBAC to return a strictly structured JSON tree defining exactly which sidebar menus, tabs, and dashboard widgets the user is allowed to see.

## 6. Support Desk APIs
- `POST /api/v1/support/tickets`
  - Create a new ticket (Organization Users).
- `GET /api/v1/support/tickets`
  - List tickets (Scoped to Organization, or Global for Super Admins).
- `POST /api/v1/support/tickets/{id}/comments`
  - Add a reply/attachment.

## 7. Advanced Impersonation
- `POST /api/v1/auth/impersonation/request`
  - Payload: `{ "target_organization_id": "uuid", "reason": "Investigating ticket #442" }`
  - Generates an impersonation token with a strict 30-minute `exp`.
- `POST /api/v1/auth/impersonation/terminate`
  - Immediately invalidates the impersonation session and updates `terminated_at` in the log.