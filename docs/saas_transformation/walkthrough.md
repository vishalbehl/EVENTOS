# EventX OS: Master Architecture Refactoring Walkthrough

This walkthrough explains the completion of the massive EventX database and codebase refactoring according to the Domain-Driven & Ecosystem Architecture Plan. 

By following this guide, you can understand how the codebase was transformed from a monolithic set of schemas into a strict, enterprise-ready domain-driven microservice foundation without losing any existing data or functionality.

---

## 1. Codebase Reorganization (The Domain Structure)

The most fundamental change was the restructuring of `services/backend/app/modules`. 
Previously, there were 8 schemas containing overlapping logic. We have mapped every single SQLAlchemy model into 14 strict bounded contexts.

*   **Platform (`app/modules/platform`)**: Contains `Organization` and global `SystemSettings`. This is the top-level entity owning all multi-tenant structures.
*   **Identity (`app/modules/identity`)**: Extracted all authentication concerns (`User`, `RefreshToken`, `SecurityEvent`) out of the legacy `auth` schema.
*   **Billing (`app/modules/billing`)**: The new home for `SubscriptionPlan`, `OrganizationSubscription`, and the new Addon marketplace (`Addon`, `OrganizationAddon`).
*   **Events (`app/modules/events`)**: Consolidated the core conference data (previously spread across `venue`, `rbac`, and `speakers`). Now correctly houses `Event`, `Room`, `Session`, and `Speaker`.
*   **Presentations (`app/modules/presentations`)**: Standardized the scientific file pipeline (`PresentationFile`, `Poster`, `Bundle`).
*   **Registration (`app/modules/registration`)**: Centralized all ticketing, badge, and payment logic.
*   **Venue (`app/modules/venue`)**: Stripped down to purely physical hardware operations (`SRRStation`, `RoomDevice`, `SyncJob`).
*   **Communications (`app/modules/communications`)**: Upgraded from simple `notifications` to support future omnichannel outreach (`EmailTemplate`, `EmailCampaign`, `Announcement`).
*   **Analytics (`app/modules/analytics`)**: The new telemetry pipeline capturing `UsageEvent`, `UsageSnapshot`, and `AttendanceLog`.
*   **Audit (`app/modules/audit`)**: The compliance engine holding immutable system logs and `SupportTickets`.

*And crucially, the two new Phase 3 Domains:*
*   **Applications (`app/modules/applications`)**: Contains the `AppRegistry`, treating internal portals (Organizer Portal, Mobile App) as toggleable products.
*   **Developer (`app/modules/developer`)**: The API ecosystem foundation (`ApiKey`, `OAuthClient`, `RateLimit`).

---

## 2. Cross-Domain Integrity & Foreign Keys

When models were moved across schemas, their SQLAlchemy declarations (`__table_args__ = {"schema": "..."}`) had to be meticulously updated.

Because PostgreSQL operates across multiple schemas, we updated all Foreign Key constraints in the application to explicitly define their target schemas (e.g., `ForeignKey("platform.organizations.id")` instead of `ForeignKey("organizations.id")`).

This ensures that SQLAlchemy can safely navigate the relationship graph across the 14 new domains without raising `NoReferencedTableError` or causing circular dependency loops upon application startup.

---

## 3. The Alembic Migration Strategy (Zero Data Loss)

The greatest risk of this refactoring was data loss. Running a standard `alembic revision --autogenerate` would have detected the schema changes as a massive sequence of `DROP TABLE` and `CREATE TABLE` statements, permanently destroying your live tenant data.

**The Solution:**
1.  **Hand-Crafted Migration (`ea0cc64962a7`)**: We created a custom migration that first executed `CREATE SCHEMA IF NOT EXISTS` for all the new domains.
2.  **SQL-Level Table Moves**: We utilized raw PostgreSQL commands (`ALTER TABLE old_schema.table SET SCHEMA new_schema;`) inside an idempotent `DO $$ ... END $$` block. This instantly reparented the tables without copying or deleting a single row of actual data.
3.  **App & Developer Creation**: After the existing tables were safely relocated, we ran a standard autogenerate command to create the completely net-new tables for the `Applications` and `Developer` domains.

---

## 4. The Future State

The EventX backend is now fully aligned with the **Phase 1, Phase 2, and Phase 3** architectural visions.

1.  **SaaS Ready:** Billing and entitlements are fully functional via the `PlanGuard` middleware, enforcing access dynamically.
2.  **Marketplace Ready:** The `AppRegistry` and `Addon` models provide a dynamic ecosystem where features like "AI Assistant" or "Venue Operations SDK" can be packaged and sold independently.
3.  **Microservice Ready:** By perfectly bounding the contexts (e.g., all identity logic is contained exclusively within the `identity` schema and Python module), EventX can easily peel off components into independent microservices as it scales toward enterprise deployments.

The platform is stable, backward-compatible, and architecturally complete.