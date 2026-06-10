# 03_feature_mapping.md: Domain-Feature Mapping

This document maps the legacy EventX OS features to the new domain-driven SaaS architecture implemented during the refactor.

## Domain Mapping

| Legacy Feature Area | New Domain Module | Key Models Transferred |
| :--- | :--- | :--- |
| **Auth** | `identity` | `users`, `refresh_tokens`, `api_keys` |
| **RBAC** | `rbac` | `roles`, `permissions`, `organization_members`|
| **Event Planner** | `events` | `events`, `sessions`, `rooms`, `capacity_rules`|
| **Speaker Portal** | `speakers` | `profiles`, `session_assignments`, `speaker_entries` |
| **Registrations** | `registration` | `participants`, `registrations`, `tickets` |
| **Venue Operations** | `venue` | `devices`, `sync_jobs`, `activity_logs` |
| **Notifications** | `communications` | `email_templates`, `campaigns`, `logs` |
| **Reporting/Insights**| `analytics` | `attendance_logs`, `dashboard_metrics` |
| **SaaS Billing** | `billing` | `subscriptions`, `plans`, `invoices` |
| **CRM** | `crm` | `accounts`, `contacts`, `leads` |
| **Support** | `support` | `support_tickets`, `ticket_comments` |
| **App Marketplace** | `marketplace` | `apps`, `reviews`, `installations` |
| **Audit/Compliance** | `audit` | `logs`, `security_logs`, `data_exports` |

## Migration Checklist Reference
- All routers have been updated to follow `/api/v1/{domain}/*` standards.
- All service methods have been moved from `app/services` to `app/modules/{domain}/services`.
- All background tasks have been moved from `app/tasks` to `app/modules/{domain}/tasks`.
- Import paths have been refactored and circular dependencies resolved.
- Backend initialization service (`init_service.py`) updated to reference the new domain-driven modules for seeding and system defaults.

---
*Status: Domain Mapping Complete*
