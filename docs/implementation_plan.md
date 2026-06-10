# EventX OS - 25-Schema Integration & Architecture Roadmap

This plan integrates the 25-schema audit findings with the EventX OS Master Architecture (`master_arch_v.03.md`). It establishes the Bounded Context boundaries, SaaS multi-tenancy rules, dynamic middleware guards, and a 4-phase engineering roadmap to transition skeleton schemas into fully active, tenant-isolated features.

## User Review Required

> [!IMPORTANT]
> The database schema is fully initialized, migrated, and functional. All 224 backend tests are passing cleanly.
> Any new features or table integration must adhere to the 10 Development Rules of the EventX OS Master Architecture, ensuring strict tenant isolation and centralized entitlement checks.

---

## 1. Domain-Driven Design (DDD) & Bounded Context Status Directory

The 25 schemas are organized into their respective Bounded Context categories. Below is the state of all tables in the database:

### A. Core Platform Domains

| Schema | Fully Used Tables (Active Business Logic) | Unused Tables (Skeleton Models) |
| :--- | :--- | :--- |
| **platform** | `organizations`, `organization_health`, `system_settings`, `feature_catalog` | `organization_domains`, `organization_settings`, `feature_flags`, `global_announcements`, `tenant_limits`, `tenant_usage` |
| **identity** | `users`, `refresh_tokens`, `security_events`, `otp_tokens` | `mfa_devices`, `user_sessions`, `password_history`, `login_attempts`, `api_keys` (personal), `password_reset_tokens`, `trusted_devices`, `user_preferences`, `sso_identities` |
| **rbac** | `roles`, `permissions`, `role_permissions`, `user_role_assignments`, `scoped_permissions`, `organization_members`, `user_access_nodes`, `role_inheritance_maps`, `user_event_assignments` | `permission_groups`, `permission_sets`, `application_permissions`, `feature_permissions`, `access_templates`, `user_organization_memberships` |
| **billing** | `subscription_plans`, `organization_subscriptions`, `plan_features`, `organization_feature_overrides`, `addons`, `addon_features`, `organization_addons`, `payment_events`, `revenue_metrics` | `invoices`, `invoice_items`, `payment_methods`, `marketplace_subscriptions`, `marketplace_transactions` |

### B. Business Domains

| Schema | Fully Used Tables (Active Business Logic) | Unused Tables (Skeleton Models) |
| :--- | :--- | :--- |
| **events** | `events`, `sessions`, `rooms`, `tracks`, `agendas`, `capacity_rules` | `agenda_items`, `session_templates`, `room_allocations`, `event_settings`, `event_assets` |
| **speakers** | `speakers`, `profiles` (speaker_profiles), `speaker_theme_settings` | `invitations`, `upload_tokens`, `travel_requests`, `accommodation_requests`, `honorariums`, `communication_history`, `profile_versions` |
| **registration** | `participants`, `registrations`, `roles` (participant_roles), `ticket_types`, `registration_forms`, `payment_transactions`, `promo_codes`, `badges`, `badge_history`, `badge_scans`, `badge_print_jobs`, `waitlists`, `attendance`, `import_jobs` | `form_fields`, `form_submissions` |
| **presentations** | `files` (presentation_files), `validations` (file_validations), `integrity_logs`, `bundles` (presentation_bundles), `bundle_files`, `posters` | `file_versions`, `review_comments`, `approvals`, `processing_jobs` |
| **venue** | `devices` (room_devices), `device_heartbeats`, `srr_stations`, `srr_checkins`, `presentation_queue`, `playback_events`, `sync_jobs` (venue_sync_jobs), `activity_logs` (venue_activity_logs), `printers`, `websocket_events` | `network_events`, `device_security` (venue_security_events), `runtime_events` (room_runtime_events) |

### C. Platform Services

| Schema | Fully Used Tables (Active Business Logic) | Unused Tables (Skeleton Models) |
| :--- | :--- | :--- |
| **communications**| `email_templates`, `email_campaigns`, `email_logs`, `announcements`, `notification_delivery_logs` | `push_notifications`, `device_tokens`, `sms_messages`, `notification_preferences`, `notification_queue` |
| **analytics** | `organization_usage`, `usage_events`, `usage_snapshots`, `attendance_logs` | `dashboard_metrics`, `feature_usage`, `application_usage`, `api_usage`, `event_metrics`, `adoption_metrics` |
| **audit** | `logs` (audit_logs), `api_logs` (api_request_logs), `impersonation_logs`, `permission_changes` (permission_audit_logs) | `worker_logs` (worker_job_logs), `security_logs`, `data_exports`, `system_changes`, `access_reviews` |

### D. Platform Expansion Domains

| Schema | Fully Used Tables (Active Business Logic) | Unused Tables (Skeleton Models) |
| :--- | :--- | :--- |
| **applications** | None | `apps`, `app_versions`, `app_features`, `app_permissions`, `organization_apps`, `device_apps`, `app_releases`, `app_configurations`, `mobile_configurations`, `push_notification_configs`, `app_audit_logs` |
| **marketplace** | None | `apps` (marketplace_apps), `categories`, `reviews`, `installations`, `permissions`, `subscriptions`, `transactions`, `version_history`, `packages` |
| **developer** | None | `api_keys` (developer_api_keys), `api_scopes`, `api_usage`, `api_products`, `api_subscriptions`, `oauth_clients`, `oauth_authorizations`, `oauth_tokens`, `rate_limits`, `sdk_versions`, `api_audit_logs` |
| **integrations** | None | `providers`, `connections`, `oauth_connections`, `sync_jobs`, `sync_history`, `webhooks`, `webhook_deliveries`, `external_resources`, `integration_logs`, `integration_settings`, `marketplace_apps` |

### E. Future Domains

| Schema | Fully Used Tables (Active Business Logic) | Unused Tables (Skeleton Models) |
| :--- | :--- | :--- |
| **workflow** | `workflows` (seeded only) | `workflow_steps`, `workflow_instances`, `workflow_tasks`, `workflow_assignments`, `workflow_history` |
| **files** | None | `assets`, `asset_versions`, `asset_tags`, `asset_permissions`, `storage_locations`, `upload_sessions`, `virus_scans` |
| **jobs** | None | `background_jobs`, `job_executions`, `job_failures`, `job_schedules`, `job_locks` |
| **search** | None | `search_indexes`, `search_documents`, `search_jobs` |
| **mobile** | None | `devices` (mobile_devices), `sessions` (mobile_sessions), `device_tokens` (mobile_device_tokens), `app_versions` (mobile_app_versions), `crash_logs` (mobile_crash_logs), `push_queue` (mobile_push_queue), `sync_queue` (mobile_sync_queue), `offline_changes` (mobile_offline_changes) |
| **ai** | None | `assistants`, `prompts`, `prompt_versions`, `conversations`, `messages`, `ai_actions`, `ai_usage`, `cost_tracking`, `feedback`, `embeddings` |
| **crm** | `accounts`, `leads`, `activities`, `notes` | `pipeline_stages`, `opportunities`, `tasks`, `contracts`, `proposals`, `customer_health`, `renewals`, `interactions` |
| **support** | `support_tickets`, `ticket_comments` | `ticket_attachments`, `escalations`, `sla_policies`, `support_agents`, `knowledge_articles` |
| **sponsors** | None | `sponsors`, `contacts` (sponsor_contacts), `packages` (sponsor_packages), `booths` (sponsor_booths), `deliverables`, `invoices` (sponsor_invoices), `assets` (sponsor_assets) |

---

## 2. Multi-Tenant SaaS Isolation & Entitlement Guard Architecture

All features and schemas must align with the multi-tenant SaaS hierarchy:
`Platform` -> `Organization (Tenant)` -> `Event` -> `Sessions` -> `Speakers` -> `Presentations` -> `Venue Operations`.

### A. Strict Tenant Isolation
1. **Scope Validation:** Every database query must filter by `organization_id`. Ensure `tenant_org_id` context scope is validated at the middleware layer.
2. **Access Security:** Cross-organization queries are strictly blocked. RBAC evaluation occurs *after* tenant ownership validation. Only Super Admins can bypass tenant boundaries, and all such actions must write to `audit.impersonation_logs`.
3. **Soft Deletes:** Respect soft deletes across all tenant-owned models using a global query filter.

### B. Dynamic Entitlement & Application Access Control
Access to features is gated via a centralized middleware/service guard layer:
1. **PlanGuard:** Evaluates if the Organization's active subscription tier (Starter, Professional, Enterprise) allows access to a domain.
2. **ApplicationGuard:** Verifies if the application (e.g., Organizer Portal, Speaker Portal, Venue Ops) is explicitly enabled for the tenant in `applications.organization_apps`.
3. **FeatureGuard:** Checks `billing.organization_feature_overrides` and `platform.feature_flags` to evaluate granular feature entitlements.
4. **Dynamic UI Rendering:** The sidebar, menus, routes, and client dashboards must dynamically respect enabled applications and feature flags. No hardcoding of UI visibility.

---

## 3. Platform Expansion & Service Domain Integration Specs

### A. Centralized File & Asset Management (`files` Schema)
- **Scope:** Replaces legacy, scattered asset structures. All event uploads, slides, floorplans, and PDFs must route through this domain.
- **Backend Rules:**
  - Standardize file uploads using `upload_sessions` with chunked validation.
  - Automate file scanning via Celery-driven background `virus_scans`.
  - Store version history in `asset_versions` and configure tag structures in `asset_tags`.
- **UI/UX Design:**
  - Modern Glassmorphic File Explorer with grid/list toggles, drag-and-drop animations, upload progress circles, and high-fidelity preview modals.

### B. Background Jobs Platform (`jobs` Schema)
- **Scope:** Offloads intensive synchronous work (e.g., Badge Generation, Email Campaigns, Exports).
- **Backend Rules:**
  - Register task metadata in `background_jobs` and capture state metrics.
  - Acquire `job_locks` to prevent race conditions or duplicate execution.
  - Stream progress and execution errors back to `job_executions` and `job_failures`.
- **UI/UX Design:**
  - Platform Worker Dashboard with live progress tracking, worker health visual meters, and details of failed executions.

### C. Search Platform (`search` Schema)
- **Scope:** Centralized search index for Events, Speakers, Participants, Files, and Sponsors.
- **Backend Rules:**
  - Maintain elastic/full-text search indexes in `search_indexes` and documents in `search_documents`.
  - Queue index sync activities via `search_jobs`.

### D. Automation & Workflow Engine (`workflow` Schema)
- **Scope:** Dynamically configurable IFTTT chains (e.g., automatically sending registration badges upon ticket purchase).
- **Backend Rules:**
  - Model execution paths with `workflow_steps` and spawn `workflow_instances`.
  - Track assignments in `workflow_tasks` and log full executions in `workflow_history`.
- **UI/UX Design:**
  - Canvas Node Designer (React Flow) with color-coded nodes and clean connection animations.

### E. AI Platform (`ai` Schema)
- **Scope:** Cognitive assistants, Semantic RAG search, and cost tracking.
- **Backend Rules:**
  - Chat backend connecting `conversations` and `messages` to Gemini API.
  - Store RAG vector embeddings in `embeddings`.
  - Enforce usage constraints and cost calculations through `ai_usage` and `cost_tracking`.
- **UI/UX Design:**
  - Minimalist floating chat assistant widget with typing micro-animations and slide-in drawer.

### F. Developer & Integration Ecosystem (`developer` & `integrations` Schemas)
- **Scope:** Public API tokens, OAuth2, and app providers (e.g., Salesforce, Zoom).
- **Backend Rules:**
  - Issue keys and verify client scopes via `api_keys` and `oauth_clients`.
  - Intercept requests at middleware to log `api_usage` and enforce `rate_limits`.

---

## 4. Integration Roadmap (Phased Execution)

```mermaid
graph TD
  Phase1 [Phase 1: Jobs, Search & Audit Core] --> Phase2 [Phase 2: Files, Workflow & AI RAG Platform]
  Phase2 --> Phase3 [Phase 3: Applications, Developer Portal & OAuth2]
  Phase3 --> Phase4 [Phase 4: Marketplace, Mobile Sync & Support]
```

### Phase 1: Jobs, Search & Audit Core (Platform Services & Future)
- **Goal:** Set up safe background processing, global indexing, and auditing foundation.
- **Actions:**
  1. Build the Celery/Redis background worker pipeline using the `jobs` schema.
  2. Implement global search sync jobs in `search.search_jobs`.
  3. Hook up structural audit listeners (e.g., logging configuration changes and admin impersonation events).

### Phase 2: Files, Workflow & AI RAG Platform (Core Infrastructure & Expansion)
- **Goal:** Unify assets, enable smart pipelines, and integrate AI.
- **Actions:**
  1. Standardize file uploads using the `files` schema with background virus scans.
  2. Implement the core event automation evaluation using the `workflow` steps.
  3. Build the RAG vector indexing pipeline and Chat API using Gemini.

### Phase 3: Applications, Developer Portal & OAuth2 Gateway (Developer Platform)
- **Goal:** Externalize EventX APIs and establish standard dynamic application guards.
- **Actions:**
  1. Establish `PlanGuard`, `ApplicationGuard`, and `FeatureGuard` middleware.
  2. Build OAuth2 key generation and public API rate-limiting layers.
  3. Build dynamic dashboard structures that toggle tabs and sidebars based on tenant application mapping.

### Phase 4: Marketplace, Mobile Sync & Support (Marketplace & Ecosystem)
- **Goal:** Support offline staff check-ins, app installations, and ticketing.
- **Actions:**
  1. Build offline data synchronization queues for local staff devices.
  2. Launch the Marketplace client dashboard permitting modular app integrations.
  3. Integrate support ticket escalation and SLA policy validation.
