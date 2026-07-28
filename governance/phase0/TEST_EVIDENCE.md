# Test Evidence

Status: PARTIAL PHASE 0/1 EVIDENCE CAPTURED

Snapshot:

- Date: 2026-07-11
- Repository snapshot: `a9c0657` with dirty working tree

| Area | Command | Date | Result | Notes |
|---|---|---|---|---|
| Tenant runtime boundaries | `.\.venv\Scripts\python.exe -m pytest -q tests/test_tenant_runtime_boundaries.py` | 2026-07-11 | `12 passed` | Earlier Phase 1 verification |
| Focused Phase 1 backend | `.\.venv\Scripts\python.exe -m pytest -q tests/test_rate_limiting_and_gating.py tests/test_tenant_runtime_boundaries.py tests/test_phase1_rls_foundation.py tests/test_phase3_developer.py` | 2026-07-11 | `34 passed` | Earlier Phase 1 verification |
| Worker report/tenant | `..\backend\.venv\Scripts\python.exe -m pytest -q tests/test_report_tasks.py tests/test_tenant_boundaries.py` | 2026-07-11 | `10 passed` | Earlier Phase 1 verification |
| Live RLS canary | `.\.venv\Scripts\python.exe scripts\verify_rls_canary.py --role Event_runtime` | 2026-07-11 | Passed | Earlier Phase 1 verification |
| Alembic heads | `.\.venv\Scripts\alembic.exe heads` | 2026-07-11 | `phase1_exports_0550 (head)` | Current turn |
| Alembic current | `.\.venv\Scripts\alembic.exe current` | 2026-07-11 | `phase1_exports_0550 (head)` | Current turn |
| Runtime DDL static scan | `rg -n "ALTER TABLE\|create_all\\(\|drop_all\\(" services/backend/app services/workers services/venue-server/app -g "*.py"` | 2026-07-11 | No matches | Current turn |
| Tenant-header static scan | `rg -n "X-Organization-ID\|X-Org-ID\|x-organization\|x-org-id\|organization_id.*headers\|headers.*organization" services/backend/app -g "*.py"` | 2026-07-11 | No matches | Current turn |

## Closure Requirement

- Include command, date, result, and environment.
- Do not count skipped tests as passed evidence without explaining the skip.
- Retain failed output for fixed Critical/High findings until retest passes.
- Add raw output from formal security scans before Phase 0 closure.

## Missing Evidence

- Secret rotation and negative-auth proof.
- Formal SAST/SCA/secret/container/API scan outputs.
- Route-by-route authorization tests for sensitive endpoints.
- Webhook replay/signature tests.
- Production privileged MFA and step-up rollout evidence.

## Evidence Capture

- Local scanner runner: `evidence/run-local-security-scans.ps1`.
- Raw scan output: `evidence/scans/<UTC timestamp>/`.
- Secret rotation proof: `evidence/secrets/` and `evidence/screenshots/`.
- Critical/High remediation retests: `evidence/retests/`.
- A runner result of `SKIPPED` or `ERROR` remains missing evidence.
