# Orders Payment Migration Runbook

This runbook covers the production rollout for migration `0016_add_orders_payment_fields`.

## Scope

- Add `orders.paid`, `orders.payment_method`, and `orders.payment_method_other`.
- Backfill legacy paid orders from status-based tracking.
- Keep order lifecycle statuses in the current allowed set.

## Locked behavior

Migration `0016` backfills all rows where `lower(status) = 'paid'` to:

- `status = 'confirmed'`
- `paid = true`
- `payment_method = 'etransfer'`
- `payment_method_other = NULL`

## Cutover window

Use a short admin freeze for order updates while merge, deploy, and validation run.

## Pre-merge checks

1. Confirm branch includes migration fix and schema docs update.
2. Confirm local checks pass:
   - `./scripts/check-config-sync.sh`
   - `cd frontend && npm run build`
   - local migration smoke test (legacy `status='paid'` rows backfilled correctly)

## Production preflight SQL

Run before merge while freeze is active.

```sql
SELECT COUNT(*) AS legacy_paid_count
FROM orders
WHERE lower(status) = 'paid';

SELECT status, COUNT(*)
FROM orders
GROUP BY status
ORDER BY status;
```

Optional safety snapshot:

```sql
SELECT id, status, paid, payment_method, payment_method_other, created_at
FROM orders
WHERE lower(status) = 'paid'
ORDER BY created_at DESC;
```

## Merge and deploy

1. Merge PR from `p1-feats` into `main` using squash merge.
2. Watch GitHub Actions deploy workflow on `main`.
3. Confirm backend startup includes successful `alembic upgrade head`.

## Post-deploy SQL validation

```sql
SELECT COUNT(*) AS remaining_legacy_paid
FROM orders
WHERE lower(status) = 'paid';

SELECT COUNT(*) AS migrated_paid_etransfer_confirmed
FROM orders
WHERE paid = TRUE
  AND payment_method = 'etransfer'
  AND payment_method_other IS NULL
  AND status = 'confirmed';

SELECT COUNT(*) AS invalid_rows
FROM orders
WHERE (paid = FALSE AND (payment_method IS NOT NULL OR payment_method_other IS NOT NULL))
   OR (paid = TRUE AND payment_method IS NULL)
   OR (payment_method = 'other' AND COALESCE(TRIM(payment_method_other), '') = '')
   OR (payment_method IN ('cash','etransfer') AND payment_method_other IS NOT NULL);
```

Expected results:

- `remaining_legacy_paid = 0`
- `invalid_rows = 0`

## App smoke checks

1. Admin orders list loads.
2. Mark one confirmed order paid with each method:
   - cash
   - etransfer
   - other (requires details)
3. Mark a paid order unpaid and confirm method fields are cleared.
4. Create a new customer order and verify it starts as pending/unpaid.

## Rollback policy

Do not use downgrade as the primary production rollback path.

Primary rollback is forward-fix:

1. Keep service running unless there is a hard outage.
2. Apply targeted SQL fix or fast-follow migration.
3. Deploy hotfix commit.

If deploy fails before becoming healthy, Railway should keep the last healthy release serving traffic.
