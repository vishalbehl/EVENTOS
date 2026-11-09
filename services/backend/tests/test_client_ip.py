from starlette.requests import Request

from app.core.client_ip import ip_is_allowed, resolve_client_ip
from app.config import settings


def _request(peer: str, headers: list[tuple[bytes, bytes]] | None = None) -> Request:
    return Request({
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": headers or [],
        "client": (peer, 1234),
        "server": ("test", 80),
        "scheme": "http",
        "query_string": b"",
    })


def test_forwarded_header_is_ignored_from_untrusted_peer(monkeypatch):
    monkeypatch.setattr(settings, "TRUSTED_PROXY_CIDRS", [])
    request = _request("198.51.100.4", [(b"x-forwarded-for", b"203.0.113.8")])
    assert resolve_client_ip(request) == "198.51.100.4"


def test_forwarded_header_is_used_from_trusted_proxy(monkeypatch):
    monkeypatch.setattr(settings, "TRUSTED_PROXY_CIDRS", ["10.0.0.0/8"])
    request = _request("10.1.2.3", [(b"x-forwarded-for", b"203.0.113.8, 10.1.2.3")])
    assert resolve_client_ip(request) == "203.0.113.8"


def test_ip_allowlist_supports_exact_addresses_and_cidrs():
    assert ip_is_allowed("203.0.113.8", "203.0.113.8")
    assert ip_is_allowed("203.0.113.8", "203.0.113.0/24")
    assert not ip_is_allowed("198.51.100.2", "203.0.113.0/24")


def test_attacker_prepended_address_cannot_replace_nearest_untrusted_peer(monkeypatch):
    monkeypatch.setattr(settings, "TRUSTED_PROXY_CIDRS", ["10.0.0.0/8"])
    request = _request("10.1.2.3", [(b"x-forwarded-for", b"192.0.2.99, 203.0.113.8, 10.4.5.6")])
    assert resolve_client_ip(request) == "203.0.113.8"


def test_ipv6_trusted_chain(monkeypatch):
    monkeypatch.setattr(settings, "TRUSTED_PROXY_CIDRS", ["fd00::/8"])
    request = _request("fd00::1", [(b"x-forwarded-for", b"2001:db8::a, fd00::2")])
    assert resolve_client_ip(request) == "2001:db8::a"


def test_malformed_chain_fails_to_direct_peer(monkeypatch):
    monkeypatch.setattr(settings, "TRUSTED_PROXY_CIDRS", ["10.0.0.0/8"])
    request = _request("10.1.2.3", [(b"x-forwarded-for", b"203.0.113.8, invalid")])
    assert resolve_client_ip(request) == "10.1.2.3"
