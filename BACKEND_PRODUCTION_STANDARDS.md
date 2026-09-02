# Backend Production Standards

The backend remains a modular monolith: PostgreSQL is authoritative, Redis is
an accelerator/coordinator, object storage owns large files, and Celery owns
slow retryable work.

Routers authenticate, resolve tenant/capability, validate input, and call an
application service. Query services return explicit read-only projections and
never commit. Command services own one short transaction. Repositories never
commit, raise HTTP exceptions, call external services, or load unbounded data.
Large lists use bounded cursor pages with stable ordering.

Ordinary shared edits use `If-Match` versions and return `409
RESOURCE_VERSION_CONFLICT` on stale writes. Retryable commands and provider or
webhook work require durable tenant-scoped idempotency keys and request hashes.

`REDIS_CACHE_URL` and `REDIS_LOCK_URL` are separate from Celery URLs. Cache
reads fail open, keys require verified tenant context, every value has an
explicit TTL, and invalidation happens after commit. Locks use unique owner
tokens and compare-and-delete release.

Large files go directly to object storage and pass through explicit upload
states before becoming available. Celery uses late acknowledgement, rejects
lost work, bounded prefetch, dedicated queues, backoff, and idempotent state
transitions. Tune DB pool settings from the deployment connection budget and
validate indexes with `EXPLAIN (ANALYZE, BUFFERS)` before release.
