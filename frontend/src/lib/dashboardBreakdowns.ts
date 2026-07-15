import { isActiveOrder, orderItemName } from "./dashboardOrderUtils";
import type {
  ItemsPerLocationRow,
  LocationPaymentMethod,
  Order,
  PaymentMethodRow,
} from "./dashboardTypes";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  etransfer: "E-Transfer",
  card: "Card",
  unpaid: "Unpaid",
};

const PAYMENT_METHOD_ORDER = ["etransfer", "cash", "card", "other"];

interface LocationAccumulator {
  items: Map<string, { quantity: number; revenue: number }>;
  paidRevenue: number;
  unpaidRevenue: number;
  paymentMethods: Map<string, { revenue: number; count: number }>;
}

function emptyLocationAccumulator(): LocationAccumulator {
  return {
    items: new Map(),
    paidRevenue: 0,
    unpaidRevenue: 0,
    paymentMethods: new Map(),
  };
}

function paymentMethodKey(method: string | null): string {
  return method === "etransfer" || method === "cash" || method === "card" ? method : "other";
}

function addLocationOrder(accumulator: LocationAccumulator, order: Order): void {
  const itemName = orderItemName(order);
  const item = accumulator.items.get(itemName) ?? { quantity: 0, revenue: 0 };
  accumulator.items.set(itemName, {
    quantity: item.quantity + order.quantity,
    revenue: item.revenue + order.total_price,
  });

  if (!order.paid) {
    accumulator.unpaidRevenue += order.total_price;
    return;
  }

  accumulator.paidRevenue += order.total_price;
  const method = paymentMethodKey(order.payment_method);
  const totals = accumulator.paymentMethods.get(method) ?? { revenue: 0, count: 0 };
  accumulator.paymentMethods.set(method, {
    revenue: totals.revenue + order.total_price,
    count: totals.count + 1,
  });
}

function formatPaymentMethods(accumulator: LocationAccumulator): LocationPaymentMethod[] {
  return PAYMENT_METHOD_ORDER.flatMap((method) => {
    const totals = accumulator.paymentMethods.get(method);
    if (!totals) return [];
    return [{
      method,
      label: PAYMENT_METHOD_LABELS[method] ?? "Other",
      revenue: totals.revenue,
      count: totals.count,
    }];
  });
}

function formatLocation(
  location: string,
  accumulator: LocationAccumulator,
): ItemsPerLocationRow {
  return {
    location,
    items: Array.from(accumulator.items.entries())
      .map(([itemName, totals]) => ({ itemName, ...totals }))
      .sort((left, right) => right.quantity - left.quantity),
    paidRevenue: accumulator.paidRevenue,
    unpaidRevenue: accumulator.unpaidRevenue,
    byMethod: formatPaymentMethods(accumulator),
  };
}

export function computeLocationBreakdown(orders: Order[]): {
  location: string;
  count: number;
  revenue: number;
}[] {
  const totals = new Map<string, { count: number; revenue: number }>();
  for (const order of orders) {
    const existing = totals.get(order.pickup_location) ?? { count: 0, revenue: 0 };
    totals.set(order.pickup_location, {
      count: existing.count + 1,
      revenue: existing.revenue + order.total_price,
    });
  }
  return Array.from(totals, ([location, values]) => ({ location, ...values }))
    .sort((left, right) => right.count - left.count);
}

export function computeTimeSlotBreakdown(orders: Order[]): {
  slot: string;
  shortLabel: string;
  count: number;
}[] {
  const totals = new Map<string, number>();
  for (const order of orders) {
    totals.set(order.pickup_time_slot, (totals.get(order.pickup_time_slot) ?? 0) + 1);
  }

  return Array.from(totals, ([slot, count]) => ({
    slot,
    shortLabel: slot.split(" - ")[0].replace(":00", "").trim(),
    count,
  })).sort((left, right) => right.count - left.count);
}

export function computeTopCustomers(
  orders: Order[],
  limit = 5,
): { name: string; email: string; totalSpend: number; orderCount: number }[] {
  const customers = new Map<string, { name: string; totalSpend: number; orderCount: number }>();
  for (const order of orders) {
    const email = (order.email ?? "").trim();
    if (!email) continue;
    const existing = customers.get(email) ?? { name: order.name, totalSpend: 0, orderCount: 0 };
    customers.set(email, {
      name: order.name,
      totalSpend: existing.totalSpend + order.total_price,
      orderCount: existing.orderCount + 1,
    });
  }
  return Array.from(customers, ([email, values]) => ({ email, ...values }))
    .sort((left, right) => right.totalSpend - left.totalSpend)
    .slice(0, limit);
}

export function filterOpenOrders(orders: Order[]): Order[] {
  return orders
    .filter((order) => order.status === "pending")
    .sort((left, right) => (
      new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
    ));
}

export function computeStatusBreakdown(orders: Order[]): { status: string; count: number }[] {
  const totals = new Map<string, number>();
  for (const order of orders) totals.set(order.status, (totals.get(order.status) ?? 0) + 1);
  return Array.from(totals, ([status, count]) => ({ status, count }))
    .sort((left, right) => right.count - left.count);
}

export function computePaymentMethodBreakdown(orders: Order[]): PaymentMethodRow[] {
  const totals = new Map<string, { count: number; revenue: number }>();
  for (const order of orders.filter(isActiveOrder)) {
    const method = order.payment_method ?? "unpaid";
    const existing = totals.get(method) ?? { count: 0, revenue: 0 };
    totals.set(method, {
      count: existing.count + 1,
      revenue: existing.revenue + order.total_price,
    });
  }
  return Array.from(totals, ([method, values]) => ({
    method,
    label: PAYMENT_METHOD_LABELS[method] ?? method,
    ...values,
  })).sort((left, right) => right.count - left.count);
}

export function computeItemsPerLocation(orders: Order[]): ItemsPerLocationRow[] {
  const locations = new Map<string, LocationAccumulator>();
  for (const order of orders.filter(isActiveOrder)) {
    const accumulator = locations.get(order.pickup_location) ?? emptyLocationAccumulator();
    addLocationOrder(accumulator, order);
    locations.set(order.pickup_location, accumulator);
  }
  return Array.from(locations, ([location, accumulator]) => formatLocation(location, accumulator));
}
