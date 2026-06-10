# EventX SaaS Platform Transformation Architecture

This document outlines the architectural design for transforming the EventX OS into a multi-tenant, commercial SaaS platform, introducing a global Platform Layer, subscription management, and enhanced RBAC.

## 1. Updated Architecture
The architecture is evolving from a simple Tenant -> Event model to a hierarchical, plan-aware SaaS model.

**Hierarchy:**
`Platform (Super Admin Layer) -> Organization (Tenant) -> Event`

**Core Components:**
*   **Platform Control Plane:** A new Super Admin Dashboard to manage organizations, billing, feature flags, and platform-wide configurations.
*   **Billing Engine:** Integration with Stripe for subscription lifecycle management (Starter, Professional, Enterprise).
*   **PlanGuard Middleware:** Intercepts requests to validate if the requested feature is enabled for the organization's current subscription plan.
*   **Enhanced RBAC:** Introduction of Platform-level, Organization-level, and Event-level roles.

## 2. Database Schema Changes
New entities will be introduced without breaking existing tables.

**New Tables:**
*   `platform_settings`: Global configurations.
*   `subscription_plans`: Defines Starter, Professional, Enterprise and their limits (users, events, storage).
*   `organization_subscriptions`: Links an organization to a plan, tracking status (`ACTIVE`, `TRIAL`, `SUSPENDED`), Stripe customer ID, and renewal dates.
*   `invoices`, `payments`, `coupons`: Billing records.
*   `feature_flags`: Key-value pairs for toggling features globally or per organization.
*   `usage_metrics`: Tracks storage, registrations, and active events per organization.
*   `impersonation_logs`: Audit trail for Super Admins accessing tenant accounts.

**Modifications to Existing Tables:**
*   `organizations`: Add foreign keys to `organization_subscriptions`.
*   `users`: Add `platform_role` (e.g., SUPER_ADMIN, SUPPORT_ADMIN) to distinguish from standard tenant users.

## 3. RBAC Matrix

**Platform Roles (Global Scope):**
*   `SUPER_ADMIN`: Full access to all platform settings, billing, and impersonation.
*   `SUPPORT_ADMIN`: View organizations, view events, handle support tickets.
*   `FINANCE_ADMIN`: Manage global billing, payments, and invoices.
*   `SECURITY_ADMIN`: View audit logs, manage global RBAC, manage API keys.

**Organization Roles (Tenant Scope):**
*   `OWNER`: Full organization access, subscription management.
*   `ORG_ADMIN`: User management, event creation, reporting.
*   `FINANCE_MANAGER`: View invoices, manage payment methods.
*   `SECURITY_MANAGER`: Tenant-level audit logs and RBAC.

**Event Roles (Event Scope):**
*   *Existing roles retained* (Event Director, Session Manager, Technician, etc.).
*   New granular permissions added: `PAYMENTS:REFUND`, `SPONSORS:VIEW/CREATE/EDIT`, `INCIDENTS:MANAGE`, `VENUE_SYNC:EXECUTE`.

## 4. Subscription Architecture
**Plans:**
1.  **Starter:** 1 Org, 3 Events, 10 Team Members, 1k Registrations. (Features: Basic Events, Reg/Speaker Portals, Campaigns).
2.  **Professional:** 10 Events, 50 Team Members, 20k Registrations. (Adds: Venue Sync, SRR, Badge Printing, WhatsApp).
3.  **Enterprise:** Unlimited Usage. (Adds: API, SSO, White Label, AI Assistant).

**Enforcement (`PlanGuard`):**
A FastAPI dependency/middleware that checks the `feature_key` against the Organization's active `subscription_plan`. Overrides are possible via `feature_flags`.

## 5. API Design
New API namespaces to support the SaaS model (backward compatible):

*   `GET /api/v1/platform/organizations`: List all tenants (Super Admin).
*   `POST /api/v1/billing/subscribe`: Initiate Stripe checkout.
*   `POST /api/v1/impersonation/start`: Generate an impersonation JWT (Super Admin).
*   `GET /api/v1/organizations/{id}/usage`: Fetch current quota metrics.
*   `GET /api/v1/feature-flags`: Resolve active features for the UI.

## 6. Security Design
*   **Authentication Flow:** Token validation -> Platform Role Check -> Organization Role Check -> Event Role Check -> PlanGuard Check.
*   **Impersonation:** Secure generation of scoped JWTs. The token payload will include `impersonator_id`. All actions performed will log the `impersonator_id` alongside the standard `user_id`.
*   **Audit Logging:** Every mutating action logs IP, User Agent, Timestamp, and previous/new states.

## 7. Migration Plan
1.  **Phase 1: Schema Updates:** Deploy new tables (`subscription_plans`, `feature_flags`, etc.) without enforcing constraints on existing data.
2.  **Phase 2: Data Seeding:** Seed default plans (e.g., auto-assign existing organizations to an "Enterprise Legacy" plan to prevent disruption).
3.  **Phase 3: Code Deployment:** Deploy `PlanGuard` in "log-only" mode to monitor enforcement hits without blocking requests.
4.  **Phase 4: Enforcement:** Enable strict plan enforcement and launch the Super Admin dashboard.

## 8. Rollout Plan
*   **Week 1-2:** Database migrations, Billing engine (Stripe) integration, and Plan models.
*   **Week 3-4:** Implementation of `PlanGuard` middleware and UI feature toggles.
*   **Week 5-6:** Development of the Super Admin Command Center.
*   **Week 7:** Security audits, penetration testing of impersonation features.
*   **Week 8:** Production deployment (Phase 1 & 2), followed by a phased transition to Phase 4.

## 9. Risk Assessment
*   **Risk:** Lockout of existing users during RBAC migration.
    *   *Mitigation:* Map all existing "Super Admins" to the new Platform `SUPER_ADMIN` role and existing Organizers to `ORG_ADMIN` on a legacy unlimited plan.
*   **Risk:** Impersonation abuse.
    *   *Mitigation:* Strict audit logging, mandatory "reason" field, and alerting to a dedicated Slack channel when impersonation starts.
*   **Risk:** Stripe webhook failure causing service disruption.
    *   *Mitigation:* Idempotent webhook handlers, generous grace periods for failed payments (e.g., 7 days) before suspension.

## 10. Testing Strategy
*   **Unit Tests:** Verify `PlanGuard` correctly blocks/allows access based on mocked plan objects.
*   **Integration Tests:** End-to-end testing of Stripe webhook events (Checkout completed, Subscription updated/deleted).
*   **Security Tests:** Verify impersonation tokens cannot be used to escalate privileges beyond the target organization.
*   **Load Tests:** Ensure the `PlanGuard` middleware (which checks DB/Redis on every request) does not introduce latency bottlenecks.
