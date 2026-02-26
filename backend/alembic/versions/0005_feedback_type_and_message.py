"""add feedback_type, order_id, message to feedback; make reason nullable

Revision ID: 0005_feedback_type_and_message
Revises: 0004_add_feedback_contact
Create Date: 2026-02-22 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0005_feedback_type_and_message"
down_revision = "0004_add_feedback_contact"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "feedback",
        sa.Column(
            "feedback_type",
            sa.String(),
            nullable=False,
            server_default="non_customer",
        ),
    )
    op.add_column("feedback", sa.Column("order_id", sa.String(), nullable=True))
    op.add_column("feedback", sa.Column("message", sa.Text(), nullable=True))
    op.alter_column("feedback", "reason", nullable=True)


def downgrade() -> None:
    op.alter_column("feedback", "reason", nullable=False)
    op.drop_column("feedback", "message")
    op.drop_column("feedback", "order_id")
    op.drop_column("feedback", "feedback_type")
