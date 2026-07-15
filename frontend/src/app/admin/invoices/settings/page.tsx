"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react";
import { API_URL } from "@/config/event";
import { getAdminToken } from "@/lib/auth";
import { getApiErrorMessage } from "@/lib/apiError";
import { InvoiceSettings } from "@/lib/invoices";
import InvoiceSettingsForm from "@/components/admin/invoices/InvoiceSettingsForm";
import AdminToast from "@/components/admin/AdminToast";

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
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, type: "success" | "error", autoDismiss = false) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    if (autoDismiss) {
      toastTimerRef.current = setTimeout(() => setToast(null), 4200);
    }
  }, []);

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const token = await getAdminToken();
      if (!token) return;
      const res = await fetch(`${API_URL}/api/admin/invoice-settings`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(await getApiErrorMessage(res, "Failed to load invoice settings"));
      setForm((await res.json()) as InvoiceSettings);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to load invoice settings", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  function update<K extends keyof InvoiceSettings>(key: K, value: InvoiceSettings[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form.business_name.trim()) {
      showToast("Business name is required", "error");
      return;
    }
    if (form.payment_method === "etransfer" && !form.payment_email?.trim()) {
      showToast("Payment email is required for e-transfer", "error");
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
      showToast("Invoice settings saved", "success", true);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to save invoice settings", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
      <AdminToast toast={toast} />
      <div className="mx-auto max-w-4xl">
        <button onClick={() => router.push("/admin/invoices")} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--color-muted)" }}><ArrowLeft size={16} /> Back to Invoices</button>
        <div className="mb-8">
          <h1 className="mb-1 text-2xl font-bold" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>Invoice Settings</h1>
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>These details are copied into each new invoice and remain unchanged on existing invoices.</p>
        </div>

        <InvoiceSettingsForm
          loading={loading}
          saving={saving}
          form={form}
          onChange={update}
          onSubmit={handleSubmit}
          onCancel={() => router.push("/admin/invoices")}
        />
      </div>
    </div>
  );
}
