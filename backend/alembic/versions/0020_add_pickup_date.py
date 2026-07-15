"""add_pickup_date

Revision ID: 0020_add_pickup_date
Revises: 0019_merge_random_customers
Create Date: 2026-03-24 00:00:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0020_add_pickup_date"
down_revision: Union[str, None] = "0019_merge_random_customers"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("events", sa.Column("pickup_date", sa.Date(), nullable=True))
    op.add_column("orders", sa.Column("pickup_date", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("events", "pickup_date")
    op.drop_column("orders", "pickup_date")
