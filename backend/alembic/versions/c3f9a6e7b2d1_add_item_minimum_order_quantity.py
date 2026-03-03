"""add minimum order quantity to items

Revision ID: c3f9a6e7b2d1
Revises: 9c8b0b7f2e1a
Create Date: 2026-03-03 00:00:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c3f9a6e7b2d1"
down_revision: Union[str, None] = "9c8b0b7f2e1a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "items",
        sa.Column("minimum_order_quantity", sa.Integer(), nullable=False, server_default="1"),
    )
    op.create_check_constraint(
        "ck_items_minimum_order_quantity_gte_1",
        "items",
        "minimum_order_quantity >= 1",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_items_minimum_order_quantity_gte_1",
        "items",
        type_="check",
    )
    op.drop_column("items", "minimum_order_quantity")
