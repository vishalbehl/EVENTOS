"""Bounded operational settings catalogue; credentials use dedicated commands."""
from __future__ import annotations
import math

REGISTRATION_FIELDS = frozenset({
    "enabled", "registration_allowed", "participants_list_allowed", "registration_cutoff_date",
    "edit_cutoff_days", "edit_cutoff_date", "tagline", "description", "auto_approve_paid",
    "auto_approve_free", "single_reg_per_email", "require_otp_verification", "support_email",
    "support_phone", "additional_contacts", "terms_and_conditions", "include_default_faqs",
    "faqs", "send_email_confirmation", "send_whatsapp_alerts", "confirmation_message",
    "program_url", "speaker_guidelines_url", "presentation_template_url", "disabled_categories",
    "badge_design", "tier_cutoffs", "theme_config", "theme_preset", "primary_color",
    "secondary_color", "bg_mode", "svg_pattern", "bg_image_url", "bg_blur",
    "bg_overlay_opacity", "bg_solid_color", "dark_mode_default", "stats",
})
BRANDING_FIELDS = frozenset({
    "theme_color", "logo_url", "banner_url", "header_images", "favicon_url", "footer_terms",
    "footer_support_email", "footer_support_phone", "footer_support_emails", "footer_support_phones",
    "footer_websites", "footer_locations", "footer_show_logo", "theme", "font_family",
    "primary_color", "secondary_color",
})
SPEAKER_FIELDS = frozenset({
    "enabled", "window_required", "branding", "terms_and_conditions", "faqs",
    "include_default_faqs", "profile_settings",
})
NESTED_FIELDS = {
    "badge_design": frozenset({"use_same_design_for_all_users", "default_template_id", "role_template_assignments"}),
    "theme_config": frozenset({"preset", "primary_color", "secondary_color", "dark_mode_default",
        "bg_mode", "svg_pattern", "bg_image_url", "bg_blur", "bg_overlay_opacity", "bg_solid_color"}),
    "profile_settings": frozenset({"enabled_methods", "template_url", "template_filename"}),
    "branding": BRANDING_FIELDS,
}
ITEM_FIELDS = {
    "faqs": frozenset({"q", "a", "is_default"}),
    "additional_contacts": frozenset({"id", "type", "value", "label"}),
    "stats": frozenset({"label", "icon"}),
}


def validate_settings(value: object, fields: frozenset[str]) -> object:
    if not isinstance(value, dict) or set(value) - fields:
        raise ValueError("Unsupported operational settings fields; use the dedicated command for financial/security changes.")
    for key, allowed in NESTED_FIELDS.items():
        if key in value and value[key] is not None:
            nested = value[key]
            if not isinstance(nested, dict) or set(nested) - allowed:
                raise ValueError(f"Unsupported {key} fields.")
    for key, allowed in ITEM_FIELDS.items():
        if key not in value:
            continue
        items = value[key]
        if (not isinstance(items, list) or len(items) > 100 or
                any(not isinstance(item, dict) or set(item) - allowed for item in items)):
            raise ValueError(f"Unsupported {key} items.")
        for item in items:
            if any(type(field) is not str for name, field in item.items() if name != "is_default"):
                raise ValueError(f"Invalid {key} text.")
            if "is_default" in item and type(item["is_default"]) is not bool:
                raise ValueError("FAQ default flag must be boolean.")
    profile = value.get("profile_settings") or {}
    if isinstance(profile, dict) and "enabled_methods" in profile:
        methods = profile["enabled_methods"]
        if (not isinstance(methods, dict) or set(methods) - {"form", "template", "cv"}
                or any(type(flag) is not bool for flag in methods.values())):
            raise ValueError("Unsupported speaker profile methods.")
    # Iterative O(n), bounded allocation and depth. No caller-controlled recursion.
    pending = [(value, 0)]
    visited = 0
    while pending:
        item, depth = pending.pop()
        visited += 1
        if visited > 6000 or depth > 8:
            raise ValueError("Settings structure exceeds its configured bounds.")
        if isinstance(item, dict):
            if len(item) > 100 or any(not isinstance(k, str) or len(k) > 255 for k in item):
                raise ValueError("Settings object exceeds its configured bounds.")
            pending.extend((v, depth + 1) for v in item.values())
        elif isinstance(item, list):
            if len(item) > 100:
                raise ValueError("Settings array exceeds its configured bounds.")
            pending.extend((v, depth + 1) for v in item)
        elif isinstance(item, str):
            if len(item) > 65536:
                raise ValueError("Settings text exceeds its configured bounds.")
        elif item is not None and type(item) not in {bool, int, float}:
            raise ValueError("Settings must contain JSON values only.")
        elif type(item) is float and not math.isfinite(item):
            raise ValueError("Settings numbers must be finite.")
    return value


def public_settings(value: dict, fields: frozenset[str]) -> dict:
    """Allowlisted read projection, including legacy records with private keys."""
    # Gateway identity/enabled state is public operational metadata, not a
    # credential or a general event-mutation input.
    read_fields = fields | {"payment_enabled", "active_gateway", "offline_instructions"} if fields is REGISTRATION_FIELDS else fields
    projected = {key: item for key, item in value.items() if key in read_fields}
    for key, allowed in NESTED_FIELDS.items():
        if isinstance(projected.get(key), dict):
            projected[key] = {name: item for name, item in projected[key].items() if name in allowed}
    for key, allowed in ITEM_FIELDS.items():
        if isinstance(projected.get(key), list):
            projected[key] = [{name: field for name, field in item.items()
                if name in allowed and (type(field) is bool if name == "is_default" else isinstance(field, str))}
                for item in projected[key][:100] if isinstance(item, dict)]
    return projected


def merge_settings(current: dict, patch: dict) -> dict:
    merged = dict(current)
    for key, value in patch.items():
        if key in NESTED_FIELDS and isinstance(value, dict):
            merged[key] = {**(current.get(key) if isinstance(current.get(key), dict) else {}), **value}
        else:
            merged[key] = value
    return merged
