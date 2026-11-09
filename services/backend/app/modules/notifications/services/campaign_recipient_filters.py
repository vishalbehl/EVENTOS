"""Finite recipient filters and bounded selections shared by reads and workers."""
import uuid
from fastapi import HTTPException

EXPLICIT_FILTERS = frozenset({"specific_speakers", "specific_participants", "custom", "custom_list"})
FILTERS = {
    "speaker": frozenset({"all", "pending", "pending_upload", "uploaded", "approved", "rejected",
        "posters", "specific_session", "specific_room", "specific_speakers", "custom", "custom_list"}),
    "participant": frozenset({"all", "paid", "unpaid", "pending",
        "specific_participants", "custom", "custom_list"}),
}


def parse_recipient_ids(value):
    if not value:
        return ()
    if not isinstance(value, str) or len(value) > 4096:
        raise HTTPException(503, detail={"code": "CAMPAIGN_RECIPIENT_RECONCILIATION_REQUIRED"})
    parts = value.split(",")
    if len(parts) > 100 or any(not part.strip() for part in parts):
        raise HTTPException(503, detail={"code": "CAMPAIGN_RECIPIENT_RECONCILIATION_REQUIRED"})
    try:
        return tuple(dict.fromkeys(uuid.UUID(part.strip()) for part in parts))
    except (ValueError, TypeError, AttributeError) as error:
        raise HTTPException(503, detail={"code": "CAMPAIGN_RECIPIENT_RECONCILIATION_REQUIRED"}) from error


def validate_recipient_filter(*, target_type, recipient_filter, session_id_filter=None,
                              room_id_filter=None, recipient_ids=(), stored=False):
    valid = (target_type in FILTERS and recipient_filter in FILTERS[target_type]
        and len(recipient_ids) <= 100
        and ((recipient_filter == "specific_session") == (session_id_filter is not None))
        and ((recipient_filter == "specific_room") == (room_id_filter is not None))
        and ((recipient_filter in EXPLICIT_FILTERS) == bool(recipient_ids)))
    if not valid:
        raise HTTPException(503 if stored else 422, detail={"code":
            "CAMPAIGN_RECIPIENT_RECONCILIATION_REQUIRED" if stored else "INVALID_RECIPIENT_CONFIGURATION"})
