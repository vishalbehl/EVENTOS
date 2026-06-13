# Walkthrough - Custom Pricing Rules & DB Seeding Safeguards for Add-ons and Subscription Plans

This walkthrough details the changes made to enhance the Add-on Configuration Matrix, remove legacy Stripe columns, safeguard database seeding on startup, and split the Subscription Plan edit forms into dedicated, contextual forms.

## Changes Made

### 1. Database Model and Schema Alignment (FastAPI Backend)
- **SQLAlchemy Models**: Removed `monthly_price`, `yearly_price`, and `stripe_product_id` columns from the `Addon` model definition in [subscription.py](file:///d:/DEV/conf-platform/services/backend/app/modules/billing/models/subscription.py).
- **Migration & Schema Enforcement**: Updated `ensure_addon_columns` inside [router.py](file:///d:/DEV/conf-platform/services/backend/app/modules/platform/router.py) to automatically:
  - Add `min_price_inr` and `max_price_inr` numeric columns if they do not exist.
  - Drop the obsolete `monthly_price`, `yearly_price`, and `stripe_product_id` columns with CASCADE to prevent any schema mismatches.
- **REST Endpoints & Validation**:
  - Expanded Pydantic models in [router.py](file:///d:/DEV/conf-platform/services/backend/app/modules/platform/router.py) to accept `min_price_inr` and `max_price_inr` fields.
  - Serialized the new fields into the output of the list endpoint (`/addons`).

### 2. Startup Seeding Protection (Backend Services)
- **Plan Feature Safeguard**: In [init_service.py](file:///d:/DEV/conf-platform/services/backend/app/services/init_service.py), updated `ensure_plans_and_features` to only wire default features for newly created plans. Features for existing plans are completely skipped (`pass`) to preserve admin edits and toggles across restarts.
- **Add-on Safeguard**: Changed the `else:` branch of the `addons` seeding loop in [init_service.py](file:///d:/DEV/conf-platform/services/backend/app/services/init_service.py) to a `pass` statement, protecting customized specs and pricing rules from resetting to default seed matrices on startup.

### 3. Front-end Client and Type Definitions (Next.js Command Center)
- **TypeScript Types**: Updated the `Addon` interface in [super-admin-service.ts](file:///d:/DEV/conf-platform/apps/cloud/command-center/services/super-admin-service.ts) to define optional `min_price_inr` and `max_price_inr`, and added `price?: number` support to each matrix specification row item inside `features_spec`.

### 4. Split Plan Editor Form Implementation (Next.js Command Center)
To clean up the subscription plan editing experience, the form was separated into three distinct flows in [page.tsx](file:///d:/DEV/conf-platform/apps/cloud/command-center/app/super-admin/commercial/plans/page.tsx):
- **General Settings**:
  - Added a Dialog popup triggered by a new "Edit [PlanName]" button in the selected plan details panel header.
  - Controls Name, Tagline, Description, Theme Color (via a color picker tool), Display Order, and toggles for active and popular states.
- **Limits / Quotas**:
  - Toggled in-place inside the **Limits** tab via the "Edit Limits" button.
  - Displays and modifies numerical limits only (e.g., Max Events, Max Users, Storage, Speakers, Sessions, Rooms, Ticket Categories, Badge & Certificate templates).
- **Pricing Settings**:
  - Toggled in-place inside the **Pricing** tab via a new "Edit Pricing" button.
  - Displays and modifies Billing Model, Currency, and Min/Max Event Prices.
- **Backend Reusability**:
  - All three editing panels reuse the backend PATCH `/platform/plans/{planId}` endpoint to send partial edits (Limits, Pricing, or General Details respectively), using the existing `updateLimitsMutation` hook.

## Verification Results

### TypeScript Verification
- Executed Next.js TypeScript compiler checks:
  ```bash
  npm run type-check
  ```
  Result: **Success**. Clean compilation with 0 errors across the Next.js frontend project.

### Database Column Verification
- Confirmed database tables and fields are properly created and migrated, dropping legacy fields while preserving customizations.
