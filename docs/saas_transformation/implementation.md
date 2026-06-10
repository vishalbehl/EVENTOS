# EventX Refactoring Implementation Plan

This document details the step-by-step execution strategy for migrating the EventX OS codebase and database to the Unified Domain-Driven & Ecosystem Architecture.

## Phase 1: Codebase Reorganization
1. **Create New Directory Structure:** 
   Create the new bounded context directories under `services/backend/app/modules/`:
   - `platform` (already exists, expand)
   - `identity` (new)
   - `billing` (new)
   - `rbac` (exists)
   - `events` (new)
   - `registration` (exists)
   - `presentations` (exists)
   - `venue` (exists)
   - `communications` (new)
   - `analytics` (new)
   - `audit` (new)
   - `integrations` (new)
   - `applications` (new)
   - `developer` (new)

2. **Move Models & Update Schemas:**
   Move existing SQLAlchemy model files into their target bounded contexts.
   Update the `__table_args__ = {"schema": "target_schema"}` in every model to match the master plan.
   *Example:* Move `User` from `auth` to `identity`, update schema to `identity`.

3. **Refactor Relationships:**
   Update all SQLAlchemy `relationship()` declarations to use the new module paths (e.g., `"app.modules.identity.models.user.User"`).

4. **Update Re-exporters:**
   Update `app/models/__init__.py` to import from all the new locations to ensure Alembic and SQLAlchemy can discover all models.

5. **Fix Imports:**
   Perform a codebase-wide search and replace to fix imports in routers, services, repositories, and dependencies to point to the new module paths.

## Phase 2: Database Migration Strategy
We cannot use Alembic's `--autogenerate` for this migration because it will `DROP` and `CREATE` tables, causing data loss.

1. **Create Schemas:**
   Write a migration script to explicitly execute `CREATE SCHEMA IF NOT EXISTS <name>;` for all 12 target schemas + applications + developer.

2. **Move Existing Tables:**
   Write manual `op.execute("ALTER TABLE old_schema.table_name SET SCHEMA new_schema;")` commands for every table being moved.

3. **Create New Tables:**
   For the entirely new tables (e.g., `applications`, `developer` domain tables), we will use `--autogenerate` *after* the existing tables have been safely moved to their new schemas.

## Phase 3: Validation
1. Run `alembic upgrade head` on the development database.
2. Run the application (`python -m app.main`) to ensure no startup errors (verifying SQLAlchemy registry health).
3. Generate the final `walkthrough.md` summarizing the completed state.