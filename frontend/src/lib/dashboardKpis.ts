import { isActiveOrder } from "./dashboardOrderUtils";
import type { KPIData, Order } from "./dashboardTypes";

interface PeriodMetrics {
  totalOrders: number;
  totalItems: number;
  confirmedRate: number;
  avgOrderValue: number;
  completionRate: number;
}

function calculatePeriodMetrics(orders: Order[]): PeriodMetrics {
  const nonCancelled = orders.filter((order) => order.status !== "cancelled");
  const totalOrders = nonCancelled.length;
  const totalItems = nonCancelled.reduce(
    (sum, order) => sum + (Number.isFinite(order.quantity) ? order.quantity : 0),
    0,
  );
  const confirmed = orders.filter((order) => (
    order.status === "confirmed" || order.status === "picked_up"
  )).length;
  const active = orders.filter(isActiveOrder);
  const resolved = orders.filter((order) => (
    order.status === "picked_up" || order.status === "no_show"
  ));
  const pickedUp = resolved.filter((order) => order.status === "picked_up").length;

  return {
    totalOrders,
    totalItems,
    confirmedRate: percentage(confirmed, totalOrders),
    avgOrderValue: average(active.map((order) => order.total_price)),
    completionRate: percentage(pickedUp, resolved.length),
  };
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentage(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;
}

function percentageDelta(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function computeKPIs(orders: Order[], now = new Date()): KPIData {
  const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const current = calculatePeriodMetrics(
    orders.filter((order) => order.created_at.startsWith(monthKey(now))),
  );
  const previous = calculatePeriodMetrics(
    orders.filter((order) => order.created_at.startsWith(monthKey(previousMonth))),
  );

  return {
    ...current,
    totalOrdersDelta: percentageDelta(current.totalOrders, previous.totalOrders),
    confirmedRateDelta: percentageDelta(current.confirmedRate, previous.confirmedRate),
    avgOrderValueDelta: percentageDelta(current.avgOrderValue, previous.avgOrderValue),
    completionRateDelta: percentageDelta(current.completionRate, previous.completionRate),
  };
}
