import type { InvoiceDetail } from "./invoices";

export interface InvoiceFormLine {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
}

export interface InvoiceFormValues {
  source_bundle_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  issue_date: string;
  due_date: string;
  memo: string;
  line_items: InvoiceFormLine[];
  discount_total: number;
  paid: boolean;
  payment_method: "etransfer" | "cash" | "other" | null;
  payment_method_other: string;
}

export interface InvoiceOrderOption {
  bundle_id: string;
  primary_order_id: string;
  name: string;
  event_id: number | null;
  event_name?: string | null;
}

export interface InvoiceBundle extends InvoiceOrderOption {
  email: string | null;
  phone_number: string | null;
  pickup_date: string | null;
  discount_total: number;
  paid: boolean;
  payment_method: InvoiceFormValues["payment_method"];
  payment_method_other: string | null;
}

export interface InvoiceBundleLine {
  item_name: string;
  quantity: number;
  base_total_price: number;
}

export interface InvoicePayload {
  source_bundle_id: string | null;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  issue_date: string;
  due_date: string;
  memo: string | null;
  line_items: Array<{ description: string; quantity: number; unit_price: number }>;
  discount_total: number;
  paid: boolean;
  payment_method: InvoiceFormValues["payment_method"];
  payment_method_other: string | null;
}

export function invoiceFormAmounts(values: InvoiceFormValues) {
  const subtotal = values.line_items.reduce(
    (sum, line) => (
      sum + Math.max(0, Number(line.quantity) || 0) * Math.max(0, Number(line.unit_price) || 0)
    ),
    0,
  );
  const discount = Math.max(0, Number(values.discount_total) || 0);
  return { subtotal, discount, total: Math.max(0, subtotal - discount) };
}

export function createInvoiceFormLine(
  description = "",
  quantity = 1,
  unitPrice = 0,
): InvoiceFormLine {
  return { id: crypto.randomUUID(), description, quantity, unit_price: unitPrice };
}

export function emptyInvoiceForm(today: string): InvoiceFormValues {
  return {
    source_bundle_id: "",
    customer_name: "",
    customer_email: "",
    customer_phone: "",
    issue_date: today,
    due_date: today,
    memo: "",
    line_items: [createInvoiceFormLine()],
    discount_total: 0,
    paid: false,
    payment_method: null,
    payment_method_other: "",
  };
}

export function invoiceFormFromBundle(
  bundle: InvoiceBundle,
  lines: InvoiceBundleLine[],
  today: string,
): InvoiceFormValues {
  const dueDate = bundle.pickup_date && bundle.pickup_date >= today
    ? bundle.pickup_date
    : today;
  return {
    source_bundle_id: bundle.bundle_id,
    customer_name: bundle.name,
    customer_email: bundle.email ?? "",
    customer_phone: bundle.phone_number ?? "",
    issue_date: today,
    due_date: dueDate,
    memo: "",
    line_items: lines.map((line) => createInvoiceFormLine(
      line.item_name,
      line.quantity,
      Number(line.base_total_price) / Math.max(1, line.quantity),
    )),
    discount_total: Number(bundle.discount_total) || 0,
    paid: Boolean(bundle.paid),
    payment_method: bundle.paid ? bundle.payment_method : null,
    payment_method_other: bundle.paid ? bundle.payment_method_other ?? "" : "",
  };
}

export function invoiceFormValidationError(form: InvoiceFormValues): string | null {
  if (!form.customer_name.trim()) return "Customer name is required";
  if (form.line_items.some((line) => !line.description.trim())) {
    return "Every invoice item needs a description";
  }
  if (form.discount_total > invoiceFormAmounts(form).subtotal) {
    return "Discount cannot exceed the invoice subtotal";
  }
  if (form.due_date < form.issue_date) return "Due date cannot be earlier than issue date";
  return null;
}

export function invoicePayload(form: InvoiceFormValues): InvoicePayload {
  return {
    source_bundle_id: form.source_bundle_id || null,
    customer_name: form.customer_name.trim(),
    customer_email: form.customer_email.trim() || null,
    customer_phone: form.customer_phone.trim() || null,
    issue_date: form.issue_date,
    due_date: form.due_date,
    memo: form.memo.trim() || null,
    line_items: form.line_items.map((line) => ({
      description: line.description.trim(),
      quantity: line.quantity,
      unit_price: line.unit_price,
    })),
    discount_total: form.discount_total,
    paid: form.paid,
    payment_method: form.paid ? form.payment_method || null : null,
    payment_method_other: form.paid && form.payment_method === "other"
      ? form.payment_method_other.trim()
      : null,
  };
}

export function invoiceFormFromDetail(invoice: InvoiceDetail): InvoiceFormValues {
  return {
    source_bundle_id: invoice.source_bundle_id ?? "",
    customer_name: invoice.customer_name,
    customer_email: invoice.customer_email ?? "",
    customer_phone: invoice.customer_phone ?? "",
    issue_date: invoice.issue_date,
    due_date: invoice.due_date,
    memo: invoice.memo ?? "",
    line_items: invoice.line_items.map((line) => (
      createInvoiceFormLine(line.description, line.quantity, line.unit_price)
    )),
    discount_total: invoice.discount_total,
    paid: invoice.payment.paid,
    payment_method: (invoice.payment.payment_method as InvoiceFormValues["payment_method"]) ?? null,
    payment_method_other: invoice.payment.payment_method_other ?? "",
  };
}
