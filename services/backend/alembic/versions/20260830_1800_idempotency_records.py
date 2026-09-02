"""Add durable tenant-scoped idempotency records."""

from alembic import op

revision = "20260830_1800"
down_revision = "20260830_1700"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
    CREATE TABLE IF NOT EXISTS platform.idempotency_records (
      id uuid PRIMARY KEY,
      organization_id uuid NOT NULL REFERENCES platform.organizations(id) ON DELETE CASCADE,
      actor_id uuid REFERENCES identity.users(id) ON DELETE SET NULL,
      operation varchar(120) NOT NULL,
      idempotency_key varchar(255) NOT NULL,
      request_hash varchar(64) NOT NULL,
      status varchar(20) NOT NULL DEFAULT 'IN_PROGRESS',
      response_status integer,
      response_body jsonb,
      resource_id uuid,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_idempotency_scope_key UNIQUE (organization_id, operation, idempotency_key)
    )
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_idempotency_records_expires_at ON platform.idempotency_records (expires_at)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS platform.idempotency_records")
