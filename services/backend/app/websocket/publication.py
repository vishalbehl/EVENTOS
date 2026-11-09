"""Recipient-authorised, allowlisted native realtime output contract."""
from contextlib import asynccontextmanager
import math
import uuid

from app.core.tenant_context import TenantContextGuard
from app.modules.rbac.services.permission_service import get_user_permissions
from app.websocket.auth import RealtimeAuthError, authorize_event, authorize_room
from app.websocket.output_resources import validate_output_resources


class RealtimeOutputContractError(ValueError):
    pass


CONTROL = frozenset({"connected", "ping", "pong", "auth_ok", "auth_required", "auth_failed", "error"})
ACTION_EVENTS = {
    "campaign.sent": "CAMPAIGNS:VIEW",
    **{name: "FILES:VIEW" for name in ("file.uploaded", "file.validated", "file.approved", "file.rejected",
        "file.locked", "file.sync_started", "file.sync_done", "file.sync_failed")},
    **{name: "SPEAKERS:VIEW" for name in ("speaker.created", "speaker.updated", "speaker.checked_in",
        "speaker.checked_out", "speaker.upload_pending", "srr.station_assigned", "srr.station_freed",
        "srr.station_status", "srr.heartbeat")},
    **{name: "SESSIONS:VIEW" for name in ("session.started", "session.completed", "session.updated")},
    **{name: "QUEUE:VIEW" for name in ("presentation.start", "presentation.stop", "slide.next", "slide.prev",
        "slide.goto", "speaker.switch", "screen.blank", "screen.show", "queue.updated", "presentation_command")},
    **{name: "PARTICIPANTS:VIEW" for name in ("import.started", "import.progress", "import.completed", "import.failed")},
    **{name: "FILES:VIEW" for name in ("venue.sync_started", "venue.sync_progress", "venue.sync_completed", "venue.sync_failed")},
    **{name: "EVENTS:VIEW" for name in ("venue_ops.request.updated", "venue_ops.request.created",
        "venue_ops.request.submitted", "venue_ops.clarification.created")},
}
FIELDS = frozenset({"event_id", "file_id", "speaker_id", "session_id", "room_id", "job_id", "station_id", "campaign_id",
    "request_id", "attachment_id", "comment_id", "entity_version", "version",
    "status", "progress", "phase", "filename", "command", "slide_index", "code", "retry_after"})
CONTROL_FIELDS = FIELDS | {"room", "message", "sid"}


def scalar_projection(payload, fields, *, nested=True):
    if not isinstance(payload, dict):
        raise RealtimeOutputContractError("Invalid realtime payload")
    projected = {}
    for key in fields:
        value = payload.get(key)
        if key not in payload:
            continue
        if value is None or type(value) in {bool, int} or (type(value) is float and math.isfinite(value)) or (isinstance(value, str) and len(value) <= 255):
            projected[key] = value
    # No free-form metadata, notes, staffing, finance, credentials or nested
    # object passthrough. Command payload uses the same bounded scalar contract.
    if nested and "payload" in payload:
        projected["payload"] = scalar_projection(payload["payload"], FIELDS, nested=False) if isinstance(payload["payload"], dict) else {}
    return projected


def output_contract(message):
    if not isinstance(message, dict) or not isinstance(message.get("type"), str):
        raise RealtimeOutputContractError("A registered realtime event is required")
    kind = message["type"]
    if kind not in CONTROL and kind not in ACTION_EVENTS:
        raise RealtimeOutputContractError("Unregistered realtime output")
    payload = scalar_projection(message.get("payload", {}), CONTROL_FIELDS if kind in CONTROL else FIELDS)
    result = {"type": kind, "payload": payload}
    timestamp = message.get("ts")
    if isinstance(timestamp, str) and len(timestamp) <= 64:
        result["ts"] = timestamp
    return result, ACTION_EVENTS.get(kind)


@asynccontextmanager
async def authorized_output(db, principal, room_id, event_id, message):
    projected, action = output_contract(message)
    if room_id is not None:
        room = await authorize_room(db, principal, room_id)
        event_id = room.event_id
    elif event_id is not None:
        await authorize_event(db, principal, event_id)
    else:
        raise RealtimeAuthError("An output resource is required")
    supplied_event = projected["payload"].get("event_id")
    if supplied_event is not None:
        try:
            if uuid.UUID(str(supplied_event)) != event_id:
                raise RealtimeOutputContractError("Output event ownership conflict")
        except (ValueError, TypeError) as exc:
            raise RealtimeOutputContractError("Output event ownership conflict") from exc
    async with TenantContextGuard.scoped(db, principal.organization_id):
        if action is not None:
            await validate_output_resources(db, principal, event_id, projected["payload"], projected["type"],
                                            channel_room_id=room_id)
        if principal.kind == "user" and action is not None:
            permissions = await get_user_permissions(db, principal.user_id, event_id,
                                                    organization_id=principal.organization_id)
            if action not in permissions:
                raise RealtimeAuthError("Realtime output permission is unavailable")
    # authorize_event holds the shared PostgreSQL revision lock until the
    # caller closes this transaction, including the bounded send below.
    yield projected
