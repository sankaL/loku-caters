"""enable RLS on public tables

Revision ID: 0011_enable_rls_public_tables
Revises: 0010_event_etransfer_fields
Create Date: 2026-02-25 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0011_enable_rls_public_tables"
down_revision = "0010_event_etransfer_fields"
branch_labels = None
depends_on = None


_TABLES = [
    "public.orders",
    "public.feedback",
    "public.events",
    "public.items",
    "public.locations",
    "public.event_config",
]


def upgrade() -> None:
    for table in _TABLES:
        op.execute(sa.text(f"ALTER TABLE IF EXISTS {table} ENABLE ROW LEVEL SECURITY"))


def downgrade() -> None:
    for table in _TABLES:
        op.execute(sa.text(f"ALTER TABLE IF EXISTS {table} DISABLE ROW LEVEL SECURITY"))
