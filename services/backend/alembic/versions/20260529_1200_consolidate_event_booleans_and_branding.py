"""consolidate_event_booleans_and_branding

Consolidates 5 standalone boolean columns and 3 branding columns into
their respective JSONB settings columns on the events table:

  Removed:
    - speaker_mode_enabled    -> speaker_settings.enabled
    - speaker_window_required -> speaker_settings.window_required
    - registration_mode_enabled     -> registration_settings.enabled
    - registration_allowed          -> registration_settings.registration_allowed
    - participants_list_allowed     -> registration_settings.participants_list_allowed
    - theme_color -> branding_settings.theme_color
    - logo_url    -> branding_settings.logo_url
    - banner_url  -> branding_settings.banner_url

  Added:
    - branding_settings JSONB

Revision ID: 7a3f9b1c2d4e
Revises: 2155c89d2e7c
Create Date: 2026-05-29 12:00:00.000000+00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers, used by Alembic.
revision: str = '7a3f9b1c2d4e'
down_revision: Union[str, None] = '51230b213e1c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── 1. Add branding_settings JSONB column with a temporary default ──
    op.add_column(
        'events',
        sa.Column(
            'branding_settings',
            JSONB,
            nullable=False,
            server_default='{"theme_color": "#1A73E8", "logo_url": null, "banner_url": null}'
        )
    )

    # ── 2. Migrate existing branding data into branding_settings ──
    op.execute("""
        UPDATE events
        SET branding_settings = jsonb_build_object(
            'theme_color', COALESCE(theme_color, '#1A73E8'),
            'logo_url',    logo_url,
            'banner_url',  banner_url
        )
        WHERE TRUE
    """)

    # ── 3. Migrate existing boolean flags into speaker_settings ──
    #    (speaker_settings column already exists — merge new keys in)
    op.execute("""
        UPDATE events
        SET speaker_settings = speaker_settings
            || jsonb_build_object(
                'enabled',         COALESCE(speaker_mode_enabled, TRUE),
                'window_required', COALESCE(speaker_window_required, TRUE)
            )
        WHERE TRUE
    """)

    # ── 4. Migrate existing boolean flags into registration_settings ──
    op.execute("""
        UPDATE events
        SET registration_settings = registration_settings
            || jsonb_build_object(
                'enabled',                  COALESCE(registration_mode_enabled, TRUE),
                'registration_allowed',     COALESCE(registration_allowed, TRUE),
                'participants_list_allowed', COALESCE(participants_list_allowed, TRUE)
            )
        WHERE TRUE
    """)

    # ── 5. Drop the old standalone columns ──
    op.drop_column('events', 'speaker_mode_enabled')
    op.drop_column('events', 'speaker_window_required')
    op.drop_column('events', 'registration_mode_enabled')
    op.drop_column('events', 'registration_allowed')
    op.drop_column('events', 'participants_list_allowed')
    op.drop_column('events', 'theme_color')
    op.drop_column('events', 'logo_url')
    op.drop_column('events', 'banner_url')

    # ── 6. Remove server default now that data is migrated ──
    op.alter_column('events', 'branding_settings', server_default=None)


def downgrade() -> None:
    # ── Re-add the old columns ──
    op.add_column('events', sa.Column('banner_url', sa.Text(), nullable=True))
    op.add_column('events', sa.Column('logo_url', sa.Text(), nullable=True))
    op.add_column('events', sa.Column('theme_color', sa.String(20), nullable=False, server_default='#1A73E8'))
    op.add_column('events', sa.Column('participants_list_allowed', sa.Boolean(), nullable=False, server_default='TRUE'))
    op.add_column('events', sa.Column('registration_allowed', sa.Boolean(), nullable=False, server_default='TRUE'))
    op.add_column('events', sa.Column('registration_mode_enabled', sa.Boolean(), nullable=False, server_default='TRUE'))
    op.add_column('events', sa.Column('speaker_window_required', sa.Boolean(), nullable=False, server_default='TRUE'))
    op.add_column('events', sa.Column('speaker_mode_enabled', sa.Boolean(), nullable=False, server_default='TRUE'))

    # ── Restore data from JSONB ──
    op.execute("""
        UPDATE events SET
            theme_color  = COALESCE((branding_settings->>'theme_color'), '#1A73E8'),
            logo_url     = branding_settings->>'logo_url',
            banner_url   = branding_settings->>'banner_url',
            speaker_mode_enabled    = COALESCE((speaker_settings->>'enabled')::boolean, TRUE),
            speaker_window_required = COALESCE((speaker_settings->>'window_required')::boolean, TRUE),
            registration_mode_enabled     = COALESCE((registration_settings->>'enabled')::boolean, TRUE),
            registration_allowed          = COALESCE((registration_settings->>'registration_allowed')::boolean, TRUE),
            participants_list_allowed     = COALESCE((registration_settings->>'participants_list_allowed')::boolean, TRUE)
        WHERE TRUE
    """)

    # ── Drop the branding_settings column ──
    op.drop_column('events', 'branding_settings')
