"""create event_config table

Revision ID: 0002_create_event_config
Revises: 0001_create_orders
Create Date: 2026-02-20 00:00:00.000000
"""

from __future__ import annotations

import json
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers, used by Alembic.
revision = "0002_create_event_config"
down_revision = "0001_create_orders"
branch_labels = None
depends_on = None

_SEED_ITEMS = [
    {
        "id": "lamprais-01",
        "name": "Lamprais",
        "description": (
            "Authentic Sri Lankan rice cooked in rich stock, wrapped in a banana leaf"
            " with fragrant accompaniments"
        ),
        "price": 23.00,
        "discounted_price": 20.00,
    }
]

_SEED_LOCATIONS = [
    {
        "id": "welland",
        "name": "Welland",
        "address": "",
        "timeSlots": [
            "11:00 AM - 12:00 PM",
            "12:00 PM - 1:00 PM",
            "1:00 PM - 2:00 PM",
            "3:00 PM - 4:00 PM",
            "4:00 PM - 5:00 PM",
            "5:00 PM - 6:00 PM",
            "6:00 PM - 7:00 PM",
            "7:00 PM - 8:00 PM",
        ],
    },
    {
        "id": "woodbridge",
        "name": "Woodbridge",
        "address": "",
        "timeSlots": [
            "12:00 PM - 1:00 PM",
            "1:00 PM - 2:00 PM",
            "2:00 PM - 3:00 PM",
        ],
    },
]


def upgrade() -> None:
    op.create_table(
        "event_config",
        sa.Column("id", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("event_date", sa.Text(), nullable=False),
        sa.Column("currency", sa.Text(), nullable=False, server_default="CAD"),
        sa.Column("items", JSONB(), nullable=False),
        sa.Column("locations", JSONB(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.execute(
        sa.text(
            "INSERT INTO event_config (id, event_date, currency, items, locations)"
            " VALUES (:id, :event_date, :currency, CAST(:items AS jsonb), CAST(:locations AS jsonb))"
        ).bindparams(
            id=1,
            event_date="February 28th, 2026",
            currency="CAD",
            items=json.dumps(_SEED_ITEMS),
            locations=json.dumps(_SEED_LOCATIONS),
        )
    )


def downgrade() -> None:
    op.drop_table("event_config")
