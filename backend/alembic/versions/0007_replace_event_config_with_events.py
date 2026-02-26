"""replace event_config with events table

Revision ID: 0007_events_table
Revises: 0006_normalize_items_locations
Create Date: 2026-02-22 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0007_events_table"
down_revision = "0006_normalize_items_locations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create events table
    op.create_table(
        "events",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("event_date", sa.Text(), nullable=False),
        sa.Column("hero_header", sa.Text(), nullable=False, server_default=""),
        sa.Column("hero_subheader", sa.Text(), nullable=False, server_default=""),
        sa.Column("promo_details", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("item_ids", JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("location_ids", JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )

    # 2. Seed one row from event_config (seeding all item/location IDs in sort order)
    op.execute(sa.text("""
        INSERT INTO events (name, event_date, hero_header, hero_subheader, promo_details, is_active, item_ids, location_ids, updated_at)
        SELECT
            'Event 1',
            event_date,
            hero_header,
            hero_subheader,
            promo_details,
            true,
            (SELECT COALESCE(jsonb_agg(id ORDER BY sort_order), '[]'::jsonb) FROM items),
            (SELECT COALESCE(jsonb_agg(id ORDER BY sort_order), '[]'::jsonb) FROM locations),
            updated_at
        FROM event_config
        WHERE id = 1
    """))

    # 3. Drop event_config
    op.drop_table("event_config")


def downgrade() -> None:
    # 1. Re-create event_config table
    op.create_table(
        "event_config",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("event_date", sa.Text(), nullable=False, server_default=""),
        sa.Column("hero_header", sa.Text(), nullable=False, server_default=""),
        sa.Column("hero_subheader", sa.Text(), nullable=False, server_default=""),
        sa.Column("promo_details", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )

    # 2. Seed from the active event
    op.execute(sa.text("""
        INSERT INTO event_config (id, event_date, hero_header, hero_subheader, promo_details, updated_at)
        SELECT 1, event_date, hero_header, hero_subheader, promo_details, updated_at
        FROM events
        WHERE is_active = true
        LIMIT 1
    """))

    # 3. Drop events table
    op.drop_table("events")
