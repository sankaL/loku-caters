"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, DownloadSimple, NotePencil, Trash, X } from "@phosphor-icons/react";
import { API_URL } from "@/config/event";
import { getAdminToken } from "@/lib/auth";
import { getApiErrorMessage } from "@/lib/apiError";
import { downloadResponseBlob } from "@/lib/browserDownload";
import { formatInvoiceDate, InvoiceDetail } from "@/lib/invoices";
import {
  invoiceFormFromDetail,
  invoiceFormValidationError,
  invoicePayload,
  type InvoiceFormValues,
  type InvoiceOrderOption,
} from "@/lib/invoiceForm";
import Modal from "@/components/ui/Modal";
import InvoiceFieldsEditor from "./InvoiceFieldsEditor";
import InvoiceDocument from "./InvoiceDocument";

interface InvoiceDetailState {
  invoice: InvoiceDetail | null;
  form: InvoiceFormValues | null;
  orders: InvoiceOrderOption[];
  loading: boolean;
  editing: boolean;
  saving: boolean;
  loadingOrders: boolean;
  exporting: boolean;
  deleting: boolean;
  deleteOpen: boolean;
  toast: { message: string; type: "success" | "error" } | null;
}

const INITIAL_STATE: InvoiceDetailState = {
  invoice: null,
  form: null,
  orders: [],
  loading: true,
  editing: false,
  saving: false,
  loadingOrders: false,
  exporting: false,
  deleting: false,
  deleteOpen: false,
  toast: null,
};

function InvoiceToast({ toast }: { toast: InvoiceDetailState["toast"] }) {
  if (!toast) return null;
  const tone = toast.type === "success" ? "success" : "error";
  return (
    <div
      className="fixed right-6 top-6 z-[130] rounded-2xl px-5 py-3 text-sm font-semibold shadow-xl"
      style={{
        background: `var(--color-${tone}-bg)`,
        color: `var(--color-${tone}-text)`,
        border: `1px solid var(--color-${tone}-border)`,
      }}
    >
      {toast.message}
    </div>
  );
}

function InvoiceToolbar({
  invoice,
  editing,
  loadingOrders,
  exporting,
  onBack,
  onViewOrder,
  onToggleEditor,
  onExport,
  onDelete,
}: {
  invoice: InvoiceDetail;
  editing: boolean;
  loadingOrders: boolean;
  exporting: boolean;
  onBack: () => void;
  onViewOrder: () => void;
  onToggleEditor: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  const paymentTone = invoice.payment.paid ? "success" : "warning";
  const reference = invoice.order_reference ? `Order #${invoice.order_reference}` : "Standalone invoice";
  return (
    <>
      <button
        onClick={onBack}
        className="mb-5 inline-flex items-center gap-2 text-sm font-semibold"
        style={{ color: "var(--color-muted)" }}
      >
        <ArrowLeft size={16} /> Back to Invoices
      </button>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1
              className="text-2xl font-bold"
              style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}
            >
              {invoice.invoice_number}
            </h1>
            <span
              className="rounded-full px-2.5 py-1 text-xs font-semibold"
              style={{
                background: `var(--color-${paymentTone}-bg)`,
                color: `var(--color-${paymentTone}-text)`,
                border: `1px solid var(--color-${paymentTone}-border)`,
              }}
            >
              {invoice.payment.paid ? "Paid" : "Payment Due"}
            </span>
          </div>
          <p className="mt-1 text-sm" style={{ color: "var(--color-muted)" }}>
            {reference} | Created {formatInvoiceDate(invoice.created_at.slice(0, 10))}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {invoice.source_order_id && (
            <button
              onClick={onViewOrder}
              className="rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold"
              style={{ borderColor: "var(--color-border)" }}
            >
              View Order
            </button>
          )}
          <button
            onClick={onToggleEditor}
            disabled={loadingOrders}
            className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
            style={{ borderColor: "var(--color-border)" }}
          >
            {editing ? <X size={17} /> : <NotePencil size={17} />}
            {loadingOrders ? "Loading..." : editing ? "Cancel Edit" : "Edit"}
          </button>
          <button
            onClick={onExport}
            disabled={exporting}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
            style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}
          >
            <DownloadSimple size={17} /> {exporting ? "Exporting..." : "Export PDF"}
          </button>
          <button
            onClick={onDelete}
            title="Delete invoice"
            className="rounded-xl border p-2.5"
            style={{
              background: "var(--color-error-bg)",
              borderColor: "var(--color-error-border)",
              color: "var(--color-error-text)",
            }}
          >
            <Trash size={17} />
          </button>
        </div>
      </div>
    </>
  );
}

function InvoiceEditForm({
  form,
  invoice,
  orders,
  saving,
  onChange,
  onSubmit,
}: {
  form: InvoiceFormValues;
  invoice: InvoiceDetail;
  orders: InvoiceOrderOption[];
  saving: boolean;
  onChange: (form: InvoiceFormValues) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="mb-6">
      <InvoiceFieldsEditor
        values={form}
        onChange={onChange}
        currency={invoice.currency}
        orders={orders}
        issueYear={invoice.number_year}
        sourceHelp="Changing this reference does not replace any invoice details or items."
      />
      <div className="mt-5 flex justify-end">
        <button
          disabled={saving}
          className="rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
          style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </form>
  );
}

function DeleteInvoiceModal({
  open,
  deleting,
  onClose,
  onDelete,
}: {
  open: boolean;
  deleting: boolean;
  onClose: () => void;
  onDelete: () => void;
}) {
  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title="Delete Invoice"
      actions={(
        <>
          <button
            disabled={deleting}
            onClick={onClose}
            className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold"
            style={{ borderColor: "var(--color-border)" }}
          >
            Keep Invoice
          </button>
          <button
            disabled={deleting}
            onClick={onDelete}
            className="rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-60"
            style={{ background: "var(--color-error-text)", color: "white" }}
          >
            {deleting ? "Deleting..." : "Delete Invoice"}
          </button>
        </>
      )}
    >
      This invoice will be permanently deleted. Its number will not be reused.
    </Modal>
  );
}

export default function InvoiceDetailClient({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const [state, setState] = useState<InvoiceDetailState>(INITIAL_STATE);
  const toastTimeoutRef = useRef<number | null>(null);
  const {
    invoice,
    form,
    orders,
    loading,
    editing,
    saving,
    loadingOrders,
    exporting,
    deleting,
    deleteOpen,
    toast,
  } = state;

  const updateState = useCallback((patch: Partial<InvoiceDetailState>) => {
    setState((current) => ({ ...current, ...patch }));
  }, []);

  const showToast = useCallback((message: string, type: "success" | "error") => {
    updateState({ toast: { message, type } });
    if (toastTimeoutRef.current !== null) window.clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = window.setTimeout(() => updateState({ toast: null }), 4200);
  }, [updateState]);

  const loadInvoice = useCallback(async () => {
    try {
      const token = await getAdminToken();
      if (!token) return;
      const headers = { Authorization: `Bearer ${token}` };
      const invoiceRes = await fetch(`${API_URL}/api/admin/invoices/${invoiceId}`, { headers });
      if (!invoiceRes.ok) throw new Error(await getApiErrorMessage(invoiceRes, "Failed to load invoice"));
      const data = (await invoiceRes.json()) as InvoiceDetail;
      updateState({ invoice: data, form: invoiceFormFromDetail(data) });
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to load invoice", "error");
    } finally {
      updateState({ loading: false });
    }
  }, [invoiceId, showToast, updateState]);

  async function toggleEditor() {
    if (editing) {
      updateState({ editing: false, form: invoiceFormFromDetail(invoice!) });
      return;
    }
    if (!invoice) return;
    updateState({ loadingOrders: true });
    try {
      if (orders.length === 0) {
        const token = await getAdminToken();
        if (!token) return;
        const res = await fetch(`${API_URL}/api/admin/orders?view=bundle`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error(await getApiErrorMessage(res, "Failed to load orders"));
        updateState({ orders: (await res.json()) as InvoiceOrderOption[] });
      }
      updateState({ form: invoiceFormFromDetail(invoice), editing: true });
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to load orders", "error");
    } finally {
      updateState({ loadingOrders: false });
    }
  }

  useEffect(() => {
    void loadInvoice();
  }, [loadInvoice]);

  useEffect(() => () => {
    if (toastTimeoutRef.current !== null) window.clearTimeout(toastTimeoutRef.current);
  }, []);

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!invoice || !form) return;
    const validationError = invoiceFormValidationError(form);
    if (validationError) return showToast(validationError, "error");
    updateState({ saving: true });
    try {
      const token = await getAdminToken();
      if (!token) return;
      const res = await fetch(`${API_URL}/api/admin/invoices/${invoice.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(invoicePayload(form)),
      });
      if (!res.ok) throw new Error(await getApiErrorMessage(res, "Failed to update invoice"));
      const updated = (await res.json()) as InvoiceDetail;
      updateState({
        invoice: updated,
        form: invoiceFormFromDetail(updated),
        editing: false,
      });
      showToast("Invoice updated", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to update invoice", "error");
    } finally {
      updateState({ saving: false });
    }
  }

  async function exportPdf() {
    if (!invoice) return;
    updateState({ exporting: true });
    try {
      const token = await getAdminToken();
      if (!token) return;
      const res = await fetch(`${API_URL}/api/admin/invoices/${invoice.id}/pdf`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(await getApiErrorMessage(res, "Failed to export PDF"));
      await downloadResponseBlob(res, `${invoice.invoice_number}.pdf`);
      showToast("PDF exported", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to export PDF", "error");
    } finally {
      updateState({ exporting: false });
    }
  }

  async function deleteInvoice() {
    if (!invoice) return;
    updateState({ deleting: true });
    try {
      const token = await getAdminToken();
      if (!token) return;
      const res = await fetch(`${API_URL}/api/admin/invoices/${invoice.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(await getApiErrorMessage(res, "Failed to delete invoice"));
      router.replace("/admin/invoices");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to delete invoice", "error");
      updateState({ deleting: false });
    }
  }

  if (loading) return <div className="p-8"><div className="h-[650px] animate-pulse rounded-[2rem]" style={{ background: "var(--color-cream-dark)" }} /></div>;
  if (!invoice || !form) return <div className="p-8"><p style={{ color: "var(--color-error-text)" }}>Invoice could not be loaded.</p></div>;

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
      <InvoiceToast toast={toast} />
      <div className="mx-auto max-w-6xl">
        <InvoiceToolbar
          invoice={invoice}
          editing={editing}
          loadingOrders={loadingOrders}
          exporting={exporting}
          onBack={() => router.push("/admin/invoices")}
          onViewOrder={() => router.push(`/admin/orders/${invoice.source_order_id}`)}
          onToggleEditor={() => void toggleEditor()}
          onExport={() => void exportPdf()}
          onDelete={() => updateState({ deleteOpen: true })}
        />
        {editing && (
          <InvoiceEditForm
            form={form}
            invoice={invoice}
            orders={orders}
            saving={saving}
            onChange={(nextForm) => updateState({ form: nextForm })}
            onSubmit={handleSave}
          />
        )}

        <InvoiceDocument invoice={invoice} />
      </div>

      <DeleteInvoiceModal
        open={deleteOpen}
        deleting={deleting}
        onClose={() => {
          if (!deleting) updateState({ deleteOpen: false });
        }}
        onDelete={() => void deleteInvoice()}
      />
    </div>
  );
}
