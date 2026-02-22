# Database Schema

Hosted on **Supabase (PostgreSQL)**. Schema is managed via Alembic migrations in `backend/alembic/versions/`.

---

## Table: `orders`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `UUID` | Primary key, default `gen_random_uuid()` | Exposed to customer as 8-char reference (uppercased) |
| `name` | `TEXT` | NOT NULL | Customer full name |
| `item_id` | `TEXT` | NOT NULL | Matches `id` in `event_config.items` |
| `item_name` | `TEXT` | NOT NULL | Denormalised name at time of order |
| `quantity` | `INTEGER` | NOT NULL, CHECK >= 1 | Number of portions |
| `pickup_location` | `TEXT` | NOT NULL | Matches a location name in `event_config.locations` |
| `pickup_time_slot` | `TEXT` | NOT NULL | Matches a time slot for that location |
| `phone_number` | `TEXT` | NOT NULL | |
| `email` | `TEXT` | NOT NULL | Used to send Resend confirmation |
| `total_price` | `DECIMAL(10,2)` | NOT NULL | Always computed server-side from config price |
| `status` | `TEXT` | default `'pending'` | See valid values below |
| `created_at` | `TIMESTAMPTZ` | default `NOW()` | UTC |

### Order status values

| Value | Meaning |
|---|---|
| `pending` | Order submitted, awaiting admin review |
| `confirmed` | Confirmed by admin via admin panel; confirmation email sent with pickup address |
| `paid` | Payment received |
| `picked_up` | Customer collected the order |
| `no_show` | Customer did not pick up |
| `cancelled` | Order cancelled |

---

## Table: `event_config`

Single-row table (`id = 1` always). Stores all event configuration that was previously managed via `event-config.json`. Edited through the admin panel at `/admin/config`. The main order page and backend read from this table at runtime.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `INTEGER` | Primary key, always `1` | Single-row design |
| `event_date` | `TEXT` | NOT NULL | Display string shown on the hero section, e.g. `"February 28th, 2026"` |
| `currency` | `TEXT` | NOT NULL, default `'CAD'` | 3-letter currency code |
| `items` | `JSONB` | NOT NULL | Array of item objects (see structure below) |
| `locations` | `JSONB` | NOT NULL | Array of location objects (see structure below) |
| `updated_at` | `TIMESTAMPTZ` | | Set automatically when admin saves config |

### `items` JSONB structure

```json
[
  {
    "id": "lamprais-01",
    "name": "Lamprais",
    "description": "...",
    "price": 23.00,
    "discounted_price": 20.00
  }
]
```

`discounted_price` is optional. If present, it overrides `price` for display and order calculation.

### `locations` JSONB structure

```json
[
  {
    "id": "woodbridge",
    "name": "Woodbridge",
    "address": "123 Main St, Woodbridge, ON L4H 1A1",
    "timeSlots": ["12:00 PM - 1:00 PM", "1:00 PM - 2:00 PM"]
  }
]
```

`address` is included in the confirmation email when admin sends it via the admin panel.

---

## Table: `feedback`

Stores visitor feedback from users who cannot participate in the current batch. Name is optional; all submissions may be anonymous.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `TEXT` (UUID) | Primary key | Python-generated UUID string |
| `feedback_type` | `TEXT` | NOT NULL, default `non_customer` | `non_customer` (pre-order badge) or `customer` (post-order confirmation page) |
| `order_id` | `TEXT` | nullable | Links to `orders.id` for customer feedback |
| `name` | `TEXT` | nullable | Auto-filled from order for customers; optional for non-customers |
| `contact` | `TEXT` | nullable | Auto-filled from order email for customers; optional for non-customers |
| `reason` | `TEXT` | nullable | Machine-readable key; only set for non-customer feedback (see allowed values below) |
| `other_details` | `TEXT` | nullable | Free text; populated only when `reason = 'other'` |
| `message` | `TEXT` | nullable | Free-form feedback message; primarily used for customer feedback |
| `created_at` | `TIMESTAMPTZ` | default `NOW()` | UTC |

### Allowed `reason` values

| Value | Display label |
|---|---|
| `price_too_high` | Price too high |
| `location_not_convenient` | Pickup location not convenient |
| `dietary_needs` | Food does not meet dietary needs |
| `not_available` | Not available on the event date |
| `different_menu` | Prefer a different menu item |
| `not_interested` | Not interested at this time |
| `other` | Other |

---

## Applying migrations

Migrations live in `backend/alembic/versions/`. To apply all pending migrations:

```bash
cd backend
alembic upgrade head
```

| Migration | Creates |
|---|---|
| `0001_create_orders` | `orders` table |
| `0002_create_event_config` | `event_config` table, seeded with values from the original `event-config.json` |
| `0003_create_feedback` | `feedback` table |
| `0004_add_feedback_contact` | adds `contact` column to `feedback` |
| `0005_feedback_type_and_message` | adds `feedback_type`, `order_id`, `message`; makes `reason` nullable |

---

## Relationships

**Two-table design** with no foreign keys between them.

`orders` captures item and location data as denormalised strings at order time so records remain accurate even if the config changes later. `event_config` is the live source of truth for items, locations, and pricing; it is read at request time by the backend and frontend.
