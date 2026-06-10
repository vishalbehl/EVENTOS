# UI/UX Enterprise Refactoring Specification

## 1. Overview
The backend architectural refactor necessitates fundamental changes to the frontend API consumption layer and data handling to support tenant-isolated domains, soft deletes, and feature-based entitlements.

## 2. API Path & Service Layer Updates
All frontend API services must be updated to match the new domain-driven API structure.

| Legacy Path | Target Path | Context |
| :--- | :--- | :--- |
| `/api/v1/auth/*` | `/api/v1/identity/*` | Auth/Identity domain |
| `/api/v1/billing/*` | `/api/v1/billing/*` | Subscription management |
| `/api/v1/events/*` | `/api/v1/events/*` | Conference planning |
| N/A (New) | `/api/v1/crm/*` | CRM management |
| N/A (New) | `/api/v1/support/*` | Ticket management |

*Requirement:* Update base API service URLs and inject `organization_id` into headers or path parameters where required by the new tenant-scoping implementation.

## 3. Entitlement-Driven UI
The UI must no longer rely on hardcoded permissions. It must dynamically hide/show UI components based on the new `Plan -> App -> Feature -> Permission` hierarchy.

- **Component Refactor:** Wrap feature-dependent UI components in an `EntitlementGuard` component.
- **Logic:** The `EntitlementGuard` must check: `Plan` (is subscription active?) -> `App` (is module installed?) -> `Feature` (is feature enabled?) -> `Permission` (does user have access?).

## 4. Soft Delete Visibility
The UI must respect the new `deleted_at` field.

- **Data Fetching:** API calls must explicitly set parameters to filter out records where `deleted_at` is not null, unless explicitly viewing a "Trash" or "Archived" context.
- **Actions:** Replace "Delete" actions with "Soft Delete" logic (API call `DELETE` -> backend updates `deleted_at`).
- **Restoration:** Implement a "Restore" UI action for entities marked as deleted.

## 5. Tenant Context State Management
The frontend must maintain a robust `TenantContext` in the application state.

- **State:** Must track the `active_organization_id` and `current_event_id`.
- **Injection:** All API requests must inject these IDs into headers (`X-Organization-ID`, `X-Event-ID`) to ensure the backend filters the data correctly.

## 6. Deliverables for UI Refactor
- [ ] Updated API Service Layer.
- [ ] EntitlementGuard Component.
- [ ] Soft Delete/Restore UI actions.
- [ ] TenantContext provider implementation.

---
*Status: Architecture Specification Complete*
