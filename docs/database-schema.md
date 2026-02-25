# Database Schema

Hosted on **Supabase (PostgreSQL)**. Schema is managed via Alembic migrations in `backend/alembic/versions/`.

---

## Table: `orders`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `UUID` | Primary key, default `gen_random_uuid()` | Exposed to customer as 8-char reference (uppercased) |
| `name` | `TEXT` | NOT NULL | Customer full name |
| `item_id` | `TEXT` | NOT NULL | Denormalised at order time; matches an `items.id` at time of order |
| `item_name` | `TEXT` | NOT NULL | Denormalised name at time of order |
| `quantity` | `INTEGER` | NOT NULL, CHECK >= 1 | Number of portions |
| `pickup_location` | `TEXT` | NOT NULL | Matches a location name in the `locations` table |
| `pickup_time_slot` | `TEXT` | NOT NULL | Matches a time slot for that location |
| `phone_number` | `TEXT` | NOT NULL | |
| `email` | `TEXT` | NOT NULL | Used to send Resend confirmation |
| `total_price` | `DECIMAL(10,2)` | NOT NULL | Always computed server-side from items table price |
| `status` | `TEXT` | default `'pending'` | See valid values below |
| `created_at` | `TIMESTAMPTZ` | default `NOW()` | UTC |

### Order status values

| Value | Meaning |
|---|---|
| `pending` | Order submitted, awaiting admin review |
| `confirmed` | Confirmed by admin via admin panel; confirmation email sent with pickup address |
| `reminded` | Pickup reminder email sent |
| `paid` | Payment received |
| `picked_up` | Customer collected the order |
| `no_show` | Customer did not pick up |
| `cancelled` | Order cancelled |

---

## Table: `items`

Relational table for menu items. Managed via `/admin/items` in the admin panel.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `TEXT` (UUID) | Primary key | Server-generated UUID string (Python `uuid4`) |
| `name` | `TEXT` | NOT NULL | Display name |
| `description` | `TEXT` | NOT NULL, default `''` | Shown below item selector on order form |
| `price` | `NUMERIC(10,2)` | NOT NULL | Regular price |
| `discounted_price` | `NUMERIC(10,2)` | NULLABLE | Overrides `price` for display and order calculation if set |
| `sort_order` | `INTEGER` | NOT NULL, default `0` | Controls display order |

---

## Table: `locations`

Relational table for pickup locations. Managed via `/admin/locations` in the admin panel.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `TEXT` (UUID) | Primary key | Server-generated UUID string (Python `uuid4`) |
| `name` | `TEXT` | NOT NULL | Display name shown to customers |
| `address` | `TEXT` | NOT NULL, default `''` | Included in confirmation and reminder emails |
| `time_slots` | `JSONB` | NOT NULL, default `'[]'` | Array of time slot strings |
| `sort_order` | `INTEGER` | NOT NULL, default `0` | Controls display order |

---

## Table: `events`

Stores events with their associated item and location selections. Only one event has `is_active = true` at a time; that event drives the public order page. Managed via `/admin/config` in the admin panel.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `INTEGER` | Primary key, auto-increment | |
| `name` | `TEXT` | NOT NULL | Internal label, e.g. `"February 2026 Batch"` |
| `event_date` | `TEXT` | NOT NULL | Display string shown on hero and emails, e.g. `"February 28th, 2026"` |
| `hero_header` | `TEXT` | NOT NULL, default `''` | Main heading on hero banner (white text). Required when creating/updating via admin API |
| `hero_header_sage` | `TEXT` | NOT NULL, default `''` | Optional second heading line (sage text) |
| `hero_subheader` | `TEXT` | NOT NULL, default `''` | Optional hero subheading |
| `promo_details` | `TEXT` | NULLABLE | Optional promo text shown between hero and order form |
| `tooltip_enabled` | `BOOLEAN` | NOT NULL, default `false` | Controls whether tooltip trigger/modal is shown on hero |
| `tooltip_header` | `TEXT` | NULLABLE | Required only when `tooltip_enabled = true`; also used as tooltip badge label |
| `tooltip_body` | `TEXT` | NULLABLE | Required only when `tooltip_enabled = true` |
| `tooltip_image_key` | `TEXT` | NULLABLE | Optional key referencing an entry in `config/event-images.json` |
| `hero_side_image_key` | `TEXT` | NULLABLE | Optional key referencing a `hero_side` image in `config/event-images.json` |
| `etransfer_enabled` | `BOOLEAN` | NOT NULL, default `false` | Controls whether the e-transfer payment section appears after submit and in confirmation emails |
| `etransfer_email` | `TEXT` | NULLABLE | Required only when `etransfer_enabled = true` |
| `is_active` | `BOOLEAN` | NOT NULL, default `false` | Only one row is `true` at a time; the active event is live on the order page |
| `item_ids` | `JSONB` | NOT NULL, default `'[]'` | Ordered array of `items.id` strings available for this event |
| `location_ids` | `JSONB` | NOT NULL, default `'[]'` | Ordered array of `locations.id` strings available for this event |
| `updated_at` | `TIMESTAMPTZ` | NULLABLE | Set automatically on create/update |

---

## Event image registry

Event image assets are stored in the repository and referenced by key from `events.tooltip_image_key` and `events.hero_side_image_key`.

Source-of-truth file:

- `config/event-images.json`

Synced runtime copies:

- `backend/event-images.json`
- `frontend/src/config/event-images.json`

Registry helper paths define where new images should be placed:

- `frontend/public/assets/img/tooltip`
- `frontend/public/assets/img/hero-side`

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
| `0003_normalize_items_locations` | `items` and `locations` tables (seeded from `event_config` JSONB); adds `hero_header`, `hero_subheader`, `promo_details` to `event_config`; drops `currency`, `items`, `locations` JSONB columns |
| `0004_replace_event_config_with_events` | `events` table (seeded from `event_config` row with all item/location IDs, `is_active = true`); drops `event_config` |
| `0005_create_feedback` | `feedback` table |
| `0006_add_feedback_contact` | adds `contact` column to `feedback` |
| `0007_feedback_type_and_message` | adds `feedback_type`, `order_id`, `message`; makes `reason` nullable |
| `0008_uuid_item_location_ids` | replaces slug item/location IDs with server-generated UUIDs; cascades to `events` and `orders` |
| `0009_event_hero_tooltip_images` | adds hero split text, tooltip config, and image-key fields to `events`; backfills tooltip defaults for existing events |
| `0010_event_etransfer_fields` | adds optional e-transfer toggle and email fields to `events`; backfills existing rows to enabled with legacy email |

---

## Relationships

**Four-table design** with no foreign keys between them.

`orders` captures item and location data as denormalised strings at order time so records remain accurate even if the config changes later. `items` and `locations` are the live source of truth for the full catalog. `events` holds one or more events, each referencing a subset of items and locations by ID; only the `is_active = true` event is shown on the public order page.
