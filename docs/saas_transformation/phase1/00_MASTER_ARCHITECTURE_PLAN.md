# EventX OS: Unified Domain-Driven & Ecosystem Architecture Plan

This document outlines the master strategic plan to refactor the EventX PostgreSQL database into a strict, enterprise-grade domain-driven SaaS architecture, while simultaneously future-proofing the platform for an extensive Application Ecosystem, Public APIs, and Third-Party Integrations.

**Crucial Mandate:** This refactoring is purely structural at the database layer. It preserves **all** existing functionality, API contracts, RBAC permissions, and tests.

---

## PART 1: CORE DOMAIN REFACTORING

### Current State vs. Target State
*   **Current Schemas (8):** `auth`, `rbac`, `notifications`, `registration`, `presentations`, `speakers`, `venue`, `public`
*   **Target Core Schemas (12):** `platform`, `identity`, `billing`, `rbac`, `events`, `registration`, `presentations`, `venue`, `communications`, `analytics`, `audit`, `integrations`

### Table Migration & Schema Reorganization Plan

#### A. Domain: `platform`
*Purpose: Top-level tenant management and SaaS configuration.*

| Current Table | Target Table | Reason / Action |
| :--- | :--- | :--- |
| `rbac.organizations` | `platform.organizations` | Root tenant entity. Move from `rbac` as it governs the whole platform. |
| `rbac.system_settings` | `platform.settings` | Global platform settings. |
| `rbac.feature_catalog` | `platform.feature_catalog` | Global catalog of SaaS capabilities. |
| *New* | `platform.organization_domains` | Extract custom domains for 1:N support. |
| `rbac.organization_health` | `platform.organization_health` | Tenant health monitoring. |

#### B. Domain: `identity`
*Purpose: Authentication, User Profiles, and Credential Management.*

| Current Table | Target Table | Reason / Action |
| :--- | :--- | :--- |
| `auth.users` | `identity.users` | Core user identity. |
| `auth.refresh_tokens` | `identity.refresh_tokens` | Session management. |
| `auth.security_events` | `identity.security_events` | Login failures, 2FA triggers. |
| `auth.portal_otp_tokens` | `identity.otp_tokens` | Passwordless / OTP authentication. |
| *New* | `identity.api_keys` | Prepare for Enterprise API access. |

#### C. Domain: `billing`
*Purpose: Subscriptions, Revenue, and Marketplace.*

| Current Table | Target Table | Reason / Action |
| :--- | :--- | :--- |
| `rbac.subscription_plans` | `billing.subscription_plans` | SaaS tier definitions. |
| `rbac.organization_subscriptions` | `billing.organization_subscriptions` | Active tenant subscriptions. |
| `rbac.plan_features` | `billing.plan_features` | Entitlement mapping. |
| `rbac.organization_features` | `billing.organization_feature_overrides` | Manual entitlement overrides. |
| `rbac.addons` | `billing.addons` | Marketplace inventory. |
| `rbac.addon_features` | `billing.addon_features` | Marketplace feature mapping. |
| `rbac.organization_addons` | `billing.organization_addons` | Purchased add-ons. |
| `rbac.revenue_metrics` | `billing.revenue_metrics` | MRR / ARR tracking. |
| *New* | `billing.invoices` | Prepare for Stripe/custom invoicing sync. |
| *New* | `billing.marketplace_subscriptions` | Third-party or premium app subscriptions. |
| *New* | `billing.marketplace_transactions` | Financial ledger for marketplace purchases. |

#### D. Domain: `rbac`
*Purpose: Authorization, Roles, and Permissions.*

| Current Table | Target Table | Reason / Action |
| :--- | :--- | :--- |
| `rbac.roles` | `rbac.roles` | Keep existing. |
| `rbac.permissions` | `rbac.permissions` | Keep existing. |
| `rbac.role_permissions` | `rbac.role_permissions` | Keep existing. |
| `rbac.user_role_assignments` | `rbac.user_role_assignments` | Keep existing. |
| `rbac.scoped_permissions` | `rbac.scoped_permissions` | Keep existing. |
| `rbac.user_access_nodes` | `rbac.user_access_nodes` | Keep existing. |
| `rbac.organisation_members` | `rbac.organization_members` | Unify British spelling. |

#### E. Domain: `events`
*Purpose: Core conference planning, scientific program, and speaker CRM.*

| Current Table | Target Table | Reason / Action |
| :--- | :--- | :--- |
| `rbac.events` | `events.events` | The core conference container. |
| `speakers.sessions` | `events.sessions` | Schedule blocks. |
| `speakers.speakers` | `events.speakers` | Speaker CRM / Roster. |
| `speakers.session_speakers` | `events.session_speakers` | Mapping speakers to timeslots. |
| `speakers.speaker_profiles` | `events.speaker_profiles` | Bios and headshots. |
| `venue.rooms` | `events.rooms` | Physical spaces. |
| `venue.capacity_rules` | `events.capacity_rules` | Room capacity management. |

#### F. Domain: `presentations`
*Purpose: Scientific file collection, validation, and playback.*

| Current Table | Target Table | Reason / Action |
| :--- | :--- | :--- |
| `presentations.presentation_files` | `presentations.files` | Slide decks, PDFs. |
| `presentations.file_validations` | `presentations.validations` | Malware/format checks. |
| `presentations.file_integrity_logs`| `presentations.integrity_logs` | Hash verifications. |
| `presentations.presentation_bundles` | `presentations.bundles` | ZIP packaging for Edge Servers. |
| `presentations.bundle_files` | `presentations.bundle_files` | Mapping files to bundles. |
| `speakers.posters` | `presentations.posters` | Digital ePosters. |

#### G. Domain: `registration`
*Purpose: Ticketing, Form building, Badges, and Payments.*

| Current Table | Target Table | Reason / Action |
| :--- | :--- | :--- |
| `registration.participants` | `registration.participants` | Attendee CRM. |
| `registration.participant_roles`| `registration.roles` | VIP, Delegate, Exhibitor types. |
| `registration.participant_registrations`| `registration.registrations` | The actual ticket/purchase record. |
| `registration.ticket_types` | `registration.ticket_types` | Pricing tiers. |
| `registration.promo_codes` | `registration.promo_codes` | Discounts. |
| `registration.payment_transactions`| `registration.payment_transactions`| Financial records for tickets. |
| `registration.registration_form_config`| `registration.form_configs` | Form builder schema. |
| `registration.badges` | `registration.badges` | Generated PDFs. |
| `registration.print_templates` | `registration.print_templates` | Badge layouts. |

#### H. Domain: `venue`
*Purpose: Edge infrastructure, hardware, and on-site operations.*

| Current Table | Target Table | Reason / Action |
| :--- | :--- | :--- |
| `venue.srr_stations` | `venue.srr_stations` | Scientific Review Room terminals. |
| `venue.srr_checkins` | `venue.srr_checkins` | Speaker arrival logs. |
| `venue.room_devices` | `venue.devices` | Kiosks, laptops, signage screens. |
| `presentations.presentation_queue`| `venue.presentation_queue` | Live playback queue. |
| `presentations.playback_events` | `venue.playback_events` | Slide transitions. |
| `venue.venue_sync_jobs` | `venue.sync_jobs` | Cloud-to-Edge data transfer logs. |
| `registration.printers` | `venue.printers` | Hardware. |

#### I. Domain: `communications`
*Purpose: Outbound messaging.*

| Current Table | Target Table | Reason / Action |
| :--- | :--- | :--- |
| `notifications.email_templates` | `communications.email_templates` | |
| `notifications.email_campaigns` | `communications.email_campaigns` | |
| `notifications.email_logs` | `communications.email_logs` | |
| `notifications.announcements` | `communications.announcements` | Push notifications. |
| *New* | `communications.push_notifications` | Push notification dispatch queue. |
| *New* | `communications.device_tokens` | APNs/FCM tokens linked to users. |

#### J. Domain: `analytics`
*Purpose: Aggregated metrics.*

| Current Table | Target Table | Reason / Action |
| :--- | :--- | :--- |
| `rbac.usage_metrics` | `analytics.organization_usage` | Denormalized storage/event counts. |
| `rbac.usage_events` | `analytics.usage_events` | Raw consumption telemetry. |
| `rbac.usage_snapshots` | `analytics.usage_snapshots` | Daily snapshots for billing. |
| `registration.attendance_logs` | `analytics.attendance_logs` | Check-in tracking. |

#### K. Domain: `audit`
*Purpose: Immutable system history and support desk.*

| Current Table | Target Table | Reason / Action |
| :--- | :--- | :--- |
| `public.audit_logs_*` | `audit.logs` | Move partition tables from `public` to `audit`. |
| `rbac.permission_audit_logs` | `audit.permission_changes` | RBAC modification history. |
| `rbac.impersonation_logs` | `audit.impersonations` | Super Admin session tracking. |
| `rbac.support_tickets` | `audit.support_tickets` | Helpdesk. |
| `rbac.ticket_comments` | `audit.support_comments` | |
| `rbac.activity_timeline` | `audit.activity_timeline` | CRM sourcing events. |

---

## PART 2: PLATFORM ECOSYSTEM EXTENSION

This section introduces three entirely new bounded contexts to support EventX's transition into a developer and marketplace platform.

### A. New Domain: `applications`
*Purpose: Manage all EventX applications (internal and external) as first-class platform entities.*

| New Table | Purpose / Description |
| :--- | :--- |
| `applications.apps` | Platform-level Application Registry (e.g., Organizer Portal, Mobile App). |
| `applications.app_versions` | Version control for released applications. |
| `applications.app_features` | Mapping specific features to an application. |
| `applications.app_permissions` | RBAC requirements for application access. |
| `applications.organization_apps` | Which applications are enabled for a specific organization. |
| `applications.device_apps` | Device-specific application bindings. |
| `applications.app_releases` | Audit and rollout logs for app updates. |
| `applications.app_configurations` | Tenant-specific config overrides per application. |
| `applications.app_audit_logs` | Audit trail specific to app enablement/disabling. |
| `applications.mobile_configurations`| Settings tailored for the EventX Mobile Apps. |
| `applications.push_notification_configs` | Certificates and keys for APNs/FCM. |
| `applications.marketplace_packages` | Bundled apps and settings for the Marketplace. |

### B. New Domain: `developer`
*Purpose: Support Public APIs, Partner APIs, SDKs, OAuth, and the Developer Portal.*

| New Table | Purpose / Description |
| :--- | :--- |
| `developer.api_keys` | API keys issued to organizations or developers. |
| `developer.api_key_scopes` | Granular permission boundaries for API keys. |
| `developer.api_usage` | Tracking API request volumes for rate limiting and billing. |
| `developer.oauth_clients` | Registered third-party OAuth2 applications. |
| `developer.oauth_authorizations` | User grants to OAuth clients. |
| `developer.oauth_tokens` | Active access/refresh tokens for OAuth. |
| `developer.rate_limits` | Tiered API rate limiting definitions. |
| `developer.developer_accounts` | Profiles for third-party developers. |
| `developer.sdk_versions` | Published SDK tracking. |
| `developer.api_audit_logs` | Security logs for the public API gateway. |

### C. Expanded Domain: `integrations`
*Purpose: Support third-party applications, external systems, and sync engines.*

| New Table | Purpose / Description |
| :--- | :--- |
| `integrations.providers` | Global catalog of supported external systems (Stripe, Zoom, OpenAI, etc.). |
| `integrations.connections` | Active tenant bindings to external providers. |
| `integrations.oauth_connections` | OAuth tokens linking a tenant to a third party. |
| `integrations.webhooks` | Outbound webhooks configured by the tenant. |
| `integrations.webhook_deliveries` | Audit log and payload history for webhook dispatches. |
| `integrations.sync_jobs` | Background synchronization tasks to external systems. |
| `integrations.sync_history` | Historical logs of successful/failed sync batches. |
| `integrations.integration_logs` | Detailed execution logs for external integrations. |
| `integrations.marketplace_apps` | Directory of third-party apps available in the Marketplace. |
| `integrations.integration_settings` | Custom configurations for active connections. |
| `integrations.external_resources` | Mapping of internal EventX IDs to external provider IDs. |

---

## PART 3: ARCHITECTURE STANDARDIZATION & SECURITY

### 1. API Architecture Standardization
To ensure future microservice readiness, the API routing layer will strictly mirror the bounded contexts. Business logic is strictly prohibited in route handlers.

**Standardized Namespaces:**
`/api/v1/platform/*`, `/api/v1/identity/*`, `/api/v1/billing/*`, `/api/v1/rbac/*`, `/api/v1/events/*`, `/api/v1/registration/*`, `/api/v1/presentations/*`, `/api/v1/venue/*`, `/api/v1/communications/*`, `/api/v1/analytics/*`, `/api/v1/audit/*`, `/api/v1/integrations/*`, `/api/v1/applications/*`, `/api/v1/developer/*`

**Module Structure Enforcement:**
Every bounded context must internally own its: `models`, `schemas`, `repositories`, `services`, `permissions`, `validators`, `tasks`, and `routers`.

### 2. Feature Entitlement Evolution
The entitlement hierarchy is expanded to support Applications as the gateway to features: `Plan -> Applications -> Features`.

*Example: Enterprise Plan*
*   **Enabled Applications:** All (including AI Assistant, Sponsor Suite).
*   **Enabled Features:** API Access, SSO, White Label, Sponsor Management.

### 3. Application Registry Architecture
The `applications.apps` registry allows EventX to treat its own UIs and tools as togglable products (e.g., Organizer Portal, Mobile App, Admin Console). Organizations can enable or disable applications independently based on their subscription tier and marketplace purchases.

### 4. Security Model for External Ecosystems
Opening EventX to public APIs and third-party apps requires enterprise-grade security structures:
1.  **OAuth2 & Scoped Access:** All third-party apps must utilize OAuth2 flows (`developer.oauth_clients`), requesting explicit granular scopes.
2.  **Strict Rate Limiting:** Applied globally and per-tenant to prevent noisy-neighbor degradation.
3.  **Tenant Isolation:** API keys and OAuth tokens must be irrevocably bound to an `organization_id`.
4.  **Device Fingerprinting:** Support for revoking active sessions or MFA devices.

### 5. Future Microservice Readiness (Service Boundary Design)
This schema and namespace restructuring enables future service extraction. Because data is siloed into specific PostgreSQL schemas and accessed strictly through bounded API modules, any domain can be physically extracted into an independent microservice (e.g., an independent `Identity Service`) without requiring a database redesign. Cross-domain relationships are mapped via logical foreign keys (`organization_id`, `event_id`) that can eventually become standard UUID references.

---

## PART 4: MIGRATION EXECUTION PLAN & RISKS

### Step 1: SQLAlchemy Model Refactoring
*   Move Python files into new directory structures (`app/modules/platform`, `app/modules/billing`, etc.).
*   Update the `__table_args__ = {"schema": "..."}` parameter in every SQLAlchemy model to reflect the target schema.
*   Update all `relationship()` declarations to use the new string paths.

### Step 2: Alembic Migrations
Generating migrations for schema moves is complex. Alembic's `--autogenerate` will attempt to DROP the old tables and CREATE the new ones, which causes **massive data loss**.
*   **Safe Migration Strategy:** The Alembic script must be written manually to execute `ALTER TABLE old_schema.table_name SET SCHEMA new_schema;`.
*   We must explicitly create the new schemas via `CREATE SCHEMA IF NOT EXISTS billing;` before moving the tables.

### Risk Assessment
- **High Risk:** The Alembic migration. If generated automatically, it will wipe the database. Must be hand-crafted using `op.execute("ALTER TABLE ...")`.
- **Medium Risk:** SQLAlchemy cross-schema Foreign Keys. PostgreSQL handles them seamlessly, but SQLAlchemy requires explicit `schema.tablename.column` syntax.
- **Low Risk:** API breakage. Since we aren't changing the Pydantic schemas or JSON contracts, frontend clients will not notice the database refactoring.