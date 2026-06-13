# Walkthrough - Custom Pricing Rules & DB Seeding Safeguards for Add-ons and Plans

This walkthrough details the changes made to enhance the Add-on Configuration Matrix, remove legacy Stripe/monthly/yearly price columns, safeguard backend startup database seeding, and build the premium interface for matrix custom prices.

## Changes Made

### 1. Database Model and Schema Alignment (FastAPI Backend)
- **SQLAlchemy Models**: Removed `monthly_price`, `yearly_price`, and `stripe_product_id` columns from the `Addon` model definition in [subscription.py](file:///d:/DEV/conf-platform/services/backend/app/modules/billing/models/subscription.py).
- **Migration & Schema Enforcement**: Updated `ensure_addon_columns` inside [router.py](file:///d:/DEV/conf-platform/services/backend/app/modules/platform/router.py) to automatically:
  - Add `min_price_inr` and `max_price_inr` numeric columns if they do not exist.
  - Drop the obsolete `monthly_price`, `yearly_price`, and `stripe_product_id` columns with CASCADE to prevent any schema mismatches.
- **REST Endpoints & Validation**:
  - Expanded `AddonPostRequest` and `AddonPatchRequest` Pydantic models in [router.py](file:///d:/DEV/conf-platform/services/backend/app/modules/platform/router.py) to accept `min_price_inr` and `max_price_inr` fields.
  - Serialized the new `min_price_inr` and `max_price_inr` fields into the output of the list endpoint (`/addons`).

### 2. Startup Seeding Protection (Backend Services)
- **Plan Feature Safeguard**: In [init_service.py](file:///d:/DEV/conf-platform/services/backend/app/services/init_service.py), updated `ensure_plans_and_features` to only wire default features for newly created plans. Features for existing plans are completely skipped (`pass`) to preserve admin edits and toggles across restarts.
- **Add-on Safeguard**: Changed the `else:` branch of the `addons` seeding loop in [init_service.py](file:///d:/DEV/conf-platform/services/backend/app/services/init_service.py) to a `pass` statement, protecting customized specs and pricing rules from resetting to default seed matrices on startup.

### 3. Front-end Client and Type Definitions (Next.js Command Center)
- **TypeScript Types**: Updated the `Addon` interface in [super-admin-service.ts](file:///d:/DEV/conf-platform/apps/cloud/command-center/services/super-admin-service.ts) to define optional `min_price_inr` and `max_price_inr`, and added `price?: number` support to each matrix specification row item inside `features_spec`.

### 4. Front-end UI Layout and Editor Redesign (Next.js Command Center)
- **Removed Feature Selector Registry**: Completely removed the right-hand column feature selector grid from `ManageAddonDialog` in [page.tsx](file:///d:/DEV/conf-platform/apps/cloud/command-center/app/super-admin/commercial/plans/page.tsx).
- **Redesigned Basic Info Layout**: Refactored the form inside the dialog into a balanced 2-column panel (Left: general details; Right: price inputs, available plans, overrides, active switch).
- **Min/Max Pricing Range Inputs**: Added numeric inputs for Minimum Price and Maximum Price, wiring them to new state variables, and ensuring proper initialization when editing an addon so they do not reset to `0`.
- **Matrix Pricing Editor**: Added a "Price (INR)" number input column in the configuration matrix grid editor, allowing custom price tags on individual options/rows.
- **Add-on Card Displays**:
  - Rendered price ranges (e.g. `Range: ₹min - ₹max`) if configured.
  - Rendered individual custom row prices next to feature values in the matrix details (e.g., `(+₹price)`).

## Verification Results

### Automated Verification
- Verified that the `billing.addons` table has correct columns and successfully dropped legacy fields by executing a verification script against the database:
  - Columns present: `min_price_inr` (numeric), `max_price_inr` (numeric), `features_spec` (jsonb).
  - Legacy fields (`monthly_price`, `yearly_price`, `stripe_product_id`) were dropped correctly.
- Executed Next.js TypeScript compiler checks:
  ```bash
  npm run type-check
  ```
  Result: Clean compilation with 0 errors.
