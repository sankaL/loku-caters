export interface Order {
  id: string;
  event_id: number;
  name: string;
  email: string | null;
  phone_number: string | null;
  item_name: string;
  item_id: string;
  quantity: number;
  pickup_location: string;
  pickup_time_slot: string;
  total_price: number;
  status: string;
  reminded: boolean;
  paid: boolean;
  payment_method: string | null;
  payment_method_other: string | null;
  notes?: string | null;
  exclude_email?: boolean;
  created_at: string;
}

export interface ItemRevenueRow {
  itemId: string;
  itemName: string;
  orderCount: number;
  quantity: number;
  revenue: number;
}

export interface RevenueTimePoint {
  date: string;
  label: string;
  totalRevenue: number;
  [itemId: string]: number | string;
}

export interface RevenueOverTimeResult {
  data: RevenueTimePoint[];
  topItems: { itemId: string; itemName: string }[];
}

export interface KPIData {
  totalOrders: number;
  totalOrdersDelta: number | null;
  totalItems: number;
  confirmedRate: number;
  confirmedRateDelta: number | null;
  avgOrderValue: number;
  avgOrderValueDelta: number | null;
  completionRate: number;
  completionRateDelta: number | null;
}

export interface PaymentMethodRow {
  method: string;
  label: string;
  count: number;
  revenue: number;
}

export interface LocationPaymentMethod {
  method: string;
  label: string;
  revenue: number;
  count: number;
}

export interface ItemsPerLocationRow {
  location: string;
  items: { itemName: string; quantity: number; revenue: number }[];
  paidRevenue: number;
  unpaidRevenue: number;
  byMethod: LocationPaymentMethod[];
}
