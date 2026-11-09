"""Portable, reference-free configuration projection; no tenant data cloning."""
import re

from fastapi import HTTPException

_COLOR_KEY = re.compile(r"[a-z][a-z0-9_]{0,63}color(?:_[a-z0-9_]{1,32})?\Z")
_HEX = re.compile(r"#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?\Z")
_SENSITIVE_KEY = re.compile(
    r"(?:amount|price|cost|invoice|payment|billing|bank|account|tax|credential|secret|password|token|key|"
    r"email|phone|address|contact|person|user|member|asset|file|url|template|contract)", re.IGNORECASE)
CLONE_PROJECTION_VERSION = 3
CLONE_EXCLUSIONS = (
    "events", "users", "billing_history", "audit_logs", "credentials",
    "api_secrets", "personal_data", "security_policies", "sso_configuration",
    "locations", "contacts", "assets", "templates", "external_references",
    "non_colour_tokens", "published_state",
)


def portable_brand_tokens(tokens: object) -> dict[str, str]:
    # Bounded O(n) projection. Arbitrary strings, nested dictionaries, URLs,
    # CSS expressions, asset IDs and tenant identifiers are never transferred.
    if not isinstance(tokens, dict) or len(tokens) > 100:
        raise HTTPException(409, detail={"code": "CLONE_CONFIGURATION_LIMIT_EXCEEDED"})
    return {
        key: value for key, value in tokens.items()
        if isinstance(key, str) and (_COLOR_KEY.fullmatch(key) or key == "color")
        and not _SENSITIVE_KEY.search(key)
        and isinstance(value, str) and _HEX.fullmatch(value)
    }
