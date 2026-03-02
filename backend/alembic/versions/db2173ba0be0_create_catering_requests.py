"""create_catering_requests

Revision ID: db2173ba0be0
Revises: 0017_phone_optional
Create Date: 2026-03-02 11:28:53.985876
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'db2173ba0be0'
down_revision: Union[str, None] = '0017_phone_optional'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'catering_requests',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('first_name', sa.String(), nullable=False),
        sa.Column('last_name', sa.String(), nullable=False),
        sa.Column('email', sa.String(), nullable=False),
        sa.Column('phone_number', sa.String(), nullable=True),
        sa.Column('event_date', sa.String(), nullable=False),
        sa.Column('guest_count', sa.Integer(), nullable=False),
        sa.Column('event_type', sa.String(), nullable=False),
        sa.Column('budget_range', sa.String(), nullable=True),
        sa.Column('special_requests', sa.Text(), nullable=True),
        sa.Column('status', sa.String(), server_default='new', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    op.drop_table('catering_requests')
