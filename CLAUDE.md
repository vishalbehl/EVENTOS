# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

EventOS — a multi-tenant SaaS for conference/event management. An npm-workspaces monorepo containing Next.js cloud portals, offline-capable venue apps, and a Python/FastAPI backend with async workers.

## Repository layout

```
conf-platform/
├── apps/
│   ├── cloud/                   # Next.js portals (cloud-hosted, multi-tenant)
│   │   ├── command-center       # Admin/ops "brain" — port 3000
│   │   ├── organiser-portal     # Event organiser tools — port 3001
│   │   ├── speaker-portal       # Speaker profile & slide uploads — port 3002
│   │   └── registration-portal  # Attendee ticketing & badges — port 3003
│   └── venue/                   # On-site apps, designed for offline operation
│       ├── registration         # Venue check-in/registration — port 3005
│       ├── kiosk-app            # Self-service check-in (PWA/Electron)
│       ├── eposter-display      # E-poster display (Electron)
│       ├── room-presentation    # Room display (Electron)
│       ├── station-app          # SRR scanning interface
│       ├── signage-app          # Digital signage (Electron)
│       ├── moderator-app        # Moderator tools
│       └── technician-dashboard # Vite + React tech dashboard
├── packages/                    # Shared npm workspaces (types, ui, utils)
├── services/
│   ├── backend/                 # Core FastAPI backend — port 8000
│   ├── venue-server/            # Local offline sync API — port 8001
│   └── workers/                 # Celery async processing (FFmpeg, PDF, slides)
├── infrastructure/              # Docker/K8s configs
├── storage/                     # Shared file storage
└── tools/                       # Audit/helper scripts
```

Each app under `apps/cloud/*` and `apps/venue/*` is an npm workspace; `packages/*` are shared workspaces consumed by them.

## Commands

### Initial setup
```bash
npm install                       # from repo root, installs all workspaces
```
Backend requires a Python 3.13+ virtualenv at `services/backend/.venv` (also used by `venue-server` and `workers`).

### Running services (manual)
```bash
# Backend API (port 8000)
cd services/backend && .venv\Scripts\activate && python -m uvicorn app.main:app --reload --port 8000

# Celery worker (background jobs: PDF parsing, slide validation, video conversion)
cd services/backend && .venv\Scripts\activate && python -m celery -A app.worker worker --loglevel=info -P solo

# Venue offline sync server (port 8001)
cd services/venue-server && ..\backend\.venv\Scripts\activate && python -m uvicorn app.main:app --reload --port 8001

# Frontend portals (from repo root)
npm run dev:command-center        # port 3000
npm run dev:organiser-portal      # port 3001
npm run dev:speaker               # port 3002
npm run dev:registration          # port 3003
npm run dev:venue-registration    # port 3005
```
On Windows, `./devrun.ps1` launches the API, Celery worker, and all cloud portals at once in separate terminals (kills any hanging node/python processes first).

### Lint / type-check (per cloud app, e.g. command-center)
```bash
cd apps/cloud/command-center
npm run lint                      # next lint
npm run type-check                # tsc --noEmit
npm run build                     # next build (also surfaces type errors)
```
`speaker-portal` and `registration-portal` do not define `lint`/`type-check` scripts — rely on `npm run build` for those.

`technician-dashboard` (Vite, not Next.js) has its own commands:
```bash
cd apps/venue/technician-dashboard
npm run dev
npm run build                     # tsc && vite build
npm run lint                      # eslint . --ext ts,tsx
```

### Backend tests
```bash
cd services/backend && .venv\Scripts\activate && python -m pytest
cd services/venue-server && ..\backend\.venv\Scripts\activate && python -m pytest

# workers needs PYTHONPATH to find sibling backend code
cd services/workers && ..\backend\.venv\Scripts\activate
$env:PYTHONPATH="..;../backend"   # PowerShell
python -m pytest
```
There is no top-level/root test runner — run pytest per service. No frontend test suite currently exists in any cloud/venue app's package.json.

### Required local infra
PostgreSQL (cloud DB on 5432, venue DB on 5433), Redis on 6379 (Celery broker + WebSocket), MinIO/R2-compatible object storage on 9000.

## Architecture

### Backend (`services/backend`)
FastAPI app organized **by domain module** under `app/modules/` (40+ domains: `auth`, `events`, `speakers`, `registration`, `billing`, `analytics`, `venue`, `notifications`, `rbac`, `crm`, `sponsors`, `superadmin`, `website_builder`, etc.). Each module typically has its own `routes.py`, `schemas.py` (Pydantic v2), `models.py` (SQLAlchemy, async via asyncpg), `services.py`, and `dependencies.py`. Routers are aggregated in `app/routers/`.

Middleware stack (`app/middleware/`), applied in order: request logging → security → audit → plan guard → RBAC → application guard → tenant context → rate limiting (x2) → IP allowlist → auth → CORS (allows ports 3000-3003).

This means almost every request passes through tenant isolation and RBAC checks before reaching a route — when adding endpoints, follow the existing module pattern rather than bypassing the router aggregation.

Auth is JWT (HS256). Access tokens last 8h, refresh tokens 30 days. Payment gateway credentials and similarly sensitive config are encrypted at rest with Fernet (`PAYMENT_SECRET_KEY`/`FERNET_KEY`).

File uploads (slides, posters, videos) are validated then handed to Celery (`services/workers`) for heavy processing — FFmpeg conversion, PDF parsing, slide validation — with results pushed back via Socket.IO.

### Venue offline mode
`services/venue-server` (port 8001) is a separate FastAPI instance with its own DB (5433), allowing venue apps (kiosk, station-app, etc.) to keep working without connectivity, then resync with the cloud backend.

### Frontend cloud portals (Next.js App Router)
Representative example: `apps/cloud/command-center`.
- Routing: `app/(auth)/` for unauthenticated routes, `app/(dashboard)/` for protected routes, `app/super-admin/` for admin-only routes. Group folders `(name)` and dynamic segments `[id]` follow standard Next.js App Router conventions.
- API calls go through a singleton Axios wrapper (`lib/api-client.ts`) — request interceptor injects the Bearer token from localStorage, response interceptor normalizes errors to a typed `ApiError`. Use the `apiGet/apiPost/apiPatch/apiPut/apiDelete` helpers rather than calling axios directly.
- Domain logic lives in `services/*.ts` (functional service objects, e.g. `authService`, `eventService`) which call the API client and update Zustand stores. `hooks/*.ts` wrap these with TanStack Query for caching/refetching — prefer the existing hooks over re-fetching ad hoc.
- Global state is Zustand (`store/`), with `use-auth-store.ts` persisted to localStorage (`obsidian-auth-storage`). Auth store also handles super-admin impersonation of orgs/users. Because of SSR, stores call `setHasHydrated()` after rehydration — don't read persisted state before checking hydration or you'll get SSR/client mismatches.
- Real-time: Socket.IO client connects on app load (`useNotificationStore.connect()`), joins per-event rooms, and handles `notification`/`file.uploaded`/`file.approved`/`file.rejected` events. A native WebSocket at `/ws/dashboard/{event_id}` is used separately for live dashboard metrics.
- UI: Tailwind CSS + Radix UI primitives composed in a shadcn/ui-style pattern, `class-variance-authority`/`clsx`/`tailwind-merge` for variant styling.

Other cloud portals (`organiser-portal`, `speaker-portal`, `registration-portal`) and venue apps follow the same general stack (Next.js/React, Zustand, Axios, Tailwind) but are separate workspaces with their own scope — don't assume code is shared unless it lives in `packages/`.

### Environment variables
Backend env at `services/backend/.env` (DB URL, JWT secrets, encryption keys, SMTP/Resend email config, storage mode). Frontend env at `apps/cloud/command-center/.env.local`:
```
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
NEXT_PUBLIC_WS_URL=http://127.0.0.1:8000
```
Backend API is mounted under `/api/v1`; Socket.IO under `/socket.io`.
