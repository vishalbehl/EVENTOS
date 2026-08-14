# Eventos Command Center — Full UX & Feature Guide

> Based on a full audit of your codebase, your design philosophy from previous builds (registration portal, organiser portal), and your stated goal of making the command center feel as smooth and non-intimidating as the user-facing apps.

---

## Your Design DNA (What You've Already Established)

| Trait | What You Do |
|---|---|
| **Zero friction entry** | Users land and immediately understand what's happening — no learning curve |
| **Cards over tables where possible** | Cards for summary/overview, tables only when dense data is needed |
| **Color-coded status everywhere** | Green/amber/red pills, never raw text for states |
| **Micro-animations** | Framer Motion — slide in, fade, hover lift, active scale |
| **Progressive disclosure** | Show headline KPIs first, drill into detail via sheet/drawer |
| **Empty states are not empty** | Always a message + action button, never a blank white box |
| **Dark-first, surface tokens** | `--bg-surface`, `--bg-surface-3`, `--text-primary` etc. |
| **Data freshness signals** | "Updated X min ago" on every live piece of data |

---

## Current State Audit

```
✅ Built & functional     🟡 Partial / placeholder     ❌ Stub only (ConsoleDashboard)
```

| Console | Dashboard | Key Pages |
|---|---|---|
| 🏠 Home | ✅ Full HomeOverviewScreen | Platform health: ✅ · Live activity: 🟡 · Console access: ✅ |
| 💼 Business | 🟡 ConsoleDashboard stub | CRM: ✅ · Pricing: ✅ · Sales/Quotes/Proposals: ✅ · Subscription: 🟡 |
| 💰 Revenue | ❌ Stub | Invoices/Transactions/Payments: ❌ · Taxes: ❌ · Financial audit: ❌ |
| ⚙️ Operations | ✅ Full PageScreen | Requests/Jobs/Venue/Risk/DB/Storage: 🟡 |
| 🔒 Security | ❌ Stub | Users: ✅ · Audit logs: ✅ · Others: ❌ |
| 👨‍💻 Developer | ❌ Stub | All pages: ❌ |
| 🎫 Support | 🟡 Partial | Tickets: ✅ · Announcements: ✅ · Knowledge base: ❌ |

---

## 🏠 HOME CONSOLE — Command Center Hub

**Purpose:** The "war room" — a living snapshot of everything happening across the entire platform.

---

### Page 1: Overview (`/dashboard/overview`) — ✅ Has content, needs UX polish

**What exists:** KPI cards (Orgs, Users, MRR, Events, Tickets, ARR, Revenue, Churn), MRR area chart, Top 5 Orgs, Subscription Health matrix, Recent Activity feed, Trials Expiring.

**What to add / improve:**

#### Quick Action Row (above KPIs)
A horizontal strip of 4–5 one-click actions that your team actually uses daily:
```
[ + Create Organization ]  [ Search Organizations ]  [ Send Announcement ]  [ Impersonate User ]
```
- Each is a button that opens a sheet/modal, not a new page
- Saves 3+ clicks for the most common workflows

#### Console Health Strip (replaces plain banner)
Replace the plain text platform health banner with a **horizontal scrollable console health row**:
```
Home [● HEALTHY]  Business [● HEALTHY]  Revenue [● DEGRADED]  Operations [● HEALTHY] ...
```
Each chip is clickable → opens a popover with last-checked timestamp + service details.

#### MRR Chart Improvements
- Add a **time range selector** (7D / 30D / 90D / This Year) — currently hardcoded 7 days
- Add a **secondary line** for ARR on the same chart
- Add **event annotations** on the chart (e.g., "New org joined" marker on a spike)

#### Organization Spotlight (replace leaderboard)
Replace "Top 5 Orgs by MRR" with a **3-column card grid** of noteworthy orgs:
- Highest MRR org (green accent)
- Fastest growing org this month (blue accent)
- At-risk org (amber — trial expiring / grace period)

This is more actionable than a plain ranked list.

#### Activity Feed → Live Activity Panel
Current feed is static scroll. Make it feel alive:
- Auto-refresh every 30s (with a "New X events" floating badge if updates arrive)
- Group by hour: "Today, 2:30 PM" section headers
- Filter tabs: **All · Billing · Auth · Organizations · Events**
- Each item has an avatar (org initials), action text, and a `→` link

#### Trials Expiring → At-Risk Accounts Panel
Expand "Trials expiring" into a wider "At-Risk Accounts" panel:
- **Expiring trials** (with days remaining pill + Extend button)
- **Grace period** orgs (with "days left in grace" + Convert button)
- **Suspended** orgs (with a "Reactivate" action)

---

### Page 2: Platform Health (`/dashboard/platform-health`) — 🟡 Needs a real page

**What to build:**

#### Service Grid
A 2×4 grid of service cards (database, Redis, Celery workers, email, storage, search, venue sync, payment gateway). Each card shows:
- Service name + icon
- Status pill (Healthy / Degraded / Down / Unknown)
- Response time (ms) if applicable
- Last checked timestamp
- Error message if degraded

#### Uptime Bars
For each service, a 90-day uptime bar (similar to statuspage.io) — color-coded bars per day. Click a bar → show what happened that day.

#### Deployment Info Panel
- Current backend version / commit hash
- Environment (Production / Staging)
- Last deployment time
- Active workers count (from Celery)

#### Incident Log
A chronological list of past incidents with severity badges.

---

### Page 3: Live Activity (`/dashboard/live-activity`) — 🟡 Partial

**What to build:**

#### Real-time Event Stream
A vertical timeline of platform events, grouped by time:
- Use EventSource or polling (30s) for live updates
- Each event: icon + org name + action + amount/detail + timestamp
- Color-coded by category (green = revenue, blue = auth, amber = warning, red = error)

#### Filter Sidebar (collapsible)
- By console/category (Business, Revenue, Security, Operations)
- By organization (searchable dropdown)
- By severity (Info / Warning / Error)
- By date range

#### Stats Bar at top
**Events today: 124 · Errors: 2 · Revenue events: 38 · New logins: 15**

---

### Page 4: Console Access (`/dashboard/consoles`) — ✅ Good base, minor additions

**What to add:**
- **Search bar** at top to filter consoles
- **"Recently visited"** console strip above the grid (last 3 consoles you visited)
- A **"Attention needed"** badge on consoles that have items in their attention array

---

## 💼 BUSINESS CONSOLE

**Purpose:** Commercial pipeline — how Eventos makes money from its clients (B2B).

---

### Page 1: Business Dashboard (`/business/dashboard`) — ❌ ConsoleDashboard stub

**What to build — a real Business Intelligence dashboard:**

#### Pipeline Funnel Visual
A horizontal funnel: **Leads → Opportunities → Quotes Sent → Proposals Accepted → Active**
- Each stage shows count + conversion rate
- Clicking a stage → navigates to CRM filtered to that stage

#### Sales Activity KPIs (top row)
```
New Leads (7d) | Open Opportunities | Quotes Pending | Proposals Outstanding | Win Rate %
```

#### Revenue by Stage (Bar chart)
A stacked bar showing potential revenue in each CRM stage (weighted by probability).

#### Recent Deals Activity
A feed of CRM events: lead created, opportunity moved, quote sent, proposal accepted.

#### Subscription Plan Mix (Donut chart)
How many orgs on each plan (Starter / Pro / Enterprise etc.) — gives product signal.

---

### Page 2: CRM (`/business/crm`) — ✅ Well built, additions only

**Current state:** Full tabbed view with Accounts, Contacts, Leads, Opportunities.

**What to add:**

#### Pipeline Kanban View Toggle
Add a **Kanban board view** alongside the table for Opportunities:
```
[Table] [Kanban]  ← toggle buttons
```
Kanban columns = pipeline stages. Cards show org name, value, and owner.

#### Lead Score Badge
On each lead row, show an auto-calculated score badge (based on org size, event count, activity):
- Hot (≥80) · Warm (50-79) · Cold (<50)

#### Quick Convert Inline
On Lead rows, show a "Convert →" button that converts lead to Opportunity in a side panel without leaving the page.

#### Activity Timeline on Side Panel
When opening a workspace sheet, show a timeline of all interactions (calls logged, notes, emails sent) with a **"Log Activity"** button at the top.

---

### Page 3: Pricing Catalogue (`/business/pricing/catalogue`) — ✅ Has sub-pages

**What to add:**

#### Margin Health Overview (top of catalogue)
A 3-card summary showing:
- Average gross margin %
- Items with margin below threshold (warning)
- Last price update date

#### Bulk Price Update
A checkbox-selectable table with a "Update selected" bulk action → opens a modal to apply a percentage change.

---

### Page 4: Pricing Simulator (`/business/pricing/pricing-simulator`)

**What to build — a calculator-style UI:**
- Left panel: Select services from catalogue (checkboxes with quantities)
- Right panel: Live total, margin breakdown, profit
- Toggle: "Show client price" vs "Show our cost"
- "Save simulation" button → saves to `/business/pricing/saved-simulations`
- "Create quote from this" button → pre-fills a quote

---

### Page 5: Sales / Service Requests, Quotes, Proposals — keep + add

**What to add:**

- **Kanban View for Service Requests**: Status columns: New → In Review → Quoted → Won / Lost
- **Quote Expiry Alerts**: Red/amber badge on quotes expiring in <7 days
- **Proposal PDF Preview**: Side-by-side preview pane showing what the client PDF looks like

---

### Page 6: Subscription Plans & Add-ons — ❌ Stub

**What to build:**

#### Plan Cards Grid
Each plan as a rich card:
- Plan name + price + billing cycle
- Feature list
- # of active organizations on this plan
- "Edit plan" button → opens a modal form

#### Add-ons Manager
A table of add-ons with toggle switches for enabled/disabled, price, and usage stats.

#### Entitlements Matrix
A table with plans as columns and features as rows — checkboxes showing what each plan gets. Editable inline.

---

## 💰 REVENUE CONSOLE

**Purpose:** Financial truth — what money moved, when, and is it healthy.

---

### Page 1: Revenue Dashboard (`/business/revenue`) — ❌ Stub

**What to build:**

#### Revenue KPI Strip
```
MRR  |  ARR  |  Revenue Today  |  Revenue This Month  |  Churn Rate  |  ARPU
```

#### Revenue Trend Chart
30-day area chart of daily revenue with:
- A reference line for "previous month same period"
- Annotations for spikes (hover reveals cause)

#### Revenue Breakdown (2 charts side by side)
1. By plan (donut) — what % of MRR comes from each subscription tier
2. By payment method (donut) — card, bank transfer, etc.

#### Collections Health
A mini table showing:
- Invoices overdue: count + total amount
- Invoices due this week: count
- Failed payments (last 7 days)
Each row is a quick link to the relevant filter.

---

### Page 2: Invoices (`/finance/invoices`) — ❌ Stub

**What to build:**

#### Invoice List
A filterable table:
- Columns: Invoice #, Organization, Amount, Status (Draft/Sent/Paid/Overdue/Void), Due Date, Actions
- Status pills are color-coded
- Row click → open invoice detail in a side drawer

#### Invoice Detail Drawer
- Full line items
- Payment history (when it was paid, method)
- "Send reminder" button (for overdue)
- "Mark as paid" button (for manual collection)
- Download PDF button

#### Bulk Actions
Select multiple → "Send reminder to all selected" / "Export CSV"

---

### Page 3: Transactions (`/finance/transactions`)

A paginated ledger view:
- Date, Description, Organization, Amount (IN/OUT), Balance
- Filter by type (payment, refund, credit note)
- Search by org name or transaction ID

---

### Page 4: Payments (`/finance/payments`)

#### Payment Gateway Status
At top: health indicator for each gateway (Razorpay, Stripe etc.) with last transaction time.

#### Payment List
Columns: Date, Org, Amount, Gateway, Method, Status (Captured/Failed/Refunded)

#### Failed Payments Panel
A dedicated section showing all failed payments with "Retry" or "Contact org" quick actions.

---

### Page 5: Taxes (`/finance/taxes`)

#### Tax Configuration Table
- Tax name, Rate %, Applies to (GST, TDS etc.), Jurisdictions, Enabled toggle

#### Tax Report Widget
- Total tax collected this month
- By tax type breakdown
- Link to "Export for filing"

---

### Page 6: Financial Audit Trail (`/finance/financial-audit-trail`)

An immutable ledger:
- Every financial mutation (invoice created, payment recorded, credit note issued, refund processed)
- Columns: Timestamp, Actor (user email), Action, Entity, Before Value, After Value
- Non-editable, export-only

---

## ⚙️ OPERATIONS CONSOLE

**Purpose:** Is the platform healthy? Are events running? Are the servers up?

---

### Page 1: Operations Dashboard (`/operations-center`) — ✅ Has content, needs UX polish

**Current state:** Scoped filter (org/event/source type), overall status card, per-source status cards.

**What to improve:**

#### Visual Status Map (replace plain cards)
Instead of basic Card status cards, use a **visual grid with iconography**:
- Each source is a rounded tile with a large icon, status dot, and health text
- Color fills the tile background on degraded/down states
- Animate a pulse ring around the status dot when degraded

#### Timeline of Status Changes
Below the source grid: a horizontal timeline showing when each source last changed state.

#### Event Operations Scope (UX fix)
Replace raw HTML `<select>` dropdowns with **styled combobox with search** — same as EventSelector in the header.

---

### Page 2: Requests (`/operations-center/requests`)

- A table of operational requests (venue sync, device registration, data migrations)
- Status: Pending / In Progress / Completed / Failed
- Priority badge: Critical / High / Normal
- Click → detail drawer with logs + actions

---

### Page 3: Venue Readiness (`/operations-center/venue-readiness`)

#### Venue Cards Grid
Each venue as a card:
- Venue name + location
- Readiness score (0-100 progress bar)
- Open issues count
- Last sync timestamp
- "View issues" button

#### Readiness Checklist Panel
Clicking a venue → opens a drawer with a checklist:
- ✅ Device connectivity
- ✅ Network latency
- ⚠️ Badge printer offline
- ❌ Entry gate sync failed

---

### Page 4: Risk Analysis (`/operations-center/risk-analysis`)

A **risk radar** view:
- Top risks listed by severity (Critical → Low)
- Each risk: title, affected entity (event/org), probability %, impact level, mitigation action button
- A donut chart: risk distribution by category (Technical / Operational / Commercial)

---

### Page 5: Jobs (`/operations-center/jobs`)

A Celery task monitor:
- Running jobs with progress indicators
- Queued jobs count
- Failed jobs with error summary + "Retry" button
- Job history with duration stats

---

### Page 6: Database (`/operations-center/database`)

Safe read-only database health metrics:
- Table row counts
- Recent slow queries (>500ms)
- Connection pool usage
- Last backup timestamp + status

---

### Page 7: Storage & Queues (`/operations-center/storage`)

- Storage usage bar (used / total)
- File type breakdown
- Queue depth for each Celery queue (with healthy/warning thresholds)
- Dead-letter queue items

---

## 🔒 SECURITY CONSOLE

**Purpose:** Who can do what, who did what, and is anything suspicious.

---

### Page 1: Security Dashboard (`/identity-security`) — ❌ Stub

**What to build:**

#### Security Posture KPIs
```
Total Users  |  Active Sessions  |  Roles  |  Permissions  |  Recent Logins (24h)  |  Failed Logins (24h)
```

#### Threat Indicators (3 alert cards)
- **Failed login rate** (last 24h vs 7d average) — spike = amber/red
- **Unusual access patterns** (logins from new IPs)
- **Pending access reviews** (overdue reviews)

#### Recent Security Events
A live feed of auth events: logins, permission changes, impersonation sessions, MFA events.

---

### Page 2: Users (`/identity-security/users`) — ✅ Built

**What to add:**
- **Bulk actions**: Select multiple → Deactivate / Reset MFA / Export
- **Last active** column (spot inactive admin accounts)
- **MFA status badge** on each row (Enabled / Disabled / Enforced)

---

### Page 3: Roles & Permissions — ❌ Stub

#### Roles Page
- Role cards: name, description, permission count, user count
- Click → opens role detail drawer with list of permissions, list of users, edit button

#### Permissions Page
A matrix or grouped list of all permissions by category:
- **Organizations** — can_create_org, can_delete_org, etc.
- **Revenue** — can_view_invoices, can_issue_refund, etc.
- **Security** — can_view_audit_logs, can_manage_roles, etc.

---

### Page 4: Audit Logs (`/identity-security/audit-logs`) — ✅ Built

**What to add:**
- **Export to CSV/JSON** button with date range selector
- **"Unusual activity"** auto-highlight — rows where IP differs from user's usual location get a ⚠️ badge

---

### Page 5: Security Events (`/identity-security/security-events`) — ❌ Stub

A log of security-specific events:
- MFA challenge failures, account lockouts, impersonation sessions, permission escalations, suspicious patterns
- Each event: severity pill (Critical/High/Medium/Info), timestamp, user/org, action, IP address

---

### Page 6: Impersonation (`/identity-security/impersonation`)

A controlled impersonation center:
- Search for an organization or user
- "Start impersonation session" button (with reason text required)
- Active impersonation sessions table with "End session" button
- Full impersonation audit trail below

---

### Page 7: Access Reviews (`/identity-security/access-reviews`) — ❌ Stub

Periodic reviews of who has access to what:
- List of review cycles (quarterly, annual)
- Each review: reviewer, roles/users in scope, due date, progress (X/Y reviewed)
- Inline approve/revoke buttons per user-role pair

---

## 👨‍💻 DEVELOPER CONSOLE

**Purpose:** API management, webhooks, integrations, and app configuration.

---

### Page 1: Developer Dashboard (`/developer-platform`) — ❌ Stub

**What to build:**

#### API Health KPIs
```
API calls (24h)  |  Error rate %  |  Avg response time  |  Active webhooks  |  Active integrations
```

#### API Usage Chart
A line chart of API calls per hour (last 24h) with a secondary line for error rate.

#### Endpoint Performance Table
Top 10 most-called endpoints with: path, call count (24h), avg response time, error rate % (color-coded)

---

### Page 2: API Catalogue (`/developer-platform/apis`)

An interactive API reference browser:
- Grouped by tag (Organizations, Events, Registrations, Billing, etc.)
- Each endpoint: method badge (GET/POST/PUT/DELETE), path, description
- Click → expand to show parameters, response schema, and a "Try it" button

---

### Page 3: API Keys (`/developer-platform/api-keys`)

- Table of API keys: name, prefix (first 8 chars), created by, last used, scopes, status
- "Create key" button → modal with name, scope selection, expiry date
- "Rotate" and "Revoke" per-row actions
- Usage sparkline per key (calls/day last 7d)

---

### Page 4: Webhooks (`/developer-platform/webhooks`)

- List of registered webhooks: URL, events subscribed, status (active/paused/failing)
- "Delivery log" tab → last 50 delivery attempts with response code + latency
- "Test webhook" button → sends a test payload
- "Pause" / "Resume" / "Delete" actions

---

### Page 5: Integrations (`/developer-platform/integrations`)

A marketplace-style integration directory:
- Integration cards: name, logo/icon, description, connected/not connected status
- Categories: Payment Gateways, Email, SMS, CRM, Cloud Storage
- Click connected → shows config + "Disconnect" option
- Click unconnected → shows setup steps

---

### Page 6: Logs (`/developer-platform/logs`)

A live log viewer:
- Log levels: ERROR / WARN / INFO / DEBUG (filter tabs)
- Search by keyword or request ID
- Each log: timestamp, level badge, service, message, expandable raw JSON
- "Follow tail" auto-scroll toggle

---

### Page 7: Application Registry (`/applications/registry`)

A registry of internal/external applications:
- App cards: name, type (Web/Mobile/API), client ID, last activity, status toggle
- Click → opens detail with OAuth scopes, redirect URIs, usage stats

---

### Page 8: Feature Flags (`/applications/feature-flags`)

- List of feature flags: name, description, enabled %, strategy (all-on / percentage rollout / org-specific)
- Toggle switches to enable/disable
- "Edit rollout" button → configure which orgs or % of users see the feature
- Audit trail of who changed each flag

---

### Page 9: Email Templates (`/applications/templates/email`)

The Email Builder Studio package exists. Wire it up:
- Template library grid (cards with preview thumbnails)
- Click → opens the email builder studio in fullscreen
- Categories: Welcome, Invoice, Trial Expiry, Announcement, etc.

---

### Page 10: Website Templates (`/applications/templates/website`)

The Website Builder Studio package exists. Wire it up:
- Template library grid
- Click → opens the website builder
- Templates: Event landing page, Registration page, etc.

---

## 🎫 SUPPORT CONSOLE

**Purpose:** Handle client issues, communicate platform news, build a help library.

---

### Page 1: Support Dashboard (`/support-center`) — ❌ Stub

**What to build:**

#### SLA Health KPIs
```
Open tickets  |  Overdue (SLA breached)  |  Resolved today  |  Avg first response time  |  CSAT score
```

#### Ticket Priority Breakdown
A donut chart: Critical / High / Medium / Low open tickets.

#### SLA Risk Table
Tickets approaching SLA breach (sorted by time remaining):
- Ticket # | Subject | Organization | Priority | SLA deadline | Time remaining
- Amber rows: <2h remaining, Red rows: breached

#### Today's Activity Feed
Recent ticket events: opened, replied, escalated, resolved.

---

### Page 2: Tickets (`/support-center/tickets`) — ✅ Built

**What to add:**

#### Ticket Board View (Kanban)
Toggle between table and kanban: **New → Open → Pending → Resolved → Closed**

#### Bulk Actions
Select tickets → bulk assign / bulk close / bulk change priority.

#### SLA Timer on each row
Instead of just a "due date", show a countdown timer with color:
- >4h: green · 1-4h: amber · <1h or breached: red

#### Reply Quick Panel
Click a ticket → open a right panel (don't navigate away) with:
- Conversation thread
- Reply editor with formatting
- Internal note toggle (visible only to team)
- Status/priority controls

---

### Page 3: Knowledge Base (`/support-center/knowledge-base`) — ❌ Stub

#### Article Library
A card grid of help articles grouped by category:
- Getting Started
- Billing & Subscriptions
- Events & Venues
- Technical / API

#### Article Editor
Click "New article" → opens a rich text editor with:
- Title, category, tags
- Publish / Draft / Archive actions
- Preview mode

#### Search Analytics
"Top searches with no results" section — helps identify content gaps.

---

### Page 4: Announcements (`/support-center/announcements`) — ✅ Built

**What to add:**
- **Audience targeting**: Filter which organizations see the announcement (all / specific plan / specific orgs)
- **Scheduled publishing**: Set a future publish date/time
- **Read receipts**: Track how many orgs have viewed the announcement

---

## 🌐 GLOBAL TOOLS

---

### Platform Settings (`/platform-settings/*`)

**Currently has tabs:** General, Branding, Localization, Authentication, Interface standards.

**What to add to each:**

#### General
- Platform name, support email, timezone
- **Maintenance mode toggle** (takes down user-facing portals with a custom message)
- **Trial settings** (default trial duration, grace period days)

#### Branding
- Logo upload (light/dark variants)
- Primary color picker (affects organiser portal)
- Email header/footer customization
- Favicon upload

#### Authentication
- Password policy settings (min length, complexity)
- MFA enforcement toggle (require MFA for all admins)
- Session timeout duration
- Allowed IP ranges (whitelist for admin access)

#### Interface Standards
- Default date format (DD/MM/YYYY vs MM/DD/YYYY)
- Currency display format
- Default language
- Pagination default (25/50/100 per page)

---

## TOP 5 CROSS-CONSOLE UX IMPROVEMENTS

These affect every page and should be done first:

### 1. Command Palette Enhancement (Cmd+K)
Currently exists. Add:
- **Action commands** (not just navigation): "Create org", "Send announcement", "Extend trial"
- **Recent searches** section
- **Console-aware** results (when in Revenue console, revenue results come first)

### 2. Breadcrumb Contextual Actions
Add a **context menu on the last breadcrumb item** — hover → shows quick actions for that resource.

### 3. Global Notification Center
Currently exists in the header. Improve:
- **Categorized notifications** (Revenue alerts, Security alerts, Support SLA alerts)
- **Mark as read / clear all**
- **Settings link** to choose which events to notify about

### 4. Empty States — Make Every One Actionable
Every empty state should follow this pattern:
```
[Illustrated icon]
[Title: "No invoices found"]
[Description: "Once an organization makes a payment, invoices will appear here."]
[Primary action button: "Create invoice manually"]
```
Use your `EmptyState` component consistently — never leave a raw empty div.

### 5. Console-Level "Attention" Banner
At the top of each console dashboard (if there are issues):
```
⚠️  2 items need your attention in this console   [Review →]
```
This pulls from the `ConsoleSummary.attention` array you already have in the backend.

---

## Suggested Build Priority

| Priority | Console | Page | Why |
|---|---|---|---|
| 🔴 P0 | Home | Platform Health page | Ops critical |
| 🔴 P0 | Business | Business Dashboard (real) | B2B core |
| 🔴 P0 | Revenue | Revenue Dashboard | Money tracking |
| 🔴 P0 | Revenue | Invoices page | Day-to-day ops |
| 🟡 P1 | Security | Security Dashboard | Trust signal |
| 🟡 P1 | Security | Security Events page | Audit requirement |
| 🟡 P1 | Developer | API Keys & Logs pages | Developer usage |
| 🟡 P1 | Support | Support Dashboard | SLA monitoring |
| 🟢 P2 | Operations | Venue Readiness page | Event operations |
| 🟢 P2 | Business | Subscription plans (real UI) | Recurring revenue |
| 🟢 P2 | Developer | Webhooks & Integrations | Platform extensibility |
| 🟢 P2 | Support | Knowledge Base | Self-serve support |
