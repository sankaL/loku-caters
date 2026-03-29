"""add rating and show_in_reviews to feedback

Revision ID: 0021_feedback_rating_reviews
Revises: 0020_add_pickup_date
Create Date: 2026-03-29 00:00:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0021_feedback_rating_reviews"
down_revision: Union[str, None] = "0020_add_pickup_date"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("feedback", sa.Column("rating", sa.Integer(), nullable=True))
    op.add_column(
        "feedback",
        sa.Column(
            "show_in_reviews",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    # Remove the server_default after backfill so the ORM default takes over
    op.alter_column("feedback", "show_in_reviews", server_default=None)


def downgrade() -> None:
    op.drop_column("feedback", "show_in_reviews")
    op.drop_column("feedback", "rating")
