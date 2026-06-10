# 2. Database Schema Changes

To support the product-led SaaS transformation and the decoupled add-on model without breaking existing APIs, the schema will be extended.

## New Tables

### `subscription_plans`
Defines the base templates for the core offering.
- `id` (UUID, PK)
- `name` (String) - e.g., 'REGISTRATION', 'CONFERENCE_PROFESSIONAL', 'ENTERPRISE'
- `max_events` (Int)
- `max_users` (Int)
- `max_registrations` (Int)
- `max_rooms` (Int)
- `storage_quota_mb` (BigInt)
- `stripe_product_id` (String, Optional)
- `created_at`, `updated_at`

### `organization_subscriptions`
Links an organization to a base plan and tracks billing state.
- `id` (UUID, PK)
- `organization_id` (UUID, FK -> organizations.id, Unique)
- `plan_id` (UUID, FK -> subscription_plans.id)
- `status` (Enum: ACTIVE, TRIAL, SUSPENDED, EXPIRED, PENDING_PAYMENT)
- `stripe_customer_id` (String)
- `stripe_subscription_id` (String)
- `current_period_end` (Timestamp)
- `created_at`, `updated_at`

### `invoices`, `payments`, `coupons`
Standard billing records synced from the payment gateway. Supports hybrid billing (automated Stripe charges for SaaS, manual invoice logging for custom Venue Operations quotes).

### `feature_flags` (Entitlement Matrix)
Dynamic configuration overrides and Add-On grants. This is how the Venue Operations add-on is unlocked.
- `id` (UUID, PK)
- `key` (String) - e.g., `ADDON_VENUE_OPERATIONS`, `ENABLE_AI_TOOLS`
- `is_enabled` (Boolean)
- `organization_id` (UUID, Nullable, FK -> organizations.id)

### `usage_metrics`
Denormalized tracking table for quota enforcement.
- `organization_id` (UUID, PK)
- `active_events_count` (Int)
- `total_registrations_count` (Int)
- `storage_used_bytes` (BigInt)
- `last_calculated_at` (Timestamp)

## Modifications to Existing Tables

### `users`
- Add `platform_role` (Enum/String) to distinguish internal SaaS staff from tenant users.

### `organizations`
- Link to `organization_subscriptions`. No hard-coded boolean flags (like `has_venue_sync`); all capabilities must derive from the `organization_subscriptions` join and `feature_flags` evaluations.