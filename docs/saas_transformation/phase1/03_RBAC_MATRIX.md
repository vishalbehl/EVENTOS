# 3. RBAC Matrix

The RBAC system evolves to a multi-tiered context model (`Platform -> Organization -> Event -> Role -> Permission`). However, **RBAC acts as a secondary layer to the PlanGuard Entitlement Framework.** (e.g., A user might have the `VENUE_SYNC:EXECUTE` RBAC permission, but if the organization hasn't purchased the Venue Operations add-on, PlanGuard will still block the action).

## 1. Platform Roles (Internal SaaS Team)
| Role | Scope | Description |
| :--- | :--- | :--- |
| **SUPER_ADMIN** | Global | Full platform access. Manage billing, feature flags, global settings, and initiate secure Organization impersonation. |
| **SUPPORT_ADMIN** | Global | View organizations, users, and events for troubleshooting. |
| **FINANCE_ADMIN** | Global | Focused on the billing module. Manage subscriptions and custom quotations for add-ons. |
| **SECURITY_ADMIN** | Global | Manage global RBAC definitions and view platform-wide audit logs. |

## 2. Organization Roles (Tenant Admins)
| Role | Scope | Description |
| :--- | :--- | :--- |
| **OWNER** | Organization | Full tenant access. The primary billing contact. |
| **ORG_ADMIN** | Organization | Manages events, users, and organization-level reporting. |
| **FINANCE_MANAGER** | Organization | Can view invoices and update payment methods. |
| **SECURITY_MANAGER** | Organization | Can view tenant-specific audit logs and configure SSO (Enterprise plan). |

## 3. Event Roles (Operational Execution)
Existing event roles are preserved but visually hidden in the UI if the feature isn't unlocked (e.g., the "Technician" role dropdown is hidden if Venue Operations is not purchased).
- **EVENT_DIRECTOR:** Full event access.
- **SCIENTIFIC_MANAGER:** Sessions, Speakers, Files, Posters.
- **REGISTRATION_MANAGER:** Participants, Badges, Check-in.
- **TECHNICAL_MANAGER:** Devices, Venue Sync, SRR.
- **MARKETING_MANAGER:** Campaigns, Analytics.

## 4. New System Permissions
Added to support commercial features and Add-Ons:
- **Finance:** `PAYMENTS:VIEW`, `PAYMENTS:REFUND`, `PAYMENTS:RECONCILE`
- **Sponsors:** `SPONSORS:VIEW`, `SPONSORS:CREATE`, `SPONSORS:EDIT`, `SPONSORS:DELETE`
- **Security:** `AUDIT:VIEW`, `SECURITY:MANAGE_RBAC`, `SECURITY:MANAGE_API_KEYS`
- **Venue Add-On Specific:** `VENUE_SYNC:VIEW`, `VENUE_SYNC:EXECUTE`, `INCIDENTS:MANAGE`