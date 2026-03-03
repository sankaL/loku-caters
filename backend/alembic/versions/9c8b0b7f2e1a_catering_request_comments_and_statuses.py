"""add catering request comments and expand statuses

Revision ID: 9c8b0b7f2e1a
Revises: 4f7d2b6c9a10
Create Date: 2026-03-02 15:45:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "9c8b0b7f2e1a"
down_revision: Union[str, None] = "4f7d2b6c9a10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE catering_requests
        SET status = 'done'
        WHERE status = 'resolved'
        """
    )

    op.create_table(
        "catering_request_comments",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("catering_request_id", sa.String(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_catering_request_comments_catering_request_id",
        "catering_request_comments",
        ["catering_request_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_catering_request_comments_catering_request_id",
        table_name="catering_request_comments",
    )
    op.drop_table("catering_request_comments")

    op.execute(
        """
        UPDATE catering_requests
        SET status = CASE
            WHEN status = 'done' THEN 'resolved'
            WHEN status = 'rejected' THEN 'resolved'
            WHEN status = 'in_review' THEN 'new'
            ELSE status
        END
        """
    )
