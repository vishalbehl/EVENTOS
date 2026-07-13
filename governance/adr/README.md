# Architecture Decision Register

ADRs must capture context, options, decision, security/privacy impact, cost, migration, rollback, reconsideration trigger, and owner.

| ID | Decision | Status |
|---|---|---|
| ADR-001 | ECS Fargate versus EKS | Pending Phase 2 workload baseline |
| ADR-002 | RDS PostgreSQL versus Aurora PostgreSQL | Pending Phase 2 database baseline |
| ADR-003 | Current authentication versus managed identity | Harden current architecture |
| ADR-004 | Socket.IO/WebSocket topology | Current single-service topology, secured in Phase 0 |
| ADR-005 | Celery/Redis to SQS transition | Trigger-driven |
| ADR-006 | Transaction-local TenantContextGuard | Accepted |
| ADR-007 | Private presigned multipart uploads | Pending |
| ADR-008 | Venue machine identity and rotation | In progress |
| ADR-009 | PostgreSQL search and OpenSearch trigger | PostgreSQL default |
| ADR-010 | Disaster recovery topology | Trigger-driven |
| ADR-011 | Cache isolation and invalidation | Pending Phase 1 |
| ADR-012 | Webhook ingestion and retention | Pending Phase 3 |
| ADR-013 | Feature flags and kill switches | Pending Phase 2 |
| ADR-014 | Audit storage and immutability | Pending evidence baseline |
