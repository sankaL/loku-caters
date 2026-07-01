"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FloppyDisk } from "@phosphor-icons/react";
import { API_URL } from "@/config/event";
import { getAdminToken } from "@/lib/auth";
import { getApiErrorMessage } from "@/lib/apiError";
import { InvoiceSettings } from "@/lib/invoices";

const EMPTY_SETTINGS: InvoiceSettings = {
  business_name: "Loku Caters",
  business_address: null,
  business_email: null,
  business_phone: null,
  payment_method: "none",
  payment_email: null,
  payment_instructions: null,
  default_footer_note: null,
};

export default function InvoiceSettingsPage() {
  const router = useRouter();
  const [form, setForm] = useState<InvoiceSettings>(EMPTY_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      const token = await getAdminToken();
      if (!token) return;
      const res = await fetch(`${API_URL}/api/admin/invoice-settings`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(await getApiErrorMessage(res, "Failed to load invoice settings"));
      setForm((await res.json()) as InvoiceSettings);
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Failed to load invoice settings", type: "error" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  function update<K extends keyof InvoiceSettings>(key: K, value: InvoiceSettings[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form.business_name.trim()) {
      setToast({ message: "Business name is required", type: "error" });
      return;
    }
    if (form.payment_method === "etransfer" && !form.payment_email?.trim()) {
      setToast({ message: "Payment email is required for e-transfer", type: "error" });
      return;
    }
    setSaving(true);
    try {
      const token = await getAdminToken();
      if (!token) return;
      const res = await fetch(`${API_URL}/api/admin/invoice-settings`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          business_name: form.business_name,
          business_address: form.business_address,
          business_email: form.business_email,
          business_phone: form.business_phone,
          payment_method: form.payment_method,
          payment_email: form.payment_email,
          payment_instructions: form.payment_instructions,
          default_footer_note: form.default_footer_note,
        }),
      });
      if (!res.ok) throw new Error(await getApiErrorMessage(res, "Failed to save invoice settings"));
      setForm((await res.json()) as InvoiceSettings);
      setToast({ message: "Invoice settings saved", type: "success" });
      window.setTimeout(() => setToast(null), 4200);
    } catch (error) {
      setToast({ message: error instanceof Error ? error.message : "Failed to save invoice settings", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  const fieldClass = "w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none transition-all focus:border-[color:var(--color-sage)] focus:ring-2 focus:ring-[color:var(--color-sage)]";

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
      {toast && <div className="fixed right-6 top-6 z-50 rounded-2xl px-5 py-3 text-sm font-semibold shadow-xl" style={{ background: toast.type === "success" ? "var(--color-success-bg)" : "var(--color-error-bg)", color: toast.type === "success" ? "var(--color-success-text)" : "var(--color-error-text)", border: `1px solid ${toast.type === "success" ? "var(--color-success-border)" : "var(--color-error-border)"}` }}>{toast.message}</div>}
      <div className="mx-auto max-w-4xl">
        <button onClick={() => router.push("/admin/invoices")} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--color-muted)" }}><ArrowLeft size={16} /> Back to Invoices</button>
        <div className="mb-8">
          <h1 className="mb-1 text-2xl font-bold" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>Invoice Settings</h1>
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>These details are copied into each new invoice and remain unchanged on existing invoices.</p>
        </div>

        {loading ? <div className="h-96 animate-pulse rounded-[2rem]" style={{ background: "var(--color-cream-dark)" }} /> : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <section className="rounded-[1.5rem] border bg-white p-5 sm:p-6" style={{ borderColor: "var(--color-border)" }}>
              <h2 className="text-lg font-bold" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>Business Details</h2>
              <p className="mb-5 mt-1 text-sm" style={{ color: "var(--color-muted)" }}>Only completed fields appear in the From section.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-semibold" style={{ color: "var(--color-text)" }}>Business name<input required value={form.business_name} onChange={(event) => update("business_name", event.target.value)} className={fieldClass} style={{ borderColor: "var(--color-border)" }} /></label>
                <label className="grid gap-1.5 text-sm font-semibold" style={{ color: "var(--color-text)" }}>Business email<input type="email" value={form.business_email ?? ""} onChange={(event) => update("business_email", event.target.value || null)} className={fieldClass} style={{ borderColor: "var(--color-border)" }} /></label>
                <label className="grid gap-1.5 text-sm font-semibold" style={{ color: "var(--color-text)" }}>Phone number<input value={form.business_phone ?? ""} onChange={(event) => update("business_phone", event.target.value || null)} className={fieldClass} style={{ borderColor: "var(--color-border)" }} /></label>
                <label className="grid gap-1.5 text-sm font-semibold sm:row-span-2" style={{ color: "var(--color-text)" }}>Business address<textarea rows={4} value={form.business_address ?? ""} onChange={(event) => update("business_address", event.target.value || null)} className={fieldClass} style={{ borderColor: "var(--color-border)", resize: "vertical" }} /></label>
              </div>
            </section>

            <section className="rounded-[1.5rem] border bg-white p-5 sm:p-6" style={{ borderColor: "var(--color-border)" }}>
              <h2 className="text-lg font-bold" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>Payment Details</h2>
              <p className="mb-5 mt-1 text-sm" style={{ color: "var(--color-muted)" }}>Payment instructions appear only while an invoice is unpaid.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-semibold" style={{ color: "var(--color-text)" }}>Preferred payment method<select value={form.payment_method} onChange={(event) => update("payment_method", event.target.value as InvoiceSettings["payment_method"])} className={fieldClass} style={{ borderColor: "var(--color-border)" }}><option value="none">Do not show</option><option value="etransfer">E-transfer</option><option value="cash">Cash</option><option value="other">Other</option></select></label>
                {form.payment_method === "etransfer" && <label className="grid gap-1.5 text-sm font-semibold" style={{ color: "var(--color-text)" }}>E-transfer email<input required type="email" value={form.payment_email ?? ""} onChange={(event) => update("payment_email", event.target.value || null)} className={fieldClass} style={{ borderColor: "var(--color-border)" }} /></label>}
                <label className="grid gap-1.5 text-sm font-semibold sm:col-span-2" style={{ color: "var(--color-text)" }}>Payment instructions<textarea rows={3} value={form.payment_instructions ?? ""} onChange={(event) => update("payment_instructions", event.target.value || null)} placeholder="For example: Include the invoice number in the transfer message." className={fieldClass} style={{ borderColor: "var(--color-border)", resize: "vertical" }} /></label>
                <label className="grid gap-1.5 text-sm font-semibold sm:col-span-2" style={{ color: "var(--color-text)" }}>Default footer note<textarea rows={2} value={form.default_footer_note ?? ""} onChange={(event) => update("default_footer_note", event.target.value || null)} placeholder="For example: Thank you for choosing Loku Caters." className={fieldClass} style={{ borderColor: "var(--color-border)", resize: "vertical" }} /></label>
              </div>
            </section>
            <div className="flex justify-end gap-2"><button type="button" onClick={() => router.push("/admin/invoices")} className="rounded-2xl border bg-white px-5 py-2.5 text-sm font-semibold" style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}>Cancel</button><button disabled={saving} className="inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold disabled:opacity-60" style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}><FloppyDisk size={18} /> {saving ? "Saving..." : "Save Settings"}</button></div>
          </form>
        )}
      </div>
    </div>
  );
}
