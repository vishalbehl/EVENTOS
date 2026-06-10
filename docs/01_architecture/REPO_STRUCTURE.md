# EventX OS Repository Structure

This document provides a detailed breakdown of the EventX OS monorepo structure, explaining the purpose of each directory and the overall architectural patterns employed.

---

## 1. Repository Tree View

```text
EventX-OS/
├── apps/                        # Frontend & Client Applications
│   ├── cloud/                   # Web-hosted portals (Next.js)
│   │   ├── command-center       # Global Admin/Organizer hub
│   │   ├── registration-portal  # Attendee registration flow
│   │   └── speaker-portal       # Speaker management interface
│   └── venue/                   # On-site local applications
│       ├── registration         # Staff check-in & badge printing
│       ├── room-presentation    # Session display engine (Electron)
│       └── technician-dashboard # On-site infrastructure monitor
├── services/                    # Backend & Core Logic
│   ├── backend/                 # Primary FastAPI Cloud API
│   ├── venue-server/            # Local Edge API for offline sync
│   └── workers/                 # Celery task processing engine
├── packages/                    # Shared Node.js Workspaces
│   ├── types/                   # Cross-app TypeScript definitions
│   ├── ui/                      # Shared React component library
│   └── utils/                   # General helper utilities
├── infrastructure/              # Deployment & DevOps
│   ├── docker/                  # Dockerfiles for all services
│   ├── nginx/                   # Reverse proxy configurations
│   └── venue/                   # On-site hardware & DB setup scripts
├── tools/                       # Maintenance & Audit Utility Scripts
│   ├── debugging/               # Log analysis & data verification
│   ├── migration/               # DB schema evolution scripts
│   └── maintenance/             # Admin & DB cleanup tools
├── docs/                        # Project Documentation & Runbooks
├── scripts/                     # CI/CD & Build orchestration scripts
├── public/                      # Static assets (Logos, Icons)
├── excel_templates/             # Templates for bulk data imports
└── devrun.ps1                   # Unified local development launcher
```

---

## 2. Major Folder Responsibilities

### `apps/` (Frontend Applications)
- **`cloud/`**: Contains Next.js applications intended for public internet deployment. They leverage React 19 and the latest Next.js App Router features.
- **`venue/`**: Contains applications designed for local local area network (LAN) use at event sites. Many are wrapped in **Electron** to interface with hardware (printers, multi-screen displays).

### `services/` (Backend Services)
- **`backend/`**: The "source of truth" API. Handles multi-tenancy, global RBAC, and data orchestration.
- **`venue-server/`**: A specialized "Edge" service. It mirrors a subset of the cloud database locally to ensure the event can continue if the internet fails.
- **`workers/`**: A dedicated Celery-based service for CPU-bound tasks like generating large PDF reports or processing video uploads.

### `packages/` (Shared Logic)
- Implements a monorepo pattern using **npm workspaces**. This ensures that if a data model changes in `packages/types`, all frontend apps are immediately notified of type errors, preventing runtime failures.

### `infrastructure/` (System Orchestration)
- Centralizes the "How it runs" logic. Includes production `docker-compose` files and Nginx configurations that route traffic to the various apps and services.

### `tools/` (Developer Utilities)
- Contains "surgical" scripts for tasks that aren't part of the main application flow, such as manually promoting a user to admin, auditing RBAC permissions, or cleaning up orphaned database records.

---

## 3. Architectural Strengths

1.  **Monorepo Consistency**: Using shared packages (`types`, `ui`) ensures visual and logical consistency across 10+ different applications.
2.  **Edge Resilience**: The `venue-server` + `cloud-sync` architecture is a major strength, allowing "Offline-First" event execution without sacrificing cloud management.
3.  **Domain Isolation**: Clear separation between `cloud` and `venue` domains prevents cloud-specific logic from bloating local site tools.
4.  **Task Offloading**: Moving heavy processing to `workers/` ensures the main APIs remain responsive under high load (e.g., during peak registration).

---

## 4. Potential Risks & Considerations

1.  **Dependency Complexity**: With dozens of `package.json` and `requirements.txt` files, keeping dependencies in sync across the monorepo requires rigorous maintenance.
2.  **Sync Complexity**: The bidirectional sync between `backend` and `venue-server` is a "high-entropy" area where data conflicts could occur if not strictly managed.
3.  **Hardware Coupling**: The `venue/` apps rely on Electron for hardware access. Testing these requires physical or simulated hardware (printers/scanners), which can slow down CI/CD.
4.  **Large Repo Size**: As a monorepo, the `node_modules` and `.venv` folders can become very large. Proper use of `.gitignore` and efficient build caching is critical.

---

## 5. Configuration & Environments
- **Global Config**: `docker-compose.yml` and `package.json` at the root.
- **Service Config**: Each subdirectory in `apps/` and `services/` maintains its own `.env.example` to define required environment variables.
