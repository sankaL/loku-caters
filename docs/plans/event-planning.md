# Event Planning Module Plan

## Goal

Build an admin-only planning module for saved event plan snapshots. Admins can create more than one plan from the same source event, refresh a plan from current orders, split planned rows for kitchen and handoff logistics, and export a clean operational report.

## Phase 1: Snapshot Core

- Add an `event_plans` table with metadata plus a JSONB snapshot payload.
- Add `orders.updated_at` so plan freshness and refresh detection can rely on order changes.
- Build backend services for snapshot creation, validation, metrics, duplication, archive/restore, and refresh preservation.
- Include all non-cancelled orders by default.
- Store customer bundles, original order lines, planned rows, notes, totals, warnings, and blocking issues in the snapshot.
- Preserve manual planned rows on refresh when the source order still exists.
- Flag under-planning and refresh conflicts as blocking issues.
- Allow over-planning with warnings and explicit ordered vs planned totals.
- Add admin APIs for list, create, get, save, refresh, mark ready, archive, restore, and duplicate.
- Add backend tests for the snapshot builder, validation, refresh behavior, and route helpers.
- Update database schema documentation.

## Phase 2: Admin Planning UI

- Add `/admin/planning` with sidebar label `Planning`.
- Show a table of saved snapshots with search, status filter, archived toggle, and row actions.
- Empty state shows a centered `Plan Event` button.
- Non-empty state shows top right `Add Plan Event`.
- Add a create modal with searchable event choices, including active events, inactive events, and Random Requests.
- Add an editor with `Plan Board` and `Report Preview` tabs.
- Add explicit save, dirty-state warnings, optimistic concurrency handling, and clean-state gates for export/refresh/archive.
- Add split planner rows with quantity, planned item, pickup location, time slot, and notes.
- Support plan-level notes, order-level notes, and split-line notes.
- Add helpers for auto-balance, reset order to original, duplicate row, apply item to selected rows, and filters.
- Add planned-row drag and drop with `@dnd-kit`, plus non-drag move controls.

## Phase 3: Report Export And Polish

- Add backend PDF export using `reportlab`.
- Require saved state before export.
- Build a one-page optimized report that can overflow to multiple pages only when required.
- Prioritize event summary, location/time item totals, customer handoff rows, and issue warnings.
- Exclude phone, email, and payment fields from planning and reports.
- Add report preview that mirrors the PDF layout closely.
- Add out-of-date indicators for source events with new or changed non-cancelled orders.
- Polish responsive behavior, large group handling, and final build/test pass.

## Confirmed Decisions

- Plans are saved snapshots, not live reports.
- A source is exactly one regular event or the Random Requests bucket.
- More than one snapshot can exist for the same source.
- Archived plans are read-only and exportable until restored.
- No hard delete in v1.
- Custom planned item names and custom pickup labels are snapshot-local.
- Planning does not modify real orders, pricing, emails, contact fields, or payment fields.
- Under-planning blocks ready/export.
- Over-planning is allowed with warnings.
