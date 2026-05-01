"""add event planning snapshots

Revision ID: 0023_event_plans
Revises: 0022_item_menu_image_key
Create Date: 2026-04-29 00:00:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0023_event_plans"
down_revision: Union[str, None] = "0022_item_menu_image_key"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _revoke_api_role_access(schema: str, table: str) -> None:
    op.execute(
        sa.text(
            f"""
            DO $$
            DECLARE
                role_name text;
            BEGIN
                FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated']
                LOOP
                    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
                        EXECUTE format(
                            'REVOKE ALL ON TABLE %I.%I FROM %I',
                            '{schema}',
                            '{table}',
                            role_name
                        );
                    END IF;
                END LOOP;
            END
            $$;
            """
        )
    )


def upgrade() -> None:
    op.add_column("orders", sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True))
    op.execute(sa.text("UPDATE orders SET updated_at = COALESCE(created_at, NOW())"))
    op.alter_column("orders", "updated_at", nullable=False)

    op.create_table(
        "event_plans",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("source_event_id", sa.Integer(), nullable=False),
        sa.Column("source_event_kind", sa.Text(), nullable=False, server_default=sa.text("'event'")),
        sa.Column("status", sa.Text(), nullable=False, server_default=sa.text("'draft'")),
        sa.Column("included_order_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("ordered_quantity", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("planned_quantity", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("issue_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("warning_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.CheckConstraint("status IN ('draft', 'ready', 'archived')", name="ck_event_plans_status"),
        sa.CheckConstraint("source_event_kind IN ('event', 'random_requests')", name="ck_event_plans_source_event_kind"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_event_plans_source_event_id", "event_plans", ["source_event_id"])
    op.create_index("ix_event_plans_status", "event_plans", ["status"])
    op.execute(sa.text("ALTER TABLE IF EXISTS public.event_plans ENABLE ROW LEVEL SECURITY"))
    _revoke_api_role_access("public", "event_plans")


def downgrade() -> None:
    op.drop_index("ix_event_plans_status", table_name="event_plans")
    op.drop_index("ix_event_plans_source_event_id", table_name="event_plans")
    op.drop_table("event_plans")
    op.drop_column("orders", "updated_at")
