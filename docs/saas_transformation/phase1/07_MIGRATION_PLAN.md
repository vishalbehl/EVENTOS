# 7. Migration Plan

Transitioning the existing EventX OS to the product-led SaaS and Add-On architecture requires a zero-downtime, phased approach to ensure existing users are not disrupted.

## Phase 1: Schema & Entitlement Preparation (Zero Impact)
1. **Apply Migrations:** Run Alembic migrations to create `subscription_plans`, `organization_subscriptions`, `feature_flags`, and billing tables.
2. **Seed Plans:** Insert the base definitions for `REGISTRATION`, `CONFERENCE_PROFESSIONAL`, and `ENTERPRISE`.
3. **Migrate Existing Tenants:** Automatically generate an `organization_subscriptions` record for every existing organization. 
   - *Crucial Step:* Assign all existing organizations to the `CONFERENCE_PROFESSIONAL` plan.
   - *Add-On Step:* Automatically insert a `feature_flags` record enabling `ADDON_VENUE_OPERATIONS` for all existing organizations. This ensures they retain full access to SRR, Venue Sync, and Edge devices exactly as they do today.

## Phase 2: Silent Enforcement (Log-Only Mode)
1. **Deploy PlanGuard:** Deploy the middleware to production in "Log-Only" mode.
2. **Monitor:** When a user accesses an advanced feature, PlanGuard evaluates their plan and add-ons. If it *would* have blocked them, it writes a warning to the logs.
3. **Analyze:** Engineering analyzes logs to ensure the migration correctly granted all legacy users the necessary feature flags.

## Phase 3: Control Plane & UI Rollout
1. **Launch Super Admin Panel:** Deploy the control plane for internal staff to view CRM data and manage Add-Ons manually.
2. **Frontend Degradation:** Deploy frontend updates that dynamically render the sidebar and UI components based on the `/entitlements/resolve` API.
3. **Stripe Integration Live:** Enable billing endpoints for new user signups targeting the Registration plan.

## Phase 4: Strict Enforcement Activation
1. **Flip the Switch:** Change PlanGuard from Log-Only to "Strict Blocking" mode.
2. **Live Operations:** The platform is now fully operating as a commercial SaaS. New users onboarding will enter via the Registration plan with a streamlined UI, while existing users will see no change thanks to their grandfathered Professional plan and Venue Operations Add-On.