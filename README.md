# EventOS — Monorepo Control Panel & Run Guide

Welcome to the **EventOS** enterprise monorepo! Following our system-wide structural re-architecture and domain-driven migration, all portals, offline venue components, background tasks, and shared logic are organized into specialized subdirectories.

---

## 1. Directory Structure Overview

```
conf-platform/
├── apps/                        # Frontend & Client Applications
│   ├── cloud/                   # Cloud-Hosted Portals (Next.js / React)
│   │   ├── command-center       # Ecosystem command center / brain (Port 3000)
│   │   ├── organiser-portal     # Event Organizer console & Studio (Port 3001)
│   │   └── event-portal         # Unified Participant, Registration & Speaker Portal (Port 3003)
│   └── venue/                   # Offline Venue Client Apps
│       ├── kiosk-app            # Check-in self-service (Electron/Next)
│       └── station-app          # SRR Scanning interface
├── services/                    # Backend Services & Run Engines
│   ├── backend/                 # Core Cloud FastAPI backend (Port 8000)
│   ├── venue-server/            # Local Offline Synced API server (Port 8001)
│   └── workers/                 # Celery Async Processing Engine (FFmpeg, PDF)
├── packages/                    # Shared Node/TS workspaces
├── storage/                     # Shared files storage (Assets, PDFs, etc.)
├── tools/                       # Organized helper & audit scripts
└── infrastructure/              # Kubernetes, Docker, and Nginx configs

---

## 💡 System Documentation & Architecture

For a comprehensive understanding of the EventOS ecosystem, please refer to the following guides:

* **[MASTER ARCHITECTURE](MASTER_ARCHITECTURE.md)** — **Start here.** High-level system overview, C4 diagrams, and core design principles.
* **[Application Inventory](APPLICATION_INVENTORY.md)** — Exhaustive list of all portals, services, and shared packages.
* **[Repository Structure](REPO_STRUCTURE.md)** — Monorepo folder responsibilities and architectural patterns.
* **[Database Architecture](DATABASE_ARCHITECTURE.md)** — Schema deep-dive, ER diagrams, and multi-tenancy model.
* **[API Inventory](API_INVENTORY.md)** — Complete list of endpoints, auth methods, and data models.
* **[Auth Architecture](AUTH_ARCHITECTURE.md)** — Security implementation, roles, and tenant isolation.
* **[File Processing Pipeline](FILE_PIPELINE.md)** — Technical lifecycle of uploaded materials from ingest to venue sync.
* **[User Journeys](USER_JOURNEYS.md)** — Sequence diagrams for major business and operational processes.
* **[Venue Architecture](VENUE_ARCHITECTURE.md)** — On-site edge-sync logic and offline resilience strategies.
* **[User Roles](USER_ROLES.md)** — System and participant roles with associated permission matrices.
* **[Trust Boundaries](TRUST_BOUNDARIES.md)** — Formal security architecture, trust zones, and communication channel mapping.
* **[External Integrations](EXTERNAL_INTEGRATIONS.md)** — Third-party services, payment gateways, and cloud storage providers.
* **[Architecture Gaps Analysis](ARCHITECTURE_GAPS.md)** — Identification of missing technical info, technical risks, and partially implemented features.

---


## 2. Prerequisites

Ensure you have the following installed on your machine:
* **Node.js**: v18+ (uses npm workspaces)
* **Python**: v3.13+ (virtual environment at `services/backend/.venv`)
* **PostgreSQL**: Running instance (Cloud DB: Port `5432`, Venue DB: Port `5433`)
* **Redis**: For Celery queues and WebSockets (Port `6379`)
* **MinIO / R2**: Object storage (Port `9000`)

---

## 3. Quick Start (One-Click Launch)

On Windows systems, you can spin up the complete cloud platform (API, Celery worker, and all three next-gen portals) simultaneously using the provided PowerShell launcher script:

```powershell
./devrun.ps1
```

This script will automatically terminate any hanging node/python processes and launch the services in separate, labeled terminals.

---

## 4. Manual Run Guide

If you prefer starting services individually or are running on a non-Windows OS, follow the steps below:

### Step 1: Package Installation & Linking
From the root directory, install all Node.js workspace dependencies:
```bash
npm install
```

### Step 2: Start Cloud Backend (Port 8000)
Navigate to the backend directory, activate the Python virtual environment, and run the Uvicorn dev server:
```bash
cd services/backend
.venv\Scripts\activate      # On Windows
source .venv/bin/activate    # On Unix/macOS

python -m uvicorn app.main:app --reload --port 8000
```

### Step 3: Start Celery Worker
Background tasks require the Celery worker to process heavy workloads (PDF parsing, slide validation, slide conversions).
```bash
cd services/backend
.venv\Scripts\activate

python -m celery -A app.worker worker --loglevel=info -P solo
```

### Step 4: Start Venue Offline Server (Port 8001)
For local venue synchronizations and hardware integrations:
```bash
cd services/venue-server
..\backend\.venv\Scripts\activate

python -m uvicorn app.main:app --reload --port 8001
```

### Step 5: Start Frontend Portals
Start the web portals from the root workspace folder:

* **Command Center**:
  ```bash
  npm run dev:command-center
  ```
* **Speaker Portal**:
  ```bash
  npm run dev:speaker
  ```
* **Registration Portal**:
  ```bash
  npm run dev:registration
  ```

---

## 5. Verification & Testing

Verify system stability by running the automated unit test suites:

### Backend Test Suite
```bash
cd services/backend
.venv\Scripts\activate
python -m pytest
```

### Venue Server Test Suite
```bash
cd services/venue-server
..\backend\.venv\Scripts\activate
python -m pytest
```

### Workers Service Test Suite
```bash
cd services/workers
..\backend\.venv\Scripts\activate
# Set PYTHONPATH to load sibling dependencies
$env:PYTHONPATH="..;../backend"   # Windows PowerShell
export PYTHONPATH="..:../backend" # Unix/macOS
python -m pytest
```

---

*For detailed system workflows or deployment instructions, check out files under the [docs/](file:///d:/DEV/conf-platform/docs/) directory.*
