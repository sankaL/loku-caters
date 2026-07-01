"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle, Receipt } from "@phosphor-icons/react";
import { API_URL, CURRENCY } from "@/config/event";
import { getAdminToken } from "@/lib/auth";
import { getApiErrorMessage } from "@/lib/apiError";
import { formatInvoiceMoney, InvoiceDetail, InvoiceSettings } from "@/lib/invoices";

interface Bundle {
  bundle_id: string;
  primary_order_id: string;
  event_id: number;
  name: string;
  email: string | null;
  phone_number: string | null;
  pickup_location: string;
  pickup_time_slot: string;
  pickup_address: string | null;
  pickup_date: string | null;
  status: string;
  base_total_price: number;
  discount_total: number;
  total_price: number;
}

interface BundleLine {
  id: string;
  item_name: string;
  quantity: number;
  base_total_price: number;
  discount_total: number;
  total_price: number;
}

function localDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function NewInvoiceClient({ bundleId }: { bundleId: string }) {
  const router = useRouter();
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [lines, setLines] = useState<BundleLine[]>([]);
  const [settings, setSettings] = useState<InvoiceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ customer_name: "", customer_email: "", customer_phone: "", issue_date: localDateString(), due_date: localDateString(), memo: "" });

  const load = useCallback(async () => {
    if (!bundleId) {
      router.replace("/admin/invoices");
      return;
    }
    try {
      const token = await getAdminToken();
      if (!token) return;
      const headers = { Authorization: `Bearer ${token}` };
      const existingRes = await fetch(`${API_URL}/api/admin/invoices/by-bundle/${encodeURIComponent(bundleId)}`, { headers });
      if (existingRes.ok) {
        const existing = (await existingRes.json()) as InvoiceDetail;
        router.replace(`/admin/invoices/${existing.id}`);
        return;
      }
      const [bundleRes, settingsRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/orders/bundles/${encodeURIComponent(bundleId)}`, { headers }),
        fetch(`${API_URL}/api/admin/invoice-settings`, { headers }),
      ]);
      if (!bundleRes.ok) throw new Error(await getApiErrorMessage(bundleRes, "Failed to load order"));
      if (!settingsRes.ok) throw new Error(await getApiErrorMessage(settingsRes, "Failed to load invoice settings"));
      const data = (await bundleRes.json()) as { bundle: Bundle; lines: BundleLine[] };
      const nextBundle = data.bundle;
      const today = localDateString();
      const dueDate = nextBundle.pickup_date && nextBundle.pickup_date >= today ? nextBundle.pickup_date : today;
      setBundle(nextBundle);
      setLines(data.lines ?? []);
      setSettings((await settingsRes.json()) as InvoiceSettings);
      setForm({ customer_name: nextBundle.name, customer_email: nextBundle.email ?? "", customer_phone: nextBundle.phone_number ?? "", issue_date: today, due_date: dueDate, memo: "" });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load invoice review");
    } finally {
      setLoading(false);
    }
  }, [bundleId, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const settingsComplete = useMemo(() => Boolean(settings?.business_address || settings?.business_email || settings?.business_phone), [settings]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (!bundle || !form.customer_name.trim()) return;
    if (form.due_date < form.issue_date) {
      setError("Due date cannot be earlier than issue date");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const token = await getAdminToken();
      if (!token) return;
      const res = await fetch(`${API_URL}/api/admin/invoices`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          source_bundle_id: bundle.bundle_id,
          issue_date: form.issue_date,
          due_date: form.due_date,
          customer_name: form.customer_name.trim(),
          customer_email: form.customer_email.trim() || null,
          customer_phone: form.customer_phone.trim() || null,
          memo: form.memo.trim() || null,
        }),
      });
      if (res.status === 409) {
        const payload = await res.json() as { detail?: { invoice_id?: string } };
        if (payload.detail?.invoice_id) {
          router.replace(`/admin/invoices/${payload.detail.invoice_id}`);
          return;
        }
      }
      if (!res.ok) throw new Error(await getApiErrorMessage(res, "Failed to create invoice"));
      const invoice = (await res.json()) as InvoiceDetail;
      router.replace(`/admin/invoices/${invoice.id}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create invoice");
    } finally {
      setCreating(false);
    }
  }

  const fieldClass = "w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none transition-all focus:border-[color:var(--color-sage)] focus:ring-2 focus:ring-[color:var(--color-sage)]";

  if (loading) return <div className="p-8"><div className="h-96 animate-pulse rounded-[2rem]" style={{ background: "var(--color-cream-dark)" }} /></div>;
  if (!bundle || !settings) return <div className="p-8"><p style={{ color: "var(--color-error-text)" }}>{error ?? "Order could not be loaded."}</p><button onClick={() => router.push("/admin/invoices")} className="mt-4 rounded-xl px-4 py-2 text-sm font-semibold" style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}>Back to Invoices</button></div>;

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <button onClick={() => router.push("/admin/invoices")} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--color-muted)" }}><ArrowLeft size={16} /> Back to Invoices</button>
        <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div><h1 className="text-2xl font-bold" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>Review Invoice</h1><p className="mt-1 text-sm" style={{ color: "var(--color-muted)" }}>Confirm the customer and dates before assigning the permanent invoice number.</p></div>
          <div className="rounded-xl px-3 py-2 text-xs font-semibold" style={{ background: "var(--color-cream)", color: "var(--color-muted)", border: "1px solid var(--color-border)" }}>Order #{bundle.primary_order_id.slice(0, 8).toUpperCase()}</div>
        </div>
        {error && <div className="mb-4 rounded-xl px-4 py-3 text-sm" style={{ background: "var(--color-error-bg)", color: "var(--color-error-text)", border: "1px solid var(--color-error-border)" }}>{error}</div>}
        {!settingsComplete && <div className="mb-4 flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm" style={{ background: "var(--color-warning-bg)", color: "var(--color-warning-text)", border: "1px solid var(--color-warning-border)" }}><span>Business contact details are mostly empty. You can still create the invoice.</span><button onClick={() => router.push("/admin/invoices/settings")} className="shrink-0 font-semibold underline">Open settings</button></div>}

        <form onSubmit={handleCreate} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-5">
            <section className="rounded-[1.5rem] border bg-white p-5 sm:p-6" style={{ borderColor: "var(--color-border)" }}>
              <h2 className="mb-4 text-lg font-bold" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>Bill To</h2>
              <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1.5 text-sm font-semibold sm:col-span-2" style={{ color: "var(--color-text)" }}>Customer name<input required value={form.customer_name} onChange={(event) => setForm((value) => ({ ...value, customer_name: event.target.value }))} className={fieldClass} style={{ borderColor: "var(--color-border)" }} /></label><label className="grid gap-1.5 text-sm font-semibold" style={{ color: "var(--color-text)" }}>Email<input type="email" value={form.customer_email} onChange={(event) => setForm((value) => ({ ...value, customer_email: event.target.value }))} className={fieldClass} style={{ borderColor: "var(--color-border)" }} /></label><label className="grid gap-1.5 text-sm font-semibold" style={{ color: "var(--color-text)" }}>Phone<input value={form.customer_phone} onChange={(event) => setForm((value) => ({ ...value, customer_phone: event.target.value }))} className={fieldClass} style={{ borderColor: "var(--color-border)" }} /></label></div>
            </section>
            <section className="rounded-[1.5rem] border bg-white p-5 sm:p-6" style={{ borderColor: "var(--color-border)" }}>
              <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>Order Items</h2><span className="text-xs" style={{ color: "var(--color-muted)" }}>{bundle.status.replaceAll("_", " ")}</span></div>
              <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-sm"><thead><tr style={{ borderBottom: "1px solid var(--color-border)", color: "var(--color-muted)" }}><th className="py-2 text-left font-semibold">Item</th><th className="py-2 text-right font-semibold">Qty</th><th className="py-2 text-right font-semibold">Unit Price</th><th className="py-2 text-right font-semibold">Subtotal</th></tr></thead><tbody>{lines.map((line) => <tr key={line.id} style={{ borderBottom: "1px solid var(--color-border)" }}><td className="py-3" style={{ color: "var(--color-text)" }}>{line.item_name}</td><td className="py-3 text-right">{line.quantity}</td><td className="py-3 text-right">{formatInvoiceMoney(Number(line.base_total_price) / Math.max(1, line.quantity), CURRENCY)}</td><td className="py-3 text-right font-semibold">{formatInvoiceMoney(line.base_total_price, CURRENCY)}</td></tr>)}</tbody></table></div>
              <div className="ml-auto mt-4 w-full max-w-xs space-y-2 text-sm"><div className="flex justify-between"><span style={{ color: "var(--color-muted)" }}>Subtotal</span><span>{formatInvoiceMoney(bundle.base_total_price, CURRENCY)}</span></div>{Number(bundle.discount_total) > 0 && <div className="flex justify-between"><span style={{ color: "var(--color-muted)" }}>Discount</span><span>-{formatInvoiceMoney(bundle.discount_total, CURRENCY)}</span></div>}<div className="flex justify-between border-t pt-3 text-base font-bold" style={{ borderColor: "var(--color-forest)", color: "var(--color-forest)" }}><span>Total</span><span>{formatInvoiceMoney(bundle.total_price, CURRENCY)}</span></div></div>
            </section>
          </div>
          <div className="space-y-5">
            <section className="rounded-[1.5rem] border bg-white p-5" style={{ borderColor: "var(--color-border)" }}><h2 className="mb-4 text-lg font-bold" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>Invoice Details</h2><div className="space-y-4"><label className="grid gap-1.5 text-sm font-semibold" style={{ color: "var(--color-text)" }}>Issue date<input type="date" required value={form.issue_date} onChange={(event) => setForm((value) => ({ ...value, issue_date: event.target.value, due_date: value.due_date < event.target.value ? event.target.value : value.due_date }))} className={fieldClass} style={{ borderColor: "var(--color-border)" }} /></label><label className="grid gap-1.5 text-sm font-semibold" style={{ color: "var(--color-text)" }}>Due date<input type="date" required min={form.issue_date} value={form.due_date} onChange={(event) => setForm((value) => ({ ...value, due_date: event.target.value }))} className={fieldClass} style={{ borderColor: "var(--color-border)" }} /></label><label className="grid gap-1.5 text-sm font-semibold" style={{ color: "var(--color-text)" }}>Memo<textarea rows={4} value={form.memo} onChange={(event) => setForm((value) => ({ ...value, memo: event.target.value }))} placeholder="Optional note for this invoice" className={fieldClass} style={{ borderColor: "var(--color-border)", resize: "vertical" }} /></label></div></section>
            <section className="rounded-[1.5rem] border p-5" style={{ background: "var(--color-cream)", borderColor: "var(--color-border)" }}><div className="flex gap-3"><CheckCircle size={22} weight="duotone" style={{ color: "var(--color-sage)" }} /><div><p className="font-semibold" style={{ color: "var(--color-forest)" }}>{settings.business_name}</p><p className="mt-1 text-xs leading-5" style={{ color: "var(--color-muted)" }}>Current settings and order amounts will be frozen into this invoice. Payment status will continue following the order.</p></div></div></section>
            <button disabled={creating} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold disabled:opacity-60" style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}><Receipt size={18} weight="bold" /> {creating ? "Creating Invoice..." : "Create Invoice"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
