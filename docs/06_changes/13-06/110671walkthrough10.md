# Walkthrough — Super Admin Commercial Plans Customization

We have successfully customized the Super Admin commercial plans page and startup seeding database logic to show only default plans, support full feature matrix customization via an interactive popup modal, immediately propagate those feature overrides, and display the platform application registry.

## Changes Made

### 1. Backend Startup Seeding & Obsolete Plans Cleanup
- Modified `ensure_plans_and_features()` in [init_service.py](file:///d:/DEV/conf-platform/services/backend/app/services/init_service.py):
  - Ensured default plans ("Basic", "Professional", "Enterprise") are created/seeded properly.
  - Queries all obsolete plans (any plan whose name is not in the default three).
  - Automatically migrates any existing `OrganizationSubscription` referring to obsolete plans to refer to the "Basic" plan's ID.
  - Deletes all obsolete plan records from the database table `billing.subscription_plans` (cascading cleanly to delete associated `plan_features` rows).

### 2. Super Admin Plans Frontend UI Customizations
- Modified [page.tsx](file:///d:/DEV/conf-platform/apps/cloud/command-center/app/super-admin/commercial/plans/page.tsx):
  - **Plans Filtering**: Filtered plans from `useSubscriptionPlans()` using `useMemo` so only plans with names in `["Basic", "Professional", "Enterprise"]` are displayed and counted in metrics.
  - **Creation Restriction**: Removed the "Create Plan" action button in the page header and the "Duplicate" button inside the limits editor, ensuring admins only manage the three default tiers.
  - **Features Customization Popup Modal**:
    - Added a "Configure Features" button to the actions grid on each plan card.
    - Used Radix UI `<Dialog>` to render a modern scrollable overlay popup.
    - Implemented a features table inside the modal that groups features by category (e.g. core, limits, integrations) retrieved from `useFeatureMatrix()`.
    - Added `Switch` toggles matching the theme allowing the admin to enable/disable features for that specific plan.
    - Wired saving to the React Query mutation `useUpdatePlanFeaturesBulk()`, which persists overrides to the backend immediately and refreshes the matrix.
  - **Platform Applications Registry**:
    - Retrieved the platform applications registry from the backend via the `usePlatformApplications()` hook.
    - Rendered the applications list as an "Apps & Integrations Registry" section at the bottom of the page in a clean card layout with versioning and status badges.

---

## Verification Results

### TypeScript Type-Checking
- Ran NextJS type checking to verify full compile-time safety:
  ```bash
  npx tsc --noEmit
  ```
  - Result: Completed successfully with **0 compilation errors/warnings**.

### Backend Test Executions
- Ran backend pytest suite for billing, settings, and feature gating:
  ```bash
  .venv\Scripts\python -m pytest tests/test_rate_limiting_and_gating.py tests/test_feature_overrides.py tests/test_settings.py
  ```
  - Result: **25 passed, 13 warnings** in 79.31s.

---

## Visual Summary & Carousel

````carousel
```typescript
// Dialog Popup Code in page.tsx
<Dialog open={!!featurePlanId} onOpenChange={(open) => { if (!open) setFeaturePlanId(null); }}>
  <DialogContent className="max-w-3xl bg-surface border border-border text-[var(--text-primary)] shadow-2xl p-6 rounded-2xl">
    ...
  </DialogContent>
</Dialog>
```
<!-- slide -->
```typescript
// Platform Applications Grid in page.tsx
function ApplicationsRegistryGrid({ applications }: { applications: PlatformApplication[] }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-6 shadow-sm mt-8 space-y-4">
      ...
    </div>
  );
}
```
````
