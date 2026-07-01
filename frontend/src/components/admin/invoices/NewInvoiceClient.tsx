"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle, Receipt } from "@phosphor-icons/react";
import { API_URL, CURRENCY } from "@/config/event";
import { getAdminToken } from "@/lib/auth";
import { getApiErrorMessage } from "@/lib/apiError";
import { InvoiceDetail, InvoiceSettings } from "@/lib/invoices";
import InvoiceFieldsEditor, { createInvoiceFormLine, InvoiceFormValues, InvoiceOrderOption, invoiceFormAmounts } from "./InvoiceFieldsEditor";

interface Bundle extends InvoiceOrderOption {
  email: string | null;
  phone_number: string | null;
  pickup_date: string | null;
  discount_total: number;
  paid: boolean;
  payment_method: "etransfer" | "cash" | "other" | null;
  payment_method_other: string | null;
}

interface BundleLine {
  item_name: string;
  quantity: number;
  base_total_price: number;
}

function localDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function emptyForm(): InvoiceFormValues {
  const today = localDateString();
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

export default function NewInvoiceClient({ bundleId }: { bundleId: string }) {
  const router = useRouter();
  const [settings, setSettings] = useState<InvoiceSettings | null>(null);
  const [orders, setOrders] = useState<Bundle[]>([]);
  const [form, setForm] = useState<InvoiceFormValues>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getAdminToken();
      if (!token) return;
      const headers = { Authorization: `Bearer ${token}` };
      const [settingsRes, ordersRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/invoice-settings`, { headers }),
        fetch(`${API_URL}/api/admin/orders?view=bundle`, { headers }),
      ]);
      if (!settingsRes.ok) throw new Error(await getApiErrorMessage(settingsRes, "Failed to load invoice settings"));
      if (!ordersRes.ok) throw new Error(await getApiErrorMessage(ordersRes, "Failed to load orders"));
      setSettings((await settingsRes.json()) as InvoiceSettings);
      const orderRows = (await ordersRes.json()) as Bundle[];
      setOrders(orderRows);

      if (!bundleId) {
        setForm(emptyForm());
        return;
      }
      const bundleRes = await fetch(`${API_URL}/api/admin/orders/bundles/${encodeURIComponent(bundleId)}`, { headers });
      if (!bundleRes.ok) throw new Error(await getApiErrorMessage(bundleRes, "Failed to load order"));
      const data = (await bundleRes.json()) as { bundle: Bundle; lines: BundleLine[] };
      const today = localDateString();
      const dueDate = data.bundle.pickup_date && data.bundle.pickup_date >= today ? data.bundle.pickup_date : today;
      setForm({
        source_bundle_id: data.bundle.bundle_id,
        customer_name: data.bundle.name,
        customer_email: data.bundle.email ?? "",
        customer_phone: data.bundle.phone_number ?? "",
        issue_date: today,
        due_date: dueDate,
        memo: "",
        line_items: data.lines.map((line) => createInvoiceFormLine(
          line.item_name,
          line.quantity,
          Number(line.base_total_price) / Math.max(1, line.quantity),
        )),
        discount_total: Number(data.bundle.discount_total) || 0,
        paid: Boolean(data.bundle.paid),
        payment_method: data.bundle.paid ? data.bundle.payment_method : null,
        payment_method_other: data.bundle.paid ? data.bundle.payment_method_other ?? "" : "",
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load invoice editor");
    } finally {
      setLoading(false);
    }
  }, [bundleId]);

  useEffect(() => {
    void load();
  }, [load]);

  const settingsComplete = useMemo(() => Boolean(settings?.business_address || settings?.business_email || settings?.business_phone), [settings]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    const amounts = invoiceFormAmounts(form);
    if (!form.customer_name.trim()) return setError("Customer name is required");
    if (form.line_items.some((line) => !line.description.trim())) return setError("Every invoice item needs a description");
    if (form.discount_total > amounts.subtotal) return setError("Discount cannot exceed the invoice subtotal");
    if (form.due_date < form.issue_date) return setError("Due date cannot be earlier than issue date");
    setCreating(true);
    setError(null);
    try {
      const token = await getAdminToken();
      if (!token) return;
      const res = await fetch(`${API_URL}/api/admin/invoices`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          source_bundle_id: form.source_bundle_id || null,
          issue_date: form.issue_date,
          due_date: form.due_date,
          customer_name: form.customer_name.trim(),
          customer_email: form.customer_email.trim() || null,
          customer_phone: form.customer_phone.trim() || null,
          memo: form.memo.trim() || null,
          line_items: form.line_items.map((line) => ({ description: line.description.trim(), quantity: line.quantity, unit_price: line.unit_price })),
          discount_total: form.discount_total,
          paid: form.paid,
          payment_method: form.paid ? form.payment_method || null : null,
          payment_method_other: form.paid && form.payment_method === "other" ? form.payment_method_other.trim() : null,
        }),
      });
      if (!res.ok) throw new Error(await getApiErrorMessage(res, "Failed to create invoice"));
      const invoice = (await res.json()) as InvoiceDetail;
      router.replace(`/admin/invoices/${invoice.id}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create invoice");
    } finally {
      setCreating(false);
    }
  }

  if (loading) return <div className="p-8"><div className="h-[650px] animate-pulse rounded-[2rem]" style={{ background: "var(--color-cream-dark)" }} /></div>;
  if (!settings) return <div className="p-8"><p style={{ color: "var(--color-error-text)" }}>{error ?? "Invoice editor could not be loaded."}</p></div>;

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
      <form onSubmit={handleCreate} className="mx-auto max-w-6xl">
        <button type="button" onClick={() => router.push("/admin/invoices")} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--color-muted)" }}><ArrowLeft size={16} /> Back to Invoices</button>
        <div className="mb-7"><h1 className="text-2xl font-bold" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>Create Invoice</h1><p className="mt-1 text-sm" style={{ color: "var(--color-muted)" }}>{bundleId ? "Order details are prefilled and can be changed before creating the invoice." : "Create a standalone invoice or choose an order to prefill it."}</p></div>
        {error && <div className="mb-4 rounded-xl px-4 py-3 text-sm" style={{ background: "var(--color-error-bg)", color: "var(--color-error-text)", border: "1px solid var(--color-error-border)" }}>{error}</div>}
        {!settingsComplete && <div className="mb-4 flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm" style={{ background: "var(--color-warning-bg)", color: "var(--color-warning-text)", border: "1px solid var(--color-warning-border)" }}><span>Business contact details are mostly empty. You can still create the invoice.</span><button type="button" onClick={() => router.push("/admin/invoices/settings")} className="shrink-0 font-semibold underline">Open settings</button></div>}
        <InvoiceFieldsEditor
          values={form}
          onChange={setForm}
          currency={CURRENCY}
          orders={orders}
          sourceHelp="Choosing another order reloads its details. After creation, the order is only a reference."
          onSourceChange={(nextBundleId) => router.replace(nextBundleId ? `/admin/invoices/new?bundle_id=${encodeURIComponent(nextBundleId)}` : "/admin/invoices/new")}
        />
        <div className="mt-5 flex flex-col items-end gap-3">
          <div className="flex max-w-md gap-3 rounded-2xl p-4 text-sm" style={{ background: "var(--color-cream)", border: "1px solid var(--color-border)" }}><CheckCircle size={22} weight="duotone" style={{ color: "var(--color-sage)" }} /><span>Invoice lines, pricing, payment, and customer data stay independent from the order after creation.</span></div>
          <button disabled={creating} className="inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-3 text-sm font-semibold disabled:opacity-60" style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}><Receipt size={18} weight="bold" /> {creating ? "Creating Invoice..." : "Create Invoice"}</button>
        </div>
      </form>
    </div>
  );
}
