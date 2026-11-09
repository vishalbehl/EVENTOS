"""Additive task concurrency contract; retain columns on binary rollback."""
from alembic import op
import sqlalchemy as sa
import uuid

revision = "20261008_3450"
down_revision = "20261008_3440"
branch_labels = None
depends_on = None


def upgrade():
    # Constant default: no application-side whole-cohort UPDATE.
    op.add_column("workflow_tasks", sa.Column("version", sa.Integer(),
        nullable=False, server_default="1"), schema="automation")
    op.execute("ALTER TABLE automation.workflow_tasks ADD CONSTRAINT "
               "ck_workflow_task_version_positive CHECK (version > 0) NOT VALID")
    for action in ("view", "manage", "approve"):
        code = f"workflows:{action}"
        op.get_bind().execute(sa.text("INSERT INTO organizer_access.permissions "
            "(id, code, name, module, description) VALUES (:id, :code, :name, 'WORKFLOWS', :description) "
            "ON CONFLICT (code) DO NOTHING"), {
                "id": uuid.uuid5(uuid.NAMESPACE_URL, f"eventos:permission:{code}"),
                "code": code, "name": f"Workflow {action}",
                "description": "Organisation-scoped workflow authority; never an event/delegated grant.",
            })


def downgrade():
    raise RuntimeError("Retain additive workflow versions; use a compatible application rollback.")
