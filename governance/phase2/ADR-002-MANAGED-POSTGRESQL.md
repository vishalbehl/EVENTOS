# ADR-002: Initial Managed PostgreSQL

Status: ACCEPTED FOR PHASE 2 BASELINE

Date: 2026-07-11

## Decision

Use Amazon RDS for PostgreSQL as the initial managed database candidate. Do not
adopt Aurora solely as an enterprise label. Reopen the decision when measured
load, failover, replica, or contractual requirements show a material benefit.

## Required Baseline

- Multi-AZ production deployment.
- Encryption with a customer-managed KMS key.
- Private subnets and security-group access only from approved runtime paths.
- Separate migration and runtime roles; runtime has no `BYPASSRLS` and does
  not own tenant tables.
- The existing Alembic graph and RLS policies deploy unchanged.
- Automated backups, point-in-time recovery, deletion protection, monitoring,
  parameter management, and restoration exercises.
- Connection pooling selected from measured connection behavior; RDS Proxy is
  not enabled without an application/RLS transaction-context compatibility
  test.

## Aurora Reconsideration Triggers

- Sustained write or connection load exceeds tested RDS headroom.
- Required failover or read-replica behavior cannot meet the service class.
- Measured database size or read scaling makes Aurora economically preferable.
- A customer contract requires capabilities supported by the Aurora design.
- Required PostgreSQL extensions and RLS behavior remain compatible.

## Required Evidence Before Production

- Clean-database Alembic upgrade and downgrade-policy validation.
- TenantContextGuard connection-reuse tests against the target topology.
- Live forced-RLS canary using the production-equivalent runtime role.
- Backup restoration into an isolated account/environment.
- Load test at measured peak plus the approved safety margin.
- Documented RPO, RTO, failover, maintenance, and rollback procedures.

