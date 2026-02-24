"""create feedback table

Revision ID: 0005_create_feedback
Revises: 0004_events_table
Create Date: 2026-02-22 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0005_create_feedback"
down_revision = "0004_events_table"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "feedback",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column("reason", sa.String(), nullable=False),
        sa.Column("other_details", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("feedback")
