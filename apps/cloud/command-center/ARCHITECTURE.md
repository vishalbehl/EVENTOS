# Command Center Frontend Architecture

## App Router

`app/` is a route manifest, not a feature implementation directory. Public URL segments remain inside console-specific route groups under `(command-center)`:

- `(home-console)` — dashboard, organizations, and reports
- `(business-console)` — CRM, sales, pricing, plans, add-ons, and entitlements
- `(revenue-console)` — revenue and finance
- `(operations-console)` — operations center
- `(security-console)` — identity and security
- `(developer-console)` — developer platform and applications
- `(support-console)` — support center
- `(global-tools)` — Settings and the design-system catalogue

Route groups never participate in public URLs. Existing deep links must remain stable.

## Feature modules

Route implementations live under `features/<domain>`. A route file should normally contain only an absolute re-export:

```tsx
export { default } from "@/features/organizations/screens/OrganizationListScreen";
```

Feature-owned API functions, components, schemas, hooks, types, and utilities stay in the same domain. Shared UI primitives remain in `components/ui`; reusable composed tables, cards, and feedback belong in the appropriate shared component package.

## Boundaries

- Domain features must not import from `app/`.
- Shared UI must not import domain features.
- Cross-feature imports should use a feature's public export when one exists.
- Server Components are the default; add `"use client"` only at the interactive boundary.
- Settings is global and is not a separate console.
- `/super-admin/*` contains redirect compatibility routes only.

Run `npm.cmd run architecture:check` after adding or moving routes.
