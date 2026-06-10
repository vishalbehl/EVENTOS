# 6. Security Design

The transformation to a multi-tenant commercial SaaS with modular Add-Ons requires a strict, multi-stage validation funnel to guarantee data isolation and feature entitlement.

## 1. Request Validation Pipeline
Every API request passes through this sequence:

1. **Authentication:** Validates the JWT signature and expiration.
2. **Platform Role Check:** Allows `SUPER_ADMIN` to bypass Tenant/Event checks for global admin routes.
3. **Tenant Context (Data Isolation):** Ensures the `organization_id` in the request matches the user's token.
4. **RBAC Check:** Validates the user has the required specific permission (e.g., `VENUE_SYNC:EXECUTE`).
5. **Entitlement Framework (PlanGuard Check):** 
   - Evaluates the required entitlement string for the endpoint.
   - Example 1: Endpoint requires `BASE:CONFERENCE_PROFESSIONAL`. PlanGuard checks if the org's plan is Pro or Enterprise.
   - Example 2: Endpoint requires `ADDON:VENUE_OPERATIONS`. PlanGuard checks the `feature_flags` table for the `ADDON_VENUE_OPERATIONS` flag, regardless of the base plan.
   - If validation fails, returns HTTP 402 or 403 (`ERR_UPGRADE_REQUIRED` or `ERR_ADDON_REQUIRED`).

## 2. Secure Impersonation System
- **Generation:** Only `SUPER_ADMIN` users can generate an impersonation token, requiring an explicit `reason` string.
- **Token Structure:** Contains an extra claim: `impersonator_id: <super_admin_id>`.
- **Visibility & Auditing:** The UI displays a persistent "Impersonating" banner. Every mutating action logs both the standard user ID and the `impersonator_id`.

## 3. Comprehensive Audit Logging
Required for the Enterprise tier. Every API mutation logs:
- Timestamp, User ID, Impersonator ID.
- Target Entity, Action taken, Previous State vs New State (JSON Diff).
- IP Address and User Agent.

## 4. API Key Management (Enterprise Plan Only)
- API Keys are strictly scoped to the Organization.
- Keys inherit the exact RBAC permissions and PlanGuard entitlements of the Organization.

## 5. UI/UX Entitlement Security
While the API strictly enforces entitlements, the frontend must gracefully degrade. If an organization on the Registration plan without Venue Operations logs in, the Next.js frontend will use the `/entitlements/resolve` API to completely hide the "Venue", "Edge Servers", and "Approval Workflow" tabs, preventing "unauthorized" errors and providing a clean, product-led user experience.