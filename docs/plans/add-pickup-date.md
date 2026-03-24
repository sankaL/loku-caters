# Pickup Date Feature

## Summary

Add a `pickup_date` (DATE) column to both the **events** and **orders** tables. Event orders auto-fill from the event's pickup date. Random/ad-hoc orders require the admin to explicitly provide it.

## Context

When an admin creates a random (ad-hoc) order, there is no way to specify when the customer should pick it up. Event orders inherit the event date implicitly, but random orders have no associated date. This creates confusion for both the admin and the customer.

## Decisions

- **DATE column type** for pickup_date (not TEXT) - better for sorting, filtering, querying
- **Required for random orders only** - event orders auto-fill from event pickup_date
- **Add pickup_date to events table too** - cleanest approach, avoids parsing display strings

## Files to modify

| File | Change |
|---|---|
| `backend/alembic/versions/0020_add_pickup_date.py` (new) | Migration: add `pickup_date DATE` to events and orders |
| `backend/models.py` | Add `pickup_date` to Event and Order models |
| `backend/routers/admin.py` | Add pickup_date to AdminOrderCreate/AdminOrderUpdate, require for random mode, auto-fill for event mode, include in _order_dict() |
| `backend/services/email.py` | Use order pickup_date in emails, fall back to event_date text |
| `config/event-config.json` | Add pickup_date field |
| `frontend/src/config/event-config.json` (sync) | Sync from config |
| `backend/event-config.json` (sync) | Sync from config |
| `frontend/src/app/admin/orders/page.tsx` | Add date input to random order form |
| `frontend/src/app/admin/orders/[id]/page.tsx` | Add pickup_date to edit form and detail view |
| `docs/database-schema.md` | Document new columns |
| Backend tests | Update payment reminder tests, add validation tests |

## Implementation details

### Migration

```sql
ALTER TABLE events ADD COLUMN pickup_date DATE NULL;
ALTER TABLE orders ADD COLUMN pickup_date DATE NULL;
```

Nullable to support existing rows. Backfill can be done manually.

### Backend order creation logic

- **Random mode**: validate that `pickup_date` is provided in the request body
- **Event mode**: auto-fill `order.pickup_date` from `event.pickup_date`
- **Update**: allow admin to edit pickup_date on existing orders, propagate to group

### Email template

- Prefer `order.pickup_date` (formatted as "February 28, 2026") for the "Pickup Date" row
- Fall back to `event.event_date` display string if pickup_date is null
- Applies to: confirmation, reminder, payment reminder emails

### Frontend

- Random order form: HTML date input (`<input type="date">`), required
- Event order form: show auto-filled pickup date from event (read-only or editable)
- Admin order detail: show pickup date, editable in edit modal
