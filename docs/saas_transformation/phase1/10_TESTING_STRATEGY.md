# 10. Testing Strategy

A rigorous testing strategy ensures the SaaS transformation perfectly isolates the core plans from the Venue Operations custom add-on.

## 1. Unit Testing
- **PlanGuard Middleware:** Extensive unit testing with mocked subscription and feature flag data. 
  - User on `REGISTRATION` plan accessing basic event setup -> Allow.
  - User on `REGISTRATION` plan accessing Presentation Approval -> Deny (`ERR_UPGRADE_REQUIRED`).
  - User on `CONFERENCE_PROFESSIONAL` plan accessing Venue Sync API -> Deny (`ERR_ADDON_REQUIRED`).
  - User on `REGISTRATION` plan *with* `ADDON_VENUE_OPERATIONS` flag accessing Venue Sync API -> Allow (Validating the decoupled add-on logic).
- **Background Tasks:** Test that Celery workers respect organization add-on flags before processing edge synchronization queues.

## 2. Integration Testing
- **UI Entitlement Sync:** End-to-end testing verifying that the JSON response from `/entitlements/resolve` successfully removes specific React components (e.g., the SRR menu item) from the DOM.
- **Stripe Webhooks:** Simulation of Stripe webhook payloads using the Stripe CLI to ensure automated plan upgrades (Registration -> Professional) immediately unlock new features without requiring a re-login.

## 3. Security & Penetration Testing
- **Tenant Isolation:** Attempt to access data belonging to Organization B while authenticated as a user in Organization A.
- **Add-On Forgery:** Attempt to manually inject `ADDON_VENUE_OPERATIONS` into frontend state payloads to see if the backend `PlanGuard` correctly catches and blocks the subsequent API requests.
- **Impersonation Scope:** Verify that an impersonation token generated for Organization A cannot be used to manipulate records in Organization B.

## 4. User Acceptance Testing (UAT)
- **Persona Walkthroughs:** Internal teams must perform full event setups from three distinct personas:
  1. A small workshop organizer on the Registration plan (verifying simplicity and lack of clutter).
  2. A standard medical conference organizer on the Professional plan.
  3. A massive exhibition organizer with the Professional Plan + Venue Operations Add-On (verifying edge server deployment and hardware integration).