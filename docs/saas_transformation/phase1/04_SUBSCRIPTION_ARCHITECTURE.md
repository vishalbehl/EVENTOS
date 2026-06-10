# 4. Subscription Architecture

EventX OS will transition to a product-led SaaS model featuring three core subscription plans, with high-end physical/on-site capabilities entirely decoupled into a custom quotation Add-On. Every module, API endpoint, UI component, and dashboard widget will be mapped to a plan tier and enforced by the `PlanGuard` middleware.

## The Three Core SaaS Plans

### 1. REGISTRATION Plan (Entry-Level)
Positioned for small workshops, training programs, and association meetings (approx. 50–100 attendees, 10–15 speakers).
- **Included Features:**
  - Event creation, Session & Room management.
  - Registration portal, ticketing, and Stripe payment collection.
  - Participant management & QR-based check-in.
  - Email confirmations, basic analytics, theme customization.
  - Announcements & Email Campaigns.
  - Speaker profiles, speaker invitations, and basic file upload via Speaker Portal.
- **Intentionally Excluded:** Presentation approval workflows, SRR, file monitoring, poster management, venue synchronization, technician tools, device management, badge printing, advanced reporting, API access, custom domains, white-labeling, SSO.

### 2. CONFERENCE PROFESSIONAL Plan (Flagship)
The primary offering for medium-to-large professional conferences requiring strict scientific and administrative control.
- **Included Features:**
  - *Everything in Registration, plus:*
  - Full registration management (Approvals, Waitlists, Bulk Import/Export).
  - Badge printing capabilities.
  - Advanced Payment administration.
  - Full Speaker Workflows: Presentation management, review/approval processes, version tracking, abstracts, and digital posters.
  - Scientific program management.
  - Advanced communications, custom branding, custom domains.
  - Platform audit logs and granular RBAC.
  - Advanced reporting matrices.

### 3. ENTERPRISE Plan (Ultimate Scale)
Designed for massive-scale organizers requiring ultimate flexibility, security, and governance.
- **Included Features:**
  - *Everything in Conference Professional, plus:*
  - Unlimited scale and quotas.
  - Sponsor management module.
  - Incident management tools.
  - AI-powered operational tools.
  - Public API Access & Custom Integrations.
  - SSO (SAML/OIDC) & Advanced security controls.
  - Full White-labeling.
  - Executive dashboards & Compliance features.
  - Custom roles and permission sets.

---

## The Custom Add-On: VENUE OPERATIONS

Physical infrastructure and on-site technical execution are radically different from cloud SaaS. Therefore, **Venue Operations is architected as a completely separate commercial offering**.
- **Availability:** It can be attached to *any* subscription tier (Registration, Pro, or Enterprise) via feature flags established through a custom quotation process.
- **Included Capabilities (Unlocked via `ADDON_VENUE_OPERATIONS` flag):**
  - Venue Sync & Edge Server Infrastructure (Local DB, Local MinIO).
  - SRR (Scientific Review Room) Stations.
  - Technician Dashboard & Device Monitoring.
  - Room Playback Management (Autonomous Display Engine).
  - Digital Signage & Kiosks.
  - Local Badge Printing Hardware integration.
  - QR Scanners & ePoster Displays.
  - Offline Venue Operations & Local Data Synchronization.
  - On-Site Support Services access.