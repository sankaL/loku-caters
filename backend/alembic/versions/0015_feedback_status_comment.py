"""add feedback status and admin_comment columns

Revision ID: 0015_feedback_status_comment
Revises: 0014_add_reminded_boolean
Create Date: 2026-02-27 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0015_feedback_status_comment"
down_revision = "0014_add_reminded_boolean"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "feedback",
        sa.Column("status", sa.String(), nullable=False, server_default="new"),
    )
    op.add_column(
        "feedback",
        sa.Column("admin_comment", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("feedback", "admin_comment")
    op.drop_column("feedback", "status")
