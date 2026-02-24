"""add contact column to feedback table

Revision ID: 0006_add_feedback_contact
Revises: 0005_create_feedback
Create Date: 2026-02-22 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0006_add_feedback_contact"
down_revision = "0005_create_feedback"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("feedback", sa.Column("contact", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("feedback", "contact")
