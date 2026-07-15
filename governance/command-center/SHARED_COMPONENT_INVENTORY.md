# Shared Component Inventory

## Existing design anchors

| Area | Current components | Treatment |
|---|---|---|
| Shell | `Sidebar`, `Header`, `PageWrapper`, `PageHeader`, `CommandPalette`, `NotificationCenter`, `RouteAnnouncer` | Approved responsive and focus-managed shell |
| Premium catalogue | `PremiumTemplateCard`, `TemplateCard`, `TemplateDetailSheet` | Preserve as the visual anchor for commercial catalogues |
| Admin data | `DataTable`, `KpiCard`, `ChartCard`, `MetricRow`, `StatusBadge`, `KpiGrid` | Approved density, responsive, semantic-chart and accessible-table contracts |
| Overlays | dialog, sheet, dropdown, tooltip, `ConfirmDestructiveAction` | Approved focus trap, escape, labelling, scroll lock and restore behavior |
| Forms | input, label, select, textarea, switch, `FormField`, `ServerErrorSummary` | Approved labels, help, validation, pending state and RFC 9457 error evidence |
| Evidence | `AuditPanel`, `OperationalTimeline`, `OperationalStatusRail` | Approved attribution, lifecycle and non-color status language |

## Required shared foundations

- Semantic design tokens for surfaces, text, borders, actions, statuses, charts, elevation and motion.
- `AsyncState`, `EmptyState`, `PermissionDenied`, `RecoverableError` and `NotFound` presentation primitives.
- `ConfirmDestructiveAction` with typed reason capture when required.
- URL-synchronized `DataTable` contract with cursor pagination.
- `AuditTimeline`, `EntityActivity`, `JobStatus`, `ProviderDegradation` and `UnsavedChangesGuard`.
- Accessible command search, notifications panel, impersonation banner and responsive navigation.

## Implemented Phase 1 foundations

- Semantic surface, text, border, status, chart, elevation, radius, spacing, motion, control-height and table-density tokens support explicit light and dark schemes.
- `CommandPalette`, `NotificationCenter`, account/theme/density menus and `RouteAnnouncer` complete the keyboard-operated shell.
- Mobile navigation uses a focus-trapped left sheet and remains usable at 320 CSS pixels.
- `FormField` and `ServerErrorSummary` connect labels, descriptions, validation, request evidence and announcements.
- `AuditPanel`, `OperationalTimeline`, `ActionToolbar` and `KpiGrid` standardize operational composition.
- `AsyncState`, `RecoverableError`, `PermissionDenied` and `RetryState` provide consistent operational states.
- `OperationalStatusRail` provides the shared visual language for health, billing, jobs, incidents and venue readiness.
- `ConfirmDestructiveAction` supports explicit resource naming, pending behavior and audited reason capture.
- `useUnsavedChanges` protects browser unload and supplies guarded navigation callbacks for forms.
- `Breadcrumbs`, `SkipNavigation`, responsive sidebar state and the main landmark establish the accessible shell contract.
- `DataTable` supports named tables, keyboard-operable rows and accessible pagination controls.
- `/design-system` publishes the live catalogue; static adoption tests prohibit new unapproved route roots.

One-off page primitives require an explicit reason in the feature matrix and must not duplicate an approved shared component.
