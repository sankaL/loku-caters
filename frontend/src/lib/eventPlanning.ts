export type PlanStatus = "draft" | "ready" | "archived";

export interface AdminEventSummary {
  id: number;
  name: string;
  event_date: string;
  kind?: string;
  is_active: boolean;
  order_count?: number;
}

export interface EventPlanSource {
  id: number;
  name: string;
  kind: string;
  event_date: string;
  pickup_date?: string | null;
  is_active?: boolean;
}

export interface EventPlanIssue {
  code: string;
  message: string;
  source_order_id?: string;
  row_id?: string;
}

export interface EventPlanBundle {
  bundle_id: string;
  primary_order_id: string;
  customer_name: string;
  pickup_location: string;
  pickup_time_slot: string;
  status: string;
  status_breakdown: Record<string, number>;
  ordered_quantity: number;
  order_notes: string;
  line_ids: string[];
}

export interface EventPlanOrderLine {
  id: string;
  bundle_id: string;
  event_id: number;
  group_id: string | null;
  customer_name: string;
  item_id: string;
  item_name: string;
  quantity: number;
  pickup_location: string;
  pickup_time_slot: string;
  pickup_date?: string | null;
  status: string;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface EventPlanRow {
  id: string;
  row_type: "order" | "extra";
  row_state?: "active" | "removed";
  split_group_id?: string | null;
  source_order_id?: string | null;
  source_bundle_id?: string | null;
  customer_name: string;
  status?: string;
  original_item_id?: string | null;
  original_item_name?: string | null;
  ordered_quantity?: number;
  planned_item_id?: string | null;
  planned_item_name: string;
  quantity: number;
  pickup_location: string;
  pickup_time_slot: string;
  notes: string;
  flags: string[];
}

export interface EventPlanSnapshot {
  version: number;
  source_event: EventPlanSource;
  created_from_orders_at?: string;
  refreshed_at?: string;
  plan_notes: string;
  bundles: EventPlanBundle[];
  order_lines: EventPlanOrderLine[];
  planned_rows: EventPlanRow[];
  removed_rows?: EventPlanRow[];
  issues: EventPlanIssue[];
  warnings: EventPlanIssue[];
  totals: {
    included_order_count: number;
    ordered_quantity: number;
    planned_quantity: number;
    issue_count: number;
    warning_count: number;
  };
  status_breakdown: Record<string, { orders: number; quantity: number }>;
}

export interface EventPlan {
  id: string;
  name: string;
  source_event_id: number;
  source_event_kind: string;
  status: PlanStatus;
  included_order_count: number;
  ordered_quantity: number;
  planned_quantity: number;
  issue_count: number;
  warning_count: number;
  created_at: string | null;
  updated_at: string | null;
  source_event?: EventPlanSource;
  is_out_of_date?: boolean;
  snapshot?: EventPlanSnapshot;
}

export const PLAN_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  ready: "Ready",
  archived: "Archived",
};

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  picked_up: "Picked Up",
  no_show: "No Show",
  cancelled: "Cancelled",
  mixed: "Mixed",
};

export function formatStatusLabel(status: string | null | undefined): string {
  if (!status) return "Unknown";
  return ORDER_STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function getPlanTotals(snapshot: EventPlanSnapshot) {
  const activeRows = snapshot.planned_rows.filter((row) => row.row_state !== "removed");
  const orderedQuantity = snapshot.order_lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
  const plannedQuantity = activeRows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const plannedByOrder = new Map<string, number>();
  for (const row of activeRows) {
    if (!row.source_order_id) continue;
    plannedByOrder.set(row.source_order_id, (plannedByOrder.get(row.source_order_id) ?? 0) + Number(row.quantity || 0));
  }
  const underCount = snapshot.order_lines.filter((line) => (plannedByOrder.get(line.id) ?? 0) < line.quantity).length;
  const overCount = snapshot.order_lines.filter((line) => (plannedByOrder.get(line.id) ?? 0) > line.quantity).length;
  return { orderedQuantity, plannedQuantity, underCount, overCount, activeRows };
}

export function normalizeSnapshot(snapshot: EventPlanSnapshot): EventPlanSnapshot {
  return {
    ...snapshot,
    plan_notes: snapshot.plan_notes ?? "",
    bundles: snapshot.bundles ?? [],
    order_lines: snapshot.order_lines ?? [],
    planned_rows: (snapshot.planned_rows ?? []).map((row) => ({
      ...row,
      notes: row.notes ?? "",
      flags: Array.isArray(row.flags) ? row.flags : [],
      quantity: Number(row.quantity || 0),
    })),
    issues: snapshot.issues ?? [],
    warnings: snapshot.warnings ?? [],
    status_breakdown: snapshot.status_breakdown ?? {},
  };
}

export function buildOriginalRow(line: EventPlanOrderLine): EventPlanRow {
  return {
    id: `plan-row-${crypto.randomUUID()}`,
    row_type: "order",
    row_state: "active",
    source_order_id: line.id,
    source_bundle_id: line.bundle_id,
    customer_name: line.customer_name,
    status: line.status,
    original_item_id: line.item_id,
    original_item_name: line.item_name,
    ordered_quantity: line.quantity,
    planned_item_id: line.item_id,
    planned_item_name: line.item_name,
    quantity: line.quantity,
    pickup_location: line.pickup_location,
    pickup_time_slot: line.pickup_time_slot,
    notes: "",
    flags: [],
  };
}

export function cloneSnapshot(snapshot: EventPlanSnapshot): EventPlanSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as EventPlanSnapshot;
}
