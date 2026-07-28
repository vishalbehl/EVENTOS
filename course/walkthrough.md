# Technical Audit Report & Engineering Course Roadmap: EventOS (conf-platform)

This document provides a comprehensive technical audit of the **EventOS (`conf-platform`)** codebase, followed by a complete step-by-step engineering curriculum and skill roadmap designed to teach an engineering student how to build this enterprise production-ready system from scratch—from database design to multi-cloud deployment.

---

## 1. Executive Summary & Architecture Overview

**EventOS** is an enterprise multi-tenant SaaS platform engineered for large-scale conference and event management. It features a **hybrid cloud + offline-capable edge architecture**, allowing mission-critical venue operations (check-in kiosks, badge printing, room presentation displays) to operate continuously even during internet outages, while maintaining real-time bi-directional synchronization with cloud portals.

### System Architecture Diagram

```
                                 ┌─────────────────────────────────────────┐
                                 │            Cloud Architecture           │
                                 └─────────────────────────────────────────┘
                                                      │
         ┌──────────────────────────────┬─────────────┴────────────────┬──────────────────────────────┐
         ▼                              ▼                              ▼                              ▼
┌──────────────────┐           ┌──────────────────┐           ┌──────────────────┐           ┌──────────────────┐
│  Command Center  │           │ Organiser Portal │           │  Speaker Portal  │           │   Registration   │
│  (Next.js 14)    │           │   (Next.js 14)   │           │   (Next.js 14)   │           │   (Next.js 14)   │
└────────┬─────────┘           └────────┬─────────┘           └────────┬─────────┘           └────────┬─────────┘
         │                              │                              │                              │
         └──────────────────────────────┴─────────────┬────────────────┴──────────────────────────────┘
                                                      │ HTTPS / REST / Socket.IO
                                                      ▼
                                       ┌─────────────────────────────┐
                                       │    FastAPI Cloud Backend    │
                                       │ (40+ Modules, RLS, Auth)    │
                                       └──────────────┬──────────────┘
                                                      │
                       ┌──────────────────────────────┼──────────────────────────────┐
                       ▼                              ▼                              ▼
        ┌────────────────────────────┐  ┌────────────────────────────┐  ┌────────────────────────────┐
        │  PostgreSQL 16 (Cloud DB)  │  │  Redis 7 (Broker & Cache)  │  │  MinIO / AWS S3 Storage    │
        │   Multi-Tenant RLS Schemas │  │  WebSockets & Rate Limits  │  │  Slides, Videos, Badges    │
        └────────────────────────────┘  └─────────────┬──────────────┘  └────────────────────────────┘
                                                      │ Async Jobs
                                                      ▼
                                       ┌─────────────────────────────┐
                                       │   Celery Worker Cluster     │
                                       │ (FFmpeg, PDF/PPT Parsing)   │
                                       └─────────────────────────────┘

                                                      ▲ Bi-Directional Offline Sync Engine
                                                      │ (HTTP/WebSocket Delta Batching)
                                 ┌────────────────────┴────────────────────┐
                                 │          Venue Edge Architecture        │
                                 └─────────────────────────────────────────┘
                                                      │
                                       ┌──────────────┴──────────────┐
                                       │   FastAPI Venue Server      │
                                       │  (Local DB port 8001/5433)  │
                                       └──────────────┬──────────────┘
                                                      │ Local Network LAN
         ┌──────────────────────────────┬─────────────┴────────────────┬──────────────────────────────┐
         ▼                              ▼                              ▼                              ▼
┌──────────────────┐           ┌──────────────────┐           ┌──────────────────┐           ┌──────────────────┐
│ Kiosk App / PWA  │           │ E-Poster Display │           │ Room Presentation│           │ Tech Dashboard   │
│ (Self Check-in)  │           │    (Electron)    │           │    (Electron)    │           │   (Vite + React) │
└──────────────────┘           └──────────────────┘           └──────────────────┘           └──────────────────┘
```

---

## 2. Deep Technical Stack Breakdown

Below is the exact inventory of technologies, frameworks, libraries, database systems, protocols, and DevOps tools used in this codebase:

| Architecture Layer | Key Technologies & Libraries Used | Codebase Location |
| :--- | :--- | :--- |
| **Monorepo Architecture** | npm workspaces, Turborepo / Cross-workspace scripts | [package.json](file:///d:/DEV/conf-platform/package.json) |
| **Cloud Frontend Web Apps** | Next.js 14+ (App Router), React 18, TypeScript 5+, Tailwind CSS, Radix UI Primitives, `class-variance-authority`, `clsx`, `tailwind-merge`, Lucide Icons | [apps/cloud/command-center](file:///d:/DEV/conf-platform/apps/cloud/command-center) |
| **State Management & Data Fetching** | Zustand (with hydration storage wrappers), TanStack Query (React Query v5), Axios (with singleton request/response interceptors) | [apps/cloud/command-center/lib/api-client.ts](file:///d:/DEV/conf-platform/apps/cloud/command-center/lib/api-client.ts) |
| **Offline & Venue Apps** | Electron, Vite + React, Progressive Web Apps (PWA), Web APIs | [apps/venue](file:///d:/DEV/conf-platform/apps/venue) |
| **Cloud Backend API** | Python 3.13+, FastAPI, Pydantic v2 (Validation & Settings), Uvicorn (ASGI server) | [services/backend](file:///d:/DEV/conf-platform/services/backend) |
| **Database & ORM** | PostgreSQL 16+, SQLAlchemy 2.0 (Async ORM), `asyncpg` (Async Driver), Alembic (Database Migrations), Row-Level Security (RLS) | [services/backend/app/core/database.py](file:///d:/DEV/conf-platform/services/backend/app/core/database.py) |
| **Authentication & Security** | PyJWT / `python-jose`, Cryptography (Fernet symmetric key encryption at rest), Passlib / Bcrypt, Custom Tenant Context & Plan Guard Middlewares | [services/backend/app/middleware](file:///d:/DEV/conf-platform/services/backend/app/middleware) |
| **Background Task Processing** | Celery 5.4, Redis 5.2 (Message Broker & Result Backend), Kombu AMQP, `python-pptx`, `pypdf`, `pdfplumber`, `pillow`, `qrcode`, OpenPyXL, mutagen | [services/workers](file:///d:/DEV/conf-platform/services/workers) |
| **Media Processing** | FFmpeg (Video transcoding, HLS stream generation, thumbnail extraction) | [services/workers](file:///d:/DEV/conf-platform/services/workers) |
| **Real-Time Communication** | Socket.IO (`python-socketio`, `socket.io-client`), Native WebSockets (`websockets`, `simple-websocket`) | [services/backend/app/modules/notifications](file:///d:/DEV/conf-platform/services/backend/app/modules/notifications) |
| **Object Storage & Cloud Storage** | MinIO (S3-Compatible local storage), AWS S3 SDK (`boto3`, `botocore`) | [services/backend/requirements.txt](file:///d:/DEV/conf-platform/services/backend/requirements.txt#L15) |
| **Infrastructure & IaC** | Terraform (AWS ECS Fargate, RDS PostgreSQL, ElastiCache Redis, S3, IAM), Docker, Multi-stage Dockerfiles, Docker Compose | [infrastructure](file:///d:/DEV/conf-platform/infrastructure) |
| **Reverse Proxy & Routing** | NGINX (SSL Termination, CORS headers, Request routing, Proxying) | [infrastructure/nginx](file:///d:/DEV/conf-platform/infrastructure/nginx) |
| **CI/CD Automation** | GitHub Actions workflows (`aws-sample-deploy.yml`, `vercel-portals-deploy.yml`, `terraform-quality.yml`) | [.github/workflows](file:///d:/DEV/conf-platform/.github/workflows) |

---

## 3. Detailed Technical Review of Codebase Components

### 3.1 Backend Service Architecture (`services/backend`)
- **Domain-Driven Modular Organization**: Organized into 40+ domain modules inside `app/modules/` (`auth`, `events`, `speakers`, `registration`, `billing`, `analytics`, `venue`, `notifications`, `rbac`, `crm`, `sponsors`, `superadmin`, `website_builder`, etc.).
- **Strict Middleware Stack**: Every request flows through an orchestrated pipeline:
  1. Request Logging -> 2. Security Headers -> 3. Audit Logging -> 4. Plan Guard -> 5. RBAC Enforcement -> 6. Application Guard -> 7. Tenant Context Injection -> 8. Rate Limiter (SlowAPI) -> 9. IP Allowlist -> 10. Authentication (JWT) -> 11. CORS.
- **Tenant Isolation**: Uses PostgreSQL Row-Level Security (RLS) and schema-level isolation to ensure data safety across multiple enterprise event clients.
- **Data Encryption**: Sensitive fields (e.g., payment gateway credentials, webhook secrets) are encrypted before writing to DB using symmetric Fernet encryption keys (`PAYMENT_SECRET_KEY` / `FERNET_KEY`).

### 3.2 Offline Venue Server (`services/venue-server`)
- Runs a standalone FastAPI instance locally on port `8001` backed by a local PostgreSQL/SQLite database (port `5433`).
- Handles high-throughput local QR code badge scans, attendee check-ins, and session access control even when offline.
- Features a delta synchronization worker that queues local transactions and uploads them to the cloud backend when connectivity restores, while pulling updated schedules and attendee lists.

### 3.3 Asynchronous Workers (`services/workers`)
- Powered by **Celery** with **Redis** as broker.
- Processes heavy computational tasks off the main API event loop:
  - **Slide Deck Processing**: Validates `.pptx` and `.pdf` files, extracts slide text, counts slides, detects custom fonts and embedded video links.
  - **Media Processing**: Uses `FFmpeg` to transcode uploaded presentation recordings into optimized MP4 formats or HLS streaming chunks.
  - **Document & Badge Generation**: Uses `qrcode`, `python-docx`, `pypdf`, and `openpyxl` to dynamically compose badges, certificate PDFs, and attendee exports.

### 3.4 Multi-Portal Cloud Frontend (`apps/cloud/*`)
- **4 Dedicated Cloud Portals**:
  1. **Command Center** (`port 3000`): Admin & operational dashboard.
  2. **Organiser Portal** (`port 3001`): Event layout, schedule builder, ticket tier management.
  3. **Speaker Portal** (`port 3002`): Slide upload, bio management, session confirmation.
  4. **Registration Portal** (`port 3003`): Public attendee registration, ticket purchase, badge preview.
- Built using **Next.js 14+ (App Router)** with typed API services (`lib/api-client.ts`), TanStack Query hooks, Zustand state stores with SSR rehydration protection, and modern Tailwind CSS + Radix UI styling.

### 3.5 On-Site Venue Applications (`apps/venue/*`)
- **8 Purpose-Built Edge Apps**:
  - `kiosk-app`: Electron / PWA self-service check-in kiosk.
  - `registration`: Desk-based check-in application (`port 3005`).
  - `eposter-display`: High-resolution Electron app for interactive scientific poster presentation screens.
  - `room-presentation`: Presenter laptop screen & slide controller (Electron).
  - `signage-app`: Live room schedule digital signage screen.
  - `station-app`: Session attendance scanner app.
  - `moderator-app`: Live Q&A and polling moderator dashboard.
  - `technician-dashboard`: Vite + React dashboard for monitoring room hardware & stream status.

### 3.6 Cloud Infrastructure & DevOps (`infrastructure/`)
- **Infrastructure as Code (IaC)**: Structured Terraform modules in `infrastructure/terraform` for provisioning AWS infrastructure:
  - ECS Fargate tasks for backend API & Celery workers.
  - AWS RDS PostgreSQL for primary database.
  - ElastiCache Redis for caching and Celery broker.
  - AWS S3 buckets with CloudFront CDN for static assets and media downloads.
- **Continuous Delivery**: GitHub Actions workflows deploy Next.js frontend portals directly to **Vercel** and containerized services to **AWS ECS**.

---

## 4. Engineering Curriculum & Required Skills Blueprint

To teach an engineering student how to build this system from scratch, the curriculum is divided into **6 Sequential Modules**, moving from foundational concepts to advanced production deployment.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        ENGINEERING STUDENT LEARNING PATHWAY                            │
├────────────────────────────────────────────────────────────────────────────────────────┤
│  MODULE 1: Fundamentals, Monorepo Setup & Core Languages (TypeScript + Python 3.13)    │
│                                           │                                            │
│                                           ▼                                            │
│  MODULE 2: Relational Databases, Multi-Tenancy & Data Security (PostgreSQL + Async ORM)│
│                                           │                                            │
│                                           ▼                                            │
│  MODULE 3: Scalable Backend Development & API Architecture (FastAPI + Middleware)     │
│                                           │                                            │
│                                           ▼                                            │
│  MODULE 4: Asynchronous Processing, Media Pipelines & WebSockets (Celery + FFmpeg)     │
│                                           │                                            │
│                                           ▼                                            │
│  MODULE 5: Multi-App Cloud Portals, Edge & Offline Apps (Next.js + Electron + PWA)     │
│                                           │                                            │
│                                           ▼                                            │
│  MODULE 6: DevOps, Cloud Infrastructure & Production Deployment (Terraform + AWS)      │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### Module 1: System Foundations, Core Languages & Monorepo Architecture

#### Technical Concepts to Learn:
1. **TypeScript 5+ Advanced Techniques**:
   - Generics, Union/Intersection types, Utility types (`Pick`, `Omit`, `Partial`, `Record`).
   - Strict type-checking, declaration merging, interface vs type definitions.
2. **Modern Asynchronous Python 3.13+**:
   - `async`/`await` primitives, event loops (`asyncio`), type hints (`typing`, `Annotated`).
   - Virtual environments, `pyproject.toml`, package management (`uv` / `pip`).
3. **Monorepo Architecture & Package Management**:
   - `npm` Workspaces & package linking.
   - Shared workspaces for UI components, TypeScript type definitions (`packages/types`), and helper utilities (`packages/utils`).
   - Monorepo scripts and workspace dependency graphs.

#### Student Milestone Project:
Set up a working npm workspaces monorepo containing a shared TypeScript library (`@project/types`) consumed by both a React frontend workspace and a Python backend project.

---

### Module 2: Relational Database Engineering, Multi-Tenancy & Data Security

#### Technical Concepts to Learn:
1. **Relational Database Design (PostgreSQL 16+)**:
   - Normalization (1NF to 3NF), foreign keys, composite indexes, JSONB columns for flexible metadata storage.
2. **Asynchronous ORM & Schema Migrations**:
   - SQLAlchemy 2.0 Async ORM (`AsyncSession`, `select`, `joinedload`, `relationship`).
   - Async database drivers (`asyncpg`).
   - Database migration management using **Alembic** (`alembic revision --autogenerate`, `alembic upgrade head`).
3. **Enterprise Multi-Tenancy & Row-Level Security (RLS)**:
   - Tenant isolation strategies (Database-per-tenant vs Schema-per-tenant vs Shared-database with Tenant ID).
   - Implementing PostgreSQL Row-Level Security (RLS) policies (`CREATE POLICY`).
4. **Data Security & Encryption at Rest**:
   - Cryptographic primitives, symmetric key encryption using **Fernet** (`cryptography` library) for encrypting credentials.
   - Password hashing algorithms (Bcrypt, Argon2) using `passlib`.

#### Student Milestone Project:
Design a multi-tenant PostgreSQL schema for events with tables for `tenants`, `events`, `users`, `tickets`, and `speakers`. Apply RLS policies ensuring tenant `A` cannot query tenant `B`'s records, and implement Alembic migrations.

---

### Module 3: Scalable Backend Development & API Architecture

#### Technical Concepts to Learn:
1. **FastAPI & Pydantic v2**:
   - Request/response schemas (`BaseModel`, `Field`, validator methods).
   - Dependency Injection system (`Depends`) for authentication, database sessions, and permission checks.
   - API Router composition (`APIRouter`).
2. **Modular Architecture & Layered Design**:
   - Domain-Driven Design (DDD): Separating concerns into `routes.py`, `schemas.py`, `models.py`, `services.py`, and `dependencies.py`.
3. **Enterprise Middleware Architecture**:
   - Custom ASGI middleware development in FastAPI.
   - Tenant Context extraction (subdomain/header-based).
   - Role-Based Access Control (RBAC) & permission guards.
   - Rate limiting using **SlowAPI** / Redis token buckets.
   - Security headers, CORS configuration, and IP allowlist enforcement.
4. **Authentication & Authorization**:
   - OAuth2 Bearer token flow, JWT access tokens (short-lived 8h) & refresh tokens (long-lived 30 days).
   - Super-admin impersonation context switching.

#### Student Milestone Project:
Build a modular FastAPI backend with domain routers (`auth`, `events`, `speakers`), a complete 7-layer middleware pipeline, JWT auth, and Pydantic validation.

---

### Module 4: Asynchronous Processing, Media Pipelines & Real-time WebSockets

#### Technical Concepts to Learn:
1. **Distributed Task Queues & Caching**:
   - **Celery** architecture: Workers, task routing, canvas primitives (`chain`, `group`).
   - **Redis**: In-memory caching, key expiration, message broker, and pub/sub engine.
2. **Document & Media File Processing Pipelines**:
   - Video processing: **FFmpeg** command-line bindings for HLS video encoding, compression, and thumbnail generation.
   - Document processing: `python-pptx` (parsing presentation slides), `pypdf` / `pdfplumber` (PDF text extraction), `openpyxl` (Excel processing).
   - Dynamic barcode & QR code rendering (`qrcode` library) for event check-in badges.
3. **Real-Time Communication Protocols**:
   - **Socket.IO** server architecture (`python-socketio`) for room-based events (`file.uploaded`, `file.approved`).
   - Native **WebSockets** (`websockets`) for streaming live metric dashboards.

#### Student Milestone Project:
Create an asynchronous file processing worker system where uploading a PDF/PPTX triggers a Celery task that parses the slide deck, generates slide previews, extracts metadata, and notifies the frontend in real time via Socket.IO.

---

### Module 5: Modern Production Frontend & Edge Engineering

#### Technical Concepts to Learn:
1. **Next.js 14+ (App Router) Architecture**:
   - Server Components vs Client Components (`"use client"`).
   - Routing conventions: Route groups `(auth)`, dynamic segments `[id]`, layout files (`layout.tsx`).
   - Optimization: Image optimization, font loading, SEO meta tags.
2. **State Management & Data Architecture**:
   - **Zustand**: Atomic stores, persist middleware, hydration handling to prevent SSR hydration mismatches.
   - **TanStack Query (React Query)**: Query caching, invalidation, optimistic updates, loading states.
   - **Axios HTTP Client**: Interceptor pipelines for automatic JWT injection and unified `ApiError` normalization.
3. **UI / UX Component Engineering**:
   - Modern design systems using **Tailwind CSS**, **Radix UI**, and **shadcn/ui** patterns.
   - Micro-animations, responsive layout design, dark/light themes.
4. **Desktop & Offline Edge App Development**:
   - **Electron**: Main process vs Renderer process, IPC communication, packaging desktop applications.
   - **Vite + React**: Lightning-fast build tools for local venue dashboards.
   - **Progressive Web Apps (PWA)**: Service workers, Cache API, offline fallback strategies.
   - **Bi-Directional Offline Sync Engine**: Queueing transactions locally during internet outages and syncing with cloud APIs upon reconnection.

#### Student Milestone Project:
Build an offline-capable Next.js cloud portal and an Electron desktop app that can record attendee check-ins offline, store them in IndexedDB/SQLite, and automatically sync them to the backend API when connected.

---

### Module 6: DevOps, Cloud Infrastructure & Production Deployment

#### Technical Concepts to Learn:
1. **Containerization & Orchestration**:
   - Writing multi-stage production `Dockerfile`s for Python and Node.js.
   - Multi-container local orchestration using `docker-compose.yml`.
2. **Infrastructure as Code (IaC) with Terraform**:
   - Terraform modules, variables, state management (`.tfstate`).
   - Provisioning AWS Cloud Infrastructure:
     - **AWS ECS Fargate**: Serverless container orchestration for backend and Celery workers.
     - **AWS RDS (PostgreSQL)**: Managed relational database with multi-AZ failover.
     - **AWS ElastiCache (Redis)**: Managed Redis cluster.
     - **AWS S3 & CloudFront**: Media storage and global CDN distribution.
3. **Reverse Proxies & Traffic Management**:
   - **NGINX**: Virtual hosts, SSL/TLS certificate termination (Let's Encrypt / certbot), rate limiting, path rewrites.
4. **CI/CD Pipelines & Cloud Hosting**:
   - **GitHub Actions**: Automated linting, type-checking, pytest execution, building Docker images, and deploying to AWS ECS / Vercel.

#### Student Milestone Project:
Write Terraform code to launch an AWS ECS cluster, RDS instance, and S3 bucket, configure an NGINX reverse proxy, and write a GitHub Actions workflow that automatically deploys the entire monorepo on `git push main`.

---

## 5. Course Completion Checklist for Engineering Students

To be deemed **Industry Ready** to build a platform like EventOS, a student must master the following toolchain:

| Domain | Required Tools & Frameworks | Mastery Level Required |
| :--- | :--- | :--- |
| **Languages** | TypeScript 5+, Python 3.13+, HTML5/CSS3 | Advanced |
| **Frontend** | Next.js 14 (App Router), React 18, Tailwind CSS, Zustand, TanStack Query, Radix UI | Production Grade |
| **Edge & Desktop** | Electron, Vite, PWA / Service Workers | Intermediate |
| **Backend** | FastAPI, Pydantic v2, Uvicorn, Celery | Production Grade |
| **Database** | PostgreSQL 16, SQLAlchemy 2.0 (Async), Alembic, Redis 7 | Advanced |
| **Security** | PyJWT, Cryptography (Fernet), Passlib, PostgreSQL RLS | High Security Standard |
| **Media & Processing**| FFmpeg, `python-pptx`, `pypdf`, `qrcode`, `openpyxl` | Intermediate |
| **Real-Time** | Socket.IO, WebSockets | Intermediate |
| **DevOps & Cloud** | Docker, NGINX, Terraform, AWS (ECS, RDS, S3, ElastiCache), Vercel, GitHub Actions | Production Deployment Ready |

---

## Summary of Completed Deliverables
- **Implementation Plan Artifact**: Created at [implementation_plan.md](file:///C:/Users/visha/.gemini/antigravity-ide/brain/0deb319c-c0b5-4d0c-bb5f-114cf3709902/implementation_plan.md)
- **Detailed Walkthrough Artifact**: Created at [walkthrough.md](file:///C:/Users/visha/.gemini/antigravity-ide/brain/0deb319c-c0b5-4d0c-bb5f-114cf3709902/walkthrough.md)
