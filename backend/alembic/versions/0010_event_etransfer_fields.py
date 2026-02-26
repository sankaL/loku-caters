"""add optional e-transfer fields to events

Revision ID: 0010_event_etransfer_fields
Revises: 0009_event_hero_tooltip_images
Create Date: 2026-02-25 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0010_event_etransfer_fields"
down_revision = "0009_event_hero_tooltip_images"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("events", sa.Column("etransfer_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("events", sa.Column("etransfer_email", sa.Text(), nullable=True))

    op.execute(sa.text("""
        UPDATE events
        SET
            etransfer_enabled = true,
            etransfer_email = 'jlokuliyana@yahoo.com'
    """))


def downgrade() -> None:
    op.drop_column("events", "etransfer_email")
    op.drop_column("events", "etransfer_enabled")
