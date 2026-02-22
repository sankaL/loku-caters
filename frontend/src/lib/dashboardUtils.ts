export interface Order {
  id: string;
  name: string;
  email: string;
  phone_number: string;
  item_name: string;
  item_id: string;
  quantity: number;
  pickup_location: string;
  pickup_time_slot: string;
  total_price: number;
  status: string;
  created_at: string;
}

export const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  pending:   { bg: "#fef3c7", color: "#92400e", label: "Pending" },
  confirmed: { bg: "#d1fae5", color: "#065f46", label: "Confirmed" },
  reminded:  { bg: "#fdf0e8", color: "#7a3f1e", label: "Reminded" },
  paid:      { bg: "#dbeafe", color: "#1e40af", label: "Paid" },
  picked_up: { bg: "#e0e7ff", color: "#3730a3", label: "Picked Up" },
  no_show:   { bg: "#fee2e2", color: "#991b1b", label: "No Show" },
  cancelled: { bg: "#f3f4f6", color: "#374151", label: "Cancelled" },
};

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function isActive(order: Order): boolean {
  return order.status !== "cancelled" && order.status !== "no_show";
}

function toLocalDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function computeRevenue(orders: Order[]): {
  total: number;
  monthly: { month: string; revenue: number }[];
} {
  const active = orders.filter(isActive);
  const total = active.reduce((sum, o) => sum + o.total_price, 0);

  // Build last 6 months buckets
  const now = new Date();
  const buckets: { key: string; month: string; revenue: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    buckets.push({ key, month: MONTH_NAMES[d.getMonth()], revenue: 0 });
  }

  for (const o of active) {
    const key = o.created_at.substring(0, 7);
    const bucket = buckets.find((b) => b.key === key);
    if (bucket) bucket.revenue += o.total_price;
  }

  return { total, monthly: buckets.map(({ month, revenue }) => ({ month, revenue })) };
}

export function computeLocationBreakdown(orders: Order[]): {
  location: string;
  count: number;
  revenue: number;
}[] {
  const map = new Map<string, { count: number; revenue: number }>();
  for (const o of orders) {
    const existing = map.get(o.pickup_location) ?? { count: 0, revenue: 0 };
    map.set(o.pickup_location, {
      count: existing.count + 1,
      revenue: existing.revenue + o.total_price,
    });
  }
  return Array.from(map.entries())
    .map(([location, { count, revenue }]) => ({ location, count, revenue }))
    .sort((a, b) => b.count - a.count);
}

export function computeTimeSlotBreakdown(orders: Order[]): {
  slot: string;
  shortLabel: string;
  count: number;
}[] {
  const map = new Map<string, number>();
  for (const o of orders) {
    map.set(o.pickup_time_slot, (map.get(o.pickup_time_slot) ?? 0) + 1);
  }

  return Array.from(map.entries())
    .map(([slot, count]) => ({
      slot,
      shortLabel: slot.split(" - ")[0].replace(":00", "").trim(),
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

export function computeTopCustomers(
  orders: Order[],
  limit = 5
): { name: string; email: string; totalSpend: number; orderCount: number }[] {
  const map = new Map<string, { name: string; totalSpend: number; orderCount: number }>();
  for (const o of orders) {
    const existing = map.get(o.email) ?? { name: o.name, totalSpend: 0, orderCount: 0 };
    map.set(o.email, {
      name: o.name,
      totalSpend: existing.totalSpend + o.total_price,
      orderCount: existing.orderCount + 1,
    });
  }
  return Array.from(map.entries())
    .map(([email, { name, totalSpend, orderCount }]) => ({ email, name, totalSpend, orderCount }))
    .sort((a, b) => b.totalSpend - a.totalSpend)
    .slice(0, limit);
}

export function filterOpenOrders(orders: Order[]): Order[] {
  return orders
    .filter((o) => o.status === "pending")
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export function computeOrdersOverTime(
  orders: Order[],
  range: "7d" | "30d" | "1y"
): { date: string; label: string; count: number; revenue: number }[] {
  const now = new Date();
  now.setHours(23, 59, 59, 999);

  if (range === "1y") {
    // Monthly buckets for past 12 months
    const buckets: { key: string; label: string; count: number; revenue: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      buckets.push({ key, label: MONTH_NAMES[d.getMonth()], count: 0, revenue: 0 });
    }
    for (const o of orders) {
      const key = o.created_at.substring(0, 7);
      const bucket = buckets.find((b) => b.key === key);
      if (bucket) {
        bucket.count++;
        bucket.revenue += o.total_price;
      }
    }
    return buckets.map(({ key, label, count, revenue }) => ({ date: key, label, count, revenue }));
  }

  // Daily buckets
  const days = range === "7d" ? 7 : 30;
  const buckets: { date: string; label: string; count: number; revenue: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = toLocalDateKey(d);
    const label = `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
    buckets.push({ date: dateStr, label, count: 0, revenue: 0 });
  }

  for (const o of orders) {
    const createdAt = new Date(o.created_at);
    if (Number.isNaN(createdAt.getTime())) continue;
    const dateStr = toLocalDateKey(createdAt);
    const bucket = buckets.find((b) => b.date === dateStr);
    if (bucket) {
      bucket.count++;
      bucket.revenue += o.total_price;
    }
  }

  return buckets;
}

function calcMetrics(subset: Order[]) {
  const nonCancelled = subset.filter((o) => o.status !== "cancelled");
  const totalOrders = nonCancelled.length;
  const confirmed = subset.filter((o) =>
    ["confirmed", "reminded", "paid", "picked_up"].includes(o.status)
  ).length;
  const confirmedRate = totalOrders > 0 ? Math.round((confirmed / totalOrders) * 100) : 0;
  const active = subset.filter(isActive);
  const avgOrderValue =
    active.length > 0
      ? active.reduce((s, o) => s + o.total_price, 0) / active.length
      : 0;
  const resolved = subset.filter(
    (o) => o.status === "picked_up" || o.status === "no_show"
  );
  const pickedUp = subset.filter((o) => o.status === "picked_up").length;
  const completionRate =
    resolved.length > 0 ? Math.round((pickedUp / resolved.length) * 100) : 0;
  return { totalOrders, confirmedRate, avgOrderValue, completionRate };
}

function pctDelta(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return Math.round(((curr - prev) / prev) * 100);
}

export interface KPIData {
  totalOrders: number;
  totalOrdersDelta: number | null;
  confirmedRate: number;
  confirmedRateDelta: number | null;
  avgOrderValue: number;
  avgOrderValueDelta: number | null;
  completionRate: number;
  completionRateDelta: number | null;
}

export function computeKPIs(orders: Order[]): KPIData {
  const now = new Date();
  const thisKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;

  const curr = calcMetrics(orders.filter((o) => o.created_at.startsWith(thisKey)));
  const prev = calcMetrics(orders.filter((o) => o.created_at.startsWith(prevKey)));

  return {
    ...curr,
    totalOrdersDelta: pctDelta(curr.totalOrders, prev.totalOrders),
    confirmedRateDelta: prev.totalOrders > 0 ? pctDelta(curr.confirmedRate, prev.confirmedRate) : null,
    avgOrderValueDelta: pctDelta(curr.avgOrderValue, prev.avgOrderValue),
    completionRateDelta: prev.completionRate > 0 ? pctDelta(curr.completionRate, prev.completionRate) : null,
  };
}
