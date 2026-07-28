# EventOS Command Center: Page-by-Page Feature Breakdown

This document provides a detailed breakdown of every functional page in the EventOS Command Center, organized by its corresponding console.

---

## 1. HOME CONSOLE (Command Center Overview)
The Home Console handles platform posture, organization directories, high-level metrics, and live server audits.

```
/dashboard
├── /overview
├── /platform-health
├── /live-activity
└── /consoles
/organizations
└── /[orgId]
/reports
├── /analytics
└── /exports
```

### Overview Dashboard (`/dashboard/overview`)
* **Features**: The primary command center landing page, displaying platform posture and commercial parameters.
* **UI Components**:
  * **Platform Health Banner**: A status block indicating if database/Redis checks have passed (Success/Warning/Danger states) with a live timestamp.
  * **KPI Grid (Row 1)**: 5 core cards tracking Total Organizations, Active Users (30d), Monthly Recurring Revenue (MRR), Events This Month, and Open Tickets. Includes mini sparklines.
  * **KPI Grid (Row 2)**: 3 cards tracking Annual Recurring Revenue (ARR), Revenue Today (INR), and Churn Rate.
  * **MRR Trend Area Chart**: An interactive chart showing MRR trends over the last 7 days.
  * **Top 5 Orgs by MRR**: Vertical ranking showing organization name, plan name, and MRR.
  * **Subscription Health Grid**: Status cards showing counts of Active, Trial, Grace Period, Suspended, Expired, and Cancelled subscriptions.
  * **Recent Activity Feed**: Real-time action log with amounts and timestamps.
  * **Trials Expiring Soon**: Action items showing expiring organizations, days remaining, and an inline form to **Extend Trial** with a custom duration and justification reason.

### Platform Health (`/dashboard/platform-health`)
* **Features**: Displays system telemetry, API latency, and connection checkouts.
* **UI Components**:
  * **Operational Status Rails**: Custom rails indicating status (Healthy/Degraded/Failed) for specific background servers, cache clusters, and background job executors.

### Live Activity (`/dashboard/live-activity`)
* **Features**: Receptive view showing platform notifications and live connections in real time.
* **UI Components**:
  * **Socket.IO Status Badge**: Displays current client-server WebSocket connectivity state.
  * **Event Stream Log**: Real-time terminal-like layout showing file validation updates, uploads, and approvals.

### Console Access (`/dashboard/consoles`)
* **Features**: Serves as a console directory, providing navigation cards and direct launch shortcuts for each console.

### Organizations Directory (`/organizations`)
* **Features**: Management of all client tenants.
* **UI Components**:
  * **Organization Table**: Rows listing Tenant ID, Name, Slug, Current Plan, Creation Date, and Status (Active/Suspended/Trial).
  * **Creation Dialog**: Form to register a new tenant (requiring name, administrator details, and plan assignment).
  * **Search & Filters**: Search by slug or name, and filters for subscription statuses.

### Organization Dossier (`/organizations/[orgId]`)
* **Features**: Deep-dive profile of a single tenant.
* **UI Components**:
  * **Dossier Header**: Overview of tenant status, current billing health, and quick actions (e.g., Suspend Tenant, Force Impersonation).
  * **Usage Tracking Cards**: Resource usage summaries (registered events, speaker count, disk storage used).
  * **Audit Timeline**: Attributable log of the tenant's security, billing, and membership events.

### Analytics (`/reports/analytics`)
* **Features**: Business metrics aggregator.
* **UI Components**:
  * **Interactive Line & Bar Charts**: Aggregated growth data, revenue expansion, and signups.

### Reports & Exports (`/reports/exports`)
* **Features**: Exports spreadsheets and data dumps.
* **UI Components**:
  * **Export Queue Table**: Status log of CSV/XLSX exports requested by platform managers.

---

## 2. BUSINESS CONSOLE (Commercial Operations)
The Business Console manages sales pipelines, service configurations, catalog pricing, and tenant subscription tiers.

```
/business
├── /dashboard
├── /crm
├── /sales
│   ├── /service-requests
│   ├── /quotes
│   ├── /saved-quotes
│   └── /proposals/create
└── /pricing
│   ├── /catalogue (hardware, staff, vendor, margin, history)
│   ├── /templates
│   ├── /pricing-simulator
│   └── /saved-simulations
└── /subscription
    ├── /plans
    ├── /add-ons
    └── /entitlements
```

### Business Dashboard (`/business/dashboard`)
* **Features**: Dashboard focusing on pipeline health and active negotiations.

### CRM (`/business/crm`)
* **Features**: Sales management interface tracking prospective organizers and client accounts.

### Sales Service Requests (`/business/sales/service-requests`)
* **Features**: Reviews client RFPs (Requests for Proposals) submitted through portals.

### Quotes & Saved Quotes (`/business/sales/quotes`, `/business/sales/saved-quotes`)
* **Features**: Estimates cost structures and displays quote versions.

### Proposal Creator & Generator (`/business/sales/proposals/create`, `/business/sales/proposal-generator`)
* **Features**:
  * **AI Proposal Generator**: Uses a prompt panel ("Ask AI") to generate customized proposals based on event scale and requirements.
  * **Rich Text Editor**: Form fields to modify proposal text, add cost cards, and save proposal revisions.

### Catalogue Management (`/business/pricing/catalogue`)
* **Features**: Central pricing configuration switcher. Handles hardware items, staff day rates, and vendor service margins.
* **UI Components**:
  * **Hardware/Staff Tables**: Configures SKU price variables, cost margins, and historical price sheets.
  * **Margin Rules Form**: Dynamically configures platform markups and taxes.

### Pricing Simulator (`/business/pricing/pricing-simulator`)
* **Features**: Modulates cost inputs to preview client quote totals before publishing.

### Subscription Plans (`/business/subscription/plans`)
* **Features**: CRUD operations for platform tiers.
* **UI Components**:
  * **Plan Cards**: Displays active SaaS tiers (Basic, Growth, Enterprise, Demo) and their costs.
  * **Feature Mappers**: Toggles which modules/limits (e.g., maximum attendees) are linked to a plan.

### Add-ons (`/business/subscription/add-ons`)
* **Features**: Toggle configurations for extra platform features (e.g., `ADDON_WHATSAPP`, `ADDON_EPOSTER`, `ADDON_WHITE_LABEL`).

---

## 3. REVENUE CONSOLE (Finance & Audit)
The Revenue Console manages collections, invoice records, payment gateways, and taxation.

```
/business/revenue
/finance
├── /invoices
├── /transactions
├── /payments
├── /credit-notes
├── /taxes
└── /financial-audit-trail
```

### Revenue Dashboard (`/business/revenue`)
* **Features**: Tracks transactional flows and collects billing stats.

### Invoices (`/finance/invoices`)
* **Features**: Chronological directory of platform invoices.
* **UI Components**:
  * **Premium Object Cards**: Renders invoice states (Paid/Unpaid/Pending) using green/red status badges and GST metadata.
  * **Invoice PDF Viewer**: Action to view or download generated PDFs.

### Transactions & Payments (`/finance/transactions`, `/finance/payments`)
* **Features**: Detailed logs of incoming gateway transactions (via Stripe/Razorpay) and manual payments.

### Credit Notes (`/finance/credit-notes`)
* **Features**: Records refunds and adjustments issued to clients.

### Taxes (`/finance/taxes`)
* **Features**: Configures active tax codes and region-specific GST rules.

### Financial Audit Trail (`/finance/financial-audit-trail`)
* **Features**: Audit registry for all monetary adjustments and billing changes.

---

## 4. OPERATIONS CONSOLE (Platform & Infrastructure)
The Operations Console manages infrastructure scaling, database telemetry, venue readiness, and background workers.

```
/operations-center
├── /requests
├── /venue-readiness
├── /risk-analysis
├── /jobs
├── /database
├── /storage
└── /search
```

### Operations Dashboard (`/operations-center`)
* **Features**: Operational status indicators.

### Venue Readiness (`/operations-center/venue-readiness`)
* **Features**: Monitors synchronization health of offline-capable venue apps.
* **UI Components**:
  * **Sync Telemetry Panels**: Lists local venue server nodes, active connections, and pending sync batches.

### Risk Analysis (`/operations-center/risk-analysis`)
* **Features**: Scans for system vulnerabilities and event planning risks.

### Jobs & Search (`/operations-center/jobs`, `/operations-center/search`)
* **Features**: Monitors and searches Celery background task queues (e.g., FFmpeg slide validations, video encoding).

### Database Management (`/operations-center/database`)
* **Features**: Telemetry and query logging.
* **UI Components**:
  * **Database Status Rails**: Displays read/write latency, active connection counts, and transaction health.

### Storage & Queues (`/operations-center/storage`)
* **Features**: File system usage monitoring and S3/MinIO bucket storage parameters.

---

## 5. SECURITY CONSOLE (Access Control & Impersonation)
The Security Console handles user permissions, access governance, audit logs, and developer credentials.

```
/identity-security
├── /users
├── /roles
├── /permissions
├── /access-reviews
├── /audit-logs
├── /security-events
└── /impersonation
```

### Security Dashboard (`/identity-security`)
* **Features**: Security posture metrics and alert indicators.

### User Management (`/identity-security/users`)
* **Features**: Directory of all administrative accounts.
* **UI Components**:
  * **User Control Table**: Displays MFA status, platform roles, last login time, and IP restrictions.
  * **Allowed IPs Config**: Text fields to manage allowed IP CIDR ranges for users.

### Roles & Permissions (`/identity-security/roles`, `/identity-security/permissions`)
* **Features**: RBAC configuration (Role-Based Access Control) for platform administrators.

### Access Reviews (`/identity-security/access-reviews`)
* **Features**: Schedules and reviews administrative role assignments.

### Audit Logs (`/identity-security/audit-logs`)
* **Features**: Master log of all system changes.
* **UI Components**:
  * **Audit Log Table**: Shows IP addresses, user agents, action types (e.g., `command_center_login`, `password_change`), and MFA verification details.

### Security Events (`/identity-security/security-events`)
* **Features**: Alert center for suspicious auth attempts (e.g., repeated 401s from a single IP address).

### Impersonation (`/identity-security/impersonation`)
* **Features**: Allows super-admins to temporarily assume the identity of any organizer/user to troubleshoot issues.

---

## 6. DEVELOPER CONSOLE (Developer Platform)
The Developer Console manages API access, credentials, webhooks, and integrations.

```
/developer-platform
├── /apis
├── /api-keys
├── /webhooks
├── /integrations
└── /logs
/applications
├── /registry
└── /feature-flags
```

### Developer Dashboard (`/developer-platform`)
* **Features**: Tracks API metrics and active keys.

### API Catalogue (`/developer-platform/apis`)
* **Features**: Endpoint documentation and service directory.

### API Keys (`/developer-platform/api-keys`)
* **Features**: Generates and revokes developer API keys.

### Webhooks (`/developer-platform/webhooks`)
* **Features**: Configures listener URLs for system events.

### Integrations (`/developer-platform/integrations`)
* **Features**: Controls active developer plugins and integrations.

### Application Registry (`/applications/registry`)
* **Features**: Registers third-party applications.

### Feature Flags (`/applications/feature-flags`)
* **Features**: Direct control panel for system feature flags.

---

## 7. SUPPORT CONSOLE (Customer Care)
The Support Console manages customer inquiries, tickets, SLAs, and announcements.

```
/support-center
├── /tickets
├── /knowledge-base
└── /announcements
```

### Tickets (`/support-center/tickets`)
* **Features**: Reviews client support tickets.
* **UI Components**:
  * **Ticket Grid**: Organizes tickets by status (New/Open/Pending/Closed) and SLA urgency.

### Knowledge Base (`/support-center/knowledge-base`)
* **Features**: CRUD interface for administrator articles and documentation.

### Announcements (`/support-center/announcements`)
* **Features**: Broadcasts notifications to all active organizations.

---

## 8. GLOBAL SETTINGS (`/platform-settings`)
A system-wide settings workspace structured into 6 tabs:

1. **General (`/platform-settings/general`)**: Sets platform metadata and system boundaries.
2. **Branding (`/platform-settings/branding`)**: Uploads logo files, selects color schemes, and configures themes.
3. **Localization (`/platform-settings/localization`)**: Selects active locales, date/time formats, and currency defaults (e.g. INR).
4. **Notifications (`/platform-settings/notifications`)**: Configures transactional email pathways (Resend/SMTP) and SMS gateways.
5. **Authentication (`/platform-settings/authentication`)**: Sets password complexity requirements, session timeouts, and MFA policies.
6. **Interface Standards (`/platform-settings/interface-standards`)**: Launches the interactive design system catalog.
