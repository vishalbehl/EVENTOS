# Enterprise Full-Stack Engineering Course: From Database to Cloud & Edge Architecture

Welcome to the **Enterprise Full-Stack Engineering Textbook & Course**, modeled after the production architecture of **EventOS (`conf-platform`)**.

This textbook is designed to take an engineering student from core computer science and web foundations to senior-level systems architecture. Each module is written as an in-depth chapter with theoretical explanations, production code patterns, diagrams, debugging strategies, and hands-on exercises.

---

## 📚 Master Table of Contents

### [Module 0: Computer Science & Systems Foundations](./module-0-foundations/)
- **[Topic 0.1: Networking, HTTP/2, WebSockets, CORS & Security Headers](./module-0-foundations/topic-0.1-networking-and-web-protocols.md)**
- **[Topic 0.2: OS Concurrency, Processes, Threads, GIL & Async I/O](./module-0-foundations/topic-0.2-os-concurrency-and-async-io.md)**

### [Module 1: Monorepo Architecture & Modern Language Runtimes](./module-1-monorepo-and-runtimes/)
- **[Topic 1.1: Advanced TypeScript 5+ Masterclass](./module-1-monorepo-and-runtimes/topic-1.1-advanced-typescript.md)**
- **[Topic 1.2: Modern Asynchronous Python 3.13+ Engineering](./module-1-monorepo-and-runtimes/topic-1.2-asynchronous-python.md)**
- **[Topic 1.3: Monorepo Engineering & npm Workspaces](./module-1-monorepo-and-runtimes/topic-1.3-monorepo-engineering.md)**

### [Module 2: Relational Database Engineering, Multi-Tenancy & Cryptography](./module-2-database-and-security/)
- **[Topic 2.1: PostgreSQL 16 Data Modeling, Indexing & JSONB Optimization](./module-2-database-and-security/topic-2.1-postgresql-and-indexing.md)**
- **[Topic 2.2: Async SQLAlchemy 2.0 ORM & Alembic Database Migrations](./module-2-database-and-security/topic-2.2-sqlalchemy-and-alembic.md)**
- **[Topic 2.3: Multi-Tenancy Architecture & PostgreSQL Row-Level Security (RLS)](./module-2-database-and-security/topic-2.3-multi-tenancy-and-rls.md)**
- **[Topic 2.4: Cryptography, Fernet Encryption at Rest & Secret Security](./module-2-database-and-security/topic-2.4-cryptography-and-data-security.md)**

### [Module 3: Modular Backend Architecture & Production FastAPI Engineering](./module-3-backend-fastapi/)
- **[Topic 3.1: FastAPI Core, Pydantic v2 & Dependency Injection Graph](./module-3-backend-fastapi/topic-3.1-fastapi-and-pydantic-v2.md)**
- **[Topic 3.2: Domain-Driven Modular System Design](./module-3-backend-fastapi/topic-3.2-domain-driven-design.md)**
- **[Topic 3.3: 11-Stage Production Middleware Pipeline](./module-3-backend-fastapi/topic-3.3-middleware-pipeline.md)**
- **[Topic 3.4: Authentication, JWT Token Management & RBAC Security](./module-3-backend-fastapi/topic-3.4-authentication-jwt-rbac.md)**

### [Module 4: Asynchronous Task Processing, Distributed Queues & Media Pipelines](./module-4-async-media-websockets/)
- **[Topic 4.1: Distributed Task Queues with Celery 5.4 & Redis 7](./module-4-async-media-websockets/topic-4.1-celery-and-redis.md)**
- **[Topic 4.2: FFmpeg Video Transcoding & Document Parsing Pipelines](./module-4-async-media-websockets/topic-4.2-document-and-ffmpeg-pipelines.md)**
- **[Topic 4.3: Real-Time Socket.IO Gateways & Native WebSockets](./module-4-async-media-websockets/topic-4.3-websockets-and-socketio.md)**

### [Module 5: Enterprise Frontend Engineering (Next.js 14 App Router)](./module-5-frontend-nextjs/)
- **[Topic 5.1: Next.js 14 App Router, Server Components & Layout Composition](./module-5-frontend-nextjs/topic-5.1-nextjs-app-router.md)**
- **[Topic 5.2: Zustand State Stores, TanStack Query & Typed Axios Interceptors](./module-5-frontend-nextjs/topic-5.2-state-zustand-tanstack-query.md)**
- **[Topic 5.3: Tailwind CSS, Radix UI & Micro-Animation Component Design](./module-5-frontend-nextjs/topic-5.3-tailwind-radix-design-system.md)**

### [Module 6: Offline-First Edge Applications & Electron Desktop Systems](./module-6-offline-edge-electron/)
- **[Topic 6.1: Desktop Engineering with Electron & Vite + React](./module-6-offline-edge-electron/topic-6.1-electron-and-vite.md)**
- **[Topic 6.2: Offline Edge Server & Bi-Directional Delta Sync Engine](./module-6-offline-edge-electron/topic-6.2-venue-server-and-delta-sync.md)**

### [Module 7: Cloud Infrastructure, IaC, Containerization & CI/CD Pipelines](./module-7-infrastructure-devops/)
- **[Topic 7.1: Multi-Stage Production Dockerfiles & Docker Compose Orchestration](./module-7-infrastructure-devops/topic-7.1-docker-containerization.md)**
- **[Topic 7.2: Infrastructure as Code (IaC) with Terraform & AWS Modules](./module-7-infrastructure-devops/topic-7.2-terraform-aws-modules.md)**
- **[Topic 7.3: NGINX Reverse Proxy & Automated GitHub Actions CI/CD](./module-7-infrastructure-devops/topic-7.3-nginx-and-github-actions.md)**

### [Module 8: Production Hardening, Observability, Load Testing & Resilience](./module-8-observability-resilience/)
- **[Topic 8.1: Full-Stack Observability, Structured Logging & Sentry Monitoring](./module-8-observability-resilience/topic-8.1-logging-monitoring-sentry.md)**
- **[Topic 8.2: Load Testing with k6/Locust & Disaster Recovery Planning](./module-8-observability-resilience/topic-8.2-load-testing-disaster-recovery.md)**

### [Capstone Project: Full-Stack Enterprise System Release](./capstone-project/)
- **[Capstone Specification & Deployment Guide](./capstone-project/capstone-specification-and-deployment.md)**

---

## 🛠 Required Tech Stack Matrix

| Technology | Role in EventOS | Target Mastery |
| :--- | :--- | :--- |
| **TypeScript 5+** | Full-stack typing across portals and shared packages | Advanced |
| **Python 3.13+** | Async backend API, Celery workers, venue server | Advanced |
| **PostgreSQL 16+** | Primary multi-tenant database with Row-Level Security (RLS) | High Security / Production |
| **FastAPI & Pydantic v2** | Async REST API & validation engine | Production Grade |
| **SQLAlchemy 2.0 & Alembic** | Async ORM and automated DB migrations | Production Grade |
| **Celery 5.4 & Redis 7** | Background job queue & result caching | Distributed Systems |
| **Next.js 14 App Router** | Multi-tenant cloud web portals | Production Grade |
| **Electron & Vite** | On-site desktop edge apps (Kiosks, E-Posters, Signs) | Production Grade |
| **Docker & Terraform** | Containerization & AWS Cloud Infrastructure (ECS/RDS/S3) | DevOps / Cloud Architect |
| **GitHub Actions & NGINX** | CI/CD deployment pipelines & reverse proxy routing | Production Operations |
