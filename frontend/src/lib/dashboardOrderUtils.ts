import type { Order } from "./dashboardTypes";

export const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function isActiveOrder(order: Order): boolean {
  return order.status !== "cancelled" && order.status !== "no_show";
}

export function orderItemId(order: Order): string {
  return (order.item_id || order.item_name || "unknown").trim() || "unknown";
}

export function orderItemName(order: Order): string {
  return (order.item_name || order.item_id || "Unknown item").trim() || "Unknown item";
}

export function toLocalDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
