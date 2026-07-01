"""decouple invoices from orders

Revision ID: 0025_decouple_invoices
Revises: 0024_invoices
"""

from typing import Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0025_decouple_invoices"
down_revision: Union[str, None] = "0024_invoices"
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    op.add_column("invoices", sa.Column("order_reference", sa.Text(), nullable=True))
    op.add_column(
        "invoices",
        sa.Column("line_items", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'[]'::jsonb")),
    )
    op.add_column("invoices", sa.Column("paid", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("invoices", sa.Column("payment_method", sa.String(), nullable=True))
    op.add_column("invoices", sa.Column("payment_method_other", sa.Text(), nullable=True))

    op.execute(
        sa.text(
            """
            UPDATE invoices
            SET order_reference = NULLIF(snapshot #>> '{order,reference}', ''),
                line_items = COALESCE(snapshot #> '{order,lines}', '[]'::jsonb),
                paid = COALESCE((snapshot #>> '{payment_fallback,paid}')::boolean, false),
                payment_method = NULLIF(snapshot #>> '{payment_fallback,payment_method}', ''),
                payment_method_other = NULLIF(snapshot #>> '{payment_fallback,payment_method_other}', '')
            """
        )
    )
    op.execute(
        sa.text(
            """
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM invoices
                    WHERE jsonb_array_length(line_items) = 0
                ) THEN
                    RAISE EXCEPTION 'Cannot migrate invoice with no saved line items';
                END IF;
            END $$;
            """
        )
    )
    op.execute(
        sa.text(
            """
            UPDATE invoices AS invoice
            SET paid = current_payment.paid,
                payment_method = current_payment.payment_method,
                payment_method_other = current_payment.payment_method_other
            FROM (
                SELECT invoice_row.id,
                       bool_and(order_row.paid) AS paid,
                       (array_agg(order_row.payment_method ORDER BY order_row.created_at, order_row.id))[1] AS payment_method,
                       (array_agg(order_row.payment_method_other ORDER BY order_row.created_at, order_row.id))[1] AS payment_method_other
                FROM invoices AS invoice_row
                JOIN orders AS order_row
                  ON order_row.group_id = invoice_row.source_bundle_id
                  OR (order_row.group_id IS NULL AND order_row.id = invoice_row.source_bundle_id)
                GROUP BY invoice_row.id
            ) AS current_payment
            WHERE invoice.id = current_payment.id
            """
        )
    )

    op.drop_constraint("invoices_source_bundle_id_key", "invoices", type_="unique")
    op.alter_column("invoices", "source_bundle_id", existing_type=sa.Text(), nullable=True)
    op.create_check_constraint(
        "ck_invoices_payment_method",
        "invoices",
        "payment_method IS NULL OR payment_method IN ('etransfer', 'cash', 'other')",
    )


def downgrade() -> None:
    connection = op.get_bind()
    incompatible_count = connection.execute(
        sa.text(
            """
            SELECT count(*)
            FROM invoices
            WHERE source_bundle_id IS NULL
               OR source_bundle_id IN (
                    SELECT source_bundle_id
                    FROM invoices
                    WHERE source_bundle_id IS NOT NULL
                    GROUP BY source_bundle_id
                    HAVING count(*) > 1
               )
            """
        )
    ).scalar_one()
    if incompatible_count:
        raise RuntimeError(
            "Downgrade blocked because standalone or duplicate-order invoices cannot be represented by revision 0024"
        )

    op.drop_constraint("ck_invoices_payment_method", "invoices", type_="check")
    op.alter_column("invoices", "source_bundle_id", existing_type=sa.Text(), nullable=False)
    op.create_unique_constraint("invoices_source_bundle_id_key", "invoices", ["source_bundle_id"])
    op.drop_column("invoices", "payment_method_other")
    op.drop_column("invoices", "payment_method")
    op.drop_column("invoices", "paid")
    op.drop_column("invoices", "line_items")
    op.drop_column("invoices", "order_reference")
