"""Stable operational keys are not mutable display-category slugs.

category_id owns taxonomy. Established category_key codes are consumed by the
registration/abstract/speaker/survey integrations and must survive taxonomy
maintenance. Unknown legacy keys remain category projections for compatibility.
No key or category confers resource authority; callers still verify ownership.
"""

OPERATIONAL_TEMPLATE_KEYS = frozenset({
    "registration", "abstract", "survey", "speaker", "speaker_intake",
    "sponsor", "sponsor_application",
})
# Static, application-owned literals only, shared by bounded SQL maintenance.
OPERATIONAL_KEYS_SQL = "(" + ",".join("'" + key + "'" for key in sorted(OPERATIONAL_TEMPLATE_KEYS)) + ")"


def category_key_matches(key: str, category_slug: str) -> bool:
    return key in OPERATIONAL_TEMPLATE_KEYS or key == category_slug


def reassigned_category_key(key: str, category_slug: str) -> str:
    return key if key in OPERATIONAL_TEMPLATE_KEYS else category_slug
