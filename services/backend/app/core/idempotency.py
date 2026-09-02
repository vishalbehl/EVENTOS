from __future__ import annotations

import hashlib
import json
from typing import Any


def request_hash(payload: Any) -> str:
    """Stable, non-sensitive fingerprint for durable idempotency records."""
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str).encode()
    return hashlib.sha256(encoded).hexdigest()


def idempotency_scope(organization_id, actor_id, operation: str, key: str) -> str:
    return f"{organization_id}:{actor_id or 'anonymous'}:{operation}:{key}"

