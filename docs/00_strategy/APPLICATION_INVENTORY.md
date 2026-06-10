# EventX OS Application Inventory

This document provides a comprehensive inventory of all applications, services, and components within the EventX OS repository.

---

## Domain: Cloud Management & Public Access
*These applications are hosted in the cloud and manage the global state of the platform.*

### 1. Command Center (Admin Portal)
- **Purpose**: The central administrative hub for managing the entire EventX ecosystem.
- **Technology Stack**: Next.js 16 (React 19), Tailwind CSS, TanStack Query, Radix UI, Lucide React, Framer Motion, Zustand, Socket.io-client.
- **Main Entry Point**: `apps/cloud/command-center/app/layout.tsx`
- **User Types**: Platform Administrators, Organization Managers, Event Organizers.
- **Primary Responsibilities**: 
    - Event lifecycle management (creation, scheduling, configuration).
    - Multi-tenant Organization and User management.
    - Role-Based Access Control (RBAC) configuration.
    - Global analytics and reporting dashboards.
    - System-wide settings and integrations.
- **Internal Dependencies**: `@conf-platform/types`, `@conf-platform/ui` (shared components).
- **External Dependencies**: Platform API (Backend), Socket.io gateway, S3 storage (via backend).

### 2. Registration Portal
- **Purpose**: Public-facing web application for attendee registration and ticket purchasing.
- **Technology Stack**: Next.js 16, Tailwind CSS, TanStack Query, Axios, Framer Motion.
- **Main Entry Point**: `apps/cloud/registration-portal/app/page.tsx`
- **User Types**: Prospective Attendees, Public Users.
- **Primary Responsibilities**: 
    - Event discovery and agenda viewing.
    - Registration form submission.
    - Ticket selection and booking.
    - Attendee profile management.
- **External Dependencies**: Platform API.

### 3. Speaker Portal
- **Purpose**: Dedicated portal for speakers to manage their participation and content.
- **Technology Stack**: Next.js 16, Tailwind CSS, TanStack Query, Axios, JSZip.
- **Main Entry Point**: `apps/cloud/speaker-portal/app/page.tsx`
- **User Types**: Invited Speakers, Session Presenters.
- **Primary Responsibilities**: 
    - Speaker biography and profile management.
    - Presentation and session material uploads.
    - Personal schedule and session oversight.
- **External Dependencies**: Platform API.

---

## Domain: Core Infrastructure & Backend Services
*The foundational services that power data persistence, logic, and background processing.*

### 4. Platform API (Cloud Backend)
- **Purpose**: The central REST/WebSocket API service for the entire platform.
- **Technology Stack**: FastAPI (Python 3.12+), SQLAlchemy 2.0, PostgreSQL, Redis, Socket.io, Pydantic v2.
- **Main Entry Point**: `services/backend/app/main.py`
- **User Types**: Programmatic access by all frontend applications.
- **Primary Responsibilities**: 
    - Authentication and Session management (JWT).
    - Tenant isolation and RBAC enforcement.
    - Database orchestration and migrations (Alembic).
    - Real-time event broadcasting via WebSockets.
    - API gateway for all cloud-based services.
- **External Dependencies**: PostgreSQL, Redis, AWS S3/MinIO, Resend (Email).

### 5. Task Workers
- **Purpose**: Distributed background processing for resource-intensive or asynchronous tasks.
- **Technology Stack**: Celery, Python, Redis (Broker), Kombu.
- **Main Entry Point**: `services/workers/celery_app.py`
- **Primary Responsibilities**: 
    - **File Tasks**: PDF conversion, thumbnail generation, document validation.
    - **Import Tasks**: Bulk Excel processing for attendees and speakers.
    - **Report Tasks**: Dynamic generation of analytics reports (XLSX, PDF).
    - **Notification Tasks**: Bulk email and SMS delivery.
    - **Video Tasks**: Video transcoding and processing.
- **Internal Dependencies**: Shares models and schemas with the Platform API.

---

## Domain: Venue Operations & Edge Infrastructure
*Applications and services designed for on-site execution and resilience.*

### 6. Venue Server (Edge Node)
- **Purpose**: A local on-site server that provides offline resilience and low-latency services.
- **Technology Stack**: FastAPI, SQLAlchemy, PostgreSQL/SQLite, Redis, MinIO (Local Object Storage).
- **Main Entry Point**: `services/venue-server/app/main.py`
- **User Types**: On-site staff apps, Venue devices.
- **Primary Responsibilities**: 
    - Bidirectional synchronization with Cloud Backend.
    - Local data caching for on-site applications.
    - On-site device management and heartbeat monitoring.
    - Local WebSocket signaling for real-time updates without internet.
- **External Dependencies**: Cloud Backend (for sync), Local MinIO instance.

### 7. Venue Registration
- **Purpose**: Staff-facing application for on-site attendee check-in and badge printing.
- **Technology Stack**: Next.js 16, Radix UI, Tailwind CSS, Socket.io, Zustand.
- **Main Entry Point**: `apps/venue/registration/app/layout.tsx`
- **User Types**: Registration Staff, Receptionists.
- **Primary Responsibilities**: 
    - Real-time attendee check-in (QR/Search).
    - Badge layout design and printing (via local printer drivers).
    - Walk-in registration and on-site payments.
- **External Dependencies**: Venue Server (Local API).

### 8. Technician Dashboard
- **Purpose**: Monitoring and management tool for IT technicians at the venue.
- **Technology Stack**: Vite, React 18, Tailwind CSS, TanStack Query.
- **Main Entry Point**: `apps/venue/technician-dashboard/src/main.tsx`
- **User Types**: IT Technicians, Venue Engineers.
- **Primary Responsibilities**: 
    - Monitoring health of Venue Servers and Edge Nodes.
    - Tracking device connection status (Kiosks, Signage, Printers).
    - Triggering manual syncs and network diagnostics.
- **External Dependencies**: Venue Server.

---

## Domain: Interactive Venue Experiences
*Specialized applications for attendees and session management at the venue.*

### 9. Room Presentation (Autonomous Display Engine)
- **Purpose**: High-fidelity display engine for session room screens and stage monitors.
- **Technology Stack**: Electron, Vite, React, Tailwind CSS.
- **Main Entry Point**: `apps/venue/room-presentation/electron/main.js`
- **User Types**: Session Managers, Presenters.
- **Primary Responsibilities**: 
    - Displaying session status and timers.
    - Rendering speaker profiles and session metadata.
    - Orchestrating multi-screen presentation layouts.
- **External Dependencies**: Venue Server (Snapshot API).

### 10. Kiosk App (Self-Service)
- **Status**: **Partially Implemented (Scaffold)**
- **Purpose**: Self-service kiosk for attendees to check-in, browse the agenda, or lookup info.
- **Technology Stack**: React, Vite (Planned for PWA/Electron).
- **Main Entry Point**: `apps/venue/kiosk-app/src/App.tsx`
- **Responsibilities**: QR-based check-in, agenda navigation, venue wayfinding.

---

## Planned / Placeholder Applications
*The following folders exist in the repository with minimal scaffolding, indicating planned development.*

- **ePoster Display** (`apps/venue/eposter-display`): Interactive stations for browsing digital scientific posters. (Electron Scaffold)
- **Signage App** (`apps/venue/signage-app`): Digital signage for hall entrances and hallway wayfinding. (Electron Scaffold)
- **Moderator App** (`apps/venue/moderator-app`): Tablet-based tool for session chairs to manage Q&A and flow. (Next.js Scaffold)
- **Station App** (`apps/venue/station-app`): General purpose multi-utility app for venue staff stations. (Electron Scaffold)

---

## Shared Packages
*Internal code libraries used across multiple applications.*

- **`packages/types`**: Shared TypeScript interfaces for API responses and data models.
- **`packages/ui`**: Shared UI component library (Buttons, Cards, etc.) ensuring visual consistency.
- **`packages/utils`**: Common utility functions (e.g., `platform-detector`).
