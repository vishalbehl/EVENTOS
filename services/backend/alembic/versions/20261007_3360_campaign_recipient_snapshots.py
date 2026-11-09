"""Immutable, owned dispatch cohorts; existing campaigns are not inferred/backfilled."""
from alembic import op

revision = "20261007_3360"
down_revision = "20261007_3350"
branch_labels = None
depends_on = None


def upgrade():
    with op.get_context().autocommit_block():
        op.execute("CREATE UNIQUE INDEX CONCURRENTLY ix_campaign_event_owner_expand ON communications.email_campaigns (id,event_id)")
        op.execute("CREATE INDEX CONCURRENTLY ix_campaign_snapshot_speakers ON speakers.speakers (event_id,email,id) WHERE deleted_at IS NULL")
        op.execute("CREATE INDEX CONCURRENTLY ix_campaign_snapshot_participants ON registration.participants (event_id,email,id) WHERE deleted_at IS NULL")
    op.execute("ALTER TABLE communications.email_campaigns ADD CONSTRAINT uq_campaign_event_owner UNIQUE USING INDEX ix_campaign_event_owner_expand")
    op.execute("""ALTER TABLE communications.email_campaigns
        ADD COLUMN recipient_snapshot_dispatch_id uuid,
        ADD COLUMN recipient_snapshot_count integer,
        ADD COLUMN recipient_snapshot_target_type varchar(20),
        ADD CONSTRAINT ck_campaign_snapshot_state CHECK (
          (recipient_snapshot_dispatch_id IS NULL AND recipient_snapshot_count IS NULL AND recipient_snapshot_target_type IS NULL) OR
          (recipient_snapshot_dispatch_id IS NOT NULL AND recipient_snapshot_count IS NOT NULL AND recipient_snapshot_count >= 0
           AND recipient_snapshot_target_type IS NOT NULL AND recipient_snapshot_target_type IN ('speaker','participant')))""")
    op.execute("""CREATE TABLE communications.campaign_recipient_snapshots (
        dispatch_id uuid NOT NULL, recipient_id uuid NOT NULL,
        organization_id uuid NOT NULL, event_id uuid NOT NULL, campaign_id uuid NOT NULL,
        to_email varchar(320) NOT NULL,
        PRIMARY KEY (dispatch_id,recipient_id),
        CONSTRAINT uq_campaign_snapshot_email UNIQUE (dispatch_id,to_email),
        CONSTRAINT fk_campaign_snapshot_event_owner FOREIGN KEY (organization_id,event_id)
          REFERENCES events.events (organization_id,id),
        CONSTRAINT fk_campaign_snapshot_campaign_owner FOREIGN KEY (campaign_id,event_id)
          REFERENCES communications.email_campaigns (id,event_id))""")
    predicate = "organization_id = nullif(current_setting('app.current_organization_id', true), '')::uuid"
    op.execute("ALTER TABLE communications.campaign_recipient_snapshots ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE communications.campaign_recipient_snapshots FORCE ROW LEVEL SECURITY")
    op.execute(f"CREATE POLICY campaign_snapshot_select ON communications.campaign_recipient_snapshots FOR SELECT USING ({predicate})")
    op.execute(f"CREATE POLICY campaign_snapshot_insert ON communications.campaign_recipient_snapshots FOR INSERT WITH CHECK ({predicate})")
    op.execute(f"CREATE POLICY campaign_snapshot_tenant ON communications.campaign_recipient_snapshots AS RESTRICTIVE FOR ALL USING ({predicate}) WITH CHECK ({predicate})")
    # No UPDATE/DELETE policies: sealed cohort rows cannot be rewritten by runtime.


def downgrade():
    raise RuntimeError("Preserve authorised dispatch cohorts; Category A rollback must fail closed")
