# Command Center Design System Contract

## Direction

The Command Center uses a conference mission-control language: graphite operational surfaces, crisp state colors, restrained motion, Space Grotesk headings, IBM Plex Sans administration text, and IBM Plex Mono identifiers and telemetry.

The repeated signature is the operational status rail. Billing, jobs, incidents, venue readiness, deployments, providers, and security events use the same state vocabulary and visual hierarchy.

## Required page composition

```text
Skip navigation
Application shell
  Sidebar / mobile navigation
  Header: breadcrumbs, controls and session
  Main landmark
    Page header
    Filters or contextual controls
    Primary content
    Async, empty, denied or degraded state
```

## Interaction requirements

- Every interactive control is keyboard reachable and visibly focused.
- Navigation exposes the current route and remains usable at 320 CSS pixels.
- Motion follows reduced-motion preferences.
- Icon-only controls have accessible names.
- Dialogs and sheets identify their title, trap focus, close predictably, and restore focus.
- Errors explain the failed operation and available recovery action.
- Permission denial never reveals protected resource existence.
- `Ctrl+K` opens command search and every shell menu uses focus-managed primitives.
- Route changes are announced and move focus to the main content region.
- Information density is a presentation preference and never changes authorization or data semantics.

## Token contract

- Surfaces, text, borders, controls, status, charts, elevation, radius, spacing, and motion use semantic CSS variables from `app/globals.css`.
- `plasma-violet` and `light` explicitly set browser color schemes and retain equivalent semantic hierarchy.
- Shared components cannot introduce hard-coded status colors; domain illustrations require a documented exception.
- Compact density changes control and table geometry through root tokens rather than page-specific classes.
- Reduced-motion and forced-color preferences are honored globally.

## Published catalogue and enforcement

- `/design-system` is the live operator-component catalogue.
- `test/design-system-contract.test.ts` enforces required tokens and theme capabilities.
- `test/design-system-adoption.test.ts` requires every dashboard route to use an approved page-composition primitive or explicit proxy.
- `e2e/design-system.spec.ts` verifies command search, theme, density, axe, and 320px mobile navigation.
- Authentication and public proposal review remain intentional standalone journeys with their own accessibility checks.

## Shared state language

| State | User-facing behavior |
|---|---|
| Loading | Preserve layout with meaningful skeleton structure |
| Empty | Explain why the view is empty and provide the permitted next action |
| Recoverable error | Identify the operation and offer retry or navigation |
| Permission denied | Explain required access without exposing protected data |
| Provider degraded | Preserve safe local work and show delayed/reconciliation state |
| Destructive confirmation | Name the affected resource and capture a reason when policy requires it |

One-off alternatives require an entry in the feature matrix and design review.
