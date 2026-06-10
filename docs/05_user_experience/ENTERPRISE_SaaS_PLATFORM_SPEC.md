# EventX OS: Enterprise SaaS Specification & Refactor Walkthrough

## 1. Executive Summary
This document serves as the architectural source of truth for the EventX OS transformation into a multi-tenant, domain-driven SaaS platform. It documents the fundamental backend refactoring achieved to date and provides a detailed UI/UX specification for the SuperAdmin multi-tenant management dashboard required for production readiness.

---

## 2. Architectural Refactoring Audit Log (Walkthrough)
The following is a technical audit of the changes applied during the transformation:

### 2.1. Domain-Driven Restructuring
The platform has been decoupled into distinct bounded contexts. All business logic, models, and routes now reside within their domain directories:
- **`platform`**: Organization/Tenant management, system global settings.
- **`identity`**: Auth, sessions, MFA, users.
- **`rbac`**: Consolidated organization/role/permission management.
- **`billing`**: Subscription, plans, feature-toggles.
- **`crm`**: Tenant-specific accounts, contacts, and leads.
- **`support`**: Ticket management system.
- **`audit`**: Immutable system logs, security audit, and access reviews.
- **`events/speakers/registration`**: Domain-segregated event management.

### 2.2. Database & Schema Hardening
- **Schema Segregation:** Migrated tables from `public` to domain-specific schemas (e.g., `crm`, `billing`, `identity`, `audit`, `support`).
- **Tenant Lineage:** Implemented mandatory `organization_id` (or `event_id` where applicable) across all tables to enforce strict data isolation at the storage level.
- **UUID Standardization:** Migrated critical primary keys from integer sequences to UUIDs for scalable, cross-tenant distribution.
- **Soft Delete Framework:** Implemented standardized `SoftDeleteMixin` (`deleted_at`, `deleted_by`) across 20+ core models, with repository-level query filtering to exclude "deleted" data by default.

### 2.3. Security & Integrity Improvements
- **Encryption-at-Rest:** Migrated plaintext TOTP secrets (`identity.users`) and Stripe configuration credentials (`registration.registration_theme_settings`) to AES-256 encrypted storage using the `CredentialCipher` service.
- **Membership Normalization:** Consolidated duplicate membership models (`organization_members` vs `user_organization_memberships`) into the canonical `OrganizationMember` table.

---

## 3. SuperAdmin UI/UX Design Specification
This section details the design requirements for the multi-tenant production dashboard.

### 3.1. Design Philosophy
- **Tenant Context:** Every view must reflect the current `organization_id`. The UI must allow SuperAdmins to "Assume Tenant Identity" to troubleshoot issues.
- **Entitlement Visibility:** The UI must hide/show features based on the active organization's subscription plan (`Plan -> App -> Feature`).
- **Data Integrity:** Soft-deleted data must be clearly marked (e.g., in a trash view) with a restoration option.

### 3.2. Dashboard Core Components
#### A. Global Dashboard (Admin Overview)
- **Tenant Health Monitor:** Card-based view showing active tenants, billing cycle warnings, and system load.
- **Recent Audit Trail:** Live feed from `audit.logs` showing high-severity security events.
- **Quick Actions:** Create Tenant, Upgrade Plan, System Maintenance.

#### B. Organization/Tenant Management
- **List View:** Table of all organizations with columns: Name, Slug, Plan, Status, Active Users, Created At.
- **Tenant Detail View:**
    - **General Tab:** Settings, branding, domain mapping.
    - **Subscription Tab:** View current `subscription_plan`, active `addons`, and historical `invoices`.
    - **Feature Toggles:** Dynamic form to override `PlanFeatures` for this specific organization.
    - **Management:** Actions for Soft-Delete, Disable Tenant, Impersonate.

#### C. RBAC & Membership Management
- **User Directory:** Consolidated list of users.
- **Membership Management:** Assign users to organizations via `OrganizationMember` table with roles (Super Admin, Organizer, Admin, Technician).
- **Access Control:** View and manage `rbac.role_permissions` assignments.

#### D. Content Management (Domain Scoped)
- **Registration Dashboard:** Tenant-specific view of participants, forms, and payment transactions.
- **Speaker Management:** Consolidated view of speakers across events within a tenant.

---

## 4. Production Readiness Checklist (UI & Logic)

### 4.1. API & Entitlement Integration
- [ ] **Entitlement Service:** Backend must implement `EntitlementService` checking for `Plan -> App -> Feature -> Permission` hierarchy.
- [ ] **UI Integration:** Frontend `EntitlementGuard` component must wrap all feature-gated components.
- [ ] **Tenant Header:** All frontend API calls must inject `X-Organization-ID`.

### 4.2. Soft Delete UI Actions
- [ ] **Action:** Replace "Delete" with "Archive/Delete" action (Triggers soft-delete API).
- [ ] **View:** Implement "Trash View" for recovering soft-deleted records.

### 4.3. Data Integrity & Sync
- [ ] **Sync Queue:** Ensure mobile/venue sync jobs are properly handled in a multi-tenant environment.
- [ ] **Validation:** Full regression audit on `rbac` logic to prevent tenant-data leakage across all portal views.

---

*Generated: 2026-06-09*
*Refactor Milestone: Enterprise Architecture Complete*
