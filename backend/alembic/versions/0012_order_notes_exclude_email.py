"""add order notes and email exclusion

Revision ID: 0012_order_notes_exclude_email
Revises: 0011_enable_rls_public_tables
Create Date: 2026-02-25 00:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0012_order_notes_exclude_email"
down_revision = "0011_enable_rls_public_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("orders", sa.Column("notes", sa.Text(), nullable=True))
    op.add_column(
        "orders",
        sa.Column(
            "exclude_email",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )

    op.alter_column("orders", "email", existing_type=sa.String(), nullable=True)
    op.alter_column("orders", "phone_number", existing_type=sa.String(), nullable=True)

    op.create_check_constraint(
        "ck_orders_contact_required_unless_excluded",
        "orders",
        "exclude_email OR (email IS NOT NULL AND phone_number IS NOT NULL)",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_orders_contact_required_unless_excluded",
        "orders",
        type_="check",
    )

    op.execute(sa.text("UPDATE orders SET email = '' WHERE email IS NULL"))
    op.execute(sa.text("UPDATE orders SET phone_number = '' WHERE phone_number IS NULL"))

    op.alter_column("orders", "email", existing_type=sa.String(), nullable=False)
    op.alter_column("orders", "phone_number", existing_type=sa.String(), nullable=False)

    op.drop_column("orders", "exclude_email")
    op.drop_column("orders", "notes")
