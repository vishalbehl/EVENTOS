# Detailed Walkthrough - Fully Editable Plans and Add-on Management

This document details the modifications made to the EventOS SaaS control plane to allow fully editable subscription plans and comprehensive CRUD/mapping management for Optional Add-ons.

## Changes Made

### 1. Backend API (Platform Admin CRM Router)
- **File modified**: [router.py](file:///d:/DEV/conf-platform/services/backend/app/modules/platform/router.py)
- **Details**:
  - Expanded `PlanPatchRequest` schema to support `tagline`, `color_hex`, `billing_model`, `currency`, `display_order`, and `is_popular` properties.
  - Implemented `AddonPostRequest` and `AddonPatchRequest` schemas.
  - Created `POST /platform/addons` route supporting add-on creation and mapping associated feature IDs in the database `AddonFeature` table.
  - Created `PATCH /platform/addons/{addon_id}` route supporting add-on updates, including updating/flushing linked feature IDs.
  - Updated `list_platform_addons` (`GET /platform/addons`) to fetch all add-ons and resolve their associated `feature_ids` list.

### 2. Frontend API Service Hooks
- **File modified**: [super-admin-service.ts](file:///d:/DEV/conf-platform/apps/cloud/command-center/services/super-admin-service.ts)
- **Details**:
  - Expanded the `Addon` interface with an optional `feature_ids` array.
  - Added Axios client calls for `createAddon` and `patchAddon`.
  - Added mutation hooks `useCreateAddon` and `useUpdateAddon` with query invalidation setup.

### 3. Frontend Super Admin Plans Page
- **File modified**: [page.tsx](file:///d:/DEV/conf-platform/apps/cloud/command-center/app/super-admin/commercial/plans/page.tsx)
- **Details**:
  - **Plan Metadata Customization**:
    - Modified `startEditingLimits` to clone the plan's `name`, `tagline`, `description`, `color_hex`, `billing_model`, `currency`, `display_order`, and `is_popular` fields.
    - Updated the editing panel to render text fields for Name and Tagline, a description textarea, a billing model select dropdown, and a switch for highlighting the plan as popular.
    - Implemented a native Color Picker (`<input type="color">`) side-by-side with a HEX text input and an active color preview block.
  - **Optional Add-on Management**:
    - Altered the Optional Add-ons section to always render, providing an elegant dashed empty state with an "Add Add-on" action button if no add-ons exist.
    - Added an "Edit" pen action button on each add-on card.
    - Created the `ManageAddonDialog` modal component. This form supports:
      - Add-on Name, Key, Description, Price, and Billing Unit.
      - Plan availability checkboxes (Basic, Professional, Enterprise).
      - Dropdown overrides for optional or included status per plan.
      - A comprehensive checklist of all platform features fetched from `useFeaturesCatalog`, grouped by their functional categories, to map features to the add-on.

---

## Verification Results

### TypeScript Type-Checking Compilation
- Ran the TypeScript compiler checks in the command-center workspace:
  ```bash
  npm run type-check
  ```
- **Result**: `command completed successfully` with no errors.
