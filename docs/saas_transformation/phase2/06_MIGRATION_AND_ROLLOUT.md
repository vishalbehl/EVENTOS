# 6. Phase 2 Migration & Rollout Plan

Implementing the Phase 2 Control Plane and Feature Catalog involves migrating away from static plan definitions to a dynamic database-driven entitlement system.

## Phase 1: Database & Telemetry Foundation
1. **Schema Deployment:** Run migrations for `feature_catalog`, `plan_features`, `organization_features`, marketplace tables, and the Support Desk.
2. **Seed the Catalog:** Run a data seed script to populate `feature_catalog` with all existing platform capabilities (e.g., `registration_portal`, `venue_sync`, `posters`).
3. **Map the Plans:** Seed `plan_features` to map the catalog entries to the `REGISTRATION`, `CONFERENCE_PROFESSIONAL`, and `ENTERPRISE` plans.
4. **Deploy Telemetry:** Silently deploy the `usage_events` tracking code across backend services to begin collecting real-time activity metrics.

## Phase 2: Authorization Pipeline Upgrade
1. **Refactor PlanGuard:** Upgrade the `PlanGuard` middleware to evaluate the new database-driven authorization pipeline (Plan -> Overrides -> Add-Ons) instead of hardcoded enums.
2. **Shadow Mode:** Run the new pipeline alongside the existing one, logging discrepancies, to ensure the new catalog mapping perfectly matches Phase 1 behavior.
3. **Impersonation Hardening:** Deploy the 30-minute session limits and tracking updates to the `/impersonation` endpoints.

## Phase 3: The Super Admin Control Plane
1. **Launch EventX HQ:** Deploy the dedicated Next.js application for Super Admins.
2. **Activate Health Engine:** Enable the background workers that calculate the Organization Health Score based on the accumulated telemetry data.
3. **Internal Training:** Train the support and finance teams on using the CRM, managing Support Tickets, and applying Feature Overrides.

## Phase 4: Tenant Experience Rollout
1. **Dynamic Navigation:** Switch the tenant-facing frontend to consume `/api/v1/entitlements/navigation`.
2. **Launch Marketplace:** Expose the Add-On Marketplace in the tenant settings.
3. **Onboarding Wizard:** Direct all new signups through the 8-step onboarding flow.

## Future Readiness Assured
By moving to a normalized `feature_catalog` and `addons` marketplace, the platform is now entirely agnostic to future product expansions. Introducing an "AI Assistant", a "Vendor Marketplace", or an "Enterprise Mobile App" simply requires adding rows to the catalog and marketplace tables, without requiring major structural changes to the core middleware or RBAC engine.