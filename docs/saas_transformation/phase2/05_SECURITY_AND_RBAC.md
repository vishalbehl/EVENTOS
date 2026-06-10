# 5. Phase 2 Security & RBAC Extensions

The security architecture must enforce rigorous validations across a multi-dimensional entitlement matrix to support the feature catalog and add-on marketplace.

## 1. The Extended Authorization Pipeline

Every request is evaluated through a strict, sequential pipeline. Failure at any stage immediately halts execution.

1. **Authentication:** Valid JWT, not expired, session not revoked.
2. **Platform Role Check:** `SUPER_ADMIN` bypasses tenant restrictions.
3. **Organization Role Check:** Ensures the user belongs to the tenant and has adequate standing.
4. **Event Role Check:** (If applicable) Ensures the user has operational access to the specific event.
5. **Subscription Status:** Organization must not be `SUSPENDED`, `CANCELLED`, or `ARCHIVED`.
6. **Plan Features:** Checks if the feature (e.g., `api_access`) is mapped to the organization's base plan.
7. **Organization Feature Overrides:** Evaluates if a Super Admin explicitly granted or revoked the feature, overriding the base plan.
8. **Add-On Entitlements:** Checks if the feature belongs to an actively purchased Add-On (e.g., `VENUE_SYNC` via `Venue Operations`).
9. **RBAC Permission:** Validates the user's specific role action (e.g., `VENUE_SYNC:EXECUTE`).
10. **Resource Scope:** Ensures the target resource belongs to the evaluated Organization/Event.

## 2. Advanced Impersonation Security
- **Strict Time Limits:** Impersonation tokens contain a hardcoded `exp` of exactly 30 minutes.
- **Workflow & Auditing:** The `impersonation_logs` record the mandatory "Reason". 
- **Session Tracking:** An active impersonation session can be forcefully terminated from the Super Admin dashboard, updating `terminated_at` and immediately revoking the JWT via Redis blacklist.
- **IP & Device Logging:** The exact IP and User Agent of the Super Admin initiating the session are permanently recorded.

## 3. RBAC Extensions
New Platform-level permissions are introduced to securely segment the internal EventX team's capabilities.

| Permission | Description |
| :--- | :--- |
| `PLATFORM:CRM_VIEW` | Access the Super Admin organization list and health scores. |
| `PLATFORM:CRM_EDIT` | Modify organization metadata, suspend/activate accounts. |
| `PLATFORM:BILLING_VIEW` | View MRR, invoices, and Stripe linkages. |
| `PLATFORM:BILLING_EDIT` | Issue refunds, apply coupons, change base plans. |
| `PLATFORM:IMPERSONATE` | Authorized to use the "Login As" functionality. |
| `PLATFORM:SUPPORT` | Access and reply to tenant support tickets. |
| `PLATFORM:FEATURE_OVERRIDE` | Modify the `organization_features` matrix to grant exceptions. |
| `PLATFORM:REVENUE_ANALYTICS` | Access the Revenue Intelligence dashboards. |

## 4. Organization Lifecycle Management
Transitions between lifecycles are heavily secured.
- `ONBOARDING` -> `TRIAL` -> `ACTIVE`
- `GRACE_PERIOD`: Triggered upon failed payment. Feature access remains, but warning banners display.
- `SUSPENDED`: Triggered after grace period ends. API access blocked, portal offline.
- `ARCHIVED`: Soft-deleted. Data retained for compliance but inaccessible.
- `CANCELLED`: Subscription terminated.