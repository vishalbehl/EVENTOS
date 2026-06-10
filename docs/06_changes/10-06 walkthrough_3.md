# Test Database Isolation & Startup Fix Walkthrough

This walkthrough details the diagnosis, resolution, and verification of the backend database startup error (`UndefinedTableError` and missing schemas/relations).

## Root Cause Analysis
1. In `tests/conftest.py`, the test database URL was defined as:
   ```python
   _TEST_DB_URL = (
       settings.async_database_url
       .replace("/conf_platform", "/conf_platform_test")
   )
   ```
2. Because the configured database name in `.env` is **`eventos_db`** (and not `conf_platform`), the replacement had no effect.
3. Pytest was therefore running directly against the live development database (`eventos_db`) instead of an isolated test database.
4. During the pytest teardown phase, it executed `DROP SCHEMA IF EXISTS ... CASCADE` on all the schemas, wiping out the entire development database `eventos_db`.
5. This left the development database empty, causing the next `uvicorn` startup to fail when seeding RBAC/Admin configurations with `UndefinedTableError: relation "rbac.permissions" does not exist`.

## Summary of Changes

### 1. Test Database URL Isolation
- **Modified File**: [conftest.py](file:///d:/DEV/conf-platform/services/backend/tests/conftest.py#L64-L72)
- Replaced the hardcoded URL replacement logic with a robust dynamic URL parser that extracts the database name from `async_database_url` and appends `_test` to it (e.g. `eventos_db` -> `eventos_db_test`).

### 2. Test Database Setup
- Created the separate Postgres test database **`eventos_db_test`** on the local database server.
- This keeps the test session context fully isolated from the development database context.

### 3. Restoration of Development Database
- Recreated all schemas in `eventos_db` via `reset_db.py`.
- Rebuilt all database tables via `alembic upgrade head`.

## Verification Results

### 🧪 Automated Tests
- Running the full pytest suite in the backend service now targets the isolated `eventos_db_test` database:
  ```powershell
  .venv\Scripts\python -m pytest tests/ -v
  ```
- **Result**: All **227** tests passed successfully:
  ```text
  ================ 227 passed, 14 warnings in 333.03s (0:05:33) =================
  ```

### 🚀 Dev Server Startup
- Verified that the `uvicorn` development server on port 8000 remains online and healthy after the test suite completes.
- Hitting the health endpoint:
  ```http
  GET http://127.0.0.1:8000/health
  ```
  Response:
  ```json
  {"status": "ok"}
  ```
- This confirms that the test teardown successfully dropped schemas only in `eventos_db_test`, leaving the live development database `eventos_db` intact and running cleanly.
