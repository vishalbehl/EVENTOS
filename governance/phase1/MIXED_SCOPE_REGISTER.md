# Mixed-Scope Tenant Isolation Register

## Implemented

| Table | Ownership rule |
|---|---|
| `billing.invoices` | Organization must match; optional event and activation must belong to the same tenant |
| `billing.organization_addons` | Organization must match; optional event and activation must belong to the same tenant |
| `templates.template_installations` | Organization and required event must both belong to the tenant |
| `rbac.user_role_assignments` | Assigned user owns the row; optional organization and event must match that tenant |

## Blocked Pending Remodeling

| Table | Blocking decision |
|---|---|
| `communications.email_templates` | Global defaults and event overrides need separate SELECT and mutation policies plus explicit platform ownership |
| `registration.print_templates` | Null-event rows lack a reliable platform-default marker |
| `communications.email_logs` | Add direct `organization_id`, backfill through event/campaign/speaker/participant, and quarantine unresolved rows |
| `identity.security_events` | Define tenant security events versus platform-global security evidence and operational writer role |
| `resource_management.employee_calendars` | Establish employee-to-organization ownership source before policy creation |
| `resource_management.equipment_calendars` | Establish hardware-to-organization ownership source before policy creation |

No policy may interpret a null tenant or event reference as organization-wide
access. Shared platform defaults require explicit read-only policy semantics.
