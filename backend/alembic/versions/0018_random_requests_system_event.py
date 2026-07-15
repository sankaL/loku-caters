"""add random requests system event

Revision ID: 0018_random_requests
Revises: 0017_phone_optional
Create Date: 2026-03-21 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0018_random_requests"
down_revision = "0017_phone_optional"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "events",
        sa.Column("kind", sa.Text(), nullable=False, server_default=sa.text("'event'")),
    )
    op.create_check_constraint(
        "ck_events_kind",
        "events",
        "kind IN ('event', 'random_requests')",
    )
    op.add_column(
        "orders",
        sa.Column("pickup_address", sa.Text(), nullable=True),
    )

    op.execute(
        sa.text("UPDATE events SET kind = 'event' WHERE kind IS NULL OR kind = ''")
    )

    op.execute(
        sa.text(
            "UPDATE events "
            "SET name = 'Random Requests', event_date = 'Random Requests', kind = 'random_requests', is_active = FALSE, updated_at = NOW() "
            "WHERE kind = 'random_requests'"
        )
    )

    op.execute(
        sa.text(
            "INSERT INTO events (name, event_date, kind, hero_header, hero_header_sage, hero_subheader, promo_details, tooltip_enabled, tooltip_header, tooltip_body, tooltip_image_key, hero_side_image_key, etransfer_enabled, etransfer_email, is_active, item_ids, location_ids, combo_deals, updated_at) "
            "SELECT "
            "'Random Requests', "
            "'Random Requests', "
            "'random_requests', "
            "''::text, "
            "''::text, "
            "''::text, "
            "NULL, "
            "FALSE, "
            "NULL, "
            "NULL, "
            "NULL, "
            "NULL, "
            "FALSE, "
            "NULL, "
            "FALSE, "
            "'[]'::jsonb, "
            "'[]'::jsonb, "
            "'[]'::jsonb, "
            "NULL "
            "WHERE NOT EXISTS (SELECT 1 FROM events WHERE kind = 'random_requests')"
        )
    )


def downgrade() -> None:
    op.drop_constraint("ck_events_kind", "events", type_="check")
    op.execute(
        sa.text("UPDATE events SET kind = 'event' WHERE kind = 'random_requests'")
    )
    op.drop_column("orders", "pickup_address")
    op.drop_column("events", "kind")
