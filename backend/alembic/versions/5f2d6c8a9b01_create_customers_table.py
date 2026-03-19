"""create customers table

Revision ID: 5f2d6c8a9b01
Revises: 7b1d5f8c2a4e
Create Date: 2026-03-18 00:00:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "5f2d6c8a9b01"
down_revision: Union[str, None] = "a4d7e3b91c2f"
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
    op.create_table(
        "customers",
        sa.Column("id", sa.Text(), nullable=False),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("phone_number", sa.Text(), nullable=True),
        sa.Column(
            "pickup_locations",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email", name="uq_customers_email"),
    )
    op.execute(sa.text("ALTER TABLE IF EXISTS public.customers ENABLE ROW LEVEL SECURITY"))
    _revoke_api_role_access("public", "customers")


def downgrade() -> None:
    op.drop_table("customers")
