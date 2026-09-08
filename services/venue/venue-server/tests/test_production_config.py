import pytest

from app.config import VenueSettings


def _production(**overrides):
    values = {
        "DEPLOYMENT_PROFILE": "production",
        "HOST": "127.0.0.1",
        "VENUE_AUTH_KEY": "a" * 32,
        "VENUE_AUTH_SECRET": "b" * 48,
        "CLOUD_API_URL": "https://cloud.example.test",
        "CLOUD_API_KEY": "rotated-cloud-secret",
        "CLOUD_DEVICE_KEY": "c" * 40,
        "PUBLIC_BASE_URL": "https://venue.example.test",
        "CORS_ORIGINS": "https://venue.example.test",
        "VENUE_BOOTSTRAP_ADMIN_PASSWORD": "rotated-admin-password",
    }
    values.update(overrides)
    return VenueSettings(_env_file=None, **values)


def test_production_configuration_accepts_loopback_api_and_https_gateway():
    assert _production().DEPLOYMENT_PROFILE == "production"


def test_production_configuration_requires_cloud_device_key_for_cloud_sync():
    with pytest.raises(ValueError, match="CLOUD_DEVICE_KEY must be provisioned"):
        _production(CLOUD_DEVICE_KEY="")


@pytest.mark.parametrize(
    "override, message",
    [
        ({"VENUE_AUTH_KEY": "dev_venue_auth_key_1234567890123456"}, "VENUE_AUTH_KEY"),
        ({"VENUE_AUTH_SECRET": "dev_venue_auth_secret_longer_than_32_characters_123456"}, "VENUE_AUTH_SECRET"),
        ({"VENUE_BOOTSTRAP_ADMIN_PASSWORD": "admin123"}, "VENUE_BOOTSTRAP_ADMIN_PASSWORD"),
    ],
)
def test_production_configuration_rejects_built_in_credentials(override, message):
    with pytest.raises(ValueError, match=message):
        _production(**override)


def test_access_tokens_are_short_lived_and_bounded():
    assert _production().VENUE_ACCESS_TOKEN_MINUTES == 30
    with pytest.raises(ValueError, match="VENUE_ACCESS_TOKEN_MINUTES"):
        _production(VENUE_ACCESS_TOKEN_MINUTES=480)


@pytest.mark.parametrize(
    "override",
    [
        {"PUBLIC_BASE_URL": "http://venue.example.test"},
        {"CLOUD_API_URL": "http://cloud.example.test"},
        {"CORS_ORIGINS": "*"},
        {"HOST": "0.0.0.0"},
        {"CONTENT_STORAGE_BACKEND": "minio"},
    ],
)
def test_production_configuration_rejects_unsafe_values(override):
    with pytest.raises(ValueError, match="Unsafe production venue-server configuration"):
        _production(**override)
