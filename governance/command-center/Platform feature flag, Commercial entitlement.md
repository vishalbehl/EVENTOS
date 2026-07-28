The three concepts must remain separate but work through one resolution pipeline:

```text
Platform feature flag
        ↓
Selects rollout/system behavior

Commercial entitlement
        ↓
Determines whether the customer purchased a capability

Quantitative limit
        ↓
Determines how much of that capability the customer may consume

Backend feature/limit gate
        ↓
Enforces the result on every API request

Organizer Portal capability state
        ↓
Shows, hides, disables, or explains the feature
```

## 1. Platform feature flags

### Purpose

A platform feature flag controls software rollout and operational behavior. It answers:

> “Should this code path or product version be active for this organization?”

It must not answer:

> “Did this organization purchase the feature?”

For example:

- An organization bought E-poster management.
- The new E-poster editor is being released gradually.
- The entitlement says the organization may use E-posters.
- The rollout flag decides whether it sees the old or new editor.

### What a production feature flag should contain

Every feature flag should have:

| Field | Purpose |
|---|---|
| `flag_key` | Stable machine identifier |
| `name` | Human-readable name |
| `description` | What behavior it controls |
| `scope` | Global, environment, organization, event, user, percentage |
| `environment` | Development, staging, production |
| `enabled` | Master state |
| `default_value` | Behavior when no override exists |
| `targeting_rules` | Organizations, events, users, plans, regions |
| `percentage` | Gradual rollout percentage |
| `starts_at` | Scheduled activation |
| `expires_at` | Automatic rollback or cleanup |
| `owner` | Responsible engineering/product team |
| `risk_level` | Low, medium, high, critical |
| `reason` | Why it was changed |
| `created_by` | Original actor |
| `updated_by` | Latest actor |
| `version` | Optimistic concurrency |
| `created_at` / `updated_at` | Audit timestamps |

### Recommended flag types

#### Release flags

Used to gradually release new software:

- `organizer_portal_new_navigation`
- `event_capabilities_api_v2`
- `new_registration_builder`
- `new_email_campaign_editor`

These should be temporary and removed after rollout.

#### Operational flags

Used to disable a malfunctioning integration:

- `email_delivery_enabled`
- `sms_delivery_enabled`
- `webhook_dispatch_enabled`
- `ai_processing_enabled`
- `presentation_validation_enabled`

These can live longer but require ownership and monitoring.

#### Migration flags

Used during source-of-truth migrations:

- `organizer_console_entitlement_shadow`
- `organizer_console_entitlement_enforce`

These compare legacy and canonical behavior before switching enforcement.

#### Experiment flags

Used for A/B tests:

- `onboarding_variant`
- `pricing_page_variant`

These must not modify purchased entitlements or bypass security.

#### Emergency kill switches

Used during incidents:

- `disable_bulk_exports`
- `disable_impersonation`
- `disable_external_webhooks`
- `disable_public_registration`

High-risk kill switches should be controlled from Security or Operations Console.

### What is already implemented

A basic organization-scoped `FeatureFlag` model exists in:

[platform_domain_tables.py](D:/DEV/conf-platform/services/backend/app/modules/platform/models/platform_domain_tables.py)

Current fields are:

- `id`
- `organization_id`
- `flag_key`
- `is_enabled`

The entitlement rollout currently uses:

- `organizer_console_entitlement_shadow`
- `organizer_console_entitlement_enforce`

Implemented behavior includes:

- Per-organization shadow mode.
- Legacy versus canonical entitlement comparisons.
- Evidence-gated enforcement activation.
- Nightly shadow comparison jobs.
- Command Center rollout status.
- Audited rollout changes.
- Enforcement cannot be enabled while comparisons diverge.

### What is still required

The current feature-flag model is only a rollout foundation. It does not yet provide a complete feature-management platform.

Still needed:

- Global and event-level flags.
- Environment-specific values.
- Targeting and percentage rollout.
- Scheduling and expiry.
- Flag ownership and descriptions.
- Versioning and concurrency checks.
- Unique constraint for organization plus flag key.
- Emergency kill switches.
- Flag evaluation audit records.
- A typed flag registry.
- Organizer Portal SDK/hook for applicable rollout flags.
- Removal deadlines for temporary flags.
- Dedicated specialist ownership in the Applications/Developer/Operations consoles.

### Important rule

A feature flag must never grant a paid feature.

Correct evaluation:

```text
commercial_entitlement_enabled
AND rollout_flag_enabled
AND NOT emergency_restriction
```

Incorrect evaluation:

```text
rollout_flag_enabled = customer can use paid feature
```

---

# 2. Commercial entitlements and feature gates

These are related but not identical:

- An entitlement is the commercial decision.
- A feature gate is the enforcement mechanism.

## Commercial entitlement

An entitlement answers:

> “May this organization or event use this capability?”

Examples:

- Registration portal.
- Coupon codes.
- Bulk imports.
- Speaker portal.
- E-posters.
- Custom badge design.
- Campaign management.
- SMS.
- WhatsApp.
- White labelling.
- API access.

Entitlements should normally be Boolean or use an explicit access tier.

Examples:

```json
{
  "FEAT_CAMPAIGN_MGMT": true,
  "FEAT_WHITE_LABEL": false,
  "FEAT_REGISTRATION_ANALYTICS": "ADVANCED"
}
```

The existing resolver currently treats Boolean values as features. Tiered feature values need a more explicit typed representation rather than relying on display strings.

## Feature gate

A feature gate answers:

> “Should this specific operation be allowed right now?”

A complete gate evaluates:

```text
actor permission
+ tenant/event ownership
+ event lifecycle state
+ commercial entitlement
+ rollout flag
+ security restriction
+ system/provider availability
```

For example, sending an SMS should require:

```text
User has communications.send permission
AND event belongs to selected organization
AND FEAT_SMS is enabled
AND SMS provider flag is enabled
AND event is not suspended
AND SMS quota has remaining capacity
```

## What every entitlement should contain

| Field | Purpose |
|---|---|
| `key` | Stable feature key |
| `name` | Display name |
| `description` | Exact customer capability |
| `category` | Registration, speakers, communications, etc. |
| `value_type` | Boolean, tier, enum |
| `scope` | Organization or event |
| `default_value` | Normally disabled |
| `enforcement_mode` | Hard, soft warning, metered |
| `dependencies` | Features that must also be enabled |
| `conflicts` | Mutually exclusive capabilities |
| `required_permissions` | Portal permission identifiers |
| `portal_routes` | Organizer Portal surfaces |
| `backend_endpoints` | Protected APIs |
| `meter_key` | Associated usage metric, if any |
| `upgrade_destination` | Where an organizer requests access |
| `owner_console` | Business, Developer, Operations, etc. |
| `sensitivity` | Operational or security classification |

## What is already implemented

### Feature catalogue

The seed catalogue currently includes these areas.

#### Platform and branding

- `FEAT_EVENT_WEBSITE`
- `FEAT_CUSTOM_DOMAIN`
- `FEAT_WHITE_LABEL`
- `FEAT_DEFAULT_THEME`
- `FEAT_THEME_CUSTOMIZATION`
- `FEAT_CUSTOM_COLORS`
- `FEAT_CUSTOM_FONTS`
- `FEAT_LOGO_BRANDING`
- `FEAT_CUSTOM_LOGIN_PAGE`

#### Registration

- `FEAT_REGISTRATION_PORTAL`
- `FEAT_REGISTRATION_FORMS`
- `FEAT_TICKET_CATEGORIES`
- `FEAT_COUPON_CODES`
- `FEAT_PAYMENT_GATEWAY`
- `FEAT_REGISTRATION_ANALYTICS`
- `FEAT_BULK_IMPORT`
- `FEAT_QR_CONFIRMATION`
- `FEAT_ATTENDEE_CHECKIN`

#### Speaker management

- `FEAT_SPEAKER_PORTAL`
- `FEAT_ABSTRACT_SUBMISSION`
- `FEAT_FILE_UPLOADS`
- `FEAT_PRESENTATION_VALIDATION`
- `FEAT_SPEAKER_DASHBOARD`
- `FEAT_SPEAKER_COMMS`
- `FEAT_SPEAKER_PROFILES`
- `FEAT_MULTI_PRESENTATION_VERSIONS`

#### Badges and certificates

- `FEAT_BADGE_TEMPLATES`
- `FEAT_CERTIFICATE_TEMPLATES`
- `FEAT_CUSTOM_BADGE_DESIGN`
- `FEAT_CUSTOM_CERT_DESIGN`
- `FEAT_QR_BADGE`
- `FEAT_BULK_BADGE_EXPORT`
- `FEAT_AUTO_CERTIFICATE`

#### Communications

- `FEAT_EMAIL_NOTIFICATIONS`
- `FEAT_REMINDER_EMAILS`
- `FEAT_CAMPAIGN_MGMT`
- `FEAT_BULK_EMAIL`
- `FEAT_ANNOUNCEMENT_CENTER`
- `FEAT_PUSH_NOTIFICATIONS`
- `FEAT_WHATSAPP`
- `FEAT_SMS`

#### Support

- `FEAT_EMAIL_SUPPORT`
- `FEAT_OFFICE_HOURS_SUPPORT`
- `FEAT_PRIORITY_SUPPORT`
- `FEAT_DEDICATED_MANAGER`
- `FEAT_24x7_SUPPORT`
- `FEAT_SLA`

The catalogue is seeded in:

[init_service.py](D:/DEV/conf-platform/services/backend/app/services/init_service.py:325)

### Commercial relationships

Already implemented:

- Plan-to-feature mappings.
- Add-on-to-feature mappings.
- Organization feature overrides.
- Organization subscriptions.
- Event activations.
- Immutable activation entitlement snapshots.
- Versioned event commercial contracts.
- Purchased event add-ons.
- Organization and event override requests.
- Dual approval.
- Effective and expiry times.
- Restrictions.
- Hard ceilings.
- Complete resolution version.
- Source breakdown.
- Legacy/canonical shadow comparison.

The canonical resolver is:

[event_entitlement_service.py](D:/DEV/conf-platform/services/backend/app/modules/billing/services/event_entitlement_service.py)

Its current resolution order is effectively:

1. Activation snapshot/legacy baseline.
2. Active event contract.
3. Purchased add-ons.
4. Approved organization overrides.
5. Approved event overrides.
6. Restrictions.
7. Hard ceilings.
8. Rollout enforcement selection.

### Backend gates already present

Several mutations already use `LimitGuard` or explicit feature dependencies, including areas such as:

- Event creation.
- User creation.
- Registrations.
- Participants.
- Speakers.
- Sessions.
- Rooms.
- File uploads.
- Storage.
- Email sending.
- Badge templates.
- Certificate templates.
- Ticket categories.

The primary implementations are:

- [limit_guard.py](D:/DEV/conf-platform/services/backend/app/modules/billing/services/limit_guard.py)
- [feature_gate.py](D:/DEV/conf-platform/services/backend/app/core/dependencies/feature_gate.py)
- [plan_guard.py](D:/DEV/conf-platform/services/backend/app/middleware/plan_guard.py)

### What is only partial

The feature enforcement system is not fully unified.

Current problems:

- `LimitGuard` generally uses the canonical `EventEntitlementService`.
- `feature_gate.py` still uses the older `EntitlementResolver`.
- `PlanGuardMiddleware` also uses the legacy organization-level entitlement service.
- `PlanGuardMiddleware` relies on URL regular expressions.
- Not every Organizer Portal route has a declared commercial feature.
- Not every backend mutation has an explicit feature dependency.
- Tiered features such as “Basic”, “Advanced”, and “Enterprise” are mainly display values, not strongly typed enforcement values.
- Some capabilities exist in the catalogue but have no proven portal/backend gate.
- Startup reports missing add-on mappings for WhatsApp, E-poster, and white-label add-ons.
- E-poster is referenced operationally but is not present in the canonical seeded feature list shown above.
- API access and third-party integration feature keys appear in middleware but are not present in the canonical seed list.
- The Organizer Portal does not currently have a shared `FeatureGate` component or capability hook.

### What should be added

#### Canonical feature definition registry

Every feature needs one code-owned definition:

```ts
{
  key: "FEAT_CAMPAIGN_MGMT",
  scope: "EVENT",
  valueType: "BOOLEAN",
  portalRoutes: [
    "/events/:eventId/communication/emails"
  ],
  backendActions: [
    "communications.campaign.create",
    "communications.campaign.schedule",
    "communications.campaign.send"
  ],
  requiredPermissions: [
    "event.communications.manage"
  ],
  usageMetric: "emails_sent"
}
```

#### Canonical Organizer Portal capability API

Add:

```http
GET /api/v1/events/{event_id}/capabilities
```

It must return the same canonical resolution used by backend gates.

#### Shared Organizer Portal gates

Add:

- `EventCapabilitiesProvider`
- `useEventCapabilities(eventId)`
- `FeatureGate`
- `LimitGate`
- `EntitlementBoundary`
- `UpgradeRequired`
- `QuotaExceeded`
- `EntitlementUnavailable`

Portal navigation, pages, buttons, and forms should use these shared primitives.

#### Explicit router gates

Replace implicit URL-only enforcement with declarations such as:

```python
@router.post(
    "/events/{event_id}/campaigns",
    dependencies=[require_event_feature("FEAT_CAMPAIGN_MGMT")],
)
```

The UI can hide a button, but the API must remain authoritative.

---

# 3. Quantitative limits and usage gates

## Purpose

A quantitative limit answers:

> “How much of an allowed capability may this organization or event consume?”

Examples:

- 1,000 registrations.
- 100 speakers.
- 20 rooms.
- 50 GB storage.
- 10,000 API calls.
- 5,000 emails.
- 25 organizer users.

A feature may be enabled while its limit is exhausted.

Example:

```text
FEAT_EMAIL_NOTIFICATIONS = enabled
max_emails_per_event = 5,000
emails_sent = 5,000
```

The customer has the email feature, but sending another email must be denied.

## What every limit should contain

| Field | Purpose |
|---|---|
| `key` | Stable machine key |
| `name` | Display name |
| `scope` | Organization or event |
| `unit` | Count, bytes, requests, messages, seats |
| `period` | Event lifetime, billing cycle, day, month |
| `limit_value` | Purchased allowance |
| `unlimited` | Explicit unlimited state |
| `hard_ceiling` | Absolute platform maximum |
| `enforcement_mode` | Hard stop, warning, overage |
| `meter_key` | Usage ledger metric |
| `reset_policy` | Event, billing-period, manual |
| `overage_policy` | Deny, bill, warn |
| `reservation_policy` | Whether pending jobs reserve usage |
| `reconciliation_source` | Authoritative domain table |
| `forecast_policy` | How expected usage is calculated |

Avoid using `null` ambiguously. A typed value is safer:

```json
{
  "mode": "LIMITED",
  "value": 1000
}
```

or:

```json
{
  "mode": "UNLIMITED",
  "value": null
}
```

## What is already implemented

### Current plan limits

The subscription-plan model contains:

#### Organization-scoped limits

- `max_events`
- `max_users`
- `max_storage_gb` compatibility value

#### Event-scoped limits

- `max_event_team_members`
- `max_registrations`
- `max_speakers`
- `max_sessions`
- `max_rooms`
- `max_ticket_categories`
- `max_badge_templates`
- `max_certificate_templates`
- `max_emails_per_event`
- `storage_quota_mb`

The model is:

[subscription.py](D:/DEV/conf-platform/services/backend/app/modules/billing/models/subscription.py:16)

### Enforcement already implemented

`LimitGuard` currently supports:

- Speakers.
- Sessions.
- Registrations.
- Rooms.
- Ticket categories.
- Badge templates.
- Certificate templates.
- Event team members.
- Email headroom.
- Storage upload headroom.
- Organization users.
- Organization events.

It produces structured `PLAN_LIMIT_EXCEEDED` errors containing:

- Limit key.
- Allowed value.
- Used value.
- Remaining value.
- Activation.
- Grant.
- Plan.
- Source.
- Human-readable reason.

### Metering already implemented

The Organizer Console implementation added:

- Usage ledger entries.
- Organization and event scope.
- Metric keys.
- Periods and timestamp buckets.
- Idempotency keys.
- Reset epochs.
- Corrections and adjustment lineage.
- Reconciliation records.
- Forecasts.
- Nightly reconciliation.
- Source and freshness information.
- Usage versus allowance displays.
- Approved extra allocations.
- Hard ceilings.

### What is still incomplete

#### Missing commercial limits

The proposal includes more metrics than the plan model currently exposes. These should be added where commercially relevant:

- API calls per day/month/event.
- API rate and burst limits.
- Webhook deliveries.
- Webhook retries.
- SMS messages.
- WhatsApp messages.
- Push notifications.
- Integration operations.
- AI tokens, requests, credits, or processing minutes.
- File count.
- Individual file-size limit.
- Export jobs.
- Bulk-operation batch size.
- Active integrations.
- API keys.
- Webhook endpoints.
- Devices.
- Presentation processing jobs.
- Concurrent background jobs.
- Email recipients per campaign.
- Scheduled campaigns.
- Custom domains.
- Seats by role, if commercially different.

#### Concurrency-safe enforcement

For costly or high-volume operations, checking usage and then writing can race:

```text
Request A sees 99/100
Request B sees 99/100
Both are accepted
Final usage becomes 101/100
```

Limits need atomic reservation or database locking for:

- Registration capacity.
- Email/SMS bulk sends.
- API quotas.
- Storage uploads.
- Export jobs.
- AI usage.
- Device allocations.

#### Unified period semantics

Each limit must explicitly identify its reset period:

- Event lifetime.
- Event service period.
- Calendar day.
- Calendar month.
- Subscription period.
- Rolling 24 hours.
- Never resets.

#### Portal limit gates

The Organizer Portal currently displays some plan limits, but it does not consistently use resolved event usage to control every action.

It needs to show:

- Used.
- Allowed.
- Remaining.
- Extra approved allocation.
- Hard ceiling.
- Forecast.
- Reset date.
- Reconciliation state.
- Upgrade or request-extra action.

### Legacy portal values that must be removed

The Organizer Portal contains hard-coded onboarding plan values for Starter, Pro, and Enterprise. These can drift from Business Console plan records.

The portal also retains organization-level editing of legacy fields such as:

- `org.plan`
- `max_events`
- `max_users`
- `max_storage_gb`

Those should not be editable from ordinary Organizer Portal organization settings. Commercial values must come from contracts and resolved entitlements.

---

# Combined evaluation model

For a user attempting an operation, the backend decision should look like this:

```text
1. Is the actor authenticated?
2. Does the actor belong to the selected organization?
3. Does the event belong to that organization?
4. Does the actor have the required permission?
5. Is the event contract active?
6. Is the commercial entitlement enabled?
7. Is the rollout flag allowing this implementation?
8. Is there an emergency restriction?
9. Is the provider/service available?
10. Is there sufficient quota or reserved capacity?
11. Atomically reserve or consume usage.
12. Execute the operation.
13. Record usage and audit evidence.
```

## Example: bulk email campaign

```text
Permission:
event.communications.campaign.send

Entitlement:
FEAT_BULK_EMAIL = true

Rollout flag:
bulk_email_v2 = enabled

Limit:
max_emails_per_event = 5,000

Usage:
emails_sent = 4,600

Requested:
500 recipients

Result:
Denied because 4,600 + 500 > 5,000
```

## Example: E-poster management

```text
Permission:
event.speakers.eposters.manage

Entitlement:
FEAT_EPOSTER_MGMT = true

Rollout flag:
eposter_workspace_v2 = enabled

Limits:
max_eposters = 250
storage_quota_mb = 10,240

Restrictions:
No active security restriction

Result:
Portal visible and API mutation allowed
```

Currently, the E-poster entitlement/add-on keys need catalogue alignment before this example is fully supported.

# Current completeness summary

Verified repository snapshot: 2026-07-28.

The code-owned registry currently contains 53 feature definitions, 60 explicit
operation gates, and 20 quantitative limits. Feature enforcement modes are 49
`ENFORCED`, two intentionally `COMPOSITE`, and two intentionally `READ_ONLY`.
There are no remaining `NOT_IMPLEMENTED` or `PROVIDER_REQUIRED` catalogue
entries.

| Area | Status |
|---|---|
| Feature catalogue | Implemented and startup/CI validated |
| Plan-feature mapping | Implemented with typed, versioned assignments |
| Add-on-feature mapping | Implemented with typed operations and validation |
| Immutable event contract | Implemented |
| Contract versioning | Implemented |
| Entitlement overrides | Implemented |
| Dual approval | Implemented |
| Expiry and revocation | Implemented |
| Hard ceilings | Implemented |
| Canonical event resolver | Implemented |
| Shadow comparison | Implemented |
| Evidence-gated rollout | Implemented |
| Core limit guards | Substantially implemented |
| Durable usage ledger | Implemented |
| Resets without deleting history | Implemented |
| Reconciliation | Implemented |
| Feature-flag management platform | Implemented; production targeting rollout remains |
| Explicit backend operation gates | Implemented for all 60 registered operations |
| Canonical Organizer Portal capability API | Implemented for organization and event scope |
| Shared Organizer Portal feature gates | Implemented |
| Shared Organizer Portal tier and limit gates | Implemented |
| Portal removal of hard-coded commercial authority | Implemented on migrated surfaces |
| Full feature-to-route/action registry | Implemented and source-audited |
| CI proof for catalogue entries | Implemented through capability and portal coverage suites |
| Atomic reservations for finite/high-volume metrics | Implemented for all 20 registered limits |
| Provider-backed SMS, WhatsApp, and push | Implemented; production credentials and remote verification remain deployment work |
| Registration QR lifecycle and abstracts | Implemented and covered by end-to-end backend tests |
| Shadow rollout and legacy retirement | Code implemented; tenant rollout and production evidence remain |

Repository implementation is substantially complete. The remaining release work
is operational: apply and validate migrations on a production-like database,
configure real provider secret references, run tenant shadow comparisons,
complete browser/load/security regression evidence, enable canonical enforcement
by organization, and retire compatibility reads only after zero divergence.
