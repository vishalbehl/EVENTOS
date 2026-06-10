# 1. Phase 2 Platform Architecture

The EventX Phase 2 architecture builds directly on the established modular core (Registration, Professional, Enterprise tiers) and the PlanGuard middleware. It transforms the system from a basic multi-tenant host into a comprehensive **Platform Control Plane** designed to manage thousands of organizations, complex feature entitlements, and robust add-on marketplaces.

## 1. Core Architectural Pillars

### A. The Platform Control Plane (Super Admin CRM)
The Control Plane is elevated into a fully-fledged CRM for EventX's internal teams. It acts as the operational nerve center, providing a 360-degree view of every tenant's health, usage, revenue, and support history.
- **Organization Health Engine:** A background analysis engine continuously evaluating metrics (storage, failed payments, user activity, sync errors) to compute a real-time "Health Score" (0-100) for every tenant.
- **Revenue Intelligence:** A dedicated analytics pipeline tracking MRR, ARR, churn, and add-on expansion revenue.
- **Customer Activity Timeline:** An event-sourced ledger tracking all critical organizational lifecycle events (plan changes, support tickets, logins, feature activations).

### B. Dynamic Feature Catalog & Marketplace
Replacing simple key-value feature flags, the platform now utilizes a structured **Feature Catalog**.
- **Plan Feature Mapping:** Features are formally mapped to plans (`REGISTRATION -> speaker_portal`).
- **Organization Overrides:** Super Admins can surgically override feature access for specific organizations without requiring a full plan upgrade (e.g., granting `posters` to a Registration plan user).
- **Add-On Marketplace:** Expands beyond Venue Operations to support a thriving ecosystem of optional modules (AI Assistant, WhatsApp Suite, Advanced Analytics, White Label). Each Add-On manages its own price, features, dependencies, and limits.

### C. Advanced Security & Governance
- **Hardened Impersonation:** The "Login As" capability is fortified with maximum session durations (30 minutes), mandatory approval workflows/reasons, and comprehensive session termination logging.
- **Extended Authorization Pipeline:** The PlanGuard middleware is upgraded to evaluate a deeper matrix: `Authentication -> Platform Role -> Organization Role -> Event Role -> Subscription -> Plan Features -> Overrides -> Add-Ons -> RBAC -> Scope`.

### D. Customer Lifecycle & Support
- **Support Desk System:** A built-in ticketing system natively integrated with the CRM, allowing tenants to request help and Super Admins to resolve issues with full context of the tenant's health and configuration.
- **Onboarding Engine:** A state-machine-driven onboarding wizard guiding new organizations from initial setup and payment through to their first live event.

### E. Dynamic Navigation Engine
The frontend navigation is decoupled from static configurations. It relies on a `navigation_entitlements` system that dynamically renders the UI based on the exact intersection of the user's Plan, purchased Add-Ons, Super Admin overrides, and RBAC permissions.