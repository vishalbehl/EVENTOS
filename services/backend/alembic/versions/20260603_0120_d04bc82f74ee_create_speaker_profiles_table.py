"""create_speaker_profiles_table

Revision ID: d04bc82f74ee
Revises: c03ab82f63ee
Create Date: 2026-06-03 01:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd04bc82f74ee'
down_revision: Union[str, None] = 'c03ab82f63ee'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create the speaker_profiles table in speakers schema
    op.create_table(
        'speaker_profiles',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('speaker_id', sa.UUID(), nullable=False),
        sa.Column('event_id', sa.UUID(), nullable=False),
        sa.Column('organization_id', sa.UUID(), nullable=False),
        sa.Column('bio', sa.Text(), nullable=True),
        sa.Column('extended_bio', sa.Text(), nullable=True),
        sa.Column('profile_photo_url', sa.String(), nullable=True),
        sa.Column('cv_url', sa.String(), nullable=True),
        sa.Column('designation', sa.String(length=50), nullable=True),
        sa.Column('title', sa.String(length=200), nullable=True),
        sa.Column('organisation_name', sa.String(length=200), nullable=True),
        sa.Column('department', sa.String(length=200), nullable=True),
        sa.Column('city', sa.String(length=100), nullable=True),
        sa.Column('country', sa.String(length=100), nullable=True),
        sa.Column('website_url', sa.String(), nullable=True),
        sa.Column('linkedin_url', sa.String(), nullable=True),
        sa.Column('twitter_url', sa.String(), nullable=True),
        sa.Column('research_interests', sa.ARRAY(sa.Text()), server_default='{}', nullable=False),
        sa.Column('languages_spoken', sa.ARRAY(sa.Text()), server_default='{}', nullable=False),
        sa.Column('photo_consent', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('last_updated_by', sa.String(length=20), nullable=False, server_default='organiser'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['event_id'], ['rbac.events.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['organization_id'], ['rbac.organizations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['speaker_id'], ['speakers.speakers.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('speaker_id', 'event_id', name='uq_speaker_event_profile'),
        schema='speakers'
    )

    # 2. Enable Row Level Security and configure the isolation policy
    op.execute(sa.text("ALTER TABLE speakers.speaker_profiles ENABLE ROW LEVEL SECURITY;"))
    op.execute(sa.text("""
        CREATE POLICY tenant_isolation_policy ON speakers.speaker_profiles USING (
            current_setting('app.current_organization_id', true) IS NULL OR
            current_setting('app.current_organization_id', true) = '' OR
            organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
        ) WITH CHECK (
            current_setting('app.current_organization_id', true) IS NULL OR
            current_setting('app.current_organization_id', true) = '' OR
            organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
        )
    """))


def downgrade() -> None:
    # Disable RLS and drop policy first
    op.execute(sa.text("DROP POLICY IF EXISTS tenant_isolation_policy ON speakers.speaker_profiles;"))
    op.execute(sa.text("ALTER TABLE speakers.speaker_profiles DISABLE ROW LEVEL SECURITY;"))
    op.drop_table('speaker_profiles', schema='speakers')
