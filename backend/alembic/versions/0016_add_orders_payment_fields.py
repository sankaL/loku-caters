"""add orders payment fields

Revision ID: 0016_add_orders_payment_fields
Revises: 0015_feedback_status_comment
Create Date: 2026-02-27 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0016_add_orders_payment_fields"
down_revision = "0015_feedback_status_comment"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "orders",
        sa.Column("paid", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column("orders", sa.Column("payment_method", sa.Text(), nullable=True))
    op.add_column("orders", sa.Column("payment_method_other", sa.Text(), nullable=True))

    op.create_check_constraint(
        "ck_orders_payment_unpaid_fields_null",
        "orders",
        "paid OR (payment_method IS NULL AND payment_method_other IS NULL)",
    )
    op.create_check_constraint(
        "ck_orders_payment_paid_requires_method",
        "orders",
        "NOT paid OR (payment_method IS NOT NULL AND payment_method IN ('cash','etransfer','other'))",
    )
    op.create_check_constraint(
        "ck_orders_payment_other_requires_details",
        "orders",
        "payment_method <> 'other' OR (payment_method_other IS NOT NULL AND payment_method_other <> '')",
    )
    op.create_check_constraint(
        "ck_orders_payment_non_other_null_details",
        "orders",
        "payment_method NOT IN ('cash','etransfer') OR payment_method_other IS NULL",
    )

    op.execute(
        sa.text(
            "UPDATE orders "
            "SET paid = TRUE, payment_method = 'etransfer', payment_method_other = NULL, status = 'confirmed' "
            "WHERE lower(status) = 'paid'"
        )
    )

    op.create_index("ix_orders_paid", "orders", ["paid"])


def downgrade() -> None:
    op.drop_index("ix_orders_paid", table_name="orders")

    op.execute(
        sa.text(
            "UPDATE orders "
            "SET status = 'paid' "
            "WHERE paid = TRUE AND status = 'confirmed' AND payment_method = 'etransfer' AND payment_method_other IS NULL"
        )
    )

    op.drop_constraint("ck_orders_payment_non_other_null_details", "orders", type_="check")
    op.drop_constraint("ck_orders_payment_other_requires_details", "orders", type_="check")
    op.drop_constraint("ck_orders_payment_paid_requires_method", "orders", type_="check")
    op.drop_constraint("ck_orders_payment_unpaid_fields_null", "orders", type_="check")

    op.drop_column("orders", "payment_method_other")
    op.drop_column("orders", "payment_method")
    op.drop_column("orders", "paid")
