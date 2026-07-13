# Phase 2 Reliable Production Cloud Status

Status: STARTED

Date: 2026-07-11

## Current Baseline

- ECS Fargate selected as the initial runtime candidate in ADR-001.
- RDS PostgreSQL selected as the initial database candidate in ADR-002.
- Backend has a basic service Dockerfile, but production hardening and image
  verification are incomplete.
- Worker Dockerfiles under `services/workers` and `infrastructure/docker` are
  placeholders.
- `docker-compose.prod.yml` contains restart policies only and is not a
  production topology.
- Cloud nginx configuration is a placeholder.
- No Terraform AWS landing zone or environment modules are currently present.
- Backend has a liveness-like `/health` response, but no dependency-aware,
  deployment-safe readiness contract.
- The Codex Security scan was stopped by user direction and retained as
  incomplete evidence; Phase 0 must not be represented as formally closed.
- Terraform and Docker CLIs are not installed in the current shell, so Phase 2
  artifacts can be authored and statically inspected here but cannot yet be
  validated or built locally.

## Completed Phase 2 Foundation Work

- `ADR-001` selects ECS Fargate as the initial managed runtime candidate.
- `ADR-002` selects RDS PostgreSQL as the initial managed database candidate.
- Added Terraform foundation scaffold under `infrastructure/terraform` for
  KMS, service log groups, immutable ECR repositories, and private encrypted S3
  buckets with non-production and production roots.
- Added Terraform network scaffold for public load-balancer subnets, private
  runtime subnets, isolated data subnets, route tables, and VPC boundaries.
- Added container hardening contracts for backend, workers, and venue server:
  non-root runtime users, minimal build context excludes, explicit commands,
  and health checks.
- Removed venue-server startup migration behavior from the image command;
  Alembic must run as an explicit deployment task.
- Added backend `/ready` endpoint for dependency-aware deployment and load
  balancer readiness checks.
- Added `DEPLOYMENT_CONTRACT.md` covering service images, migration tasks,
  readiness, rollback, and promotion evidence.

## Work Package 2A: Reproducible Containers

1. Harden backend and worker images with pinned runtime dependencies, non-root
   users, health checks, signal-safe commands, and minimal build context.
   - Status: PARTIAL. Files are authored; image builds and scans still require
     Docker availability.
2. Separate API, backend Celery, and database-worker task definitions.
3. Run Alembic as an explicit one-off deployment task.
   - Status: CONTRACT STARTED. Venue startup DDL/migration was removed from
     the container command; ECS migration task definition is still pending.
4. Generate SBOMs, scan images, sign immutable digests, and retain evidence.
5. Add liveness, readiness, and startup contracts with tests.
   - Status: PARTIAL. `/health` and `/ready` exist; tests and deployment
     wiring are pending.

## Work Package 2B: AWS Foundation

1. Terraform remote state and locking bootstrap.
   - Status: PENDING. Backend blocks are intentionally not configured until the
     AWS account and state bucket are approved.
2. Separate production and non-production accounts or account boundaries.
   - Status: PARTIAL. Separate Terraform roots exist; account IDs and IAM
     boundaries still require business approval.
3. VPC, public load-balancer subnets, private runtime subnets, isolated data
   subnets, endpoints, flow logs, and controlled egress.
   - Status: PARTIAL. VPC, subnet tiers, and route tables are scaffolded.
     Endpoints, flow logs, NAT/egress policy, security groups, and ACL review
     are pending.
4. KMS, Secrets Manager, ECR, centralized logs, IAM task roles, and short-lived
   CI deployment identity.
   - Status: PARTIAL. KMS, ECR, and log group scaffold exists. Secrets Manager,
     IAM roles, and CI OIDC are pending.
5. RDS PostgreSQL, private object storage, and managed Redis selected through
   measured compatibility tests.
   - Status: PARTIAL. Private encrypted S3 bucket scaffold exists. RDS and
     Redis modules are pending.

## Work Package 2C: Deployment and Operations

1. CI builds, tests, scans, signs, and publishes immutable images.
2. Deployment runs migration preflight and one-off migration task.
3. ECS canary/blue-green deployment verifies readiness and tenant canaries.
4. Automatic rollback uses application, infrastructure, and business signals.
5. Monitoring, alerting, incident runbooks, backup restoration, cost tags, and
   workload-profile load tests produce Phase 2 exit evidence.

## Exit Gate

Phase 2 is complete only after repeatable deployment, tested rollback, proven
restore, production-equivalent RLS, observable service behavior, incident
runbooks, current-peak load testing with safety margin, and cost ownership are
all evidenced. Creating Terraform files alone does not satisfy this gate.
