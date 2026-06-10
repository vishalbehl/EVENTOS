# 1. Updated Architecture

The architecture of EventX OS is evolving into a fully realized, multi-tenant hierarchical SaaS model built around a **Modular Core + Add-On Architecture**.

## Target Hierarchy
The new conceptual hierarchy ensures complete logical separation, supporting platform-wide oversight while allowing organizations to attach modular add-ons (like Venue Operations) independently of their base subscription.

```text
Platform (Super Admin Layer)
│
├── Organizations (Tenants)
│   │
│   ├── Subscription Plan (Registration, Conference Professional, or Enterprise)
│   ├── Active Add-Ons (e.g., Venue Operations)
│   ├── Billing
│   ├── Users
│   ├── Events
│   └── Storage
│
└── Event Layer
    ├── Sessions
    ├── Speakers
    ├── Registrations
    └── Files
```

## Core Architectural Additions

### 1. Platform Control Plane (Super Admin Dashboard)
A completely new application layer accessible only to platform administrators. 
- **Purpose:** Manage the entire SaaS ecosystem.
- **Capabilities:** View organizations, manage billing states, configure custom quotations (e.g., activating Venue Operations), and monitor global infrastructure.

### 2. PlanGuard & Feature Entitlement Framework
A robust policy enforcement middleware embedded deeply into the API routing, UI navigation, and background worker layer.
- **Mechanism:** Every protected module, API endpoint, dashboard widget, and backend service is mapped to a specific plan tier or add-on flag.
- **Validation Flow:** `Request -> Authentication -> RBAC -> Entitlement Check (Plan Base + Add-Ons) -> Execution`
- **Example:** A request to trigger Venue Sync checks if the `VENUE_OPERATIONS_ADDON` feature flag is present for the organization, completely independent of whether they are on the Registration or Enterprise plan.

### 3. Decoupled Venue Operations
Venue Operations are structurally separated from the core cloud SaaS offering. Edge server binaries, offline sync engines, and hardware device management APIs are locked behind a specific entitlement layer, ensuring cloud-only customers have a streamlined UI without hardware clutter.

### 4. Billing Engine Integration
A robust integration with Stripe directly at the Organization layer, supporting core base subscriptions (monthly/yearly) alongside custom, invoice-based manual additions for enterprise hardware and on-site support services.