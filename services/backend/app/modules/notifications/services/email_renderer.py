"""Context-safe rendering for stored email snapshots."""

from __future__ import annotations

import html
import re
from typing import Any
from urllib.parse import urlparse

import bleach
from loguru import logger
from premailer import transform


REPEATER_REGISTRY: dict[str, tuple[int, frozenset[str]]] = {
    "Speakers": (6, frozenset({"Name", "Title", "ImageUrl"})),
    "AgendaItems": (20, frozenset({"Time", "Title", "Room"})),
    "Sponsors": (12, frozenset({"Name", "LogoUrl"})),
}
REPEATER_PATTERN = re.compile(
    r"\{\{#each\s+([A-Za-z][A-Za-z0-9_]*)\s+limit=(\d+)\s*\}\}(.*?)\{\{/each\}\}",
    re.DOTALL,
)
VARIABLE_PATTERN = re.compile(r"\{\{\s*([A-Za-z][A-Za-z0-9_.]*)\s*\}\}")
URL_FIELD_PATTERN = re.compile(r"(?:Url|URL|Link)$")
BRANDING_MARKER = 'data-eventos-branding="locked"'
DEFAULT_BRANDING_POLICY: dict[str, Any] = {
    "enabled": True,
    "text": "In collaboration with EventOS",
    "icon_url": None,
    "destination_url": None,
    "version": 1,
}


def _strip_html(value: str) -> str:
    text = re.sub(r"<(br|p|div|h[1-6]|tr|li|/p|/div|/h[1-6]|/tr|/li)[^>]*>", "\n", value, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    text = bleach.clean(text, tags=[], strip=True)
    return re.sub(r"\n\s*\n", "\n\n", text).strip()


def _safe_value(key: str, value: Any) -> str:
    rendered = "" if value is None else str(value)
    if URL_FIELD_PATTERN.search(key):
        parsed = urlparse(rendered)
        if parsed.scheme and parsed.scheme.lower() not in {"http", "https", "mailto"}:
            return ""
    return html.escape(rendered, quote=True)


def substitute_registered_context(source: str, variables: dict[str, Any]) -> str:
    """Expand bounded registered collections, then HTML-escape scalar variables."""

    if source.count("{{#each") != source.count("{{/each}}"):
        raise ValueError("Malformed email repeater expression")

    def expand(match: re.Match[str]) -> str:
        collection_name, requested_limit, body = match.groups()
        definition = REPEATER_REGISTRY.get(collection_name)
        if definition is None or "{{#each" in body:
            raise ValueError(f"Unsupported email repeater: {collection_name}")
        maximum, fields = definition
        limit = min(int(requested_limit), maximum)
        rows = variables.get(collection_name, [])
        if not isinstance(rows, list):
            return ""
        rendered_rows: list[str] = []
        for row in rows[:limit]:
            if not isinstance(row, dict):
                continue

            def replace_field(field_match: re.Match[str]) -> str:
                expression = field_match.group(1)
                prefix, separator, field = expression.partition(".")
                if not separator or prefix != collection_name[:-1] or field not in fields:
                    raise ValueError(f"Unsupported repeater field: {expression}")
                return _safe_value(field, row.get(field, ""))

            rendered_rows.append(VARIABLE_PATTERN.sub(replace_field, body))
        return "".join(rendered_rows)

    rendered = REPEATER_PATTERN.sub(expand, source)
    if "{{#each" in rendered or "{{/each}}" in rendered:
        raise ValueError("Unsupported or nested email repeater expression")

    def replace_scalar(match: re.Match[str]) -> str:
        key = match.group(1)
        if "." in key:
            raise ValueError(f"Repeater field outside collection: {key}")
        return _safe_value(key, variables.get(key, match.group(0)))

    return VARIABLE_PATTERN.sub(replace_scalar, rendered)


def apply_eventos_branding(source: str, policy: dict[str, Any] | None = None) -> str:
    """Inject the non-document EventOS mark exactly once.

    The caller may supply the versioned global policy loaded from storage. The
    default is deliberately enabled so a missing policy can never silently
    remove platform branding.
    """

    resolved = {**DEFAULT_BRANDING_POLICY, **(policy or {})}
    if not resolved.get("enabled", True) or BRANDING_MARKER in source:
        return source
    text = html.escape(str(resolved.get("text") or DEFAULT_BRANDING_POLICY["text"]), quote=True)
    destination = str(resolved.get("destination_url") or "").strip()
    if destination and urlparse(destination).scheme.lower() not in {"http", "https"}:
        destination = ""
    icon_url = str(resolved.get("icon_url") or "").strip()
    if icon_url and urlparse(icon_url).scheme.lower() != "https":
        icon_url = ""
    icon = (
        f'<img src="{html.escape(icon_url, quote=True)}" width="22" height="22" alt="EventOS" '
        'style="display:inline-block;vertical-align:middle;border:0;margin:0 8px 0 0" />'
        if icon_url else
        '<span style="display:inline-block;vertical-align:middle;width:22px;height:22px;line-height:22px;'
        'margin-right:8px;border-radius:6px;background:#4f46e5;color:#ffffff;font-weight:700;text-align:center">E</span>'
    )
    contents = f'{icon}<span style="vertical-align:middle">{text}</span>'
    if destination:
        contents = f'<a href="{html.escape(destination, quote=True)}" style="color:#667085;text-decoration:none">{contents}</a>'
    mark = (
        f'<table role="presentation" {BRANDING_MARKER} width="100%" cellspacing="0" cellpadding="0" border="0" '
        'style="width:100%;border-collapse:collapse"><tr><td align="center" '
        'style="padding:18px 12px;border-top:1px solid #eaecf0;color:#667085;font-family:Arial,sans-serif;font-size:11px;line-height:22px">'
        f'{contents}</td></tr></table>'
    )
    body_close = re.search(r"</body\s*>", source, flags=re.I)
    return source[:body_close.start()] + mark + source[body_close.start():] if body_close else source + mark


def render_template(
    source: str,
    variables: dict[str, Any],
    *,
    branding_policy: dict[str, Any] | None = None,
) -> tuple[str, str]:
    """Substitute safe context, inline CSS, and return HTML plus plain text."""

    rendered_html = apply_eventos_branding(
        substitute_registered_context(source, variables), branding_policy
    )
    plain_text = _strip_html(rendered_html)
    try:
        inlined_html = transform(rendered_html)
    except Exception as exc:
        logger.error(f"Premailer CSS inlining failed: {exc}. Falling back to original HTML.")
        inlined_html = rendered_html
    return inlined_html, plain_text
