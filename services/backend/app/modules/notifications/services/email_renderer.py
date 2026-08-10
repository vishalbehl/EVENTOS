"""Context-safe rendering for stored email snapshots."""

from __future__ import annotations

import html
import re
from typing import Any
from urllib.parse import urlparse

import bleach
from loguru import logger
# pyrefly: ignore [missing-import]
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
        if parsed.scheme and parsed.scheme.lower() not in {"http", "https", "mailto", "data"}:
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
    base64_logo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACwAAAAsCAYAAAAehFoBAAAGv0lEQVR42u2YbVBU5xXHz3nuXRYWUVCBmkqoZDJtrW1eNgZlELwRtbVTUye5fCi2ibFJjG1nqsmMraNeSNS0OCVNmzENmqZqTDuLjE1KJUTjgikFI2t0IAuIgKjLiyxv6y7svfd57umHYqvtJxZkmAz/j3fu3PObc885z/88ANOa1rS+GHK5XBIAABGxqc6KRIC3P5iy0ET0H9Bjrr9uPX78/XPeC95FAABut1ueiBjyBMJKjDFRWlqRhBgu8pyvy2MIEG2PqmppbHni/q/fX0luklFBPp44bKJgEVFkUZa85aebU+rOnc0T3BScC9Pf55/dP9RX3tHWsRYV5OPNNJsAWBkRhefsxRVlgTJvS5v34b2v7l3b39+PaWlpNs4Fv9HbG93a3nq8uaH5aUVRuDYOaHl8zUUSIvLLzW1PzZuffNA0huXASLCYiLba7bGP62HdpeaqMYILfrm1Vers6nrnoudiwgPOB15TVVUqKSkRkwZMRICIvL21/ZepC1L36uEQBYMhAUDWgQMHijIfzPrGocOHskPBYMXGZ3+cIEmMf3bhAnb6fEW1Z2pnZyqZO4mIIaI1GdOAaZomNzVd+j0RUXgkxIcG+sTQYJ/5yisvU1xc/JsAMJMxBgDwzZU5K9uPHD5MBQUvm08+qZpbt75IJX8pKbh9Xt813Wqa6urql0wjTP7ebiMUHBQ3AwN82y+2UVxswl4AAEQEAJBHoVOWpC+5sK9wH72wabORnb1cPLNhY7MsyZPXdGjRt/y9NwRZFo2Ew2zHjnyp+M2DLw2HA9tdLlfU6dOnZSKyLMuSGWPXas/WKkcOHfnE4XDItqgoZnJTv/N4ucs1HAwNG0II1j84KO3aVRAqLS3NA4D3AQByc3ON2161HrIesp3H8wP+3qFtwWDon4wxQECECIgjBp6bOEd0dnXj5p/87Posx9xXiains6VzlcPhEBwA4mfFkyyByH0qt2bhwoXcU+DBRfd9Fe1RUaAbOpimGUmCx14SlZWVAADwt7KypLz1P2p/LCvnj6eqyrePhII1c++dXTFrXtypmDg8FdB7P965e1d59YfVcfn5+QQABCADEYFh6GAYxqRZBjbaUOsL8ve83d/nD7S1NlNTY4N5uaVJ9Pu79UZvPeX9IK8bABYDADidThsAwKqlazKef24TPfyIk9Z+7/F6m2y7+xl2uQiJCD791MPXrfvuM03ez+NMgxMiyrJNZt09N6I0bffVo+8dXcEYOwcALC0tzQIAME0Oum6AYZjATXNyTrrExEoEAGhrvbR21sw44IKbh999zxbWDX3GjFi8cuVqY1nZB+sYw3bLWiYDVHEogdFZa4JpmsC5CdzkkwN8S2HdGJ4hOPh7/bZ3/nT0OV0PfjT6PR8yDFsWSQBVd1BZksRM0wDOOZgiMuDIzQ8RGroByBisWrOyXpalDklirYgYJosYAIj/3UB6unqGDeO/WYbJnBKGbsDNm0GItkdDgiMhiXMBO3bsjB418Xf4g5y3clhubq5IT1/8qD06CnRdB8uiyS0JYZowGA5RgsTEho0//F2eur5n9fcfO+smt6ygcut/o9vtlhRFMcs/qHg+zEfeKPptEReCy5YQFMnBEXFJhIZHEBHRd/268PmupsbES6frPY1PKKhwt9stExESESqKwitPndlui5H+UHywmHV0dCAiWrJskyxLAIyROhJgCwiw0v2PQz3dvcN2u93ecaXDPP9ZnaN3wHesvaX9RUVReElJCUNE6xN39W8s5Ht+va9QtFxqIYsEpaXdx6Idse8KS4CqqmNiGLO1q6qqIg00duDtt674+4Y+/lJS8uqEOQkJAwMDps93DWMcMat3a3uSMpZllC/PXP6aaelbflVYyH0+HzOFSV9JXSDHxszMP3myfLemaWz//v1j8sMYaUnctjGkbHr2hWOpC1IeDQSGTAKAjIwMGwq2z33GveLq9WsPNjU2Wtzi7Mv3zGeyZP95RcXfX49044jYPHu9XlJVVWps9A7Weer+nDgn6WvJycmLTMPgXd2d6PN1hhs+b2D9A30pwVAQU+bfi4Ty0yc/OlGcnZ0tnzhxQkQSd1xu3+v1EgAwxtCob6h3xTri4hMTEzMBLAyGhut7urujw0Y4de6cRJ2Hmep2f+hyOp22mpqaiFf9ibiXsCzr3xMBEbcEBgPtS5Yufp2EmCnImn3PvPnDPp9/TW1tZZXT6bR5PB4TpohQ0zQZACD9kfQN3875TmG6M/2NpYuXZQEAZGdnyzAVparq/5WZpmlT+0JQVVWJiFDTNDblYac1rWlNa1pj0r8A5uOJa1Tv3q0AAAAASUVORK5CYII="
    
    icon = (
        f'<img src="{html.escape(icon_url, quote=True)}" width="22" height="22" alt="EventOS" '
        'style="display:inline-block;vertical-align:middle;border:0;margin:0 8px 0 0" />'
        if icon_url else
        f'<img src="{base64_logo}" width="26" height="26" alt="EventOS" '
        'style="display:inline-block;vertical-align:middle;border:0;margin:0 8px 0 0" />'
    )
    contents = f'{icon}<span style="vertical-align:middle">{text}</span>'
    if destination:
        contents = f'<a href="{html.escape(destination, quote=True)}" style="color:#667085;text-decoration:none">{contents}</a>'
    mark = (
        f'<table role="presentation" {BRANDING_MARKER} width="100%" cellspacing="0" cellpadding="0" border="0" '
        'style="width:100%;border-collapse:collapse;margin:16px 0 0 0;background-color:transparent"><tr><td align="center" style="padding:0;background-color:transparent">'
        '<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto;background-color:transparent"><tr><td align="center" '
        'style="padding:8px 16px;border:0;color:#667085;font-family:Arial,sans-serif;font-size:11px;line-height:22px;background-color:transparent">'
        f'{contents}</td></tr></table></td></tr></table>'
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
