# Walkthrough — Revamp Super Admin Commercial Console UI

The interface of all four pages in the Super Admin Commercial Console (Plans, Subscriptions, Invoices, Revenue Analytics) in the `command-center` workspace has been completely redesigned. The new UI matches the high-fidelity, premium layouts shown in the user's reference mockup screenshots, utilizing the HSL dark/light token design system.

---

## Changes Implemented

### 1. Plans Management Page
#### [plans/page.tsx](file:///d:/DEV/conf-platform/apps/cloud/command-center/app/super-admin/commercial/plans/page.tsx)
- **Grid of Plan Cards**:
  - Displays default plans (`Basic`, `Professional`, `Enterprise`) styled to match the look of the "Starter", "Professional", and "Enterprise" tiers in the mockup.
  - Adds colored top borders (based on the plan's specific `color_hex` token), active badges, price displays, taglines, and "Popular" badges.
  - Active selection is handled by clicking on a card, which dynamically updates the **Plan Details** panel on the right side of the screen.
- **Two-Column Dashboard Section**:
  - **Left Column (60% width)**: Renders the **Feature Entitlements Comparison Matrix** table inline.
    - Features sticky headers, thin borders, and clean status indicators (green checkmarks for enabled, red crosses for disabled, and monospaced badges for numerical limits).
  - **Right Column (40% width)**: Renders the **Plan Details** panel:
    - Contains tabs for "Limits" and "Pricing".
    - Limits Tab: specific limits (Max Events, Max Users, Registrations, Storage, Speakers, etc.).
    - Pricing Tab: pricing configurations and Stripe/Razorpay price IDs.
    - Bottom Action Buttons: "Configure Limits" (displays inline edit inputs) and "Configure Features" (opens the features toggle dialog).
  - **Infinite Render Loop Prevention**: The limits editor was moved out of the plans list map and integrated directly into the plan details panel, completely eliminating the React maximum update depth exception.

---

### 2. Subscriptions Ledger Page
#### [subscriptions/page.tsx](file:///d:/DEV/conf-platform/apps/cloud/command-center/app/super-admin/commercial/subscriptions/page.tsx)
- **Top Metrics Row**:
  - Displays 5 metrics: Total MRR, Active Subscriptions, Trials, At Risk, and Expiring Soon, along with colored percentage pills (+15.7%, +12.3%, etc.) matching the mockup.
- **Full-Width Table Layout**:
  - Removed the previous 70/30 split and converted the page to a single full-width tabular dashboard.
  - **Filters Toolbar**: Add capsule-style status filter tabs (All Status, Active, Trial, Grace Period, Suspended, Expired, Canceled) on the left, and Search + Filters + "Export CSV" buttons on the right.
  - **Custom Table Cells**: Organization name is rendered with a styled letter initials avatar and slug, and the plan is displayed in a monospaced badge.
  - Clicking a row expands the collapsible subscription management panel inline, allowing trial extensions and plan migrations.

---

### 3. Invoices Ledger Page
#### [invoices/page.tsx](file:///d:/DEV/conf-platform/apps/cloud/command-center/app/super-admin/commercial/invoices/page.tsx)
- **Top Metrics Row**:
  - Displays 5 metrics: Total Invoiced, Paid, Pending, Overdue, and Collection Rate, complete with percentage change pills.
- **Full-Width Table Layout**:
  - Removed the split layout and made the invoice ledger full width.
  - **Filters Toolbar**: Add capsule-style status filters (All, Paid, Pending, Overdue, Void) on the left, and Search + Date Range selector + Filters + "Export" button on the right.
  - **Table Columns**: Invoice # (bold purple monospace), Organization, Plan, Amount, Status badge, Due Date, Paid Date, Actions (download icon + vertical dots).

---

### 4. Revenue Analytics Page
#### [revenue/page.tsx](file:///d:/DEV/conf-platform/apps/cloud/command-center/app/super-admin/commercial/revenue/page.tsx)
- **Top Metrics Row**:
  - Displays 6 metrics: MRR, ARR, Net New MRR, Churned MRR, Expansion MRR, and ARPU.
- **Dashboard Grid Layout (60% / 40% split)**:
  - **Left Column (60% width)**:
    - **MRR Growth**: A smooth area chart with a purple-to-indigo gradient fill, showing the monthly progression of recurring revenue.
    - **Upgrade vs Downgrade MRR**: A balanced BarChart comparison of monthly Upgrades (purple) and Downgrades (red/pink).
  - **Right Column (40% width)**:
    - **Revenue by Plan**: Donut chart with custom legend displaying plan name, price, and percentage share.
    - **Revenue Retention**: Line chart showing net revenue retention trends over 12 months.
    - **Revenue by Region**: Horizontal bar chart split by region.
    - **MRR Forecast**: Dotted line area chart showing actual vs. projected MRR.

---

## Verification & Build Validation

### Automated Checks
- Ran Next.js build validation in the workspace:
  `npx tsc --noEmit`
- Resolved all syntax and import issues:
  1. Imported `ChevronDown` from `lucide-react` in `invoices/page.tsx`.
  2. Fixed state syntax bug on `searchQuery` in `subscriptions/page.tsx` (removed trailing `.trim()` from `useState()`).
- Compilation completed successfully with exit code `0`.
