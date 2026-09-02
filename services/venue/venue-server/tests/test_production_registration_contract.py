import uuid
from datetime import datetime, timezone

from app.models.registration_source_key import RegistrationSourceApiKey
from app.routers.operational_control import observed_state
from app.routers.source_sync import DEFAULT_SCOPES, _hash_api_key, _key_response


def test_registration_key_is_hash_only_and_secret_is_not_serialized():
    raw_key = "regsrc_test-secret-value"
    key = RegistrationSourceApiKey(
        id=uuid.uuid4(),
        event_id=uuid.uuid4(),
        organization_id=uuid.uuid4(),
        name="Registration A",
        key_prefix=raw_key[:16],
        key_hash=_hash_api_key(raw_key),
        scopes=list(DEFAULT_SCOPES),
        allowed_cidrs=[],
        permissions={"read": True, "push": True},
        created_at=datetime.now(timezone.utc),
    )

    response = _key_response(key)

    assert key.key_hash != raw_key
    assert "api_key" not in response
    assert response["api_key_recoverable"] is False
    assert response["scopes"] == DEFAULT_SCOPES


def test_operational_state_never_claims_health_without_evidence():
    assert observed_state(None, "healthy") == "not_configured"
    assert observed_state(None, "unknown") == "not_configured"
