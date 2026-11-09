from __future__ import annotations

from fastapi import HTTPException

UPLOAD_STATES = frozenset({"created", "uploading", "uploaded", "verifying", "scanning", "processing", "cleanup_pending", "ready", "failed", "quarantined", "deleted"})
TERMINAL_UPLOAD_STATES = frozenset({"ready", "failed", "quarantined", "deleted"})
UPLOAD_TRANSITIONS = {
    # Session creation can succeed before presigning/storage negotiation fails;
    # recovery therefore needs an explicit terminal failure from ``created``.
    "created": {"uploading", "failed", "deleted"},
    "uploading": {"uploaded", "failed", "deleted"},
    # Integrity failures are terminal and can be established before the
    # verification state is entered (for example, object size/checksum).
    "uploaded": {"verifying", "quarantined", "failed", "deleted"},
    "verifying": {"scanning", "failed", "quarantined"},
    "scanning": {"processing", "ready", "failed", "quarantined"},
    "processing": {"ready", "failed", "quarantined"},
    "ready": {"deleted"},
    "failed": {"verifying", "deleted"},
    "quarantined": {"deleted"},
    "deleted": set(),
    # Irreversible cleanup intent: never revive this same object key after an
    # external DELETE has been authorised. Quota remains held until recovery.
    "cleanup_pending": {"failed"},
}
for _state in ("created", "uploading", "uploaded", "verifying", "scanning", "processing"):
    UPLOAD_TRANSITIONS[_state].add("cleanup_pending")


def transition_upload(current: str, target: str) -> str:
    # Retries may replay a successful state update. Same-state transitions are
    # idempotent; every actual state change remains strictly validated.
    if current == target and target in UPLOAD_STATES:
        return current
    if target not in UPLOAD_STATES or target not in UPLOAD_TRANSITIONS.get(current, set()):
        raise HTTPException(status_code=409, detail={"code": "INVALID_UPLOAD_TRANSITION", "message": f"Cannot transition upload from {current} to {target}."})
    return target
