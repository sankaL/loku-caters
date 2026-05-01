from __future__ import annotations

from copy import deepcopy
from datetime import date, datetime, timezone
import uuid
from typing import Any, Iterable, Optional

from constants import OrderStatus


PLAN_STATUS_DRAFT = "draft"
PLAN_STATUS_READY = "ready"
PLAN_STATUS_ARCHIVED = "archived"
PLAN_STATUSES = {PLAN_STATUS_DRAFT, PLAN_STATUS_READY, PLAN_STATUS_ARCHIVED}
SNAPSHOT_VERSION = 1


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso_now() -> str:
    return utc_now().isoformat()


def make_default_plan_name(event: Any, created_at: Optional[datetime] = None) -> str:
    timestamp = (created_at or utc_now()).astimezone(timezone.utc).strftime("%b %d %H:%M UTC")
    return f"{getattr(event, 'name', 'Event')} Plan - {timestamp}"


def _iso(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return str(value)


def _quantity(value: Any) -> int:
    try:
        return max(0, int(value or 0))
    except (TypeError, ValueError):
        return 0


def _bundle_id_for_order(order: Any) -> str:
    group_id = str(getattr(order, "group_id", "") or "").strip()
    return group_id or str(getattr(order, "id"))


def _new_planned_row_id() -> str:
    return f"plan-row-{uuid.uuid4()}"


def _order_sort_key(order: Any) -> tuple[str, str]:
    created_at = _iso(getattr(order, "created_at", None)) or ""
    return created_at, str(getattr(order, "id", ""))


def _included_orders(orders: Iterable[Any]) -> list[Any]:
    return sorted(
        [order for order in orders if getattr(order, "status", None) != OrderStatus.CANCELLED],
        key=_order_sort_key,
    )


def _event_snapshot(event: Any) -> dict[str, Any]:
    return {
        "id": int(getattr(event, "id")),
        "name": getattr(event, "name", ""),
        "kind": getattr(event, "kind", "event"),
        "event_date": getattr(event, "event_date", ""),
        "pickup_date": _iso(getattr(event, "pickup_date", None)),
        "is_active": bool(getattr(event, "is_active", False)),
    }


def _order_line_snapshot(order: Any) -> dict[str, Any]:
    return {
        "id": str(getattr(order, "id")),
        "bundle_id": _bundle_id_for_order(order),
        "event_id": int(getattr(order, "event_id")),
        "group_id": getattr(order, "group_id", None),
        "customer_name": getattr(order, "name", ""),
        "item_id": getattr(order, "item_id", ""),
        "item_name": getattr(order, "item_name", "") or getattr(order, "item_id", ""),
        "quantity": _quantity(getattr(order, "quantity", 0)),
        "pickup_location": getattr(order, "pickup_location", ""),
        "pickup_time_slot": getattr(order, "pickup_time_slot", ""),
        "pickup_date": _iso(getattr(order, "pickup_date", None)),
        "status": getattr(order, "status", OrderStatus.PENDING),
        "created_at": _iso(getattr(order, "created_at", None)),
        "updated_at": _iso(getattr(order, "updated_at", None) or getattr(order, "created_at", None)),
    }


def build_source_order_fingerprint(order_lines: Iterable[dict[str, Any]]) -> dict[str, Any]:
    rows = []
    for line in order_lines:
        rows.append(
            {
                "id": str(line.get("id") or ""),
                "group_id": line.get("group_id"),
                "customer_name": line.get("customer_name") or "",
                "item_id": line.get("item_id") or "",
                "item_name": line.get("item_name") or "",
                "quantity": _quantity(line.get("quantity")),
                "pickup_location": line.get("pickup_location") or "",
                "pickup_time_slot": line.get("pickup_time_slot") or "",
                "pickup_date": line.get("pickup_date"),
                "status": line.get("status") or OrderStatus.PENDING,
                "updated_at": line.get("updated_at"),
            }
        )
    rows.sort(key=lambda row: row["id"])
    return {
        "version": 1,
        "count": len(rows),
        "ids": [row["id"] for row in rows],
        "rows": rows,
    }


def _default_planned_row(line: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": _new_planned_row_id(),
        "row_type": "order",
        "row_state": "active",
        "source_order_id": line["id"],
        "source_bundle_id": line["bundle_id"],
        "customer_name": line["customer_name"],
        "status": line["status"],
        "original_item_id": line["item_id"],
        "original_item_name": line["item_name"],
        "ordered_quantity": line["quantity"],
        "planned_item_id": line["item_id"],
        "planned_item_name": line["item_name"],
        "quantity": line["quantity"],
        "pickup_location": line["pickup_location"],
        "pickup_time_slot": line["pickup_time_slot"],
        "notes": "",
        "flags": [],
    }


def _unassigned_planned_row(line: dict[str, Any], quantity: int) -> dict[str, Any]:
    row = _default_planned_row(line)
    row["planned_item_id"] = None
    row["planned_item_name"] = "Unassigned"
    row["quantity"] = quantity
    row["flags"] = ["refresh_new_quantity"]
    return row


def _normalize_preserved_row(row: dict[str, Any], line: dict[str, Any]) -> dict[str, Any]:
    next_row = deepcopy(row)
    flags = set(next_row.get("flags", []))
    next_row["row_state"] = "removed" if row.get("row_state") == "removed" and "user_removed" in flags else "active"
    next_row["source_order_id"] = line["id"]
    next_row["source_bundle_id"] = line["bundle_id"]
    next_row["customer_name"] = line["customer_name"]
    next_row["status"] = line["status"]
    next_row["original_item_id"] = line["item_id"]
    next_row["original_item_name"] = line["item_name"]
    next_row["ordered_quantity"] = line["quantity"]
    next_row.setdefault("planned_item_id", line["item_id"])
    next_row.setdefault("planned_item_name", line["item_name"])
    next_row.setdefault("pickup_location", line["pickup_location"])
    next_row.setdefault("pickup_time_slot", line["pickup_time_slot"])
    next_row.setdefault("notes", "")
    next_row.setdefault("flags", [])
    next_row["quantity"] = _quantity(next_row.get("quantity"))
    return next_row


def _group_preserved_rows(previous_snapshot: Optional[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    if not previous_snapshot:
        return grouped
    for row in previous_snapshot.get("planned_rows", []):
        if row.get("row_type") == "extra":
            continue
        if row.get("row_state") == "removed" and "user_removed" not in set(row.get("flags", [])):
            continue
        source_order_id = row.get("source_order_id")
        if source_order_id:
            grouped.setdefault(str(source_order_id), []).append(row)
    return grouped


def _preserve_extra_rows(previous_snapshot: Optional[dict[str, Any]]) -> list[dict[str, Any]]:
    if not previous_snapshot:
        return []
    rows: list[dict[str, Any]] = []
    for row in previous_snapshot.get("planned_rows", []):
        if row.get("row_type") != "extra":
            continue
        next_row = deepcopy(row)
        next_row.setdefault("id", _new_planned_row_id())
        next_row["row_state"] = "active"
        next_row["quantity"] = _quantity(next_row.get("quantity"))
        next_row.setdefault("flags", ["extra"])
        rows.append(next_row)
    return rows


def _removed_rows(previous_snapshot: Optional[dict[str, Any]], active_order_ids: set[str]) -> list[dict[str, Any]]:
    if not previous_snapshot:
        return []
    rows: list[dict[str, Any]] = []
    for row in previous_snapshot.get("planned_rows", []):
        source_order_id = row.get("source_order_id")
        if not source_order_id or str(source_order_id) in active_order_ids:
            continue
        if row.get("row_type") == "extra":
            continue
        next_row = deepcopy(row)
        next_row["row_state"] = "removed"
        flags = set(next_row.get("flags", []))
        flags.add("removed_on_refresh")
        next_row["flags"] = sorted(flags)
        rows.append(next_row)
    return rows


def _build_bundles(order_lines: list[dict[str, Any]], previous_snapshot: Optional[dict[str, Any]]) -> list[dict[str, Any]]:
    order_notes: dict[str, str] = {}
    if previous_snapshot:
        for bundle in previous_snapshot.get("bundles", []):
            order_notes[str(bundle.get("bundle_id"))] = str(bundle.get("order_notes") or "")

    grouped: dict[str, list[dict[str, Any]]] = {}
    for line in order_lines:
        grouped.setdefault(line["bundle_id"], []).append(line)

    bundles: list[dict[str, Any]] = []
    for bundle_id, lines in grouped.items():
        status_breakdown: dict[str, int] = {}
        for line in lines:
            status = str(line.get("status") or "")
            status_breakdown[status] = status_breakdown.get(status, 0) + 1
        statuses = sorted(status_breakdown.keys())
        bundles.append(
            {
                "bundle_id": bundle_id,
                "primary_order_id": lines[0]["id"],
                "customer_name": lines[0]["customer_name"],
                "pickup_location": lines[0]["pickup_location"],
                "pickup_time_slot": lines[0]["pickup_time_slot"],
                "status": statuses[0] if len(statuses) == 1 else "mixed",
                "status_breakdown": status_breakdown,
                "ordered_quantity": sum(line["quantity"] for line in lines),
                "order_notes": order_notes.get(bundle_id, ""),
                "line_ids": [line["id"] for line in lines],
            }
        )
    return bundles


def build_event_plan_snapshot(
    event: Any,
    orders: Iterable[Any],
    previous_snapshot: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    included_orders = _included_orders(orders)
    order_lines = [_order_line_snapshot(order) for order in included_orders]
    active_order_ids = {line["id"] for line in order_lines}
    previous_rows = _group_preserved_rows(previous_snapshot)
    planned_rows: list[dict[str, Any]] = []

    for line in order_lines:
        preserved = [_normalize_preserved_row(row, line) for row in previous_rows.get(line["id"], [])]
        if not preserved:
            planned_rows.append(_default_planned_row(line))
            continue

        active_preserved = [row for row in preserved if row.get("row_state") != "removed"]
        planned_total = sum(_quantity(row.get("quantity")) for row in active_preserved)
        if active_preserved and planned_total > line["quantity"]:
            flags = set(active_preserved[0].get("flags", []))
            flags.add("refresh_conflict")
            active_preserved[0]["flags"] = sorted(flags)
        planned_rows.extend(preserved)
        if active_preserved and planned_total < line["quantity"]:
            planned_rows.append(_unassigned_planned_row(line, line["quantity"] - planned_total))

    planned_rows.extend(_preserve_extra_rows(previous_snapshot))
    removed = _removed_rows(previous_snapshot, active_order_ids)
    planned_rows.extend(removed)

    snapshot = {
        "version": SNAPSHOT_VERSION,
        "source_event": _event_snapshot(event),
        "created_from_orders_at": iso_now(),
        "refreshed_at": iso_now(),
        "source_fingerprint": build_source_order_fingerprint(order_lines),
        "plan_notes": (previous_snapshot or {}).get("plan_notes", ""),
        "bundles": _build_bundles(order_lines, previous_snapshot),
        "order_lines": order_lines,
        "planned_rows": planned_rows,
        "removed_rows": removed,
        "issues": [],
        "warnings": [],
        "totals": {},
        "status_breakdown": {},
    }
    apply_plan_metrics(snapshot)
    return snapshot


def _active_planned_rows(snapshot: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        row for row in snapshot.get("planned_rows", [])
        if row.get("row_state", "active") == "active"
    ]


def _issue(code: str, message: str, *, source_order_id: Optional[str] = None, row_id: Optional[str] = None) -> dict[str, Any]:
    result: dict[str, Any] = {"code": code, "message": message}
    if source_order_id is not None:
        result["source_order_id"] = source_order_id
    if row_id is not None:
        result["row_id"] = row_id
    return result


def apply_plan_metrics(snapshot: dict[str, Any]) -> dict[str, int]:
    order_lines = snapshot.get("order_lines", [])
    active_rows = _active_planned_rows(snapshot)
    issues: list[dict[str, Any]] = []
    warnings: list[dict[str, Any]] = []

    ordered_quantity = sum(_quantity(line.get("quantity")) for line in order_lines)
    planned_quantity = sum(_quantity(row.get("quantity")) for row in active_rows)

    planned_by_order: dict[str, int] = {}
    for row in active_rows:
        quantity = _quantity(row.get("quantity"))
        row["quantity"] = quantity
        row_id = str(row.get("id") or "")
        if quantity <= 0:
            issues.append(_issue("invalid_quantity", "Planned row quantity must be greater than zero.", row_id=row_id))
        if not str(row.get("planned_item_name") or "").strip():
            issues.append(_issue("missing_item", "Planned row is missing an item name.", row_id=row_id))
        if not str(row.get("pickup_location") or "").strip():
            issues.append(_issue("missing_pickup_location", "Planned row is missing a pickup location.", row_id=row_id))
        if not str(row.get("pickup_time_slot") or "").strip():
            issues.append(_issue("missing_pickup_time_slot", "Planned row is missing a time slot.", row_id=row_id))
        if "refresh_conflict" in set(row.get("flags", [])):
            issues.append(_issue("refresh_conflict", "A refreshed order quantity is lower than the preserved planned rows.", row_id=row_id))
        source_order_id = row.get("source_order_id")
        if source_order_id:
            planned_by_order[str(source_order_id)] = planned_by_order.get(str(source_order_id), 0) + quantity
        if row.get("row_type") == "extra":
            warnings.append(_issue("extra_row", "Extra planned row is not tied to a source order.", row_id=row_id))
        if not row.get("planned_item_id"):
            warnings.append(_issue("custom_item", "Planned row uses a custom or unassigned item name.", row_id=row_id))
        if "refresh_new_quantity" in set(row.get("flags", [])):
            warnings.append(_issue("refresh_new_quantity", "Refresh added new quantity that needs review.", row_id=row_id))

    if not order_lines:
        issues.append(_issue("empty_source", "The source event has no non-cancelled orders."))

    for line in order_lines:
        source_order_id = str(line.get("id"))
        ordered = _quantity(line.get("quantity"))
        planned = planned_by_order.get(source_order_id, 0)
        if planned < ordered:
            issues.append(
                _issue(
                    "under_planned",
                    f"Planned quantity is short by {ordered - planned}.",
                    source_order_id=source_order_id,
                )
            )
        elif planned > ordered:
            warnings.append(
                _issue(
                    "over_planned",
                    f"Planned quantity has extra +{planned - ordered}.",
                    source_order_id=source_order_id,
                )
            )

    status_breakdown: dict[str, dict[str, int]] = {}
    for line in order_lines:
        status = str(line.get("status") or OrderStatus.PENDING)
        bucket = status_breakdown.setdefault(status, {"orders": 0, "quantity": 0})
        bucket["orders"] += 1
        bucket["quantity"] += _quantity(line.get("quantity"))

    snapshot["issues"] = issues
    snapshot["warnings"] = warnings
    snapshot["status_breakdown"] = status_breakdown
    snapshot["totals"] = {
        "included_order_count": len(order_lines),
        "ordered_quantity": ordered_quantity,
        "planned_quantity": planned_quantity,
        "issue_count": len(issues),
        "warning_count": len(warnings),
    }
    return snapshot["totals"]


def summarize_snapshot(snapshot: dict[str, Any]) -> dict[str, int]:
    totals = apply_plan_metrics(snapshot)
    return {
        "included_order_count": int(totals["included_order_count"]),
        "ordered_quantity": int(totals["ordered_quantity"]),
        "planned_quantity": int(totals["planned_quantity"]),
        "issue_count": int(totals["issue_count"]),
        "warning_count": int(totals["warning_count"]),
    }


def assert_plan_can_mark_ready(snapshot: dict[str, Any]) -> None:
    totals = summarize_snapshot(snapshot)
    if totals["issue_count"] > 0:
        raise ValueError("Plan has blocking issues")


def duplicate_snapshot(snapshot: dict[str, Any]) -> dict[str, Any]:
    return deepcopy(snapshot)
