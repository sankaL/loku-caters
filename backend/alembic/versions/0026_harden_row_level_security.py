"""harden row level security policies

Revision ID: 0026_harden_rls
Revises: 0025_decouple_invoices
Create Date: 2026-07-14 00:00:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0026_harden_rls"
down_revision: Union[str, None] = "0025_decouple_invoices"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_TABLES = (
    "orders",
    "feedback",
    "events",
    "items",
    "locations",
    "customers",
    "catering_requests",
    "catering_request_comments",
    "event_plans",
    "invoices",
    "invoice_settings",
    "invoice_number_counters",
    "alembic_version",
)
_POLICY_NAME = "deny_direct_api_access"


def upgrade() -> None:
    for table in _TABLES:
        op.execute(
            sa.text(f"ALTER TABLE IF EXISTS public.{table} ENABLE ROW LEVEL SECURITY")
        )
        op.execute(
            # All interpolated identifiers come from fixed migration constants.
            sa.text(  # nosec B608
                f"""
                DO $$
                DECLARE
                    api_roles text;
                    role_name text;
                BEGIN
                    SELECT string_agg(format('%I', rolname), ', ' ORDER BY rolname)
                    INTO api_roles
                    FROM pg_roles
                    WHERE rolname IN ('anon', 'authenticated');

                    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated']
                    LOOP
                        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
                            EXECUTE format(
                                'REVOKE ALL ON TABLE %I.%I FROM %I',
                                'public',
                                '{table}',
                                role_name
                            );
                        END IF;
                    END LOOP;

                    DROP POLICY IF EXISTS {_POLICY_NAME} ON public.{table};
                    IF api_roles IS NOT NULL THEN
                        EXECUTE format(
                            'CREATE POLICY %I ON %I.%I AS RESTRICTIVE FOR ALL TO %s USING (false) WITH CHECK (false)',
                            '{_POLICY_NAME}',
                            'public',
                            '{table}',
                            api_roles
                        );
                    END IF;
                END
                $$;
                """
            )
        )

    op.execute(
        sa.text(
            """
            DO $$
            DECLARE
                role_name text;
            BEGIN
                FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated']
                LOOP
                    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
                        EXECUTE format(
                            'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I',
                            role_name
                        );
                        EXECUTE format(
                            'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I',
                            role_name
                        );
                        EXECUTE format(
                            'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I',
                            role_name
                        );
                    END IF;
                END LOOP;
            END
            $$;
            """
        )
    )


def downgrade() -> None:
    for table in _TABLES:
        op.execute(sa.text(f"DROP POLICY IF EXISTS {_POLICY_NAME} ON public.{table}"))

    # RLS and revoked grants intentionally remain in place. Restoring direct API
    # access requires an explicit, table-specific security decision.
