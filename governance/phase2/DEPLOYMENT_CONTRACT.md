# Phase 2 Deployment Contract

Status: STARTED

This contract defines how EventX OS moves from local/manual deployment toward a
repeatable production cloud deployment. It is intentionally stricter than the
current implementation and becomes the acceptance target for Phase 2.

## Service Images

Required images:

- `backend`: FastAPI HTTP and WebSocket API.
- `workers`: Celery worker pool image, separated by queue at runtime.
- `venue-server`: venue sync/API service, deployed only where the chosen venue
  trust boundary allows it.

Image requirements:

- Run as non-root users.
- Use immutable image digests in production deployments.
- Do not run Alembic in normal service startup.
- Expose liveness and readiness contracts.
- Emit logs to stdout/stderr only.
- Receive secrets from the runtime secret store, not baked into images.
- Produce build, scan, SBOM, and signing evidence before production promotion.

## Migration Task

Alembic runs as an explicit one-off deployment task before service rollout.

Required behavior:

- Use a separate migration role with migration permissions.
- Run against the exact image version being deployed.
- Fail the deployment when the migration task fails.
- Record migration revision, image digest, operator/CI identity, start time,
  finish time, and logs.
- Never run migration commands as part of API, worker, or venue service startup.

## Readiness Contract

- `/health` means the process is alive.
- `/ready` means the API can accept normal traffic.
- Load balancers and canary promotion use `/ready`, not `/health`.
- A dependency failure returns a non-2xx readiness response.

Current backend readiness dependencies:

- PostgreSQL query succeeds.
- Redis ping succeeds.

Future additions:

- Required object storage access.
- Active migration revision check.
- Optional degraded-mode provider checks where safe.

## Rollback Contract

Rollback requires:

- Previous immutable image digest.
- Database migration rollback or forward-fix decision.
- Compatibility check between old image and current schema.
- Audit entry for rollback trigger, approver, and outcome.
- Post-rollback tenant canary and smoke test.

## Promotion Evidence

Every production deployment must retain:

- Git commit.
- Image digest.
- SBOM location.
- Image scan result.
- Signature/provenance result.
- Migration result.
- Readiness/canary result.
- Rollback decision and operator.
- Incident link when deployment is emergency-driven.
