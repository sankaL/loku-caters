"use client";

import { Plus, Trash } from "@phosphor-icons/react";
import { formatInvoiceMoney } from "@/lib/invoices";

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

interface Props {
  values: InvoiceFormValues;
  onChange: (values: InvoiceFormValues) => void;
  currency: string;
  orders?: InvoiceOrderOption[];
  sourceHelp?: string;
  issueYear?: number;
  onSourceChange?: (bundleId: string) => void;
}

export function invoiceFormAmounts(values: InvoiceFormValues) {
  const subtotal = values.line_items.reduce(
    (sum, line) => sum + Math.max(0, Number(line.quantity) || 0) * Math.max(0, Number(line.unit_price) || 0),
    0,
  );
  const discount = Math.max(0, Number(values.discount_total) || 0);
  return { subtotal, discount, total: Math.max(0, subtotal - discount) };
}

export function createInvoiceFormLine(description = "", quantity = 1, unitPrice = 0): InvoiceFormLine {
  return { id: crypto.randomUUID(), description, quantity, unit_price: unitPrice };
}

export default function InvoiceFieldsEditor({ values, onChange, currency, orders = [], sourceHelp, issueYear, onSourceChange }: Props) {
  const amounts = invoiceFormAmounts(values);
  const fieldClass = "w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none transition-all focus:border-[color:var(--color-sage)] focus:ring-2 focus:ring-[color:var(--color-sage)]";
  const set = <K extends keyof InvoiceFormValues>(key: K, value: InvoiceFormValues[K]) => onChange({ ...values, [key]: value });
  const updateLine = (index: number, patch: Partial<InvoiceFormLine>) => {
    const lines = values.line_items.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line);
    set("line_items", lines);
  };
  const changeSource = (bundleId: string) => {
    set("source_bundle_id", bundleId);
    onSourceChange?.(bundleId);
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-5">
        <section className="rounded-[1.5rem] border bg-white p-5 sm:p-6" style={{ borderColor: "var(--color-border)" }}>
          <h2 className="mb-4 text-lg font-bold" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>Bill To</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-semibold sm:col-span-2">Customer name<input required value={values.customer_name} onChange={(event) => set("customer_name", event.target.value)} className={fieldClass} style={{ borderColor: "var(--color-border)" }} /></label>
            <label className="grid gap-1.5 text-sm font-semibold">Email<input type="email" value={values.customer_email} onChange={(event) => set("customer_email", event.target.value)} className={fieldClass} style={{ borderColor: "var(--color-border)" }} /></label>
            <label className="grid gap-1.5 text-sm font-semibold">Phone<input value={values.customer_phone} onChange={(event) => set("customer_phone", event.target.value)} className={fieldClass} style={{ borderColor: "var(--color-border)" }} /></label>
          </div>
        </section>

        <section className="rounded-[1.5rem] border bg-white p-5 sm:p-6" style={{ borderColor: "var(--color-border)" }}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>Invoice Items</h2>
            <button type="button" onClick={() => set("line_items", [...values.line_items, createInvoiceFormLine()])} className="inline-flex items-center gap-1 rounded-xl border bg-white px-3 py-2 text-xs font-semibold" style={{ borderColor: "var(--color-border)", color: "var(--color-forest)" }}><Plus size={15} /> Add Item</button>
          </div>
          <div className="space-y-3">
            {values.line_items.map((line, index) => (
              <div key={line.id} className="grid gap-3 rounded-2xl p-3 sm:grid-cols-[minmax(0,1fr)_90px_130px_42px] sm:items-end" style={{ background: "var(--color-cream)", border: "1px solid var(--color-border)" }}>
                <label className="grid gap-1 text-xs font-semibold">Description<input required value={line.description} onChange={(event) => updateLine(index, { description: event.target.value })} className={fieldClass} style={{ borderColor: "var(--color-border)" }} /></label>
                <label className="grid gap-1 text-xs font-semibold">Qty<input required type="number" min={1} step={1} value={line.quantity} onChange={(event) => updateLine(index, { quantity: Math.max(1, Number(event.target.value) || 1) })} className={fieldClass} style={{ borderColor: "var(--color-border)" }} /></label>
                <label className="grid gap-1 text-xs font-semibold">Unit price<input required type="number" min={0} step="0.01" value={line.unit_price} onChange={(event) => updateLine(index, { unit_price: Math.max(0, Number(event.target.value) || 0) })} className={fieldClass} style={{ borderColor: "var(--color-border)" }} /></label>
                <button type="button" disabled={values.line_items.length === 1} onClick={() => set("line_items", values.line_items.filter((_, lineIndex) => lineIndex !== index))} title="Remove item" className="grid h-[42px] place-items-center rounded-xl border bg-white disabled:opacity-35" style={{ borderColor: "var(--color-border)", color: "var(--color-error-text)" }}><Trash size={16} /></button>
                <p className="text-xs sm:col-span-4 sm:text-right" style={{ color: "var(--color-muted)" }}>Line subtotal: <span className="font-semibold" style={{ color: "var(--color-text)" }}>{formatInvoiceMoney(line.quantity * line.unit_price, currency)}</span></p>
              </div>
            ))}
          </div>
          <div className="ml-auto mt-5 w-full max-w-sm space-y-2 text-sm">
            <div className="flex justify-between"><span style={{ color: "var(--color-muted)" }}>Subtotal</span><span>{formatInvoiceMoney(amounts.subtotal, currency)}</span></div>
            <label className="flex items-center justify-between gap-4"><span style={{ color: "var(--color-muted)" }}>Discount</span><input type="number" min={0} max={amounts.subtotal} step="0.01" value={values.discount_total} onChange={(event) => set("discount_total", Math.max(0, Number(event.target.value) || 0))} className="w-32 rounded-lg border bg-white px-2 py-1.5 text-right" style={{ borderColor: "var(--color-border)" }} /></label>
            <div className="flex justify-between border-t pt-3 text-base font-bold" style={{ borderColor: "var(--color-forest)", color: "var(--color-forest)" }}><span>Total</span><span>{formatInvoiceMoney(amounts.total, currency)}</span></div>
          </div>
        </section>
      </div>

      <div className="space-y-5">
        <section className="rounded-[1.5rem] border bg-white p-5" style={{ borderColor: "var(--color-border)" }}>
          <h2 className="mb-4 text-lg font-bold" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>Invoice Details</h2>
          <div className="space-y-4">
            <label className="grid gap-1.5 text-sm font-semibold">Order reference<select value={values.source_bundle_id} onChange={(event) => changeSource(event.target.value)} className={fieldClass} style={{ borderColor: "var(--color-border)" }}><option value="">Standalone invoice</option>{orders.map((order) => <option key={order.bundle_id} value={order.bundle_id}>{order.name} | #{order.primary_order_id.slice(0, 8).toUpperCase()}</option>)}</select>{sourceHelp && <span className="text-xs font-normal leading-5" style={{ color: "var(--color-muted)" }}>{sourceHelp}</span>}</label>
            <label className="grid gap-1.5 text-sm font-semibold">Issue date<input type="date" required min={issueYear ? `${issueYear}-01-01` : undefined} max={issueYear ? `${issueYear}-12-31` : undefined} value={values.issue_date} onChange={(event) => set("issue_date", event.target.value)} className={fieldClass} style={{ borderColor: "var(--color-border)" }} /></label>
            <label className="grid gap-1.5 text-sm font-semibold">Due date<input type="date" required min={values.issue_date} value={values.due_date} onChange={(event) => set("due_date", event.target.value)} className={fieldClass} style={{ borderColor: "var(--color-border)" }} /></label>
            <label className="grid gap-1.5 text-sm font-semibold">Memo<textarea rows={4} value={values.memo} onChange={(event) => set("memo", event.target.value)} placeholder="Optional note for this invoice" className={fieldClass} style={{ borderColor: "var(--color-border)", resize: "vertical" }} /></label>
          </div>
        </section>

        <section className="rounded-[1.5rem] border bg-white p-5" style={{ borderColor: "var(--color-border)" }}>
          <h2 className="mb-4 text-lg font-bold" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>Payment</h2>
          <label className="flex items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={values.paid} onChange={(event) => onChange({ ...values, paid: event.target.checked, payment_method: event.target.checked ? values.payment_method : null, payment_method_other: event.target.checked ? values.payment_method_other : "" })} className="h-4 w-4" /> Mark invoice as paid</label>
          {values.paid && <div className="mt-4 space-y-4"><label className="grid gap-1.5 text-sm font-semibold">Payment method<select value={values.payment_method ?? ""} onChange={(event) => set("payment_method", event.target.value ? event.target.value as NonNullable<InvoiceFormValues["payment_method"]> : null)} className={fieldClass} style={{ borderColor: "var(--color-border)" }}><option value="">Not recorded</option><option value="etransfer">E-transfer</option><option value="cash">Cash</option><option value="other">Other</option></select></label>{values.payment_method === "other" && <label className="grid gap-1.5 text-sm font-semibold">Method details<input required value={values.payment_method_other} onChange={(event) => set("payment_method_other", event.target.value)} className={fieldClass} style={{ borderColor: "var(--color-border)" }} /></label>}</div>}
        </section>
      </div>
    </div>
  );
}
