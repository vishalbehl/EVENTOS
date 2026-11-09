"""Correct Venue catalogue presentation and technician-day pricing.

Revision ID: 20261106_3720
Revises: 20261105_3710

The per-event Venue plans already exist as canonical VENUE offers. This
revision corrects the onsite technician price unit without rewriting the
published version referenced by existing contracts. A new effective-dated
version becomes authoritative while historical contract snapshots retain the
previous version.
"""

from __future__ import annotations

import uuid

from alembic import op
import sqlalchemy as sa


revision = "20261106_3720"
down_revision = "20261105_3710"
branch_labels = None
depends_on = None


TECHNICIAN_CODE = "VENUE_TECHNICIAN_SETUP_DAY"
CHANGE_REASON = "Correct onsite technician pricing to per setup day per technician"


def ensure_catalogue_corrections(bind: sa.Connection) -> None:
    """Publish the corrected technician unit once, preserving version history."""

    now = bind.scalar(sa.text("SELECT clock_timestamp()"))
    offer = bind.execute(
        sa.text(
            """
            SELECT id
            FROM commerce.plans
            WHERE code = :code
            FOR UPDATE
            """
        ),
        {"code": TECHNICIAN_CODE},
    ).mappings().one_or_none()
    if offer is None:
        raise RuntimeError(f"Required catalogue offer {TECHNICIAN_CODE} is missing")

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
        {"offer_id": offer["id"], "now": now},
    ).mappings().one_or_none()
    if current is None:
        raise RuntimeError(f"Published catalogue version for {TECHNICIAN_CODE} is missing")

    description_result = bind.execute(
        sa.text(
            """
            UPDATE commerce.plans
            SET description = :description,
                updated_at = :now
            WHERE id = :offer_id
            """
        ),
        {
            "offer_id": offer["id"],
            "now": now,
            "description": (
                "Onsite setup technician charged per setup day per technician; "
                "travel and outstation costs are separate."
            ),
        },
    )
    if description_result.rowcount != 1:
        raise RuntimeError(
            f"Expected one catalogue offer for {TECHNICIAN_CODE}; "
            f"updated {description_result.rowcount}"
        )
    if bind.scalar(
        sa.text(
            """
            SELECT EXISTS (
                SELECT 1
                FROM commerce.plan_versions
                WHERE offer_id = :offer_id
                  AND idempotency_key = 'catalogue:venue-technician-day:v1'
            )
            """
        ),
        {"offer_id": offer["id"]},
    ):
        return
    corrected = bind.scalar(
        sa.text(
            """
            SELECT EXISTS (
                SELECT 1
                FROM commerce.plan_prices price
                JOIN commerce.plan_entitlements entitlement
                  ON entitlement.offer_version_id = price.offer_version_id
                WHERE price.offer_version_id = :version_id
                  AND price.billing_interval = 'ONE_TIME'
                  AND price.pricing_unit = 'TECHNICIAN_DAY'
                  AND price.amount = 10000
                  AND entitlement.entitlement_key = 'venue_technician_days'
                  AND entitlement.unit_type = 'technician_days'
            )
            """
        ),
        {"version_id": current["id"]},
    )
    if corrected:
        return

    next_version = bind.scalar(
        sa.text(
            """
            SELECT COALESCE(MAX(version_number), 0) + 1
            FROM commerce.plan_versions
            WHERE offer_id = :offer_id
            """
        ),
        {"offer_id": offer["id"]},
    )
    version_id = uuid.uuid4()

    close_result = bind.execute(
        sa.text(
            """
            UPDATE commerce.plan_versions
            SET effective_until = :now
            WHERE id = :version_id
            """
        ),
        {"version_id": current["id"], "now": now},
    )
    if close_result.rowcount != 1:
        raise RuntimeError(
            f"Expected one active version for {TECHNICIAN_CODE}; "
            f"closed {close_result.rowcount}"
        )
    version_result = bind.execute(
        sa.text(
            """
            INSERT INTO commerce.plan_versions
                (id, offer_id, version_number, effective_from, effective_until,
                 version_status, change_reason, published_at, idempotency_key,
                 eligible_addon_codes, created_at)
            SELECT :id, offer_id, :version_number, :now, NULL,
                   'PUBLISHED', :change_reason, :now, :idempotency_key,
                   eligible_addon_codes, :now
            FROM commerce.plan_versions
            WHERE id = :source_version
            """
        ),
        {
            "id": version_id,
            "version_number": next_version,
            "now": now,
            "change_reason": CHANGE_REASON,
            "idempotency_key": "catalogue:venue-technician-day:v1",
            "source_version": current["id"],
        },
    )
    if version_result.rowcount != 1:
        raise RuntimeError(
            f"Expected one source version for {TECHNICIAN_CODE}; "
            f"copied {version_result.rowcount}"
        )
    price_result = bind.execute(
        sa.text(
            """
            INSERT INTO commerce.plan_prices
                (id, offer_version_id, billing_interval, pricing_unit, amount,
                 currency, tax_mode, minimum_quantity, maximum_quantity,
                 created_at)
            SELECT gen_random_uuid(), :target_version, billing_interval,
                   'TECHNICIAN_DAY', 10000, currency, tax_mode, 1, 100,
                   :now
            FROM commerce.plan_prices
            WHERE offer_version_id = :source_version
              AND billing_interval = 'ONE_TIME'
            """
        ),
        {
            "target_version": version_id,
            "source_version": current["id"],
            "now": now,
        },
    )
    if price_result.rowcount != 1:
        raise RuntimeError(
            f"Expected one ONE_TIME price for {TECHNICIAN_CODE}; "
            f"found {price_result.rowcount}"
        )
    entitlement_result = bind.execute(
        sa.text(
            """
            INSERT INTO commerce.plan_entitlements
                (id, offer_version_id, entitlement_key, scope_type, value_type,
                 quantity, unit_type, consumption_model, hard_ceiling,
                 metadata_json)
            SELECT gen_random_uuid(), :target_version, entitlement_key,
                   scope_type, value_type, quantity,
                   CASE
                       WHEN entitlement_key = 'venue_technician_days'
                       THEN 'technician_days'
                       ELSE unit_type
                   END,
                   consumption_model, hard_ceiling, metadata_json
            FROM commerce.plan_entitlements
            WHERE offer_version_id = :source_version
            """
        ),
        {
            "target_version": version_id,
            "source_version": current["id"],
        },
    )
    if entitlement_result.rowcount < 1:
        raise RuntimeError(
            f"Expected entitlements for {TECHNICIAN_CODE}; "
            f"copied {entitlement_result.rowcount}"
        )


def upgrade() -> None:
    ensure_catalogue_corrections(op.get_bind())


def downgrade() -> None:
    bind = op.get_bind()
    corrected = bind.execute(
        sa.text(
            """
            SELECT version.id, version.offer_id
            FROM commerce.plan_versions version
            JOIN commerce.plans plan ON plan.id = version.offer_id
            WHERE plan.code = :code
              AND version.change_reason = :change_reason
            ORDER BY version.version_number DESC
            LIMIT 1
            FOR UPDATE
            """
        ),
        {"code": TECHNICIAN_CODE, "change_reason": CHANGE_REASON},
    ).mappings().one_or_none()
    if corrected is None:
        return

    referenced = bind.scalar(
        sa.text(
            """
            SELECT EXISTS (
                SELECT 1
                FROM commerce.contract_items
                WHERE offer_version_id = :version_id
            )
            """
        ),
        {"version_id": corrected["id"]},
    )
    if referenced:
        raise RuntimeError(
            "Cannot remove the corrected technician price version because "
            "commercial history references it"
        )

    bind.execute(
        sa.text("DELETE FROM commerce.plan_versions WHERE id = :version_id"),
        {"version_id": corrected["id"]},
    )
    bind.execute(
        sa.text(
            """
            UPDATE commerce.plan_versions
            SET effective_until = NULL
            WHERE id = (
                SELECT id
                FROM commerce.plan_versions
                WHERE offer_id = :offer_id
                  AND version_status = 'PUBLISHED'
                ORDER BY effective_from DESC, version_number DESC
                LIMIT 1
            )
            """
        ),
        {"offer_id": corrected["offer_id"]},
    )
    bind.execute(
        sa.text(
            """
            UPDATE commerce.plans
            SET description = :description,
                updated_at = clock_timestamp()
            WHERE id = :offer_id
            """
        ),
        {
            "offer_id": corrected["offer_id"],
            "description": (
                "Setup-day technician service; travel and outstation costs "
                "are separate."
            ),
        },
    )
