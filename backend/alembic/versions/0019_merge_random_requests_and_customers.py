"""merge alembic heads for random requests and customers

Revision ID: 0019_merge_random_customers
Revises: 0018_random_requests, 5f2d6c8a9b01
Create Date: 2026-03-21 00:00:00.000000
"""

from __future__ import annotations

revision = "0019_merge_random_customers"
down_revision = ("0018_random_requests", "5f2d6c8a9b01")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
