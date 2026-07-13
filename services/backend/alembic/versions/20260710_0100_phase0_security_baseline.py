"""Phase 0 security baseline and removal of runtime schema mutation.

Revision ID: phase0_security_0100
Revises: 91a2b6e7d4c1
"""

from alembic import op


revision = "phase0_security_0100"
down_revision = "91a2b6e7d4c1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE events.speaker_profiles ADD COLUMN IF NOT EXISTS state VARCHAR(100)")

    op.execute("ALTER TABLE billing.addons ADD COLUMN IF NOT EXISTS min_price_inr NUMERIC(12, 2)")
    op.execute("ALTER TABLE billing.addons ADD COLUMN IF NOT EXISTS max_price_inr NUMERIC(12, 2)")
    op.execute("ALTER TABLE billing.addons ADD COLUMN IF NOT EXISTS price_unit VARCHAR(50)")
    op.execute("ALTER TABLE billing.addons ADD COLUMN IF NOT EXISTS final_price NUMERIC(12, 2)")
    op.execute("UPDATE billing.addons SET final_price = COALESCE(final_price, price_inr, min_price_inr, 0)")

    op.execute("ALTER TABLE identity.refresh_tokens ADD COLUMN IF NOT EXISTS mfa_authenticated_at TIMESTAMPTZ")

    op.execute(
        "ALTER TABLE files.assets ADD COLUMN IF NOT EXISTS processing_status "
        "VARCHAR(30) NOT NULL DEFAULT 'QUARANTINED'"
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_files_assets_processing_status ON files.assets (processing_status)")

    op.execute("ALTER TABLE venue.devices ADD COLUMN IF NOT EXISTS organization_id UUID")
    op.execute(
        """
        UPDATE venue.devices d
        SET organization_id = e.organization_id
        FROM events.events e
        WHERE d.event_id = e.id AND d.organization_id IS NULL
        """
    )
    op.execute("ALTER TABLE venue.devices ALTER COLUMN organization_id SET NOT NULL")
    op.execute(
        """
        DO $$ BEGIN
            ALTER TABLE venue.devices
            ADD CONSTRAINT fk_venue_devices_organization
            FOREIGN KEY (organization_id) REFERENCES platform.organizations(id) ON DELETE CASCADE;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_venue_devices_organization_id ON venue.devices (organization_id)")
    op.execute("ALTER TABLE venue.devices ADD COLUMN IF NOT EXISTS device_key_hash VARCHAR(64)")
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_venue_devices_device_key_hash "
        "ON venue.devices (device_key_hash) WHERE device_key_hash IS NOT NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS venue.ix_venue_devices_device_key_hash")
    op.execute("ALTER TABLE venue.devices DROP COLUMN IF EXISTS device_key_hash")
    op.execute("DROP INDEX IF EXISTS venue.ix_venue_devices_organization_id")
    op.execute("ALTER TABLE venue.devices DROP CONSTRAINT IF EXISTS fk_venue_devices_organization")
    op.execute("ALTER TABLE venue.devices DROP COLUMN IF EXISTS organization_id")
    op.execute("ALTER TABLE identity.refresh_tokens DROP COLUMN IF EXISTS mfa_authenticated_at")
    op.execute("DROP INDEX IF EXISTS files.ix_files_assets_processing_status")
    op.execute("ALTER TABLE files.assets DROP COLUMN IF EXISTS processing_status")
    op.execute("ALTER TABLE billing.addons DROP COLUMN IF EXISTS final_price")
    op.execute("ALTER TABLE billing.addons DROP COLUMN IF EXISTS price_unit")
    op.execute("ALTER TABLE billing.addons DROP COLUMN IF EXISTS max_price_inr")
    op.execute("ALTER TABLE billing.addons DROP COLUMN IF EXISTS min_price_inr")
    op.execute("ALTER TABLE events.speaker_profiles DROP COLUMN IF EXISTS state")
