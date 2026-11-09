"""Upload receipts are not an accounting-data or credential projection."""
from types import SimpleNamespace
import uuid

import pytest

from app.modules.billing.services.usage_reservation_service import UsageReservationService


@pytest.mark.parametrize("prefix", ["registration-upload:", "program-upload:"])
def test_upload_consumption_copies_only_allowlisted_ids(prefix):
    upload_id, reservation_id, event_id = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    private = {"upload_id": str(upload_id), "filename": "private-person-name.pdf",
        "storage_path": "private/object/path", "response": {"capability": "private-bearer"},
        "actor_user_id": str(uuid.uuid4()), "request_fingerprint": "private-request-hash"}
    reservation = SimpleNamespace(id=reservation_id, event_id=event_id,
        metric_key="storage_quota_mb", idempotency_key=prefix + "opaque-key", metadata_json=private)
    projected = UsageReservationService._consumption_metadata(reservation)
    assert projected == {"reservation_id": str(reservation_id), "source_event_id": str(event_id),
        "limit_key": "storage_quota_mb", "upload_id": str(upload_id)}
    assert reservation.metadata_json is private and reservation.metadata_json["response"]["capability"] == "private-bearer"


@pytest.mark.parametrize("invalid_id", [None, "not-a-uuid", {"secret": "must-not-copy"}])
def test_malformed_upload_metadata_is_not_copied_into_accounting(invalid_id):
    row = SimpleNamespace(id=uuid.uuid4(), event_id=None, metric_key="storage_quota_mb",
        idempotency_key="registration-upload:opaque", metadata_json={"upload_id": invalid_id})
    assert set(UsageReservationService._consumption_metadata(row)) == {"reservation_id", "source_event_id", "limit_key"}


def test_non_upload_accounting_metadata_keeps_its_existing_contract():
    row = SimpleNamespace(id=uuid.uuid4(), event_id=None, metric_key="emails_sent",
        idempotency_key="email:opaque", metadata_json={"campaign_id": "campaign", "reason": "Approved capacity"})
    assert UsageReservationService._consumption_metadata(row)["campaign_id"] == "campaign"
