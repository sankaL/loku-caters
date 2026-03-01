"""add email queue tables

Revision ID: 0018_email_queue
Revises: 0017_phone_optional
Create Date: 2026-03-01 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0018_email_queue"
down_revision = "0017_phone_optional"
branch_labels = None
depends_on = None


_TABLES = [
    "public.email_batches",
    "public.email_jobs",
    "public.email_events",
    "public.email_suppressions",
]


def upgrade() -> None:
    op.create_table(
        "email_batches",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("created_by", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("meta", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
    )

    op.create_table(
        "email_jobs",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("batch_id", sa.Text(), nullable=True),
        sa.Column("type", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default=sa.text("'queued'")),
        sa.Column("dedupe_key", sa.Text(), nullable=False),
        sa.Column("order_id", sa.Text(), nullable=True),
        sa.Column("to_email", sa.Text(), nullable=True),
        sa.Column("from_email", sa.Text(), nullable=False),
        sa.Column("reply_to_email", sa.Text(), nullable=True),
        sa.Column("subject", sa.Text(), nullable=True),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("resend_message_id", sa.Text(), nullable=True),
        sa.Column("attempt_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("max_attempts", sa.Integer(), nullable=False, server_default=sa.text("8")),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("locked_by", sa.Text(), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["batch_id"], ["email_batches.id"], ondelete="SET NULL"),
    )
    op.create_unique_constraint("uq_email_jobs_dedupe_key", "email_jobs", ["dedupe_key"])
    op.create_index("ix_email_jobs_status_next_attempt_at", "email_jobs", ["status", "next_attempt_at"])
    op.create_index("ix_email_jobs_batch_id_status", "email_jobs", ["batch_id", "status"])
    op.create_index("ix_email_jobs_order_id_type", "email_jobs", ["order_id", "type"])

    op.create_table(
        "email_events",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("job_id", sa.Text(), nullable=True),
        sa.Column("resend_message_id", sa.Text(), nullable=True),
        sa.Column("event_type", sa.Text(), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.ForeignKeyConstraint(["job_id"], ["email_jobs.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_email_events_resend_message_id", "email_events", ["resend_message_id"])
    op.create_index("ix_email_events_job_id", "email_events", ["job_id"])

    op.create_table(
        "email_suppressions",
        sa.Column("email", sa.Text(), primary_key=True),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("meta", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
    )

    for table in _TABLES:
        op.execute(sa.text(f"ALTER TABLE IF EXISTS {table} ENABLE ROW LEVEL SECURITY"))


def downgrade() -> None:
    for table in _TABLES:
        op.execute(sa.text(f"ALTER TABLE IF EXISTS {table} DISABLE ROW LEVEL SECURITY"))

    op.drop_table("email_suppressions")
    op.drop_index("ix_email_events_job_id", table_name="email_events")
    op.drop_index("ix_email_events_resend_message_id", table_name="email_events")
    op.drop_table("email_events")
    op.drop_index("ix_email_jobs_order_id_type", table_name="email_jobs")
    op.drop_index("ix_email_jobs_batch_id_status", table_name="email_jobs")
    op.drop_index("ix_email_jobs_status_next_attempt_at", table_name="email_jobs")
    op.drop_constraint("uq_email_jobs_dedupe_key", "email_jobs", type_="unique")
    op.drop_table("email_jobs")
    op.drop_table("email_batches")
