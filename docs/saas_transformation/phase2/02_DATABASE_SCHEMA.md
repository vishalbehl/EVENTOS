# 2. Phase 2 Database Schema Changes

These schema additions seamlessly extend the Phase 1 SaaS foundation without modifying existing transactional data.

## 1. Feature Catalog & Entitlements

### `feature_catalog`
Central registry of all platform capabilities.
- `id` (UUID, PK)
- `key` (String, Unique) - e.g., 'registration_portal', 'venue_sync', 'ai_assistant'
- `name` (String)
- `description` (Text)
- `category` (String) - e.g., 'core', 'advanced', 'integrations'
- `is_addon` (Boolean)
- `is_billable` (Boolean)
- `required_plan` (String, Optional)
- `created_at` (Timestamp)

### `plan_features`
Maps features to specific base subscription plans.
- `plan_id` (UUID, FK -> subscription_plans.id, PK)
- `feature_id` (UUID, FK -> feature_catalog.id, PK)
- `enabled` (Boolean, default=True)

### `organization_features`
Allows Super Admins to override features for specific tenants.
- `organization_id` (UUID, FK -> organizations.id, PK)
- `feature_id` (UUID, FK -> feature_catalog.id, PK)
- `is_enabled` (Boolean) - Overrides plan default if present.

## 2. Add-On Marketplace

### `addons`
Registry of purchasable add-on modules.
- `id` (UUID, PK)
- `name` (String) - e.g., 'Venue Operations', 'WhatsApp Suite'
- `description` (Text)
- `monthly_price` (Decimal)
- `yearly_price` (Decimal)
- `stripe_product_id` (String)

### `addon_features`
Maps an Add-On to the features it unlocks.
- `addon_id` (UUID, FK -> addons.id, PK)
- `feature_id` (UUID, FK -> feature_catalog.id, PK)

### `organization_addons`
Tracks which Add-Ons an organization has purchased.
- `id` (UUID, PK)
- `organization_id` (UUID, FK -> organizations.id)
- `addon_id` (UUID, FK -> addons.id)
- `status` (Enum: ACTIVE, CANCELED, PENDING)
- `purchased_at` (Timestamp)
- `expires_at` (Timestamp, Optional)

## 3. Usage Analytics & Revenue Intelligence

### `usage_events`
Immutable log of platform consumption.
- `id` (UUID, PK)
- `organization_id` (UUID, FK -> organizations.id)
- `event_type` (String) - e.g., 'EMAIL_SENT', 'API_CALL', 'STORAGE_UPLOAD'
- `quantity` (Int)
- `timestamp` (Timestamp)

### `usage_snapshots`
Aggregated usage data for fast reporting.
- `organization_id` (UUID, FK -> organizations.id, PK)
- `period` (Date, PK) - e.g., '2026-06-01'
- `metrics` (JSONB) - Aggregated stats (registrations, api_calls, etc.)

## 4. Organization Health & Lifecycle

### `organization_health`
Real-time health evaluation.
- `organization_id` (UUID, FK -> organizations.id, PK)
- `health_score` (Int) - 0 to 100
- `status` (Enum: HEALTHY, WARNING, CRITICAL)
- `warnings` (JSONB) - List of active warning codes (e.g., ['STORAGE_LIMIT', 'FAILED_PAYMENT'])
- `last_calculated_at` (Timestamp)

### `activity_timeline`
Sourced events for the CRM.
- `id` (UUID, PK)
- `organization_id` (UUID, FK -> organizations.id)
- `actor_id` (UUID, FK -> users.id)
- `action_type` (String) - e.g., 'PLAN_UPGRADED', 'SUPPORT_TICKET_CREATED'
- `metadata` (JSONB)
- `timestamp` (Timestamp)

## 5. Support Desk

### `support_tickets`
- `id` (UUID, PK)
- `organization_id` (UUID, FK -> organizations.id)
- `creator_id` (UUID, FK -> users.id)
- `assigned_to` (UUID, Optional, FK -> users.id)
- `subject` (String)
- `status` (Enum: OPEN, IN_PROGRESS, ESCALATED, RESOLVED)
- `priority` (Enum: LOW, MEDIUM, HIGH, CRITICAL)

### `ticket_comments`
- `id` (UUID, PK)
- `ticket_id` (UUID, FK -> support_tickets.id)
- `author_id` (UUID, FK -> users.id)
- `content` (Text)
- `created_at` (Timestamp)

## 6. Advanced Impersonation (Updates)

### `impersonation_logs` (Modifications)
- Add `approved_by` (UUID, Optional, FK -> users.id)
- Add `session_expires_at` (Timestamp) - Enforces 30 min limit.
- Add `terminated_at` (Timestamp) - Explicit logout.