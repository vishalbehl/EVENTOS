# Residual Risk Register

Status: SEEDED, OWNER REVIEW REQUIRED

| ID | Risk | Severity | Reason accepted/deferred | Compensating control | Owner | Review date | Expiry |
|---|---|---|---|---|---|---|---|
| RR-001 | Dormant workflow/platform jobs need future control-plane fanout before production scheduling | Medium | Jobs are not scheduled globally and fail closed without tenant scope | Celery beat only schedules tenant-aware API usage flusher | Engineering | 2026-07-11 | Phase 2 review |
| RR-002 | Venue Server local API presigned URL path remains outside cloud DB Phase 1 scope | Medium | Venue reliability is governed as parallel program | No direct cloud DB access; cloud sync uses device identity | Engineering | 2026-07-11 | Venue Reliability Program review |
| RR-003 | Route authorization inventory is too large to complete through static counting alone | Medium | 664 route matches require route-by-route audit; package now identifies scope | Sensitive route classes must be prioritized and tested before public production | Engineering | 2026-07-11 | Phase 0 closure |
| RR-004 | Provider/processor residency and DPA data is incomplete | Medium | Requires business/legal inputs outside repository | Do not enable production provider processing of restricted data until provider review is complete | Privacy/Legal + Product/Risk | 2026-07-11 | Phase 2/3 boundary |

## Acceptance Rule

- Critical risks cannot be normally accepted for production.
- High risks require time-limited exception and compensating control.
- Medium risks require owner, treatment plan, and review date.
- Low risks may enter managed backlog.

## Non-Residual Blockers

The following are not acceptable residual risks for normal production release and
must remain blocking findings until closure evidence exists:

- Historical secret rotation and old credential revocation.
- Formal scanner/security-assessor Critical/High finding closure.
