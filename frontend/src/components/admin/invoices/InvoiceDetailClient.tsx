"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowLeft, DownloadSimple, NotePencil, Trash, X } from "@phosphor-icons/react";
import { API_URL } from "@/config/event";
import { getAdminToken } from "@/lib/auth";
import { getApiErrorMessage } from "@/lib/apiError";
import { formatInvoiceDate, formatInvoiceMoney, InvoiceDetail, paymentMethodLabel } from "@/lib/invoices";
import Modal from "@/components/ui/Modal";

interface EditForm {
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  issue_date: string;
  due_date: string;
  memo: string;
}

function formFromInvoice(invoice: InvoiceDetail): EditForm {
  return {
    customer_name: invoice.customer_name,
    customer_email: invoice.customer_email ?? "",
    customer_phone: invoice.customer_phone ?? "",
    issue_date: invoice.issue_date,
    due_date: invoice.due_date,
    memo: invoice.memo ?? "",
  };
}

export default function InvoiceDetailClient({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 4200);
  }, []);

  const loadInvoice = useCallback(async () => {
    try {
      const token = await getAdminToken();
      if (!token) return;
      const res = await fetch(`${API_URL}/api/admin/invoices/${invoiceId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(await getApiErrorMessage(res, "Failed to load invoice"));
      const data = (await res.json()) as InvoiceDetail;
      setInvoice(data);
      setForm(formFromInvoice(data));
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to load invoice", "error");
    } finally {
      setLoading(false);
    }
  }, [invoiceId, showToast]);

  useEffect(() => {
    void loadInvoice();
  }, [loadInvoice]);

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!invoice || !form) return;
    if (!form.customer_name.trim()) {
      showToast("Customer name is required", "error");
      return;
    }
    if (form.due_date < form.issue_date) {
      showToast("Due date cannot be earlier than issue date", "error");
      return;
    }
    setSaving(true);
    try {
      const token = await getAdminToken();
      if (!token) return;
      const res = await fetch(`${API_URL}/api/admin/invoices/${invoice.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ customer_name: form.customer_name.trim(), customer_email: form.customer_email.trim() || null, customer_phone: form.customer_phone.trim() || null, issue_date: form.issue_date, due_date: form.due_date, memo: form.memo.trim() || null }),
      });
      if (!res.ok) throw new Error(await getApiErrorMessage(res, "Failed to update invoice"));
      const updated = (await res.json()) as InvoiceDetail;
      setInvoice(updated);
      setForm(formFromInvoice(updated));
      setEditing(false);
      showToast("Invoice updated", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to update invoice", "error");
    } finally {
      setSaving(false);
    }
  }

  async function exportPdf() {
    if (!invoice) return;
    setExporting(true);
    try {
      const token = await getAdminToken();
      if (!token) return;
      const res = await fetch(`${API_URL}/api/admin/invoices/${invoice.id}/pdf`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(await getApiErrorMessage(res, "Failed to export PDF"));
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `${invoice.invoice_number}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showToast("PDF exported", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to export PDF", "error");
    } finally {
      setExporting(false);
    }
  }

  async function deleteInvoice() {
    if (!invoice) return;
    setDeleting(true);
    try {
      const token = await getAdminToken();
      if (!token) return;
      const res = await fetch(`${API_URL}/api/admin/invoices/${invoice.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(await getApiErrorMessage(res, "Failed to delete invoice"));
      router.replace("/admin/invoices");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to delete invoice", "error");
      setDeleting(false);
    }
  }

  if (loading) return <div className="p-8"><div className="h-[650px] animate-pulse rounded-[2rem]" style={{ background: "var(--color-cream-dark)" }} /></div>;
  if (!invoice || !form) return <div className="p-8"><p style={{ color: "var(--color-error-text)" }}>Invoice could not be loaded.</p><button onClick={() => router.push("/admin/invoices")} className="mt-4 rounded-xl px-4 py-2 text-sm font-semibold" style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}>Back to Invoices</button></div>;

  const { snapshot } = invoice;
  const vendor = snapshot.vendor;
  const order = snapshot.order;
  const fieldClass = "w-full rounded-xl border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color:var(--color-sage)]";
  const paymentMethod = paymentMethodLabel(invoice.payment.payment_method, invoice.payment.payment_method_other);

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
      {toast && <div className="fixed right-6 top-6 z-[130] rounded-2xl px-5 py-3 text-sm font-semibold shadow-xl" style={{ background: toast.type === "success" ? "var(--color-success-bg)" : "var(--color-error-bg)", color: toast.type === "success" ? "var(--color-success-text)" : "var(--color-error-text)", border: `1px solid ${toast.type === "success" ? "var(--color-success-border)" : "var(--color-error-border)"}` }}>{toast.message}</div>}
      <div className="mx-auto max-w-6xl">
        <button onClick={() => router.push("/admin/invoices")} className="mb-5 inline-flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--color-muted)" }}><ArrowLeft size={16} /> Back to Invoices</button>
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div><div className="flex flex-wrap items-center gap-3"><h1 className="text-2xl font-bold" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>{invoice.invoice_number}</h1><span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: invoice.payment.paid ? "var(--color-success-bg)" : "var(--color-warning-bg)", color: invoice.payment.paid ? "var(--color-success-text)" : "var(--color-warning-text)", border: `1px solid ${invoice.payment.paid ? "var(--color-success-border)" : "var(--color-warning-border)"}` }}>{invoice.payment.paid ? "Paid" : "Payment Due"}</span></div><p className="mt-1 text-sm" style={{ color: "var(--color-muted)" }}>Order #{invoice.order_reference ?? "Unavailable"} | Created {formatInvoiceDate(invoice.created_at.slice(0, 10))}</p></div>
          <div className="flex flex-wrap gap-2">
            {invoice.payment.order_exists && invoice.source_order_id && <button onClick={() => router.push(`/admin/orders/${invoice.source_order_id}`)} className="rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold" style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}>View Order</button>}
            <button onClick={() => { setForm(formFromInvoice(invoice)); setEditing((value) => !value); }} className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold" style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}>{editing ? <X size={17} /> : <NotePencil size={17} />}{editing ? "Cancel Edit" : "Edit"}</button>
            <button onClick={() => void exportPdf()} disabled={exporting} className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-60" style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}><DownloadSimple size={17} /> {exporting ? "Exporting..." : "Export PDF"}</button>
            <button onClick={() => setDeleteOpen(true)} title="Delete invoice" className="rounded-xl border p-2.5" style={{ background: "var(--color-error-bg)", borderColor: "var(--color-error-border)", color: "var(--color-error-text)" }}><Trash size={17} /></button>
          </div>
        </div>

        {!invoice.payment.order_exists && <div className="mb-5 rounded-xl px-4 py-3 text-sm" style={{ background: "var(--color-warning-bg)", color: "var(--color-warning-text)", border: "1px solid var(--color-warning-border)" }}>The source order was deleted. This invoice remains available from its saved snapshot.</div>}

        {editing ? (
          <form onSubmit={handleSave} className="mb-5 rounded-[1.5rem] border bg-white p-5 sm:p-6" style={{ borderColor: "var(--color-border)" }}>
            <h2 className="mb-4 text-lg font-bold" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>Edit Invoice Details</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><label className="grid gap-1.5 text-sm font-semibold">Customer name<input required value={form.customer_name} onChange={(event) => setForm((value) => value ? ({ ...value, customer_name: event.target.value }) : value)} className={fieldClass} style={{ borderColor: "var(--color-border)" }} /></label><label className="grid gap-1.5 text-sm font-semibold">Email<input type="email" value={form.customer_email} onChange={(event) => setForm((value) => value ? ({ ...value, customer_email: event.target.value }) : value)} className={fieldClass} style={{ borderColor: "var(--color-border)" }} /></label><label className="grid gap-1.5 text-sm font-semibold">Phone<input value={form.customer_phone} onChange={(event) => setForm((value) => value ? ({ ...value, customer_phone: event.target.value }) : value)} className={fieldClass} style={{ borderColor: "var(--color-border)" }} /></label><label className="grid gap-1.5 text-sm font-semibold">Issue date<input type="date" value={form.issue_date} min={`${invoice.number_year}-01-01`} max={`${invoice.number_year}-12-31`} onChange={(event) => setForm((value) => value ? ({ ...value, issue_date: event.target.value, due_date: value.due_date < event.target.value ? event.target.value : value.due_date }) : value)} className={fieldClass} style={{ borderColor: "var(--color-border)" }} /></label><label className="grid gap-1.5 text-sm font-semibold">Due date<input type="date" min={form.issue_date} value={form.due_date} onChange={(event) => setForm((value) => value ? ({ ...value, due_date: event.target.value }) : value)} className={fieldClass} style={{ borderColor: "var(--color-border)" }} /></label><label className="grid gap-1.5 text-sm font-semibold sm:col-span-2 lg:col-span-3">Memo<textarea rows={3} value={form.memo} onChange={(event) => setForm((value) => value ? ({ ...value, memo: event.target.value }) : value)} className={fieldClass} style={{ borderColor: "var(--color-border)", resize: "vertical" }} /></label></div>
            <div className="mt-5 flex justify-end"><button disabled={saving} className="rounded-xl px-5 py-2.5 text-sm font-semibold disabled:opacity-60" style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}>{saving ? "Saving..." : "Save Changes"}</button></div>
          </form>
        ) : null}

        <article className="overflow-hidden rounded-[1.75rem] border bg-white shadow-[0_24px_70px_-45px_rgba(18,39,15,0.45)]" style={{ borderColor: "var(--color-border)" }}>
          <div className="p-6 sm:p-9 lg:p-12">
            <header className="flex flex-col gap-5 border-b pb-7 sm:flex-row sm:items-start sm:justify-between" style={{ borderColor: "var(--color-border)" }}>
              <div className="flex items-center gap-4"><Image src="/logo-color.svg" alt="Loku Caters logo" width={64} height={64} className="rounded-2xl" /><div><p className="text-lg font-bold" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>{vendor.business_name}</p><p className="mt-1 max-w-xs whitespace-pre-line text-xs leading-5" style={{ color: "var(--color-muted)" }}>{[vendor.business_address, vendor.business_email, vendor.business_phone].filter(Boolean).join("\n")}</p></div></div>
              <div className="sm:text-right"><p className="text-3xl font-bold tracking-tight" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>INVOICE</p><p className="mt-1 text-sm font-semibold" style={{ color: "var(--color-sage)" }}>{invoice.invoice_number}</p></div>
            </header>
            <div className="grid gap-6 border-b py-7 sm:grid-cols-3" style={{ borderColor: "var(--color-border)" }}><div><p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-sage)" }}>Bill To</p><p className="mt-2 font-semibold" style={{ color: "var(--color-text)" }}>{invoice.customer_name}</p>{invoice.customer_email && <p className="mt-1 text-sm" style={{ color: "var(--color-muted)" }}>{invoice.customer_email}</p>}{invoice.customer_phone && <p className="text-sm" style={{ color: "var(--color-muted)" }}>{invoice.customer_phone}</p>}</div><div><p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-sage)" }}>Invoice Details</p><dl className="mt-2 space-y-1 text-sm"><div className="flex justify-between gap-3"><dt style={{ color: "var(--color-muted)" }}>Issue date</dt><dd>{formatInvoiceDate(invoice.issue_date)}</dd></div><div className="flex justify-between gap-3"><dt style={{ color: "var(--color-muted)" }}>Due date</dt><dd>{formatInvoiceDate(invoice.due_date)}</dd></div><div className="flex justify-between gap-3"><dt style={{ color: "var(--color-muted)" }}>Order</dt><dd>#{order.reference}</dd></div></dl></div><div><p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-sage)" }}>Pickup</p><p className="mt-2 text-sm font-semibold">{order.event_name ?? "Order"}</p><p className="mt-1 text-sm" style={{ color: "var(--color-muted)" }}>{[order.pickup_date ? formatInvoiceDate(order.pickup_date) : null, order.pickup_location, order.pickup_time_slot].filter(Boolean).join(" | ")}</p></div></div>
            <div className="my-6 flex items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold" style={{ background: invoice.payment.paid ? "var(--color-success-bg)" : "var(--color-warning-bg)", color: invoice.payment.paid ? "var(--color-success-text)" : "var(--color-warning-text)", border: `1px solid ${invoice.payment.paid ? "var(--color-success-border)" : "var(--color-warning-border)"}` }}><span>{invoice.payment.paid ? "PAID" : "PAYMENT DUE"}</span><span>{invoice.payment.paid && paymentMethod ? paymentMethod : formatInvoiceMoney(invoice.total, invoice.currency)}</span></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-sm"><thead><tr style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}><th className="rounded-l-xl px-4 py-3 text-left font-semibold">Item</th><th className="px-4 py-3 text-right font-semibold">Qty</th><th className="px-4 py-3 text-right font-semibold">Unit Price</th><th className="rounded-r-xl px-4 py-3 text-right font-semibold">Subtotal</th></tr></thead><tbody>{order.lines.map((line) => <tr key={line.source_order_id} style={{ borderBottom: "1px solid var(--color-border)" }}><td className="px-4 py-3">{line.description}</td><td className="px-4 py-3 text-right">{line.quantity}</td><td className="px-4 py-3 text-right">{formatInvoiceMoney(line.unit_price, invoice.currency)}</td><td className="px-4 py-3 text-right font-semibold">{formatInvoiceMoney(line.subtotal, invoice.currency)}</td></tr>)}</tbody></table></div>
            <div className="ml-auto mt-6 w-full max-w-sm space-y-2 text-sm"><div className="flex justify-between"><span style={{ color: "var(--color-muted)" }}>Subtotal</span><span>{formatInvoiceMoney(invoice.subtotal, invoice.currency)}</span></div>{invoice.discount_total > 0 && <div className="flex justify-between"><span style={{ color: "var(--color-muted)" }}>Discount</span><span>-{formatInvoiceMoney(invoice.discount_total, invoice.currency)}</span></div>}<div className="flex justify-between border-t pt-3 text-lg font-bold" style={{ borderColor: "var(--color-forest)", color: "var(--color-forest)" }}><span>Total</span><span>{formatInvoiceMoney(invoice.total, invoice.currency)}</span></div></div>
            {(invoice.memo || (!invoice.payment.paid && vendor.payment_method !== "none")) && <div className="mt-8 grid gap-5 rounded-2xl p-5 sm:grid-cols-2" style={{ background: "var(--color-cream)", border: "1px solid var(--color-border)" }}>{invoice.memo && <div><p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-sage)" }}>Memo</p><p className="mt-2 whitespace-pre-line text-sm leading-6" style={{ color: "var(--color-text)" }}>{invoice.memo}</p></div>}{!invoice.payment.paid && vendor.payment_method !== "none" && <div><p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-sage)" }}>Payment</p><p className="mt-2 text-sm font-semibold">{paymentMethodLabel(vendor.payment_method)}{vendor.payment_method === "etransfer" && vendor.payment_email ? ` to ${vendor.payment_email}` : ""}</p>{vendor.payment_instructions && <p className="mt-1 whitespace-pre-line text-sm leading-6" style={{ color: "var(--color-muted)" }}>{vendor.payment_instructions}</p>}</div>}</div>}
            {vendor.default_footer_note && <p className="mt-7 text-center text-xs" style={{ color: "var(--color-muted)" }}>{vendor.default_footer_note}</p>}
          </div>
        </article>
      </div>

      <Modal isOpen={deleteOpen} onClose={() => !deleting && setDeleteOpen(false)} title="Delete Invoice" actions={<><button disabled={deleting} onClick={() => setDeleteOpen(false)} className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold" style={{ borderColor: "var(--color-border)" }}>Keep Invoice</button><button disabled={deleting} onClick={() => void deleteInvoice()} className="rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-60" style={{ background: "var(--color-error-text)", color: "white" }}>{deleting ? "Deleting..." : "Delete Invoice"}</button></>}>
        This invoice will be permanently deleted. Its number will not be reused, and the order can receive a new invoice later.
      </Modal>
    </div>
  );
}
