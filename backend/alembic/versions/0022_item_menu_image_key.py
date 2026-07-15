"""add menu image key to items

Revision ID: 0022_item_menu_image_key
Revises: 0021_feedback_rating_reviews
Create Date: 2026-04-28 00:00:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0022_item_menu_image_key"
down_revision: Union[str, None] = "0021_feedback_rating_reviews"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("items", sa.Column("image_key", sa.Text(), nullable=True))
    op.execute(
        sa.text("""
        UPDATE items
        SET image_key = CASE lower(trim(name))
            WHEN 'lamprais' THEN 'menu-item-lamprais'
            WHEN 'veg lamprais' THEN 'menu-item-lamprais-veg'
            WHEN 'vegetarian lamprais' THEN 'menu-item-lamprais-veg'
            WHEN 'vegetable lamprais' THEN 'menu-item-lamprais-veg'
            WHEN 'rolls' THEN 'menu-item-rolls'
            WHEN 'pastries' THEN 'menu-item-pastries'
            WHEN 'patties' THEN 'menu-item-patties'
            WHEN 'cutlets' THEN 'menu-item-cutlets'
            WHEN 'seeni sambol' THEN 'menu-item-seeni-sambol'
            ELSE image_key
        END
        WHERE lower(trim(name)) IN (
            'lamprais',
            'veg lamprais',
            'vegetarian lamprais',
            'vegetable lamprais',
            'rolls',
            'pastries',
            'patties',
            'cutlets',
            'seeni sambol'
        )
    """)
    )


def downgrade() -> None:
    op.drop_column("items", "image_key")
