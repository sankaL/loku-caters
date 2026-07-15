export type {
  ItemRevenueRow,
  ItemsPerLocationRow,
  KPIData,
  Order,
  RevenueTimePoint,
} from "./dashboardTypes";

export {
  computeItemRevenueBreakdown,
  computeRevenue,
  computeRevenueOverTime,
} from "./dashboardRevenue";

export {
  computeItemsPerLocation,
  computeLocationBreakdown,
  computePaymentMethodBreakdown,
  computeStatusBreakdown,
  computeTimeSlotBreakdown,
  computeTopCustomers,
  filterOpenOrders,
} from "./dashboardBreakdowns";

export { computeKPIs } from "./dashboardKpis";

export const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  pending: { bg: "#fef3c7", color: "#92400e", label: "Pending" },
  confirmed: { bg: "#d1fae5", color: "#065f46", label: "Confirmed" },
  picked_up: { bg: "#e0e7ff", color: "#3730a3", label: "Picked Up" },
  no_show: { bg: "#fee2e2", color: "#991b1b", label: "No Show" },
  cancelled: { bg: "#f3f4f6", color: "#374151", label: "Cancelled" },
};
