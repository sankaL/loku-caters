# Running a Pre-Order Event

The site has no database or admin portal. Everything customers see comes from
`config/event-config.json`, and every submission is emailed to the owners
through Resend.

## Open pre-orders for a new event

1. Edit `active_event` in `config/event-config.json`:
   - `is_active`: `true` to show the order form, `false` to show the "no active
     event" page.
   - `event.date`: the date shown to customers, for example `"Oct 17th, 2026"`.
   - `items`: menu items for this event. `price` is the regular price,
     `discounted_price` (or `null`) is what the customer pays,
     `minimum_order_quantity` is enforced on checkout, and `image_path` points
     at a file under `frontend/public`.
   - `locations`: pickup locations with their `timeSlots`.
   - `combo_deals`: optional bundle discounts. Every item id in a combo must be
     one of the event's `items`.
   - `etransfer_enabled` / `etransfer_email`: payment instructions shown after
     checkout.
   - Hero and tooltip copy: `hero_header`, `hero_header_sage`,
     `hero_subheader`, `promo_details`, `tooltip_*`.
2. Sync the frontend copy: `make sync-config`
3. Commit and push to the `frontend-only` branch. Railway redeploys
   automatically.

Close pre-orders by setting `is_active` back to `false` and redeploying.

## Where submissions go

| Form | Route | Email |
|---|---|---|
| Pre-order checkout | `POST /api/orders/checkout` | "New order from ..." |
| Catering request | `POST /api/catering-requests` | "New catering request from ..." |
| Contact, reviews, event feedback | `POST /api/feedback` | "New feedback/review from ..." |

Emails go to `NOTIFICATION_EMAILS` (comma-separated) and set `Reply-To` to the
customer, so replying reaches them directly. Prices are recomputed on the
server from the config, so the emailed total is authoritative.

If Resend fails, the customer sees an error and can retry. Nothing is stored
anywhere else, so the email inbox is the order log.

## Showing a new review

Reviews on the home and reviews pages come from `config/reviews.json`. Copy a
review from its notification email into that file, run `make sync-config`,
and redeploy.

## Railway environment variables

| Variable | Purpose |
|---|---|
| `RESEND_API_KEY` | Resend API key |
| `FROM_EMAIL` | Sender address on a Resend-verified domain |
| `NOTIFICATION_EMAILS` | Owner inboxes, comma-separated |
| `REPLY_TO_EMAIL` | Fallback reply-to when no customer email is given |
| `NEXT_PUBLIC_SITE_URL` | Canonical site URL (build time) |
| `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | Analytics (build time) |
