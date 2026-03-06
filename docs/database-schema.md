# Database Schema

Hosted on **Supabase (PostgreSQL)**. Schema is managed via Alembic migrations in `backend/alembic/versions/`.

## Security: Row Level Security (RLS)

App tables that live in the `public` schema, plus `public.alembic_version`, are not intended to be accessed via Supabase PostgREST from the browser. RLS is enabled on these tables, no RLS policies are defined, and direct grants to Supabase API roles are revoked when those roles exist. The FastAPI backend connects directly to Postgres as the table owner and performs all reads and writes.

---

## Table: `orders`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `UUID` | Primary key, default `gen_random_uuid()` | Exposed to customer as 8-char reference (uppercased) |
| `event_id` | `INTEGER` | NOT NULL | References `events.id` at time of order (no FK) |
| `name` | `TEXT` | NOT NULL | Customer full name |
| `item_id` | `TEXT` | NOT NULL | Denormalised at order time; matches an `items.id` at time of order |
| `item_name` | `TEXT` | NOT NULL | Denormalised name at time of order |
| `quantity` | `INTEGER` | NOT NULL, CHECK >= 1 | Number of portions |
| `pickup_location` | `TEXT` | NOT NULL | Matches a location name in the `locations` table |
| `pickup_time_slot` | `TEXT` | NOT NULL | Matches a time slot for that location |
| `phone_number` | `TEXT` | NULLABLE | Always optional for both customers and admin |
| `email` | `TEXT` | NULLABLE | Used to send Resend confirmation/reminders unless excluded |
| `notes` | `TEXT` | NULLABLE | Admin-only internal notes |
| `exclude_email` | `BOOLEAN` | NOT NULL, default `false` | When true, admin actions will not send confirmation/reminder emails |
| `total_price` | `DECIMAL(10,2)` | NOT NULL | Always computed server-side from items table price |
| `status` | `TEXT` | default `'pending'` | See valid values below |
| `reminded` | `BOOLEAN` | NOT NULL, default `false` | Tracks whether a pickup reminder email has been sent; independent of order status |
| `paid` | `BOOLEAN` | NOT NULL, default `false` | Tracks whether payment has been recorded; independent of order status |
| `payment_method` | `TEXT` | NULLABLE | Required when `paid = true`; one of `cash`, `etransfer`, `other` |
| `payment_method_other` | `TEXT` | NULLABLE | Required when `payment_method = 'other'`; cleared when `paid = false` |
| `created_at` | `TIMESTAMPTZ` | default `NOW()` | UTC |

### Order status values

| Value | Meaning |
|---|---|
| `pending` | Order submitted, awaiting admin review |
| `confirmed` | Confirmed by admin via admin panel; confirmation email may be sent unless email is excluded or delivery fails |
| `picked_up` | Customer collected the order |
| `no_show` | Customer did not pick up |
| `cancelled` | Order cancelled |

### Payment fields and invariants

Payment is tracked separately from `status` and enforced via API validation and database CHECK constraints:
- When `paid = false`, both `payment_method` and `payment_method_other` must be NULL.
- When `paid = true`, `payment_method` must be set to one of `cash`, `etransfer`, `other`.
- When `payment_method = 'other'`, `payment_method_other` must be non-empty.
- When `payment_method` is `cash` or `etransfer`, `payment_method_other` must be NULL.

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
| `minimum_order_quantity` | `INTEGER` | NOT NULL, default `1`, CHECK >= 1 | Minimum quantity required on the public order form for this item |
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

Stores all contact messages, pre-order event feedback, and post-order customer feedback in one table. Historical rows were backfilled from the legacy source-based `feedback_type` values into the canonical shape below.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `TEXT` (UUID) | Primary key | Python-generated UUID string |
| `origin` | `TEXT` | NOT NULL | Source page key: `contact_us`, `events_page_non_customer`, or `events_page_customer` |
| `feedback_type` | `TEXT` | NOT NULL | Message category key: `general_question`, `feedback`, `collaboration`, or `other` |
| `order_id` | `TEXT` | nullable | Links to `orders.id` for post-order customer feedback |
| `name` | `TEXT` | nullable | Optional on contact and pre-order feedback; auto-filled from order for post-order feedback |
| `contact` | `TEXT` | nullable | Optional on contact and pre-order feedback; auto-filled from order email for post-order feedback |
| `reason` | `TEXT` | nullable | Machine-readable pre-order reason key; only set when `origin = 'events_page_non_customer'` (see allowed values below) |
| `other_details` | `TEXT` | nullable | Free text; populated only when `reason = 'other'` |
| `message` | `TEXT` | nullable | Free-form message body for contact submissions and post-order feedback |
| `created_at` | `TIMESTAMPTZ` | default `NOW()` | UTC |
| `status` | `VARCHAR` | NOT NULL, default `'new'` | Admin triage state: `new`, `in_progress`, or `resolved` |
| `admin_comment` | `TEXT` | nullable | Internal admin note; not visible to submitters |

### Allowed `origin` values

| Value | Display label |
|---|---|
| `contact_us` | Contact Us |
| `events_page_non_customer` | Events Page (Non-customer) |
| `events_page_customer` | Events Page (Customer) |

### Allowed `feedback_type` values

| Value | Display label |
|---|---|
| `general_question` | General Question |
| `feedback` | Feedback |
| `collaboration` | Collaboration |
| `other` | Other |

### Allowed `reason` values

| Value | Display label |
|---|---|
| `price_too_high` | Price too high |
| `location_not_convenient` | Pickup location not convenient |
| `dietary_needs` | Food does not meet dietary needs |
| `not_available` | Not available on the event date |
| `different_menu` | Prefer a different menu item |
| `prefer_delivery` | Prefer delivery over pickup |
| `not_interested` | Not interested at this time |
| `other` | Other |

---

## Table: `catering_requests`

Stores inbound quote requests from the public `/catering-request` form. Managed via `/admin/catering-requests` in the admin panel.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `TEXT` (UUID) | Primary key | Python-generated UUID string |
| `first_name` | `TEXT` | NOT NULL | Requester first name |
| `last_name` | `TEXT` | NOT NULL | Requester last name |
| `email` | `TEXT` | NOT NULL | Primary contact email |
| `phone_number` | `TEXT` | nullable | Optional phone number |
| `event_date` | `TEXT` | NOT NULL | Customer-provided event date string from the form date input |
| `guest_count` | `INTEGER` | NOT NULL, CHECK >= 1 at API level | Estimated guest count |
| `event_type` | `TEXT` | NOT NULL | Machine-readable event type key from the public form |
| `budget_range` | `TEXT` | nullable | Machine-readable budget range key from the public form |
| `special_requests` | `TEXT` | nullable | Free-form request details |
| `status` | `VARCHAR` | NOT NULL, default `'new'` | Admin workflow state (see allowed values below) |
| `created_at` | `TIMESTAMPTZ` | default `NOW()` | UTC |

### Allowed `status` values

| Value | Meaning |
|---|---|
| `new` | Newly submitted and not yet reviewed |
| `in_review` | Being reviewed by the team before a decision or follow-up |
| `in_progress` | Actively being worked on |
| `rejected` | Request was declined or cannot be accommodated |
| `done` | Request has been fully handled |

---

## Table: `catering_request_comments`

Stores internal admin comment history for catering requests. Comments are shown in the admin portal only and are kept separate from the new-comment input for each request.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `TEXT` (UUID) | Primary key | Python-generated UUID string |
| `catering_request_id` | `TEXT` | NOT NULL, indexed | Logical parent `catering_requests.id`; maintained by the backend |
| `body` | `TEXT` | NOT NULL | Internal comment text |
| `created_at` | `TIMESTAMPTZ` | default `NOW()` | UTC |

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
| `0006_normalize_items_locations` | `items` and `locations` tables (seeded from `event_config` JSONB); adds `hero_header`, `hero_subheader`, `promo_details` to `event_config`; drops `currency`, `items`, `locations` JSONB columns |
| `0007_events_table` | `events` table (seeded from `event_config` row with all item/location IDs, `is_active = true`); drops `event_config` |
| `0008_uuid_item_location_ids` | replaces slug item/location IDs with server-generated UUIDs; cascades to `events` and `orders` |
| `0009_event_hero_tooltip_images` | adds hero split text, tooltip config, and image-key fields to `events`; backfills tooltip defaults for existing events |
| `0010_event_etransfer_fields` | adds optional e-transfer toggle and email fields to `events`; backfills existing rows to enabled with legacy email |
| `0011_enable_rls_public_tables` | enables RLS on the initial app tables in `public` |
| `0012_order_notes_exclude_email` | adds `notes` and `exclude_email` to `orders`; makes `email` and `phone_number` nullable |
| `0013_orders_event_id` | adds `event_id` to `orders` and backfills to the active event |
| `0014_add_reminded_boolean` | adds `reminded` boolean to `orders`; backfills existing `status='reminded'` rows to `reminded=true, status='confirmed'` |
| `0015_feedback_status_comment` | adds `status` (VARCHAR, default `'new'`) and `admin_comment` (TEXT, nullable) to `feedback` |
| `0016_add_orders_payment_fields` | adds `paid`, `payment_method`, `payment_method_other` to `orders`; backfills legacy `status='paid'` rows to `status='confirmed', paid=true, payment_method='etransfer', payment_method_other=NULL` |
| `0017_phone_optional` | updates `ck_orders_contact_required_unless_excluded` constraint to only require `email` (not `phone_number`) when `exclude_email` is false |
| `db2173ba0be0_create_catering_requests` | `catering_requests` table |
| `4f7d2b6c9a10_feedback_origin_rework` | adds `origin` to `feedback`; backfills legacy rows into canonical `origin` and `feedback_type` values |
| `9c8b0b7f2e1a_catering_request_comments_and_statuses` | `catering_request_comments` table; remaps `catering_requests.status='resolved'` to `'done'` |
| `c3f9a6e7b2d1_add_item_minimum_order_quantity` | adds `minimum_order_quantity` to `items` with a check constraint enforcing values >= 1 |
| `7b1d5f8c2a4e_enable_rls_catering_and_alembic_version` | enables RLS on `catering_requests`, `catering_request_comments`, and `alembic_version`; revokes `anon` and `authenticated` access when those roles exist |

---

## Relationships

**Four-table design** with no foreign keys between them.

`orders` captures item and location data as denormalised strings at order time so records remain accurate even if the config changes later. Each order is also tied to an `event_id` so admin views and emails can reference the correct event even after the active event changes. `items` and `locations` are the live source of truth for the full catalog. `events` holds one or more events, each referencing a subset of items and locations by ID; only the `is_active = true` event is shown on the public order page.
