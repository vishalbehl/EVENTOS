"""Version capacity add-on eligibility with each cloud offer version."""

import json

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "20260922_3170"
down_revision = "20260922_3160"
branch_labels = None
depends_on = None


EVENT_ADDONS = [
    "EVENT_REGISTRATIONS_250",
    "EVENT_ABSTRACTS_250",
    "EVENT_SPEAKERS_25",
    "EVENT_STORAGE_25GB",
    "EVENT_EMAIL_10K",
]
EMC_ADDONS = [
    "EMC_EVENTS_5",
    "EMC_REGISTRATIONS_5000",
    "EMC_STORAGE_250GB",
    "EMC_EMAIL_100K",
    "EMC_WORKSPACES_5",
]


def upgrade() -> None:
    op.add_column(
        "commercial_offer_versions",
        sa.Column(
            "eligible_addon_codes",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        schema="commerce",
    )
    op.get_bind().execute(
        sa.text(
            """
            UPDATE commerce.commercial_offer_versions AS version
            SET eligible_addon_codes = CASE offer.product_family
                WHEN 'EVENT' THEN CAST(:event_addons AS jsonb)
                WHEN 'EMC' THEN CAST(:emc_addons AS jsonb)
                ELSE '[]'::jsonb
            END
            FROM commerce.commercial_offers AS offer
            WHERE offer.id = version.offer_id
            """
        ),
        {
            "event_addons": json.dumps(EVENT_ADDONS),
            "emc_addons": json.dumps(EMC_ADDONS),
        },
    )


def downgrade() -> None:
    op.drop_column("commercial_offer_versions", "eligible_addon_codes", schema="commerce")
