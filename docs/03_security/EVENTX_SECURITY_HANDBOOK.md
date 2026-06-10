# EventX OS: Security Handbook
**Role:** Principal Platform Security Engineer  
**Version:** 1.0.0-Enterprise  
**Status:** Confidential / Internal Only  

## 1. Executive Summary
EventX OS is a mission-critical conference platform designed for high-concurrency venue operations and multi-tenant cloud management. This handbook codifies our "Security-by-Design" philosophy, merging existing robust implementations with an enterprise-grade roadmap.

We adhere to the **Principle of Least Privilege (PoLP)** and **Zero-Trust for Venue Infrastructure**.

---

## 2. Current Security Architecture (The Foundation)

### 2.1 Multi-Tenant Isolation (Tenant Context)
*   **Implementation:** `TenantContextMiddleware` + SQLAlchemy `with_loader_criteria`.
*   **Mechanism:** Every request captures the `organization_id` from the JWT or `X-Organization-ID` header and binds it to a thread-safe `ContextVar`. 
*   **SQL Enforcement:** Database queries automatically append `WHERE organization_id = :current_org_id` via the shared `Base` model metadata.

### 2.2 Identity & Authentication
*   **Cloud Users (Admins/Organizers):** JWT Bearer tokens (RS256/HS256) with short-lived access and sliding-window refresh tokens.
*   **Speaker Portal:** Hashed upload tokens (SHA-256). Speakers do not have accounts; they possess cryptographic links bound to specific event scopes.
*   **Venue Devices:** `X-Device-Key` header. Static keys are hashed (`device_key_hash`) using `PBKDF2` or `SHA-256` before database comparison.

### 2.3 RBAC (Role-Based Access Control)
*   **Dynamic Permissions:** Granular codes (e.g., `PARTICIPANTS:IMPORT`) are mapped to routes in `RBACMiddleware`.
*   **Hierarchical Assignments:** `UserAccessNode` allows assigning users to specific sub-entities (Events, Rooms, or even specific SRR Stations).

### 2.4 Audit & Security Observability
*   **Audit Trail:** Immutable `AuditLog` table capturing `old_values`, `new_values`, and `correlation_id` for distributed tracing.
*   **Security Events:** `SecurityEvent` table specifically for Auth anomalies, brute-force detection, and risk scoring.

---

## 3. Enterprise Upgrades Roadmap

### 3.1 Defense in Depth (API Shielding)
*   **Requirement:** Basic JWT checks are insufficient for public-facing enterprise APIs. We need multi-layer shielding.
*   **Integration:** 
    1.  Implement `RateLimitMiddleware` using a Sliding Window algorithm (Redis-backed).
    2.  Inject mandatory `Content-Security-Policy` and `Strict-Transport-Security` headers in `AuthMiddleware`.
*   **Migration Complexity:** Low (Pure middleware addition).
*   **Status:** **SAFE TO IMPLEMENT NOW**

### 3.2 Permission Engine Normalization
*   **Requirement:** Currently, permissions are split between `dependencies.py` (roles) and `RBACMiddleware` (codes). This creates "shadow permissions."
*   **Integration:** Standardize on a single `require_permission(code)` dependency that checks the `RolePermission` and `ScopedPermission` models. Deprecate `require_roles`.
*   **Migration Complexity:** Medium (Requires surgical updates to ~50-100 route signatures).
*   **Status:** **SAFE TO IMPLEMENT NOW**

### 3.3 Shared Security SDK (`packages/security-sdk`)
*   **Requirement:** Prevent logic drift between Cloud Backend, Venue Server, and Workers.
*   **Integration:** Move JWT validation, Hashing helpers, and Middleware classes into a shared workspace package.
*   **Migration Complexity:** Medium (Refactoring workspace imports).
*   **Status:** **FUTURE ENTERPRISE FEATURE**

### 3.4 Robust Device Authentication (Machine Identity)
*   **Requirement:** Static `X-Device-Key` is a "forever secret" that is hard to rotate at scale across 100+ room PCs.
*   **Integration:** Transition to **Temporary Device Sessions**. Devices "enroll" once, receive a unique certificate, and perform a challenge-response handshake to get a short-lived session token.
*   **Migration Complexity:** High (Requires updating Electron venue apps and Backend enrollment endpoints).
*   **Status:** **FUTURE ENTERPRISE FEATURE**

### 3.5 File Security (Zero-Trust Storage)
*   **Requirement:** PPTX/PDF files are high-value targets. They must never be accessible via public S3 URLs.
*   **Integration:** 
    1.  Force `STORAGE_MODE=s3` with `private` ACLs.
    2.  All downloads/previews generated via **Presigned URLs** with 60-second TTL.
    3.  Async Malware scanning via `ClamAV` in the Worker pipeline.
*   **Migration Complexity:** Low (Configuration and helper utility update).
*   **Status:** **SAFE TO IMPLEMENT NOW**

### 3.6 App Marketplace Capability Model
*   **Requirement:** Enterprise customers want to build plugins. We cannot give 3rd party apps full user permissions.
*   **Integration:** Implement OAuth2 Scopes. An API key for "Reporting Plugin" only gets `ANALYTICS:READ`, even if the user who installed it is a Super Admin.
*   **Migration Complexity:** High (Full OAuth2 server implementation).
*   **Status:** **FUTURE ENTERPRISE FEATURE**

### 3.7 Enhanced Audit Logging (Tamper-Proofing)
*   **Requirement:** Compliance (SOC2/ISO) requires proof that audit logs haven't been modified by a rogue DB admin.
*   **Integration:** Implement **Log Chaining**. Each `AuditLog.row_hash` includes the hash of the *previous* row.
*   **Migration Complexity:** Medium (Requires background task to sign chains).
*   **Status:** **FUTURE ENTERPRISE FEATURE**

---

## 4. AI Coding Standards (Security First)
When using LLMs/AI to generate code for EventX, these rules are mandatory:

1.  **Context Preservation:** Never omit `correlation_id` when calling logger or creating audit entries.
2.  **Explicit Scoping:** Any query to `Event` or `Participant` models must be preceded by a check for the current tenant context.
3.  **No Naked Secrets:** Never generate code that hardcodes API keys or secrets. Always use `app.config.settings`.
4.  **Zod/Pydantic Enforcement:** All external input must be typed and validated. No `Any` types in security-critical paths.

---

## 5. Developer Security Checklist
*   [ ] Does the route use `ActiveUser` or `AuthenticatedSpeaker`?
*   [ ] Is the `organization_id` correctly scoped in the query?
*   [ ] If modifying data, is there an `AuditLog` entry?
*   [ ] Have you checked for PII (emails/phones) and ensured they aren't logged in plaintext?
*   [ ] Is the rate limit appropriate for this endpoint's cost?

---
**Approved By:** EventX Security Board  
**Date:** June 2026

## Recent Changes (Refactor)
This document has been updated to reflect the SaaS transformation refactor completed on 2026-06-09.
Key changes include:
- Migration of legacy schemas to domain-driven namespaces (identity, illing, crm, etc.).
- Implementation of mandatory tenant lineage (organization_id/event_id).
- Introduction of soft delete framework (deleted_at, deleted_by).
- Standardization of Primary Keys to UUIDs for critical entities.
- Enhanced security with field-level encryption for TOTP and Stripe secrets.
