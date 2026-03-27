# Bundle-Aware Order Flow States and Triggers

This document describes the current order lifecycle for the Loku Caters pre-order app after the bundle-aware admin workflow refactor.

## Core Model

- Status is stored per order line.
- Most admin actions resolve the full bundle and apply the change to every line in that bundle.
- The admin orders page defaults to bundle view.
- `mixed` is a bundle-view aggregation only. It is not stored in the database.

## Persisted Order Statuses

Defined in [`OrderStatus`](backend/constants.py:1):

| Status | Description |
|--------|-------------|
| `pending` | Customer submitted the order and it is waiting for admin confirmation |
| `confirmed` | Admin confirmed the bundle |
| `picked_up` | Customer collected the bundle |
| `no_show` | Customer did not collect the bundle |
| `cancelled` | Admin cancelled the bundle |

## Reminder and Payment Flags

### Reminder Flag

- `reminded` is a boolean flag, not a status.
- Only confirmed bundles can receive pickup reminders.
- The flag is aggregated as `true` in bundle view only when all lines are reminded.
- New lines added to an existing bundle start with `reminded=false`.

### Payment Flag

- `paid` is independent from order `status`.
- Bundles cannot be marked paid while they are `pending`.
- Adding a new line to an existing bundle resets bundle payment state to unpaid.

## Allowed Status Transitions

Defined in [`ALLOWED_STATUS_TRANSITIONS`](backend/routers/admin.py:194):

| From Status | Allowed Transitions |
|-------------|---------------------|
| `pending` | `pending`, `confirmed`, `cancelled` |
| `confirmed` | `confirmed`, `picked_up`, `no_show`, `cancelled` |
| `picked_up` | `picked_up`, `no_show`, `cancelled` |
| `no_show` | `no_show`, `picked_up`, `cancelled` |
| `cancelled` | `cancelled`, `picked_up`, `no_show` |

For bundle actions, every line in the bundle must be able to make the requested transition.

## Customer and Admin Triggers

### Pending

- Entered via [`POST /api/orders/checkout`](backend/routers/orders.py)
- Customer sees a holding message after checkout
- Exits through:
  - [`POST /api/admin/orders/{order_id}/confirm`](backend/routers/admin.py)
  - [`POST /api/admin/orders/{order_id}/actions/cancel`](backend/routers/admin.py)

### Confirmed

- Entered through [`POST /api/admin/orders/{order_id}/confirm`](backend/routers/admin.py)
- Confirmation email is sent unless `exclude_email=true`
- Exits through:
  - [`POST /api/admin/orders/{order_id}/remind`](backend/routers/admin.py)
  - [`POST /api/admin/orders/{order_id}/actions/mark-picked-up`](backend/routers/admin.py)
  - [`POST /api/admin/orders/{order_id}/actions/mark-no-show`](backend/routers/admin.py)
  - [`POST /api/admin/orders/{order_id}/actions/cancel`](backend/routers/admin.py)

### Picked Up

- Entered through the picked up action
- No email is sent
- Can be corrected to `no_show`
- Can be cancelled

### No Show

- Entered through the no show action
- No email is sent
- Can be corrected to `picked_up`
- Can be cancelled

### Cancelled

- Entered through the cancel action
- No email is sent
- Can be restored only to `picked_up` or `no_show`

## Safe Admin Endpoints

The admin UI should use these endpoints for bundle-aware status changes:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/admin/orders/{order_id}/confirm` | `POST` | Confirm a pending bundle and send confirmation email when allowed |
| `/api/admin/orders/{order_id}/actions/mark-picked-up` | `POST` | Mark a bundle picked up |
| `/api/admin/orders/{order_id}/actions/mark-no-show` | `POST` | Mark a bundle no show |
| `/api/admin/orders/{order_id}/actions/cancel` | `POST` | Cancel a bundle |
| `/api/admin/orders/{order_id}/actions/restore` | `POST` | Restore a cancelled bundle to `picked_up` or `no_show` |
| `/api/admin/orders/{order_id}/remind` | `POST` | Send a pickup reminder for a confirmed bundle |
| `/api/admin/orders/{order_id}/payment-remind` | `POST` | Send a payment reminder for an unpaid confirmed or picked up bundle |

## Legacy Endpoint

`PATCH /api/admin/orders/{order_id}/status` still exists for backward compatibility, but the admin UI should not call it.

## Bundle-Specific Rules

- Bundle actions resolve all lines for the selected order.
- New lines inherit the bundle's uniform persisted status at creation time.
- New lines cannot be added to a mixed-status bundle.
- Mixed bundles are excluded from table-level bulk status actions.

## Admin UI Workflow

### Table View

- Status is displayed as a read-only badge.
- Pending bundles show confirm and cancel actions.
- Confirmed bundles show reminder, picked up, no show, and cancel actions.
- Picked up bundles show correction to no show and cancel actions.
- No show bundles show correction to picked up and cancel actions.
- Cancelled bundles show restore actions.
- Mixed bundles show a mixed badge only and require detail view review.

### Detail View

- Shows bundle breakdown, including mixed-status line counts when applicable.
- Uses the same bundle-aware action model as the table.
- Can surface safe normalization actions for mixed bundles when every line allows the same target state.

### Bulk Actions

- Bulk confirm: pending bundles only
- Bulk mark picked up: confirmed bundles only
- Bulk cancel: pending, confirmed, picked up, and no show bundles
- Bulk reminder: confirmed, not-reminded, emailable bundles only
- Mixed bundles are excluded from bulk status actions

## Email Notes

- Email failures must not fail the order confirmation flow.
- Confirmation still succeeds even if `send_confirmation()` raises.
- Reminder and payment reminder endpoints return explicit sent, skipped, or failed responses.
