"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle, Receipt } from "@phosphor-icons/react";
import { API_URL, CURRENCY } from "@/config/event";
import { getAdminToken } from "@/lib/auth";
import { getApiErrorMessage } from "@/lib/apiError";
import { InvoiceDetail, InvoiceSettings } from "@/lib/invoices";
import {
  emptyInvoiceForm,
  invoiceFormFromBundle,
  invoiceFormValidationError,
  invoicePayload,
  type InvoiceBundle,
  type InvoiceBundleLine,
  type InvoiceFormValues,
} from "@/lib/invoiceForm";
import InvoiceFieldsEditor from "./InvoiceFieldsEditor";

function localDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function emptyForm(): InvoiceFormValues {
  return emptyInvoiceForm(localDateString());
}

interface NewInvoiceState {
  settings: InvoiceSettings | null;
  orders: InvoiceBundle[];
  form: InvoiceFormValues;
  loading: boolean;
  creating: boolean;
  error: string | null;
}

export default function NewInvoiceClient({ bundleId }: { bundleId: string }) {
  const router = useRouter();
  const [state, setState] = useState<NewInvoiceState>(() => ({
    settings: null,
    orders: [],
    form: emptyForm(),
    loading: true,
    creating: false,
    error: null,
  }));
  const { settings, orders, form, loading, creating, error } = state;

  const updateState = useCallback((patch: Partial<NewInvoiceState>) => {
    setState((current) => ({ ...current, ...patch }));
  }, []);

  const load = useCallback(async () => {
    updateState({ loading: true, error: null });
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
      const nextSettings = (await settingsRes.json()) as InvoiceSettings;
      const orderRows = (await ordersRes.json()) as InvoiceBundle[];
      updateState({ settings: nextSettings, orders: orderRows });

      if (!bundleId) {
        updateState({ form: emptyForm() });
        return;
      }
      const bundleRes = await fetch(`${API_URL}/api/admin/orders/bundles/${encodeURIComponent(bundleId)}`, { headers });
      if (!bundleRes.ok) throw new Error(await getApiErrorMessage(bundleRes, "Failed to load order"));
      const data = (await bundleRes.json()) as { bundle: InvoiceBundle; lines: InvoiceBundleLine[] };
      const today = localDateString();
      updateState({ form: invoiceFormFromBundle(data.bundle, data.lines, today) });
    } catch (loadError) {
      updateState({
        error: loadError instanceof Error ? loadError.message : "Failed to load invoice editor",
      });
    } finally {
      updateState({ loading: false });
    }
  }, [bundleId, updateState]);

  useEffect(() => {
    void load();
  }, [load]);

  const settingsComplete = Boolean(
    settings?.business_address || settings?.business_email || settings?.business_phone,
  );

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    const validationError = invoiceFormValidationError(form);
    if (validationError) return updateState({ error: validationError });
    updateState({ creating: true, error: null });
    try {
      const token = await getAdminToken();
      if (!token) return;
      const res = await fetch(`${API_URL}/api/admin/invoices`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(invoicePayload(form)),
      });
      if (!res.ok) throw new Error(await getApiErrorMessage(res, "Failed to create invoice"));
      const invoice = (await res.json()) as InvoiceDetail;
      router.replace(`/admin/invoices/${invoice.id}`);
    } catch (createError) {
      updateState({
        error: createError instanceof Error ? createError.message : "Failed to create invoice",
      });
    } finally {
      updateState({ creating: false });
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
          onChange={(nextForm) => updateState({ form: nextForm })}
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
