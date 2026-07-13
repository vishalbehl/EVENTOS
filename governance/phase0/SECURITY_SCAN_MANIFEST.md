# Security Scan Manifest

Status: LOCAL STATIC CHECKS RECORDED, FORMAL SECURITY SCANS STILL REQUIRED

Record every scan used to close Phase 0. Attach raw output paths where possible.

Repository evidence templates and the local runner are available under
`governance/phase0/evidence/`. Each runner execution creates timestamped raw
outputs, metadata, and a machine-readable summary. `SKIPPED` never counts as a
passing scan.

| Scan | Tool/version | Scope | Command | Date | Result | Output path |
|---|---|---|---|---|---|---|
| Dependency file discovery | `rg` | Full repo | `rg --files -g "requirements*.txt" -g "pyproject.toml" -g "package.json" -g "package-lock.json" -g "Dockerfile*" -g "docker-compose*.yml" -g ".env*"` | 2026-07-11 | Dependency/config files discovered across backend, workers, venue apps, cloud apps, Docker Compose, and local env files | Console evidence |
| Route surface count | `rg` | Backend routes | `rg -n "@(router\|app)\\.(get\|post\|put\|patch\|delete)\|APIRouter\\(" services/backend/app -g "*.py" \| Measure-Object` | 2026-07-11 | 664 route decorator/APIRouter matches | Console evidence |
| Task surface count | `rg` | Backend + workers | `rg -n "@(celery_app\|app)\\.task\|beat_schedule\|send_task\|\\.delay\\(" services/backend/app services/workers -g "*.py" \| Measure-Object` | 2026-07-11 | 64 task/scheduling/dispatch matches | Console evidence |
| Runtime DDL scan | `rg` | Backend, workers, venue server | `rg -n "ALTER TABLE\|create_all\\(\|drop_all\\(" services/backend/app services/workers services/venue-server/app -g "*.py"` | 2026-07-11 | No matches | Console evidence |
| Tenant-header trust scan | `rg` | Backend | `rg -n "X-Organization-ID\|X-Org-ID\|x-organization\|x-org-id\|organization_id.*headers\|headers.*organization" services/backend/app -g "*.py"` | 2026-07-11 | No matches | Console evidence |
| Secret/default config scan | `rg` | Backend/workers/venue/cloud apps | `rg -n "change-me-in-production\|dev_internal_secret_do_not_use_in_prod\|SECRET\|TOKEN\|PASSWORD\|API_KEY\|PRIVATE_KEY\|FERNET\|JWT\|CLOUD_API\|S3_\|WHATSAPP\|RESEND\|SMTP\|STRIPE\|RAZORPAY\|PAYMENT" ...` | 2026-07-11 | Backend production validation exists; venue dev defaults found and recorded as finding | Console evidence |
| Print/debug scan | `rg` | Backend/workers/venue server | `rg -n "except Exception...|print\\(|ALTER TABLE|create_all\\(|drop_all\\(|...|DEBUG" ...` | 2026-07-11 | Print/debug candidates found in venue server, AI service, seed scripts | Console evidence |
| Alembic heads | Alembic | Backend migrations | `.\.venv\Scripts\alembic.exe heads` | 2026-07-11 | `phase1_exports_0550 (head)` | Console evidence |
| Alembic current | Alembic | Backend database | `.\.venv\Scripts\alembic.exe current` | 2026-07-11 | `phase1_exports_0550 (head)` | Console evidence |
| Tenant escape tests | pytest + live RLS canary | Backend DB/runtime | See `TEST_EVIDENCE.md` | 2026-07-11 | Partial pass | `governance/phase1/PHASE1_EXIT_EVIDENCE.md` |
| Secret scan | Gitleaks or assessor-approved equivalent | Full repo and history as approved | Local runner or CI job |  | Not run | `evidence/scans/<timestamp>/` |
| SAST | Bandit + Semgrep or assessor-approved equivalent | Backend, workers, venue, frontend | Local runner or CI job |  | Not run | `evidence/scans/<timestamp>/` |
| Dependency/SCA | pip-audit + npm audit or assessor-approved equivalent | Python + JS packages | Local runner or CI job |  | Not run | `evidence/scans/<timestamp>/` |
| Container scan | Trivy or assessor-approved equivalent | Immutable backend/worker image digest | Local runner or CI job |  | Not run | `evidence/scans/<timestamp>/` |
| API/DAST | OWASP ZAP or assessor-approved equivalent | Authorized local/staging API | Local runner or assessor job |  | Not run | `evidence/scans/<timestamp>/` |

## Minimum Phase 0 Requirement

- Raw scan output must be retained.
- Every Critical and High finding must be copied into
  `SECURITY_FINDING_REGISTER.md`.
- False positives require evidence and reviewer approval.
- This manifest is not sufficient for Phase 0 closure until the external scan
  rows have raw outputs, owners, and retest evidence.
