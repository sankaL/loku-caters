"""add hero anatomy and tooltip image fields to events

Revision ID: 0009_event_hero_tooltip_images
Revises: 0008_uuid_item_location_ids
Create Date: 2026-02-25 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0009_event_hero_tooltip_images"
down_revision = "0008_uuid_item_location_ids"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("events", sa.Column("hero_header_sage", sa.Text(), nullable=False, server_default=""))
    op.add_column("events", sa.Column("tooltip_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("events", sa.Column("tooltip_header", sa.Text(), nullable=True))
    op.add_column("events", sa.Column("tooltip_body", sa.Text(), nullable=True))
    op.add_column("events", sa.Column("tooltip_image_key", sa.Text(), nullable=True))
    op.add_column("events", sa.Column("hero_side_image_key", sa.Text(), nullable=True))

    op.execute(sa.text("""
        UPDATE events
        SET
            tooltip_enabled = true,
            tooltip_header = 'What is Lamprais?',
            tooltip_body = 'Lamprais is a beloved Sri Lankan dish of rice cooked in stock, served with a variety of curries and accompaniments, all wrapped and baked in a banana leaf.',
            tooltip_image_key = 'tooltip-lamprais-how-its-made',
            hero_side_image_key = NULL
    """))


def downgrade() -> None:
    op.drop_column("events", "hero_side_image_key")
    op.drop_column("events", "tooltip_image_key")
    op.drop_column("events", "tooltip_body")
    op.drop_column("events", "tooltip_header")
    op.drop_column("events", "tooltip_enabled")
    op.drop_column("events", "hero_header_sage")
