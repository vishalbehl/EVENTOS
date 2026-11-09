"""Make review submission one logical outcome per assignment."""

from alembic import op


revision = "20260909_1830"
down_revision = "20260909_1810"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        DELETE FROM abstract.abstract_reviews duplicate
        USING abstract.abstract_reviews keeper
        WHERE duplicate.assignment_id = keeper.assignment_id
          AND duplicate.id > keeper.id
        """
    )
    op.create_unique_constraint(
        "uq_abstract_reviews_assignment_id",
        "abstract_reviews",
        ["assignment_id"],
        schema="abstract",
    )


def downgrade() -> None:
    op.drop_constraint("uq_abstract_reviews_assignment_id", "abstract_reviews", schema="abstract", type_="unique")
