# Migration Validation Report

Status: CURRENT DATABASE EVIDENCE AVAILABLE, CLEAN-BASELINE REPLAY STILL RECOMMENDED

| Check | Command | Date | Result | Evidence |
|---|---|---|---|---|
| Alembic heads | `.\.venv\Scripts\alembic.exe heads` | 2026-07-11 | `phase1_exports_0550 (head)` | Console evidence |
| Alembic current | `.\.venv\Scripts\alembic.exe current` | 2026-07-11 | `phase1_exports_0550 (head)` | Console evidence |
| Upgrade head | `.\.venv\Scripts\alembic.exe upgrade head` | 2026-07-11 | Passed in earlier Phase 1 run | `governance/phase1/PHASE1_EXIT_EVIDENCE.md` |
| Runtime DDL scan | `rg -n "ALTER TABLE\|create_all\\(\|drop_all\\(" services/backend/app services/workers services/venue-server/app -g "*.py"` | 2026-07-11 | No matches | Console evidence |
| Tenant-header trust scan | `rg -n "X-Organization-ID\|X-Org-ID\|x-organization\|x-org-id\|organization_id.*headers\|headers.*organization" services/backend/app -g "*.py"` | 2026-07-11 | No matches | Console evidence |
| RLS canary | `.\.venv\Scripts\python.exe scripts\verify_rls_canary.py --role Event_runtime` | 2026-07-11 | Passed in earlier Phase 1 run | `governance/phase1/PHASE1_EXIT_EVIDENCE.md` |

## Closure Requirement

- One Alembic head.
- Clean upgrade from baseline database.
- No runtime startup DDL.
- RLS policies verified through live non-owner role canary.
- Production runtime role cannot bypass RLS.

## Remaining Recommendation

Before final Phase 0 sign-off, replay migrations against a clean disposable
database in CI and attach the raw output. The current evidence proves the local
database is at the expected head, but CI replay is stronger release evidence.
