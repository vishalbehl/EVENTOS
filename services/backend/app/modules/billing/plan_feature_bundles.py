"""Code-owned compatibility bundles for the seeded Event plans.

The catalogue stores these values on every newly published Event-plan version.
The same mapping is retained in code so contracts purchased against an older
catalogue version keep the feature set that was implicit when they were sold.
"""

from __future__ import annotations

from typing import Any


EVENT_PLAN_FEATURE_BUNDLES: dict[str, dict[str, Any]] = {
    "EVENT_BASIC": {
        "FEAT_EVENT_PLANNING": True,
        "FEAT_EVENT_WEBSITE": "BASIC",
        "FEAT_REGISTRATION_PORTAL": "BASIC",
        "FEAT_REGISTRATION_FORMS": "STANDARD",
        "FEAT_SPEAKER_PORTAL": "PARTIAL",
        "FEAT_SPEAKER_PROFILES": "BASIC",
        "FEAT_ABSTRACT_SUBMISSION": "BASIC",
        "FEAT_FILE_UPLOADS": True,
        "FEAT_SPEAKER_DASHBOARD": "BASIC",
        "FEAT_SESSION_MANAGEMENT": True,
        "FEAT_COMMUNICATION_CENTER": True,
        "FEAT_DEFAULT_THEME": True,
        "FEAT_BADGE_TEMPLATES": 1,
        "FEAT_CERTIFICATE_TEMPLATES": 1,
        "FEAT_EMAIL_NOTIFICATIONS": 2500,
        "FEAT_ATTENDEE_CHECKIN": "BASIC",
        "FEAT_DATA_EXPORTS": True,
    },
    "EVENT_PROFESSIONAL": {
        "FEAT_EVENT_PLANNING": True,
        "FEAT_EVENT_WEBSITE": "CUSTOMIZABLE",
        "FEAT_REGISTRATION_PORTAL": "ADVANCED",
        "FEAT_REGISTRATION_FORMS": "CUSTOM",
        "FEAT_SPEAKER_PORTAL": "FULL",
        "FEAT_SPEAKER_PROFILES": "CUSTOMIZABLE",
        "FEAT_ABSTRACT_SUBMISSION": "ADVANCED",
        "FEAT_FILE_UPLOADS": True,
        "FEAT_PRESENTATION_VALIDATION": "BASIC",
        "FEAT_SPEAKER_DASHBOARD": "ADVANCED",
        "FEAT_SESSION_MANAGEMENT": True,
        "FEAT_COMMUNICATION_CENTER": True,
        "FEAT_DEFAULT_THEME": True,
        "FEAT_THEME_CUSTOMIZATION": True,
        "FEAT_CUSTOM_COLORS": True,
        "FEAT_BADGE_TEMPLATES": 1,
        "FEAT_CERTIFICATE_TEMPLATES": 1,
        "FEAT_EMAIL_NOTIFICATIONS": 10000,
        "FEAT_ATTENDEE_CHECKIN": "ADVANCED",
        "FEAT_DATA_EXPORTS": True,
    },
    "EVENT_PRO": {
        "FEAT_EVENT_PLANNING": True,
        "FEAT_EVENT_WEBSITE": "FULLY_BRANDED",
        "FEAT_REGISTRATION_PORTAL": "ENTERPRISE",
        "FEAT_REGISTRATION_FORMS": "CUSTOM",
        "FEAT_SPEAKER_PORTAL": "FULL",
        "FEAT_SPEAKER_PROFILES": "FULLY_CUSTOM",
        "FEAT_ABSTRACT_SUBMISSION": "ADVANCED",
        "FEAT_FILE_UPLOADS": True,
        "FEAT_PRESENTATION_VALIDATION": "ADVANCED",
        "FEAT_SPEAKER_DASHBOARD": "ADVANCED",
        "FEAT_SESSION_MANAGEMENT": True,
        "FEAT_COMMUNICATION_CENTER": True,
        "FEAT_DEFAULT_THEME": True,
        "FEAT_THEME_CUSTOMIZATION": True,
        "FEAT_CUSTOM_COLORS": True,
        "FEAT_BADGE_TEMPLATES": 1,
        "FEAT_CERTIFICATE_TEMPLATES": 1,
        "FEAT_EMAIL_NOTIFICATIONS": 30000,
        "FEAT_ATTENDEE_CHECKIN": "ENTERPRISE",
        "FEAT_DATA_EXPORTS": True,
    },
}


def typed_feature_value(value: Any) -> dict[str, Any]:
    if isinstance(value, bool):
        value_type = "BOOLEAN"
    elif isinstance(value, str):
        value_type = "TIER"
    else:
        value_type = "LIMIT"
    return {"type": value_type, "value": value}

