export interface InvoicePayment {
  paid: boolean;
  payment_method: string | null;
  payment_method_other: string | null;
}

export interface InvoiceLine {
  description: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export interface InvoiceSnapshot {
  version: number;
  currency: string;
  vendor: InvoiceSettings;
  customer: { name: string; email: string | null; phone: string | null };
  invoice: { issue_date: string; due_date: string; memo: string | null };
  order: {
    bundle_id: string;
    primary_order_id: string;
    reference: string;
    event_id: number | null;
    event_name: string | null;
    pickup_location: string | null;
    pickup_time_slot: string | null;
    pickup_address: string | null;
    pickup_date: string | null;
    ordered_at: string | null;
  } | null;
}

export interface InvoiceSummary {
  id: string;
  invoice_number: string;
  number_year: number;
  source_bundle_id: string | null;
  source_order_id: string | null;
  source_event_id: number | null;
  order_reference: string | null;
  event_name: string | null;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  issue_date: string;
  due_date: string;
  memo: string | null;
  currency: string;
  line_items: InvoiceLine[];
  subtotal: number;
  discount_total: number;
  total: number;
  payment: InvoicePayment;
  created_at: string;
  updated_at: string;
}

export interface InvoiceDetail extends InvoiceSummary {
  snapshot: InvoiceSnapshot;
}

export interface InvoiceSettings {
  business_name: string;
  business_address: string | null;
  business_email: string | null;
  business_phone: string | null;
  payment_method: "none" | "etransfer" | "cash" | "other";
  payment_email: string | null;
  payment_instructions: string | null;
  default_footer_note: string | null;
  updated_at?: string | null;
}

export function formatInvoiceMoney(value: number, currency: string): string {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(Number(value) || 0);
}

export function formatInvoiceDate(value: string): string {
  if (!value) return "-";
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "short", day: "numeric" }).format(date);
}

export function paymentMethodLabel(method: string | null, other?: string | null): string {
  if (method === "etransfer") return "E-transfer";
  if (method === "cash") return "Cash";
  if (method === "other") return other || "Other";
  return "";
}
