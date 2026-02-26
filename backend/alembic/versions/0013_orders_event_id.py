"""add orders.event_id

Revision ID: 0013_orders_event_id
Revises: 0012_order_notes_exclude_email
Create Date: 2026-02-26 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0013_orders_event_id"
down_revision = "0012_order_notes_exclude_email"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("orders", sa.Column("event_id", sa.Integer(), nullable=True))

    # Backfill all existing orders to the currently active event.
    # If there is no active event (possible if an admin deactivated all events),
    # pick the most recent event and activate it so the system returns to a valid state.
    op.execute(
        sa.text(
            """
DO $$
DECLARE
  backfill_event_id INT;
BEGIN
  SELECT id INTO backfill_event_id
  FROM events
  WHERE is_active = true
  ORDER BY id DESC
  LIMIT 1;

  IF backfill_event_id IS NULL THEN
    SELECT id INTO backfill_event_id
    FROM events
    ORDER BY id DESC
    LIMIT 1;
  END IF;

  IF backfill_event_id IS NULL THEN
    RAISE EXCEPTION 'No events found; cannot backfill orders.event_id';
  END IF;

  UPDATE events
  SET is_active = CASE WHEN id = backfill_event_id THEN true ELSE false END;

  UPDATE orders
  SET event_id = backfill_event_id
  WHERE event_id IS NULL;
END$$;
"""
        )
    )

    op.alter_column("orders", "event_id", existing_type=sa.Integer(), nullable=False)
    op.create_index("ix_orders_event_id", "orders", ["event_id"])


def downgrade() -> None:
    op.drop_index("ix_orders_event_id", table_name="orders")
    op.drop_column("orders", "event_id")
