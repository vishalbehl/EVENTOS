# ADR-001: Initial Managed Container Runtime

Status: ACCEPTED FOR PHASE 2 BASELINE

Date: 2026-07-11

## Decision

Use Amazon ECS on Fargate as the initial managed container runtime for the
cloud backend and workload-separated workers. Preserve EKS as a target-state
option that requires a new ADR when measured requirements justify Kubernetes.

## Context

EventX OS is currently a modular FastAPI monolith with Celery worker paths and
multiple frontend applications. The repository does not yet contain a complete
production topology, Terraform deployment, signed-image pipeline, canary, or
tested rollback path. The current team size does not justify operating a
Kubernetes control plane before these baseline controls exist.

## Initial Runtime Shape

- One ECS service for the FastAPI backend and authenticated realtime traffic.
- Separate ECS services or task definitions for materially different worker
  queues when workload measurements justify independent scaling.
- One-off migration tasks run as an explicit deployment step, never as API or
  venue-server startup DDL.
- Application Load Balancer health checks use dedicated liveness and readiness
  endpoints.
- Tasks use private subnets, task roles, read-only root filesystems where
  compatible, non-root users, CloudWatch logs, and Secrets Manager references.
- Venue hardware remains outside this cloud runtime and synchronizes only
  through authenticated cloud APIs.

## EKS Reconsideration Triggers

Reopen this ADR when at least one of these is evidenced:

- Kubernetes-specific customer or operational requirements.
- Workload/service count makes ECS orchestration materially harder.
- Specialized media/GPU scheduling cannot be handled economically by ECS.
- WebSocket topology or deployment frequency requires controls unavailable in
  the selected ECS design.
- The team has sufficient Kubernetes operational ownership and on-call depth.
- Measured cost, reliability, or scaling benchmarks favor EKS.

## Consequences

Fargate reduces initial operational burden and provides a managed path to
repeatable production. This decision does not authorize deployment until the
Phase 2 network, IAM, secrets, database, storage, monitoring, backup, rollback,
and cost controls pass their gates.

