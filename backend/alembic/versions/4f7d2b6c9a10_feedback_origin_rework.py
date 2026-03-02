"""rework feedback origin and type values

Revision ID: 4f7d2b6c9a10
Revises: db2173ba0be0
Create Date: 2026-03-02 12:30:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "4f7d2b6c9a10"
down_revision = "db2173ba0be0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("feedback", sa.Column("origin", sa.String(), nullable=True))

    op.execute(
        """
        UPDATE feedback
        SET origin = 'events_page_customer',
            feedback_type = 'feedback'
        WHERE feedback_type = 'customer'
        """
    )

    op.execute(
        """
        UPDATE feedback
        SET origin = 'contact_us',
            feedback_type = CASE lower(trim(split_part(split_part(message, E'\\n', 1), ':', 2)))
                WHEN 'general question' THEN 'general_question'
                WHEN 'feedback' THEN 'feedback'
                WHEN 'collaboration' THEN 'collaboration'
                WHEN 'other' THEN 'other'
                ELSE 'other'
            END,
            message = NULLIF(
                regexp_replace(
                    regexp_replace(
                        COALESCE(message, ''),
                        E'^Subject:[^\\r\\n]*\\r?\\n(?:\\r?\\n)?',
                        ''
                    ),
                    E'^[\\s\\r\\n]+|[\\s\\r\\n]+$',
                    '',
                    'g'
                ),
                ''
            ),
            reason = NULL
        WHERE feedback_type = 'non_customer'
          AND message LIKE 'Subject:%'
        """
    )

    op.execute(
        """
        UPDATE feedback
        SET origin = 'events_page_non_customer',
            feedback_type = 'feedback'
        WHERE feedback_type = 'non_customer'
          AND (message IS NULL OR message NOT LIKE 'Subject:%')
        """
    )

    op.execute(
        """
        UPDATE feedback
        SET origin = 'contact_us',
            feedback_type = CASE reason
                WHEN 'general_feedback' THEN 'feedback'
                WHEN 'catering_inquiry' THEN 'general_question'
                WHEN 'previous_order_inquiry' THEN 'general_question'
                WHEN 'stay_updated' THEN 'other'
                ELSE 'other'
            END,
            reason = NULL
        WHERE feedback_type = 'general_contact'
        """
    )

    op.execute(
        """
        UPDATE feedback
        SET origin = CASE
            WHEN order_id IS NOT NULL THEN 'events_page_customer'
            WHEN reason IS NOT NULL OR other_details IS NOT NULL THEN 'events_page_non_customer'
            ELSE 'contact_us'
        END
        WHERE origin IS NULL
        """
    )

    op.execute(
        """
        UPDATE feedback
        SET feedback_type = 'feedback'
        WHERE feedback_type NOT IN ('general_question', 'feedback', 'collaboration', 'other')
        """
    )

    op.alter_column("feedback", "origin", nullable=False)


def downgrade() -> None:
    op.execute(
        """
        UPDATE feedback
        SET reason = CASE
            WHEN origin = 'contact_us' AND feedback_type = 'feedback' THEN 'general_feedback'
            WHEN origin = 'contact_us' THEN 'other'
            ELSE reason
        END
        WHERE origin = 'contact_us'
        """
    )

    op.execute(
        """
        UPDATE feedback
        SET feedback_type = CASE
            WHEN origin = 'events_page_customer' THEN 'customer'
            WHEN origin = 'events_page_non_customer' THEN 'non_customer'
            ELSE 'general_contact'
        END
        """
    )

    op.drop_column("feedback", "origin")
