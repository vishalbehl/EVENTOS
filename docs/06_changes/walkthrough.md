# Walkthrough: Domain-Driven Folder Refactoring of Command Center

## Goal
Restructure the flat `components/` directory in `apps/cloud/command-center` into a professional, domain-driven SaaS architecture that cleanly separates **Organizer** (event-specific) components from **Super Admin** (platform control-plane) components.

---

## Why This Was Needed

The original structure had all components at `components/{domain}/` with no higher-level grouping:
```
components/
  auth/          ← Organizer domain
  dashboard/     ← Organizer domain
  emails/        ← Organizer domain
  rbac/          ← Organizer domain
  super-admin/   ← Platform domain (correctly placed)
  ui/            ← Shared design system
  org/           ← Organizer domain
  ...
```

As a SaaS platform with **two distinct user bases** (Super Admin vs Organizer), this flat structure made it impossible to enforce domain boundaries, locate code quickly, or onboard new engineers confidently.

---

## New Architecture

```
components/
  organizer/          ← All event-management features
    auth/
    dashboard/
    emails/
    eposters/
    events/
    files/
    import/
    modals/
    notifications/
    org/
    rbac/
    ready-room/
    registration/
    rooms/
    sessions/
    speaker/
    speakers/
    CreateEventDialog.tsx
    FloatingToolbar.tsx
  super-admin/        ← Platform control-plane (unchanged)
  layout/             ← Shared layout primitives (unchanged)
  ui/                 ← shadcn/ui design system (unchanged)
  providers.tsx       ← App-wide providers (unchanged)
  ThemeSwitcher.tsx   ← Shared utility (unchanged)
```

---

## How It Was Done

### 1. Migration Script (`migrate_components.py`)

A Python migration script was written that performed two operations in a single pass:

**Phase 1 — Import Rewriting** (before any files move):
- Scanned all 212 `.tsx` / `.ts` files in the project
- Updated `@/components/{domain}/` → `@/components/organizer/{domain}/` for all organizer domains
- Recalculated relative import depths (e.g., `../ui/button` → `../../ui/button`) for files that increased nesting by one level

**Phase 2 — Directory Moves**:
- Physically moved 17 directories into `components/organizer/`
- Physically moved 2 root-level files (`CreateEventDialog.tsx`, `FloatingToolbar.tsx`) into `components/organizer/`

> The script was designed so import rewrites happen **before** the moves to avoid broken state at any point.

---

## Files Changed

### Import Updates (35 files)

| File | What Changed |
|------|-------------|
| `app/layout.tsx` | `@/components/modals/*` → `@/components/organizer/modals/*` |
| `app/(dashboard)/users/page.tsx` | `@/components/rbac/*` → `@/components/organizer/rbac/*` |
| `app/(dashboard)/events/page.tsx` | `@/components/events/*` → `@/components/organizer/events/*` |
| `app/(dashboard)/onboarding/page.tsx` | `@/components/org/*` → `@/components/organizer/org/*` |
| `app/(dashboard)/org/settings/page.tsx` | `@/components/org/*` → `@/components/organizer/org/*` |
| `app/(public)/signup/page.tsx` | `@/components/org/*` → `@/components/organizer/org/*` |
| `app/(public)/accept-invite/page.tsx` | `@/components/org/*` → `@/components/organizer/org/*` |
| `app/(dashboard)/events/[eventId]/speaker/**` | All speaker domain imports updated |
| `app/(dashboard)/events/[eventId]/registration/**` | All registration domain imports updated |
| `components/organizer/rbac/*.tsx` | Internal relative imports depth-adjusted (`../ui/` → `../../ui/`) |
| *(+ 25 more pages)* | |

### Directories Moved (17)
`auth`, `dashboard`, `emails`, `eposters`, `events`, `files`, `import`, `modals`, `notifications`, `org`, `rbac`, `ready-room`, `registration`, `rooms`, `sessions`, `speaker`, `speakers`

### Files Moved (2)
`CreateEventDialog.tsx`, `FloatingToolbar.tsx`

---

## Verification

| Check | Result |
|-------|--------|
| Stale `@/components/{old-domain}` imports | ✅ **0 found** |
| Relative import depth correctness | ✅ Verified (`../../ui/` = `components/ui/`) |
| `npx tsc --noEmit` | ✅ **0 errors, 0 warnings** |

---

## What Stays the Same
- `components/super-admin/` — unchanged, already correctly scoped
- `components/ui/` — shared design system, unchanged
- `components/layout/` — shared layout components, unchanged
- `components/providers.tsx` — unchanged
- All app route files (`app/**`) — only import paths updated, no logic changes
- `tsconfig.json` — the `@/*` alias still works as before

---

## Outcome

The command center now has a clean, professional SaaS architecture:
- **Super Admins** work exclusively in `components/super-admin/` and `app/super-admin/`
- **Organizers** work exclusively in `components/organizer/` and `app/(dashboard)/`
- **Shared infrastructure** stays at `components/ui/`, `components/layout/`

New engineers can orient themselves in seconds, domain boundaries are enforced by the directory tree, and the codebase is ready to scale.
