"""Publish typed Event-plan feature entitlements.

Revision ID: 20261109_3730
Revises: 20261106_3720

Every fresh database already receives the pricing catalogue from the earlier
catalogue migrations. This revision publishes a new immutable version for each
Event plan with the operational feature bundle that checkout must grant after
verified settlement. Existing contracts retain their original version and are
covered by the matching code-owned compatibility bundle.
"""

from __future__ import annotations

import json
import uuid
from typing import Any

from alembic import op
import sqlalchemy as sa

revision = "20261109_3730"
down_revision = "20261106_3720"
branch_labels = None
depends_on = None


IDEMPOTENCY_PREFIX = "catalogue:event-plan-features:v1:"
CHANGE_REASON = "Publish typed operational features for settled Event plans"

# Keep migration data immutable. Runtime uses the matching mapping in
# plan_feature_bundles.py for contracts purchased before these versions exist.
_BASE = {
    "FEAT_EVENT_PLANNING": True,
    "FEAT_FILE_UPLOADS": True,
    "FEAT_SESSION_MANAGEMENT": True,
    "FEAT_COMMUNICATION_CENTER": True,
    "FEAT_DEFAULT_THEME": True,
    "FEAT_BADGE_TEMPLATES": 1,
    "FEAT_CERTIFICATE_TEMPLATES": 1,
    "FEAT_DATA_EXPORTS": True,
}
EVENT_PLAN_FEATURE_BUNDLES: dict[str, dict[str, Any]] = {
    "EVENT_BASIC": {
        **_BASE,
        "FEAT_EVENT_WEBSITE": "BASIC",
        "FEAT_REGISTRATION_PORTAL": "BASIC",
        "FEAT_REGISTRATION_FORMS": "STANDARD",
        "FEAT_SPEAKER_PORTAL": "PARTIAL",
        "FEAT_SPEAKER_PROFILES": "BASIC",
        "FEAT_ABSTRACT_SUBMISSION": "BASIC",
        "FEAT_SPEAKER_DASHBOARD": "BASIC",
        "FEAT_EMAIL_NOTIFICATIONS": 2500,
        "FEAT_ATTENDEE_CHECKIN": "BASIC",
    },
    "EVENT_PROFESSIONAL": {
        **_BASE,
        "FEAT_EVENT_WEBSITE": "CUSTOMIZABLE",
        "FEAT_REGISTRATION_PORTAL": "ADVANCED",
        "FEAT_REGISTRATION_FORMS": "CUSTOM",
        "FEAT_SPEAKER_PORTAL": "FULL",
        "FEAT_SPEAKER_PROFILES": "CUSTOMIZABLE",
        "FEAT_ABSTRACT_SUBMISSION": "ADVANCED",
        "FEAT_PRESENTATION_VALIDATION": "BASIC",
        "FEAT_SPEAKER_DASHBOARD": "ADVANCED",
        "FEAT_THEME_CUSTOMIZATION": True,
        "FEAT_CUSTOM_COLORS": True,
        "FEAT_EMAIL_NOTIFICATIONS": 10000,
        "FEAT_ATTENDEE_CHECKIN": "ADVANCED",
    },
    "EVENT_PRO": {
        **_BASE,
        "FEAT_EVENT_WEBSITE": "FULLY_BRANDED",
        "FEAT_REGISTRATION_PORTAL": "ENTERPRISE",
        "FEAT_REGISTRATION_FORMS": "CUSTOM",
        "FEAT_SPEAKER_PORTAL": "FULL",
        "FEAT_SPEAKER_PROFILES": "FULLY_CUSTOM",
        "FEAT_ABSTRACT_SUBMISSION": "ADVANCED",
        "FEAT_PRESENTATION_VALIDATION": "ADVANCED",
        "FEAT_SPEAKER_DASHBOARD": "ADVANCED",
        "FEAT_THEME_CUSTOMIZATION": True,
        "FEAT_CUSTOM_COLORS": True,
        "FEAT_EMAIL_NOTIFICATIONS": 30000,
        "FEAT_ATTENDEE_CHECKIN": "ENTERPRISE",
    },
}


def _value_type(value: Any) -> str:
    if isinstance(value, bool):
        return "BOOLEAN"
    if isinstance(value, str):
        return "TIER"
    return "LIMIT"


def _publish_bundle(bind: sa.Connection, code: str, features: dict[str, Any]) -> None:
    now = bind.scalar(sa.text("SELECT clock_timestamp()"))
    offer_id = bind.scalar(
        sa.text("SELECT id FROM commerce.plans WHERE code = :code FOR UPDATE"),
        {"code": code},
    )
    if offer_id is None:
        raise RuntimeError(f"Required Event plan {code} is missing")

    idempotency_key = f"{IDEMPOTENCY_PREFIX}{code.lower()}"
    if bind.scalar(
        sa.text(
            "SELECT EXISTS (SELECT 1 FROM commerce.plan_versions "
            "WHERE offer_id = :offer_id AND idempotency_key = :key)"
        ),
        {"offer_id": offer_id, "key": idempotency_key},
    ):
        return

    current = bind.execute(
        sa.text(
            """
            SELECT id
            FROM commerce.plan_versions
            WHERE offer_id = :offer_id
              AND version_status = 'PUBLISHED'
              AND effective_from <= :now
              AND (effective_until IS NULL OR effective_until > :now)
            ORDER BY effective_from DESC, version_number DESC
            LIMIT 1
            FOR UPDATE
            """
        ),
        {"offer_id": offer_id, "now": now},
    ).mappings().one_or_none()
    if current is None:
        raise RuntimeError(f"Published catalogue version for {code} is missing")

    next_number = bind.scalar(
        sa.text(
            "SELECT COALESCE(MAX(version_number), 0) + 1 "
            "FROM commerce.plan_versions WHERE offer_id = :offer_id"
        ),
        {"offer_id": offer_id},
    )
    target_id = uuid.uuid4()
    bind.execute(
        sa.text(
            "UPDATE commerce.plan_versions SET effective_until = :now WHERE id = :id"
        ),
        {"now": now, "id": current["id"]},
    )
    copied = bind.execute(
        sa.text(
            """
            INSERT INTO commerce.plan_versions
                (id, offer_id, version_number, effective_from, effective_until,
                 version_status, change_reason, created_by, published_at,
                 idempotency_key, eligible_addon_codes, created_at)
            SELECT :target_id, offer_id, :version_number, :now, NULL,
                   'PUBLISHED', :reason, created_by, :now,
                   :idempotency_key, eligible_addon_codes, :now
            FROM commerce.plan_versions
            WHERE id = :source_id
            """
        ),
        {
            "target_id": target_id,
            "version_number": next_number,
            "now": now,
            "reason": CHANGE_REASON,
            "idempotency_key": idempotency_key,
            "source_id": current["id"],
        },
    )
    if copied.rowcount != 1:
        raise RuntimeError(f"Could not copy the published version for {code}")

    bind.execute(
        sa.text(
            """
            INSERT INTO commerce.plan_prices
                (id, offer_version_id, billing_interval, pricing_unit, amount,
                 currency, tax_mode, minimum_quantity, maximum_quantity, created_at)
            SELECT gen_random_uuid(), :target_id, billing_interval, pricing_unit,
                   amount, currency, tax_mode, minimum_quantity, maximum_quantity, :now
            FROM commerce.plan_prices
            WHERE offer_version_id = :source_id
            """
        ),
        {"target_id": target_id, "source_id": current["id"], "now": now},
    )
    bind.execute(
        sa.text(
            """
            INSERT INTO commerce.plan_entitlements
                (id, offer_version_id, entitlement_key, scope_type, value_type,
                 quantity, unit_type, consumption_model, hard_ceiling, metadata_json)
            SELECT gen_random_uuid(), :target_id, entitlement_key, scope_type,
                   value_type, quantity, unit_type, consumption_model,
                   hard_ceiling, metadata_json
            FROM commerce.plan_entitlements
            WHERE offer_version_id = :source_id
            """
        ),
        {"target_id": target_id, "source_id": current["id"]},
    )

    for key, value in features.items():
        bind.execute(
            sa.text(
                """
                INSERT INTO commerce.plan_entitlements
                    (id, offer_version_id, entitlement_key, scope_type,
                     value_type, quantity, unit_type, consumption_model,
                     hard_ceiling, metadata_json)
                VALUES
                    (gen_random_uuid(), :version_id, :key, 'EVENT',
                     :value_type, NULL, NULL, 'FEATURE', false,
                     CAST(:metadata AS jsonb))
                """
            ),
            {
                "version_id": target_id,
                "key": key,
                "value_type": _value_type(value),
                "metadata": json.dumps({"value": value}),
            },
        )


def upgrade() -> None:
    bind = op.get_bind()
    for code, features in EVENT_PLAN_FEATURE_BUNDLES.items():
        _publish_bundle(bind, code, features)


def downgrade() -> None:
    bind = op.get_bind()
    for code in EVENT_PLAN_FEATURE_BUNDLES:
        key = f"{IDEMPOTENCY_PREFIX}{code.lower()}"
        row = bind.execute(
            sa.text(
                """
                SELECT version.id, version.offer_id
                FROM commerce.plan_versions version
                JOIN commerce.plans plan ON plan.id = version.offer_id
                WHERE plan.code = :code AND version.idempotency_key = :key
                FOR UPDATE
                """
            ),
            {"code": code, "key": key},
        ).mappings().one_or_none()
        if row is None:
            continue
        if bind.scalar(
            sa.text(
                "SELECT EXISTS (SELECT 1 FROM commerce.contract_items "
                "WHERE offer_version_id = :version_id)"
            ),
            {"version_id": row["id"]},
        ):
            raise RuntimeError(
                f"Cannot remove {code} feature version because commercial history references it"
            )
        bind.execute(
            sa.text("DELETE FROM commerce.plan_versions WHERE id = :id"),
            {"id": row["id"]},
        )
        bind.execute(
            sa.text(
                """
                UPDATE commerce.plan_versions
                SET effective_until = NULL
                WHERE id = (
                    SELECT id FROM commerce.plan_versions
                    WHERE offer_id = :offer_id AND version_status = 'PUBLISHED'
                    ORDER BY effective_from DESC, version_number DESC LIMIT 1
                )
                """
            ),
            {"offer_id": row["offer_id"]},
        )

