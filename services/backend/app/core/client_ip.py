from __future__ import annotations

import ipaddress
from typing import Iterable

from fastapi import Request

from app.config import settings


def _in_networks(value: str, networks: Iterable[str]) -> bool:
    try:
        address = ipaddress.ip_address(value)
    except ValueError:
        return False
    for item in networks:
        try:
            if address in ipaddress.ip_network(item, strict=False):
                return True
        except ValueError:
            continue
    return False


def resolve_client_ip(request: Request) -> str | None:
    """Honor forwarding headers only when the direct peer is a configured proxy."""
    peer = request.client.host if request.client else None
    if not peer or not _in_networks(peer, settings.TRUSTED_PROXY_CIDRS):
        return peer

    forwarded = request.headers.get("forwarded", "")
    if forwarded:
        first = forwarded.split(",", 1)[0]
        for part in first.split(";"):
            key, _, value = part.strip().partition("=")
            if key.lower() == "for":
                candidate = value.strip('"[]')
                try:
                    return str(ipaddress.ip_address(candidate))
                except ValueError:
                    break

    chain = [item.strip() for item in request.headers.get("x-forwarded-for", "").split(",") if item.strip()]
    for candidate in chain:
        try:
            return str(ipaddress.ip_address(candidate))
        except ValueError:
            continue
    return peer


def ip_is_allowed(client_ip: str | None, allowed_ips: str | None) -> bool:
    if not allowed_ips:
        return True
    if not client_ip:
        return False
    try:
        address = ipaddress.ip_address(client_ip)
    except ValueError:
        return False
    for item in allowed_ips.replace(",", " ").split():
        try:
            if address in ipaddress.ip_network(item, strict=False):
                return True
        except ValueError:
            continue
    return False
