# EventOS — Monorepo Control Panel & Run Guide

Welcome to the **EventOS** enterprise monorepo! Following our system-wide structural re-architecture and domain-driven migration, all portals, offline venue components, background tasks, and shared logic are organized into specialized subdirectories.

---

## 1. Directory Structure Overview

```
conf-platform/
├── apps/                        # Frontend & Client Applications
│   ├── cloud/                   # Cloud-Hosted Portals (Next.js / React)
│   │   ├── command-center       # Ecosystem command center / brain (Port 3000)
│   │   ├── registration-portal  # Attendee ticketing & badges (Port 3003)
│   │   └── speaker-portal       # Slide uploads & speaker profile (Port 3002)
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
```

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
