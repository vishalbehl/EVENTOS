# 8. Rollout Plan

The rollout plan outlines the chronological timeline for executing the product-led SaaS transformation and Venue Operations decoupling over an 8-week cycle.

## Weeks 1-2: Architecture & Database
- **Milestone 1:** Database schemas finalized, migrations tested, and merged.
- **Milestone 2:** Base plans (Registration, Conference Professional, Enterprise) seeded in staging and production.
- **Milestone 3:** Entitlement framework designed, focusing on separating core SaaS from the `ADDON_VENUE_OPERATIONS` feature flag.

## Weeks 3-4: Entitlements & Middleware
- **Milestone 4:** `PlanGuard` middleware developed, unit tested, and mapped to all existing protected API routes, UIs, and background workers.
- **Milestone 5:** Impersonation JWT logic built, including audit logging mechanisms.
- **Milestone 6:** Stripe integration foundation completed for self-serve upgrades (Registration -> Professional).

## Weeks 5-6: UI/UX Segregation & Control Plane
- **Milestone 7:** Frontend navigation heavily refactored to consume `/entitlements/resolve`. Features like SRR, File Monitoring, and Venue Sync completely disappear from the UI for Registration-plan users.
- **Milestone 8:** Super Admin Command Center frontend developed (CRM, manual Add-On toggles for custom quotations).
- **Milestone 9:** Tenant-facing billing UI developed (Pricing pages, Invoice history).

## Week 7: Phase 1 & 2 Deployment (Silent Operations)
- **Milestone 10:** Production deployment of schema changes and data seeding. All legacy users are granted the `CONFERENCE_PROFESSIONAL` plan + `ADDON_VENUE_OPERATIONS` flag.
- **Milestone 11:** `PlanGuard` deployed to production in "Log-Only" mode.
- **Milestone 12:** Extensive QA, verifying that the Registration plan successfully masks advanced conference operations.

## Week 8: Final Transition & Go-Live
- **Milestone 13:** Analysis of "Log-Only" data to ensure no false positives for legacy users.
- **Milestone 14:** `PlanGuard` switched to strict enforcement mode.
- **Milestone 15:** Public SaaS launch finalized. New self-serve onboarding funnels live for the Registration plan.