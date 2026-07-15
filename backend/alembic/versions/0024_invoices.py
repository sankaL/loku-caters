"""add invoice module

Revision ID: 0024_invoices
Revises: 0023_event_plans
Create Date: 2026-06-30 00:00:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0024_invoices"
down_revision: Union[str, None] = "0023_event_plans"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _revoke_api_role_access(table: str) -> None:
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
                        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', '{table}', role_name);
                    END IF;
                END LOOP;
            END
            $$;
            """
        )
    )


def upgrade() -> None:
    op.create_table(
        "invoice_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "business_name",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'Loku Caters'"),
        ),
        sa.Column("business_address", sa.Text(), nullable=True),
        sa.Column("business_email", sa.Text(), nullable=True),
        sa.Column("business_phone", sa.Text(), nullable=True),
        sa.Column(
            "payment_method",
            sa.String(),
            nullable=False,
            server_default=sa.text("'none'"),
        ),
        sa.Column("payment_email", sa.Text(), nullable=True),
        sa.Column("payment_instructions", sa.Text(), nullable=True),
        sa.Column("default_footer_note", sa.Text(), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.CheckConstraint("id = 1", name="ck_invoice_settings_singleton"),
        sa.CheckConstraint(
            "payment_method IN ('none', 'etransfer', 'cash', 'other')",
            name="ck_invoice_settings_payment_method",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.execute(
        sa.text(
            "INSERT INTO invoice_settings (id, business_name) VALUES (1, 'Loku Caters')"
        )
    )

    op.create_table(
        "invoice_number_counters",
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column(
            "last_value", sa.Integer(), nullable=False, server_default=sa.text("0")
        ),
        sa.CheckConstraint(
            "last_value >= 0", name="ck_invoice_number_counters_nonnegative"
        ),
        sa.PrimaryKeyConstraint("year"),
    )

    op.create_table(
        "invoices",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("invoice_number", sa.Text(), nullable=False),
        sa.Column("number_year", sa.Integer(), nullable=False),
        sa.Column("number_sequence", sa.Integer(), nullable=False),
        sa.Column("source_bundle_id", sa.Text(), nullable=False),
        sa.Column("source_order_id", sa.String(), nullable=True),
        sa.Column("source_event_id", sa.Integer(), nullable=True),
        sa.Column("customer_name", sa.Text(), nullable=False),
        sa.Column("customer_email", sa.Text(), nullable=True),
        sa.Column("customer_phone", sa.Text(), nullable=True),
        sa.Column("issue_date", sa.Date(), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("memo", sa.Text(), nullable=True),
        sa.Column("currency", sa.String(), nullable=False),
        sa.Column("subtotal", sa.Numeric(10, 2), nullable=False),
        sa.Column(
            "discount_total",
            sa.Numeric(10, 2),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("total", sa.Numeric(10, 2), nullable=False),
        sa.Column(
            "snapshot",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
        sa.CheckConstraint("due_date >= issue_date", name="ck_invoices_due_date"),
        sa.CheckConstraint(
            "subtotal >= 0 AND discount_total >= 0 AND total >= 0",
            name="ck_invoices_amounts_nonnegative",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("invoice_number"),
        sa.UniqueConstraint("source_bundle_id"),
        sa.UniqueConstraint(
            "number_year", "number_sequence", name="uq_invoices_year_sequence"
        ),
    )
    op.create_index("ix_invoices_invoice_number", "invoices", ["invoice_number"])
    op.create_index("ix_invoices_number_year", "invoices", ["number_year"])
    op.create_index("ix_invoices_source_bundle_id", "invoices", ["source_bundle_id"])
    op.create_index("ix_invoices_source_event_id", "invoices", ["source_event_id"])

    for table in ("invoice_settings", "invoice_number_counters", "invoices"):
        op.execute(
            sa.text(f"ALTER TABLE IF EXISTS public.{table} ENABLE ROW LEVEL SECURITY")
        )
        _revoke_api_role_access(table)


def downgrade() -> None:
    op.drop_index("ix_invoices_source_event_id", table_name="invoices")
    op.drop_index("ix_invoices_source_bundle_id", table_name="invoices")
    op.drop_index("ix_invoices_number_year", table_name="invoices")
    op.drop_index("ix_invoices_invoice_number", table_name="invoices")
    op.drop_table("invoices")
    op.drop_table("invoice_number_counters")
    op.drop_table("invoice_settings")
