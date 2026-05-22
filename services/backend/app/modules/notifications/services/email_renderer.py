import re
import bleach
from loguru import logger
from premailer import transform

def _strip_html(html: str) -> str:
    """Strip HTML tags to generate a plain text fallback."""
    # Replace common block elements with newlines for better text formatting
    text = re.sub(r'<(br|p|div|h[1-6]|tr|li|/p|/div|/h[1-6]|/tr|/li)[^>]*>', '\n', html, flags=re.IGNORECASE)
    # Strip all remaining tags
    text = re.sub(r'<[^>]+>', '', text)
    # Unescape HTML entities
    text = bleach.clean(text, tags=[], strip=True)
    # Collapse multiple newlines/spaces
    text = re.sub(r'\n\s*\n', '\n\n', text)
    return text.strip()

def render_template(html: str, variables: dict) -> tuple[str, str]:
    """
    Renders an email template by substituting variables
    and inlining CSS for Gmail compatibility.
    
    Returns:
        tuple: (inlined_html, plain_text_fallback)
    """
    # 1. Substitute {{variable}} placeholders
    def _replacer(match: re.Match) -> str:
        key = match.group(1).strip()
        value = variables.get(key, match.group(0))  # leave placeholder if key missing
        return str(value)

    rendered_html = re.sub(r"\{\{(.+?)\}\}", _replacer, html)

    # 2. Generate plain text fallback (before CSS inlining modifies it further)
    plain_text = _strip_html(rendered_html)

    # 3. Inline CSS using premailer
    try:
        inlined_html = transform(rendered_html)
    except Exception as exc:
        logger.error(f"Premailer CSS inlining failed: {exc}. Falling back to original HTML.")
        inlined_html = rendered_html

    return inlined_html, plain_text
