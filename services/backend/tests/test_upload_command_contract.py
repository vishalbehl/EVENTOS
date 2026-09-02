from app.core.idempotency import request_hash


def test_upload_completion_idempotency_payload_is_stable():
    first = {"upload_id": "00000000-0000-0000-0000-000000000001"}
    assert request_hash(first) == request_hash(dict(first))
    assert request_hash(first) != request_hash({"upload_id": "different"})
