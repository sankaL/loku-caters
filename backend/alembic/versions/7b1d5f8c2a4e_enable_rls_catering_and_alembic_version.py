"""enable RLS on catering and alembic metadata tables

Revision ID: 7b1d5f8c2a4e
Revises: c3f9a6e7b2d1
Create Date: 2026-03-06 00:00:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "7b1d5f8c2a4e"
down_revision: Union[str, None] = "c3f9a6e7b2d1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_TABLES = [
    ("public", "catering_requests"),
    ("public", "catering_request_comments"),
    ("public", "alembic_version"),
]


def _set_row_level_security(enabled: bool) -> None:
    action = "ENABLE" if enabled else "DISABLE"
    for schema, table in _TABLES:
        op.execute(
            sa.text(f"ALTER TABLE IF EXISTS {schema}.{table} {action} ROW LEVEL SECURITY")
        )


def _revoke_api_role_access(schema: str, table: str) -> None:
    # Supabase API roles are absent in some local Postgres setups.
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
    _set_row_level_security(enabled=True)
    for schema, table in _TABLES:
        _revoke_api_role_access(schema, table)


def downgrade() -> None:
    # Restoring prior grants is intentionally skipped because they vary by environment.
    _set_row_level_security(enabled=False)
