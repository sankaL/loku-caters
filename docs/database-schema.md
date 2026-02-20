# Database Schema

Hosted on **Supabase (PostgreSQL)**.

---

## Table: `orders`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `UUID` | Primary key, default `gen_random_uuid()` | Exposed to customer as 8-char reference (uppercased) |
| `name` | `TEXT` | NOT NULL | Customer full name |
| `item_id` | `TEXT` | NOT NULL | Matches `id` in `event-config.json` items |
| `item_name` | `TEXT` | NOT NULL | Denormalised name at time of order |
| `quantity` | `INTEGER` | NOT NULL, CHECK >= 1 | Number of portions |
| `pickup_location` | `TEXT` | NOT NULL | Matches a location name in config |
| `pickup_time_slot` | `TEXT` | NOT NULL | Matches a time slot for that location in config |
| `phone_number` | `TEXT` | NOT NULL | |
| `email` | `TEXT` | NOT NULL | Used to send Resend confirmation |
| `total_price` | `DECIMAL(10,2)` | NOT NULL | Always computed server-side from config price |
| `status` | `TEXT` | default `'pending'` | See valid values below — updated manually or via admin portal |
| `created_at` | `TIMESTAMPTZ` | default `NOW()` | UTC |

### SQL (run in Supabase SQL editor)

```sql
CREATE TABLE orders (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name             TEXT NOT NULL,
  item_id          TEXT NOT NULL,
  item_name        TEXT NOT NULL,
  quantity         INTEGER NOT NULL CHECK (quantity >= 1),
  pickup_location  TEXT NOT NULL,
  pickup_time_slot TEXT NOT NULL,
  phone_number     TEXT NOT NULL,
  email            TEXT NOT NULL,
  total_price      DECIMAL(10,2) NOT NULL,
  status           TEXT DEFAULT 'pending',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
```

### Order status values

| Value | Meaning |
|---|---|
| `pending` | Order submitted, awaiting confirmation |
| `confirmed` | Confirmed by admin, customer notified |
| `paid` | Payment received |
| `picked_up` | Customer collected the order |
| `no_show` | Customer did not pick up |
| `cancelled` | Order cancelled |

To enforce valid values in Supabase, run this migration in the SQL editor:

```sql
ALTER TABLE orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending','confirmed','paid','picked_up','no_show','cancelled'));
```

---

## Relationships

Currently a **single-table design** — no foreign keys or joins.

Item and location data is config-driven (JSON file), not stored as relational tables. `item_id`, `item_name`, `pickup_location`, and `pickup_time_slot` are denormalised strings captured at order time so the record remains accurate even if the config changes later.

If a second table is added in the future (e.g. `events` or `items`), `item_id` is the natural join key.
