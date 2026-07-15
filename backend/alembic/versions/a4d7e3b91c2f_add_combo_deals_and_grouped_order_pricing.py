"""add combo deals and grouped order pricing

Revision ID: a4d7e3b91c2f
Revises: 7b1d5f8c2a4e
Create Date: 2026-03-15 00:00:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "a4d7e3b91c2f"
down_revision: Union[str, None] = "7b1d5f8c2a4e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "events",
        sa.Column(
            "combo_deals",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )

    op.add_column("orders", sa.Column("group_id", sa.String(), nullable=True))
    op.add_column(
        "orders",
        sa.Column(
            "base_total_price", sa.Numeric(10, 2), nullable=False, server_default="0"
        ),
    )
    op.add_column(
        "orders",
        sa.Column(
            "discount_total", sa.Numeric(10, 2), nullable=False, server_default="0"
        ),
    )
    op.add_column(
        "orders",
        sa.Column(
            "pricing_meta",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.create_index("ix_orders_group_id", "orders", ["group_id"], unique=False)

    op.execute(
        """
        UPDATE orders
        SET
            base_total_price = total_price,
            discount_total = 0,
            pricing_meta = '{}'::jsonb
        """
    )

    op.alter_column("events", "combo_deals", server_default=None)
    op.alter_column("orders", "base_total_price", server_default=None)
    op.alter_column("orders", "discount_total", server_default=None)
    op.alter_column("orders", "pricing_meta", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_orders_group_id", table_name="orders")
    op.drop_column("orders", "pricing_meta")
    op.drop_column("orders", "discount_total")
    op.drop_column("orders", "base_total_price")
    op.drop_column("orders", "group_id")
    op.drop_column("events", "combo_deals")
