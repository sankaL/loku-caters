"""make phone_number optional on orders

Revision ID: 0017_phone_optional
Revises: 0016_add_orders_payment_fields
Create Date: 2026-02-27 00:00:00.000000
"""

from __future__ import annotations

from alembic import op


revision = "0017_phone_optional"
down_revision = "0016_add_orders_payment_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint(
        "ck_orders_contact_required_unless_excluded",
        "orders",
        type_="check",
    )
    op.create_check_constraint(
        "ck_orders_contact_required_unless_excluded",
        "orders",
        "exclude_email OR email IS NOT NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_orders_contact_required_unless_excluded",
        "orders",
        type_="check",
    )
    op.create_check_constraint(
        "ck_orders_contact_required_unless_excluded",
        "orders",
        "exclude_email OR (email IS NOT NULL AND phone_number IS NOT NULL)",
    )
