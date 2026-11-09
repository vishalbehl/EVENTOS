"""Enable self-service venue offers and add enterprise venue choices.

Revision ID: 20261105_3700
Revises: 20261104_3690

The approved fixed-price Venue catalogue is purchasable without a quotation.
Only Enterprise/custom offers remain quote-only. Existing offer versions and
historical contract snapshots are not rewritten.
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
import uuid

from alembic import op
import sqlalchemy as sa


revision = "20261105_3700"
down_revision = "20261104_3690"
branch_labels = None
depends_on = None


ENTERPRISE_VENUE_OFFERS = (
    ("VENUE_EVENT_ENTERPRISE", "Venue Event Enterprise", "Custom per-event venue application scope.", "EVENT", "PER_EVENT", 399),
    ("VENUE_MONTHLY_ENTERPRISE", "Venue Monthly Enterprise", "Custom monthly venue application scope.", "ORGANIZATION", "MONTHLY", 319),
    ("VENUE_ANNUAL_ENTERPRISE", "Venue Annual Enterprise", "Custom annual venue application scope.", "ORGANIZATION", "ANNUAL", 329),
)


def _insert_enterprise_offer(
    bind: sa.Connection,
    *,
    code: str,
    display_name: str,
    description: str,
    scope_type: str,
    interval: str,
    display_order: int,
    now: datetime,
) -> None:
    offer_id = bind.scalar(
        sa.text("SELECT id FROM commerce.commercial_offers WHERE code = :code"),
        {"code": code},
    )
    if offer_id is None:
        offer_id = uuid.uuid4()
        bind.execute(sa.text("""
            INSERT INTO commerce.commercial_offers
                (id, code, product_family, name, display_name, description,
                 scope_type, is_quote_only, lifecycle_status, display_order,
                 created_at, updated_at)
            VALUES
                (:id, :code, 'VENUE', :display_name, :display_name, :description,
                 :scope_type, true, 'PUBLISHED', :display_order, :now, :now)
        """), {
            "id": offer_id,
            "code": code,
            "display_name": display_name,
            "description": description,
            "scope_type": scope_type,
            "display_order": display_order,
            "now": now,
        })
    else:
        bind.execute(sa.text("""
            UPDATE commerce.commercial_offers
            SET is_quote_only = true,
                lifecycle_status = 'PUBLISHED',
                updated_at = :now
            WHERE id = :offer_id
        """), {"offer_id": offer_id, "now": now})

    version_id = bind.scalar(sa.text("""
        SELECT id
        FROM commerce.commercial_offer_versions
        WHERE offer_id = :offer_id AND version_number = 1
    """), {"offer_id": offer_id})
    if version_id is None:
        version_id = uuid.uuid4()
        bind.execute(sa.text("""
            INSERT INTO commerce.commercial_offer_versions
                (id, offer_id, version_number, effective_from, version_status,
                 change_reason, published_at, created_at)
            VALUES
                (:id, :offer_id, 1, :now, 'PUBLISHED',
                 'Enterprise Venue quotation option', :now, :now)
        """), {"id": version_id, "offer_id": offer_id, "now": now})
    bind.execute(sa.text("""
        INSERT INTO commerce.commercial_offer_prices
            (id, offer_version_id, billing_interval, pricing_unit, amount,
             currency, tax_mode, created_at)
        SELECT :id, :version_id, :interval, :pricing_unit, :amount,
               'INR', 'EXCLUSIVE', :now
        WHERE NOT EXISTS (
            SELECT 1 FROM commerce.commercial_offer_prices
            WHERE offer_version_id = :version_id
              AND billing_interval = :interval
        )
    """), {
        "id": uuid.uuid4(),
        "version_id": version_id,
        "interval": interval,
        "pricing_unit": "EVENT" if interval == "PER_EVENT" else "ACCOUNT",
        "amount": Decimal("0"),
        "now": now,
    })


def upgrade() -> None:
    bind = op.get_bind()
    now = datetime.now(timezone.utc)
    bind.execute(sa.text("""
        UPDATE commerce.commercial_offers
        SET is_quote_only = false,
            updated_at = :now
        WHERE product_family IN ('VENUE', 'VENUE_ADDON')
          AND code NOT LIKE '%ENTERPRISE%'
    """), {"now": now})
    bind.execute(sa.text("""
        UPDATE commerce.commercial_offers
        SET display_name = 'Workspace Free Trial',
            description = 'One-month Workspace trial for individuals evaluating EventOS.',
            updated_at = :now
        WHERE code = 'WORKSPACE_FREE'
    """), {"now": now})
    for code, display_name, description, scope_type, interval, order in ENTERPRISE_VENUE_OFFERS:
        _insert_enterprise_offer(
            bind,
            code=code,
            display_name=display_name,
            description=description,
            scope_type=scope_type,
            interval=interval,
            display_order=order,
            now=now,
        )


def downgrade() -> None:
    bind = op.get_bind()
    now = datetime.now(timezone.utc)
    bind.execute(sa.text("""
        UPDATE commerce.commercial_offers
        SET is_quote_only = true,
            updated_at = :now
        WHERE product_family IN ('VENUE', 'VENUE_ADDON')
          AND code NOT LIKE '%ENTERPRISE%'
    """), {"now": now})
    bind.execute(sa.text("""
        UPDATE commerce.commercial_offers
        SET display_name = 'Workspace Free',
            description = 'Permanent workspace for individuals getting started.',
            updated_at = :now
        WHERE code = 'WORKSPACE_FREE'
    """), {"now": now})
    bind.execute(sa.text("""
        UPDATE commerce.commercial_offers
        SET lifecycle_status = 'RETIRED',
            updated_at = :now
        WHERE code IN (
            'VENUE_EVENT_ENTERPRISE',
            'VENUE_MONTHLY_ENTERPRISE',
            'VENUE_ANNUAL_ENTERPRISE'
        )
    """), {"now": now})
