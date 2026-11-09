"""Append-only owned campaign claim/outcome history; no inferred backfill."""
from alembic import op

revision = "20261007_3390"
down_revision = "20261007_3380"
branch_labels = None
depends_on = None


def upgrade():
    with op.get_context().autocommit_block():
        op.execute("""CREATE UNIQUE INDEX CONCURRENTLY ix_campaign_snapshot_attempt_expand
            ON communications.campaign_recipient_snapshots (organization_id,event_id,campaign_id,dispatch_id,recipient_id)""")
    op.execute("""ALTER TABLE communications.campaign_recipient_snapshots ADD CONSTRAINT
        uq_campaign_snapshot_attempt_owner UNIQUE USING INDEX ix_campaign_snapshot_attempt_expand""")
    op.execute("""CREATE TABLE communications.campaign_attempts (
        id uuid PRIMARY KEY, organization_id uuid NOT NULL, event_id uuid NOT NULL,
        campaign_id uuid NOT NULL, dispatch_id uuid NOT NULL, recipient_id uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_campaign_attempt_owner UNIQUE (id,organization_id,event_id,campaign_id),
        CONSTRAINT uq_campaign_attempt_log_owner UNIQUE (id,event_id,campaign_id),
        CONSTRAINT fk_campaign_attempt_snapshot_owner
          FOREIGN KEY (organization_id,event_id,campaign_id,dispatch_id,recipient_id)
          REFERENCES communications.campaign_recipient_snapshots
            (organization_id,event_id,campaign_id,dispatch_id,recipient_id))""")
    op.execute("""CREATE INDEX ix_campaign_attempt_dispatch ON communications.campaign_attempts
        (organization_id,event_id,campaign_id,dispatch_id)""")
    op.execute("""CREATE TABLE communications.campaign_attempt_outcomes (
        id uuid PRIMARY KEY, attempt_id uuid NOT NULL, organization_id uuid NOT NULL,
        event_id uuid NOT NULL, campaign_id uuid NOT NULL, kind varchar(20) NOT NULL,
        provider_receipt varchar(255), diagnostic_code varchar(128),
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT fk_campaign_outcome_attempt_owner FOREIGN KEY (attempt_id,organization_id,event_id,campaign_id)
          REFERENCES communications.campaign_attempts (id,organization_id,event_id,campaign_id),
        CONSTRAINT uq_campaign_attempt_outcome UNIQUE (attempt_id,kind),
        CONSTRAINT ck_campaign_outcome_kind CHECK (kind IN ('ACCEPTED','REJECTED','UNCONFIRMED')),
        CONSTRAINT ck_campaign_outcome_receipt CHECK (
          (kind = 'ACCEPTED' AND provider_receipt IS NOT NULL) OR
          (kind <> 'ACCEPTED' AND provider_receipt IS NULL)))""")
    op.execute("""CREATE UNIQUE INDEX uq_campaign_attempt_terminal_outcome
        ON communications.campaign_attempt_outcomes (attempt_id) WHERE kind IN ('ACCEPTED','REJECTED')""")
    op.execute("""ALTER TABLE communications.email_logs ADD COLUMN current_attempt_id uuid,
        ADD CONSTRAINT fk_email_log_attempt_owner FOREIGN KEY (current_attempt_id,event_id,campaign_id)
          REFERENCES communications.campaign_attempts (id,event_id,campaign_id) NOT VALID""")
    op.execute("ALTER TABLE communications.email_logs VALIDATE CONSTRAINT fk_email_log_attempt_owner")
    predicate = "organization_id = nullif(current_setting('app.current_organization_id', true), '')::uuid"
    for table in ("campaign_attempts", "campaign_attempt_outcomes"):
        op.execute(f"ALTER TABLE communications.{table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE communications.{table} FORCE ROW LEVEL SECURITY")
        op.execute(f"CREATE POLICY {table}_select ON communications.{table} FOR SELECT USING ({predicate})")
        op.execute(f"CREATE POLICY {table}_insert ON communications.{table} FOR INSERT WITH CHECK ({predicate})")
        op.execute(f"CREATE POLICY {table}_tenant ON communications.{table} AS RESTRICTIVE FOR ALL USING ({predicate}) WITH CHECK ({predicate})")


def downgrade():
    raise RuntimeError("Preserve provider attempt evidence; runtime rollback must fail closed")
