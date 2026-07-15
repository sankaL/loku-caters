import {
  isActiveOrder,
  MONTH_NAMES,
  orderItemId,
  orderItemName,
  toLocalDateKey,
} from "./dashboardOrderUtils";
import type {
  ItemRevenueRow,
  Order,
  RevenueOverTimeResult,
  RevenueTimePoint,
} from "./dashboardTypes";

interface RevenueBucket {
  date: string;
  label: string;
  totalRevenue: number;
  itemRevenue: Map<string, number>;
}

type RevenueRange = "7d" | "30d" | "1y";

export function computeRevenue(orders: Order[]): {
  total: number;
  monthly: { month: string; revenue: number }[];
} {
  const active = orders.filter(isActiveOrder);
  const total = active.reduce((sum, order) => sum + order.total_price, 0);
  const buckets = buildMonthlyBuckets(new Date(), 6);
  accumulateRevenue(active, buckets, "1y");

  return {
    total,
    monthly: buckets.map(({ label: month, totalRevenue: revenue }) => ({ month, revenue })),
  };
}

export function computeItemRevenueBreakdown(orders: Order[]): ItemRevenueRow[] {
  const rows = new Map<string, ItemRevenueRow>();

  for (const order of orders.filter(isActiveOrder)) {
    const itemId = orderItemId(order);
    const itemName = orderItemName(order);
    const existing = rows.get(itemId);
    if (existing) {
      existing.orderCount += 1;
      existing.quantity += order.quantity;
      existing.revenue += order.total_price;
      if (existing.itemName === existing.itemId) existing.itemName = itemName;
      continue;
    }

    rows.set(itemId, {
      itemId,
      itemName,
      orderCount: 1,
      quantity: order.quantity,
      revenue: order.total_price,
    });
  }

  return Array.from(rows.values()).sort((left, right) => right.revenue - left.revenue);
}

function emptyBucket(date: string, label: string): RevenueBucket {
  return { date, label, totalRevenue: 0, itemRevenue: new Map() };
}

function buildMonthlyBuckets(now: Date, count: number): RevenueBucket[] {
  const buckets: RevenueBucket[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    buckets.push(emptyBucket(key, MONTH_NAMES[date.getMonth()]));
  }
  return buckets;
}

function buildDailyBuckets(now: Date, count: number): RevenueBucket[] {
  const buckets: RevenueBucket[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(now);
    date.setDate(date.getDate() - offset);
    buckets.push(emptyBucket(toLocalDateKey(date), `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}`));
  }
  return buckets;
}

function buildRevenueBuckets(range: RevenueRange, now: Date): RevenueBucket[] {
  if (range === "1y") return buildMonthlyBuckets(now, 12);
  return buildDailyBuckets(now, range === "7d" ? 7 : 30);
}

function revenueBucketKey(order: Order, range: RevenueRange): string | null {
  if (range === "1y") return order.created_at.substring(0, 7);
  const createdAt = new Date(order.created_at);
  return Number.isNaN(createdAt.getTime()) ? null : toLocalDateKey(createdAt);
}

function addOrderRevenue(bucket: RevenueBucket, order: Order): void {
  const itemId = orderItemId(order);
  bucket.totalRevenue += order.total_price;
  bucket.itemRevenue.set(itemId, (bucket.itemRevenue.get(itemId) ?? 0) + order.total_price);
}

function accumulateRevenue(
  orders: Order[],
  buckets: RevenueBucket[],
  range: RevenueRange,
): void {
  const bucketByDate = new Map(buckets.map((bucket) => [bucket.date, bucket]));
  for (const order of orders) {
    const key = revenueBucketKey(order, range);
    if (!key) continue;
    const bucket = bucketByDate.get(key);
    if (bucket) addOrderRevenue(bucket, order);
  }
}

function collectItemNames(orders: Order[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const order of orders) {
    const itemId = orderItemId(order);
    if (!names.has(itemId)) names.set(itemId, orderItemName(order));
  }
  return names;
}

function rankTopItems(
  buckets: RevenueBucket[],
  itemNames: Map<string, string>,
): RevenueOverTimeResult["topItems"] {
  const totals = new Map<string, number>();
  for (const bucket of buckets) {
    for (const [itemId, revenue] of bucket.itemRevenue) {
      totals.set(itemId, (totals.get(itemId) ?? 0) + revenue);
    }
  }

  return Array.from(totals.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([itemId]) => ({ itemId, itemName: itemNames.get(itemId) ?? itemId }));
}

function buildRevenuePoints(
  buckets: RevenueBucket[],
  topItems: RevenueOverTimeResult["topItems"],
): RevenueTimePoint[] {
  return buckets.map((bucket) => {
    const point: RevenueTimePoint = {
      date: bucket.date,
      label: bucket.label,
      totalRevenue: bucket.totalRevenue,
    };
    for (const { itemId } of topItems) point[itemId] = bucket.itemRevenue.get(itemId) ?? 0;
    return point;
  });
}

export function computeRevenueOverTime(
  orders: Order[],
  range: RevenueRange,
  now = new Date(),
): RevenueOverTimeResult {
  const activeOrders = orders.filter(isActiveOrder);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const buckets = buildRevenueBuckets(range, endOfToday);
  accumulateRevenue(activeOrders, buckets, range);
  const topItems = rankTopItems(buckets, collectItemNames(activeOrders));
  return { data: buildRevenuePoints(buckets, topItems), topItems };
}
