from __future__ import annotations

from fastapi import HTTPException

UPLOAD_STATES = frozenset({"created", "uploading", "uploaded", "verifying", "scanning", "processing", "ready", "failed", "quarantined", "deleted"})
TERMINAL_UPLOAD_STATES = frozenset({"ready", "failed", "quarantined", "deleted"})
UPLOAD_TRANSITIONS = {
    "created": {"uploading", "deleted"},
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
}


def transition_upload(current: str, target: str) -> str:
    # Retries may replay a successful state update. Same-state transitions are
    # idempotent; every actual state change remains strictly validated.
    if current == target and target in UPLOAD_STATES:
        return current
    if target not in UPLOAD_STATES or target not in UPLOAD_TRANSITIONS.get(current, set()):
        raise HTTPException(status_code=409, detail={"code": "INVALID_UPLOAD_TRANSITION", "message": f"Cannot transition upload from {current} to {target}."})
    return target
