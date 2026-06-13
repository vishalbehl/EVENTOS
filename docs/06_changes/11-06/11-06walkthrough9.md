# Walkthrough — Wiring CPMS Super Admin Dashboard to PostgreSQL

We have successfully wired the CPMS Super Admin Console Dashboard from mockup states to real PostgreSQL databases using SQLAlchemy asynchronous queries in FastAPI.

---

## Changes Implemented

### 1. Backend API Routing Extensions
- **[router.py](file:///d:/DEV/conf-platform/services/backend/app/modules/platform/router.py)**:
  - Added Pydantic schemas representing the extended telemetry payload: `ActivityItem`, `TrialExpiring`, and `DashboardMetrics`.
  - Decorated `GET /platform/dashboard` with `response_model=DashboardMetrics` and enforced admin-only validation dependencies.
  - Implemented SQL queries to retrieve:
    - **Active Users (30d)**: Count of users whose `last_login_at` is within the past 30 days.
    - **Monthly Churn Rate**: Ratio of cancelled trials/subscriptions to active ones.
    - **Open Support Tickets**: Graceful query over the support ticketing system.
    - **Revenue Today**: Sum of completed invoice payments today from `PaymentTransaction`.
    - **7-Day Sparkline Trends**: Daily counts for organizations, users, events, and MRR.
    - **Subscription Health Matrix**: Grouped counts of active, trial, grace, suspended, expired, and cancelled subscriptions.
    - **Recent Billing Activity**: Left-join mapping the last 10 payment events.
    - **Trials Expiring Soon**: Organizations with trials ending in the next 14 days.
    - **Platform Status & Telemetry Check**: DB ping and Redis check to report platform health status (`healthy`, `degraded`, or `down`).

---

### 2. Frontend Services & API Types
- **[super-admin-service.ts](file:///d:/DEV/cloud/command-center/services/super-admin-service.ts)**:
  - Extended the `DashboardMetrics` interface with the new backend fields.
  - Added type definitions for `ActivityItem` and `TrialExpiring`.
  - Left existing API hooks (`useAdminDashboard()`, `useRevenueMetrics()`, etc.) fully functional.

---

### 3. Dashboard Frontend Component Wiring
- **[page.tsx](file:///d:/DEV/conf-platform/apps/cloud/command-center/app/super-admin/page.tsx)**:
  - Replaced static placeholder counts and arrays with properties from the retrieved `useAdminDashboard()` data hook.
  - Wired the following components to live data:
    - **KPI Cards Grid**: Feeds total orgs, active users, current MRR/ARR, churn, open tickets, monthly events, and today's revenue.
    - **LiveHealthBar**: Reflects the actual status returned from telemetry and redis/db indicators.
    - **TopOrganizations**: Dynamic ranking of organizations by MRR.
    - **PlatformActivity**: Sums trends to show week-over-week growth.
    - **RecentBillingActivity**: Dynamically lists recent invoice ledger events.
    - **SubscriptionHealth**: A interactive grid redirecting users to matching subscription filters.
    - **TrialsExpiringSoon**: Lists trials expiring soon with a button to extend the trial duration.
  - Integrated `calculateDelta` and `formatCurrency` helper utilities.

---

## Verification Results

### 1. TypeScript Validation
Successfully ran project-wide type checking checks to verify no compilation errors:
```bash
> command-center@1.0.0 type-check
> tsc --noEmit
```
**Result**: Complete success with exit code `0`.

### 2. Next.js Production Build
Executed full Next.js Turbopack compiler build to verify build-time route and code optimization:
```bash
▲ Next.js 16.2.4 (Turbopack)
- Environments: .env.local

  Creating an optimized production build ...
✓ Compiled successfully in 38.8s
  Running TypeScript ...
  Finished TypeScript in 76s ...
  Collecting page data using 7 workers ...
✓ Generating static pages using 7 workers (53/53) in 1764ms
  Finalizing page optimization ...
```
**Result**: Build completed successfully. All static and dynamic routes compile correctly.
