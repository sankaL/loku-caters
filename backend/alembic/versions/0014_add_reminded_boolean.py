"""add orders.reminded boolean

Revision ID: 0014_add_reminded_boolean
Revises: 0013_orders_event_id
Create Date: 2026-02-26 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0014_add_reminded_boolean"
down_revision = "0013_orders_event_id"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "orders",
        sa.Column("reminded", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )

    op.execute(
        sa.text(
            "UPDATE orders SET reminded = TRUE, status = 'confirmed' WHERE status = 'reminded'"
        )
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            "UPDATE orders SET status = 'reminded' WHERE reminded = TRUE AND status = 'confirmed'"
        )
    )
    op.drop_column("orders", "reminded")
