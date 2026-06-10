# 4. Phase 2 UI Structures

The frontend architecture will be bifurcated into the **Tenant Application** (EventX OS) and the **Super Admin Control Plane** (EventX HQ).

## 1. Super Admin Control Plane (EventX HQ)

A dedicated Next.js application (or isolated layout) serving as the ultimate CRM and command center.

### A. Dashboard V2
- **Top Row KPIs:** Total Organizations, Total Revenue (MRR), Active Events, Venue Servers Online.
- **Alerts Panel:** Failed Payments, Security Alerts, High Priority Support Tickets.
- **Health Summary:** A donut chart showing Healthy vs. Warning vs. Critical organizations.
- **Add-On Adoption:** Bar chart showing the popularity of the Venue Operations, AI Assistant, and WhatsApp suites.

### B. Organization CRM (Detail View)
A comprehensive, tabbed interface for managing a single tenant.
- **Overview:** Health score, MRR contribution, renewal dates, trial status.
- **Events & Users:** Datatables of active resources.
- **Billing:** Invoice history, manual custom quote generation.
- **Feature Access:** A matrix showing the tenant's base plan features and any manual overrides applied by the Super Admin.
- **Add-Ons:** Active marketplace subscriptions.
- **Support Tickets:** Native integration to view open issues.
- **Activity Timeline:** A vertical feed showing log-ins, plan upgrades, and errors.
- **Impersonate Button:** Prominent action requiring a modal to input the "Reason" before generating the 30-minute session.

### C. Revenue Intelligence
- Dashboards mapping MRR, ARR, Churn, Upgrade/Downgrade revenue, and Hardware/Venue revenue segmentation.

## 2. Tenant Application (EventX OS)

### A. Organizer Onboarding Wizard
A step-by-step state machine upon first login:
1. Organization Setup (Name, Logo, Domain)
2. Create First Event
3. Choose Plan (Registration vs. Pro vs. Enterprise)
4. Payment (Stripe Integration)
5. Invite Team
6. Import Speakers
7. Configure Registration
8. Go Live

### B. Add-On Marketplace
A visually rich "App Store" within the tenant settings.
- Cards displaying available Add-Ons (e.g., "AI Assistant", "Venue Operations Hub").
- Detailed feature lists, pricing, and "Add to Subscription" buttons.

### C. Dynamic Navigation Engine
The frontend sidebar and top-nav are no longer hardcoded.
- The `Sidebar.tsx` component fetches the tree from `/api/v1/entitlements/navigation`.
- Only modules the user is entitled to (via Plan, Override, or Add-On) are rendered.
- If a user attempts to manually navigate to an unentitled route (e.g., `/events/123/venue`), a dedicated `UpgradeRequired` UI component intercepts the render, displaying the Marketplace card for the required Add-On or Plan.