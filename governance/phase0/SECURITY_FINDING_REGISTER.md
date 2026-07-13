# Security Finding Register

Status: OPEN FINDINGS SEEDED, ASSESSOR VALIDATION REQUIRED

Snapshot:

- Date: 2026-07-11
- Repository snapshot: `a9c0657` with dirty working tree

| ID | Severity | Source | Finding | Affected area | Owner | Status | Fix evidence | Retest evidence | Exception expiry |
|---|---|---|---|---|---|---|---|---|---|
| SEC-001 | High | Phase 0 blocker `P0-SEC-01` | Historical or potentially exposed production secrets require rotation and proof of revocation | Backend, venue, providers, storage, payment, JWT/portal tokens | Product/Risk + Engineering | Open | Pending external secret-manager/provider evidence | Pending negative-auth/decrypt tests | |
| SEC-002 | High | Phase 0 blocker `P0-SCAN-01` | Formal SAST, SCA, secret, container, API/DAST, and assessor scan outputs are not yet attached | Full repository and deployed API | Security Assessor | Open | Pending scan outputs | Pending retest for Critical/High findings | |
| SEC-003 | Medium | Static route inventory | Backend has 664 route decorator matches; full route-by-route authorization classification is not complete | FastAPI routes | Engineering | Open | `ROUTE_AUTHORIZATION_INVENTORY.md` seeded | Pending route audit tests | Phase 1/2 boundary |
| SEC-004 | Medium | Static secret/config scan | Venue server config contains development defaults (`dev_internal_secret_do_not_use_in_prod`, `minioadmin`) and needs production guard validation | Venue server config/deployment | Engineering | Open | Pending production startup guard or deployment proof | Pending production config test | Phase 0 |
| SEC-005 | Medium | Static debug scan | Print/debug candidates remain in venue/server AI/seed paths and need classification or replacement with redacted logging | Backend and venue logging | Engineering | Open | Pending triage | Pending redaction/logging tests | Phase 0 |
| SEC-006 | Medium | Provider inventory | Provider/processor residency, DPA, retention, and deletion behavior are not fully documented | Email, WhatsApp, payment, storage, AI, malware scanning | Privacy/Legal + Product/Risk | Open | `PROVIDER_PROCESSOR_INVENTORY.md` seeded | Pending legal/privacy review | Phase 2/3 boundary |
| SEC-007 | Medium | Phase 1 residual risk | Dormant workflow/platform jobs need future control-plane fanout before production scheduling | Background jobs | Engineering | Deferred | Jobs fail closed or are not globally scheduled | Pending Phase 2 worker hardening | Phase 2 review |

## Severity Rules

- Critical: blocks deployment, no normal exception path.
- High: blocks deployment unless formally excepted with compensating control and
  expiry.
- Medium: requires documented treatment and remediation timeline.
- Low: managed backlog.

## False Positive Rule

Do not close a finding as false positive without reproducible evidence and
reviewer approval.
