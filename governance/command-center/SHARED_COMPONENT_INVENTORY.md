# Shared Component Inventory

## Existing design anchors

| Area | Current components | Treatment |
|---|---|---|
| Shell | `Sidebar`, `Header`, `PageWrapper`, `PageHeader` | Standardize responsiveness, focus order, breadcrumbs and operational states |
| Premium catalogue | `PremiumTemplateCard`, `TemplateCard`, `TemplateDetailSheet` | Preserve as the visual anchor for commercial catalogues |
| Admin data | `DataTable`, `KpiCard`, `ChartCard`, `MetricRow`, `StatusBadge` | Add density, pagination, sorting, empty/error/loading and accessibility contracts |
| Overlays | dialog, sheet, dropdown, tooltip | Verify focus trap, escape, labelling, scroll lock and nested overlay behavior |
| Forms | input, label, select, textarea, switch | Add shared field errors, help text, pending state and server problem mapping |

## Required shared foundations

- Semantic design tokens for surfaces, text, borders, actions, statuses, charts, elevation and motion.
- `AsyncState`, `EmptyState`, `PermissionDenied`, `RecoverableError` and `NotFound` presentation primitives.
- `ConfirmDestructiveAction` with typed reason capture when required.
- URL-synchronized `DataTable` contract with cursor pagination.
- `AuditTimeline`, `EntityActivity`, `JobStatus`, `ProviderDegradation` and `UnsavedChangesGuard`.
- Accessible command search, notifications panel, impersonation banner and responsive navigation.

## Implemented Phase 1 foundations

- `AsyncState`, `RecoverableError`, `PermissionDenied` and `RetryState` provide consistent operational states.
- `OperationalStatusRail` provides the shared visual language for health, billing, jobs, incidents and venue readiness.
- `ConfirmDestructiveAction` supports explicit resource naming, pending behavior and audited reason capture.
- `useUnsavedChanges` protects browser unload and supplies guarded navigation callbacks for forms.
- `Breadcrumbs`, `SkipNavigation`, responsive sidebar state and the main landmark establish the accessible shell contract.
- `DataTable` supports named tables, keyboard-operable rows and accessible pagination controls.

One-off page primitives require an explicit reason in the feature matrix and must not duplicate an approved shared component.
