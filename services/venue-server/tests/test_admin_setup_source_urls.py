from app.routers.admin_setup import _source_context_url, _source_root_url


def test_venue_server_cloud_source_urls_use_sync_contract():
    source = {"source_type": "cloud", "base_url": "https://command.example.com"}

    assert _source_root_url(source["base_url"], source["source_type"]) == "https://command.example.com/api/v1/sync"
    assert _source_context_url(source) == "https://command.example.com/api/v1/sync/device/context"

    saved_bad_source = {"source_type": "cloud", "base_url": "https://command.example.com/api/v1/registration-source"}
    assert _source_root_url(saved_bad_source["base_url"], saved_bad_source["source_type"]) == "https://command.example.com/api/v1/sync"
    assert _source_context_url(saved_bad_source) == "https://command.example.com/api/v1/sync/device/context"


def test_venue_server_registration_source_url_is_legacy_only():
    source = {"source_type": "registration_server", "base_url": "https://registration.example.com"}

    assert _source_root_url(source["base_url"], source["source_type"]) == "https://registration.example.com/api/v1/registration-source"
    assert _source_context_url(source) == "https://registration.example.com/api/v1/registration-source/context"
