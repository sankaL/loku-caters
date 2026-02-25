"""replace slug item/location IDs with server-generated UUIDs

Revision ID: 0008_uuid_item_location_ids
Revises: 0007_feedback_type_and_message
Create Date: 2026-02-25 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0008_uuid_item_location_ids"
down_revision = "0007_feedback_type_and_message"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # For each item with a non-UUID id, generate a new UUID and cascade
    # the change to events.item_ids and orders.item_id.
    op.execute(sa.text("""
        DO $$
        DECLARE
            r RECORD;
            new_id TEXT;
        BEGIN
            FOR r IN SELECT id FROM items
                WHERE id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            LOOP
                new_id := gen_random_uuid()::text;

                UPDATE events
                SET item_ids = (
                    SELECT jsonb_agg(
                        CASE WHEN elem.value #>> '{}' = r.id
                             THEN to_jsonb(new_id)
                             ELSE elem.value
                        END
                        ORDER BY elem.ord
                    )
                    FROM jsonb_array_elements(item_ids) WITH ORDINALITY AS elem(value, ord)
                )
                WHERE item_ids @> to_jsonb(r.id);

                UPDATE orders SET item_id = new_id WHERE item_id = r.id;

                UPDATE items SET id = new_id WHERE id = r.id;
            END LOOP;
        END $$;
    """))

    # Same for locations
    op.execute(sa.text("""
        DO $$
        DECLARE
            r RECORD;
            new_id TEXT;
        BEGIN
            FOR r IN SELECT id FROM locations
                WHERE id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            LOOP
                new_id := gen_random_uuid()::text;

                UPDATE events
                SET location_ids = (
                    SELECT jsonb_agg(
                        CASE WHEN elem.value #>> '{}' = r.id
                             THEN to_jsonb(new_id)
                             ELSE elem.value
                        END
                        ORDER BY elem.ord
                    )
                    FROM jsonb_array_elements(location_ids) WITH ORDINALITY AS elem(value, ord)
                )
                WHERE location_ids @> to_jsonb(r.id);

                UPDATE locations SET id = new_id WHERE id = r.id;
            END LOOP;
        END $$;
    """))


def downgrade() -> None:
    pass
