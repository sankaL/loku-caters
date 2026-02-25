"""normalize items and locations to db tables

Revision ID: 0003_normalize_items_locations
Revises: 0002_create_event_config
Create Date: 2026-02-22 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0003_normalize_items_locations"
down_revision = "0002_create_event_config"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Create items table
    op.create_table(
        "items",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("price", sa.Numeric(10, 2), nullable=False),
        sa.Column("discounted_price", sa.Numeric(10, 2), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
    )

    # 2. Create locations table
    op.create_table(
        "locations",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("address", sa.Text(), nullable=False, server_default=""),
        sa.Column("time_slots", JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
    )

    # 3. Seed items from event_config JSONB
    op.execute(sa.text("""
        INSERT INTO items (id, name, description, price, discounted_price, sort_order)
        SELECT
            gen_random_uuid()::text,
            elem.value->>'name',
            COALESCE(elem.value->>'description', ''),
            (elem.value->>'price')::NUMERIC,
            CASE WHEN elem.value->>'discounted_price' IS NOT NULL
                 THEN (elem.value->>'discounted_price')::NUMERIC
                 ELSE NULL
            END,
            (elem.ord - 1)::INT
        FROM event_config, jsonb_array_elements(items) WITH ORDINALITY AS elem(value, ord)
        WHERE id = 1
        ORDER BY elem.ord
    """))

    # 4. Seed locations from event_config JSONB (map timeSlots -> time_slots)
    op.execute(sa.text("""
        INSERT INTO locations (id, name, address, time_slots, sort_order)
        SELECT
            gen_random_uuid()::text,
            elem.value->>'name',
            COALESCE(elem.value->>'address', ''),
            COALESCE(elem.value->'timeSlots', '[]'::jsonb),
            (elem.ord - 1)::INT
        FROM event_config, jsonb_array_elements(locations) WITH ORDINALITY AS elem(value, ord)
        WHERE id = 1
        ORDER BY elem.ord
    """))

    # 5-7. Add new columns to event_config
    op.add_column("event_config", sa.Column("hero_header", sa.Text(), nullable=False, server_default=""))
    op.add_column("event_config", sa.Column("hero_subheader", sa.Text(), nullable=False, server_default=""))
    op.add_column("event_config", sa.Column("promo_details", sa.Text(), nullable=True))

    # 8-10. Drop old columns
    op.drop_column("event_config", "currency")
    op.drop_column("event_config", "items")
    op.drop_column("event_config", "locations")


def downgrade() -> None:
    # Re-add JSONB columns
    op.add_column("event_config", sa.Column("currency", sa.Text(), nullable=False, server_default="CAD"))
    op.add_column("event_config", sa.Column("items", JSONB(), nullable=False, server_default="'[]'::jsonb"))
    op.add_column("event_config", sa.Column("locations", JSONB(), nullable=False, server_default="'[]'::jsonb"))

    # Migrate items data back
    op.execute(sa.text("""
        UPDATE event_config SET items = (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id', i.id,
                    'name', i.name,
                    'description', i.description,
                    'price', i.price,
                    'discounted_price', i.discounted_price
                ) ORDER BY i.sort_order
            ), '[]'::jsonb)
            FROM items i
        ) WHERE id = 1
    """))

    # Migrate locations data back (time_slots -> timeSlots)
    op.execute(sa.text("""
        UPDATE event_config SET locations = (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id', l.id,
                    'name', l.name,
                    'address', l.address,
                    'timeSlots', l.time_slots
                ) ORDER BY l.sort_order
            ), '[]'::jsonb)
            FROM locations l
        ) WHERE id = 1
    """))

    # Drop new columns
    op.drop_column("event_config", "promo_details")
    op.drop_column("event_config", "hero_subheader")
    op.drop_column("event_config", "hero_header")

    # Drop new tables
    op.drop_table("locations")
    op.drop_table("items")
