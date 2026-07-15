"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DownloadSimple, GearSix, MagnifyingGlass, Plus, Receipt } from "@phosphor-icons/react";
import { API_URL, CURRENCY } from "@/config/event";
import { getAdminToken } from "@/lib/auth";
import { getApiErrorMessage } from "@/lib/apiError";
import AdminToast from "@/components/admin/AdminToast";
import { formatInvoiceDate, formatInvoiceMoney, InvoiceSummary } from "@/lib/invoices";
import Modal from "@/components/ui/Modal";

interface OrderBundle {
  id: string;
  bundle_id: string;
  primary_order_id: string;
  event_id: number;
  name: string;
  email: string | null;
  quantity_total: number;
  pickup_location: string;
  pickup_date: string | null;
  total_price: number;
  status: string;
  created_at: string;
}

interface AdminEvent {
  id: number;
  name: string;
}

const PAGE_SIZE = 15;

function PaymentPill({ paid }: { paid: boolean }) {
  return (
    <span
      className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{
        background: paid ? "var(--color-success-bg)" : "var(--color-warning-bg)",
        color: paid ? "var(--color-success-text)" : "var(--color-warning-text)",
        border: `1px solid ${paid ? "var(--color-success-border)" : "var(--color-warning-border)"}`,
      }}
    >
      {paid ? "Paid" : "Payment Due"}
    </span>
  );
}

export default function InvoicesPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [orders, setOrders] = useState<OrderBundle[]>([]);
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [eventFilter, setEventFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [bundleFilter, setBundleFilter] = useState("");
  const [pickerSearch, setPickerSearch] = useState("");
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 4200);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getAdminToken();
      if (!token) return;
      const headers = { Authorization: `Bearer ${token}` };
      const [invoiceRes, orderRes, eventRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/invoices`, { headers }),
        fetch(`${API_URL}/api/admin/orders?view=bundle`, { headers }),
        fetch(`${API_URL}/api/admin/events`, { headers }),
      ]);
      if (!invoiceRes.ok) throw new Error(await getApiErrorMessage(invoiceRes, "Failed to load invoices"));
      if (!orderRes.ok) throw new Error(await getApiErrorMessage(orderRes, "Failed to load orders"));
      if (!eventRes.ok) throw new Error(await getApiErrorMessage(eventRes, "Failed to load events"));
      setInvoices((await invoiceRes.json()) as InvoiceSummary[]);
      setOrders((await orderRes.json()) as OrderBundle[]);
      setEvents((await eventRes.json()) as AdminEvent[]);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to load invoices", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    setBundleFilter(new URLSearchParams(window.location.search).get("bundle_id") ?? "");
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const eventNames = useMemo(() => new Map(events.map((event) => [event.id, event.name])), [events]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return invoices.filter((invoice) => {
      if (bundleFilter && invoice.source_bundle_id !== bundleFilter) return false;
      if (eventFilter !== "all" && String(invoice.source_event_id) !== eventFilter) return false;
      if (paymentFilter === "paid" && !invoice.payment.paid) return false;
      if (paymentFilter === "due" && invoice.payment.paid) return false;
      if (!query) return true;
      return `${invoice.invoice_number} ${invoice.customer_name} ${invoice.customer_email ?? ""} ${invoice.order_reference ?? ""} ${invoice.event_name ?? ""}`.toLowerCase().includes(query);
    });
  }, [bundleFilter, eventFilter, invoices, paymentFilter, search]);

  useEffect(() => {
    setPage(1);
  }, [bundleFilter, eventFilter, paymentFilter, search]);

  function clearBundleFilter() {
    setBundleFilter("");
    window.history.replaceState(null, "", "/admin/invoices");
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pickerOrders = useMemo(() => {
    const query = pickerSearch.trim().toLowerCase();
    return orders.filter((order) => !query || `${order.name} ${order.email ?? ""} ${order.bundle_id} ${eventNames.get(order.event_id) ?? ""}`.toLowerCase().includes(query)).slice(0, 40);
  }, [eventNames, orders, pickerSearch]);

  async function exportPdf(invoice: InvoiceSummary) {
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
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to export PDF", "error");
    }
  }

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
      <AdminToast toast={toast} />

      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="mb-1 text-2xl font-bold" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>Invoices</h1>
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>Create, edit, and export standalone or order-referenced invoices.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => router.push("/admin/invoices/settings")} className="inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold" style={{ background: "white", color: "var(--color-text)", border: "1px solid var(--color-border)" }}>
            <GearSix size={18} /> Settings
          </button>
          <button onClick={() => { setPickerSearch(""); setPickerOpen(true); }} className="inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold" style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}>
            <Plus size={18} weight="bold" /> Create Invoice
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <label className="relative min-w-60 flex-1">
          <MagnifyingGlass size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--color-muted)" }} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search invoice, customer, or order" className="w-full rounded-xl border bg-white py-2 pl-9 pr-4 text-sm outline-none focus:ring-2 focus:ring-[color:var(--color-sage)]" style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }} />
        </label>
        <select value={eventFilter} onChange={(event) => setEventFilter(event.target.value)} className="rounded-xl border bg-white px-3 py-2 text-sm" style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}>
          <option value="all">All events</option>
          {events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
        </select>
        <select value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)} className="rounded-xl border bg-white px-3 py-2 text-sm" style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}>
          <option value="all">All payments</option>
          <option value="paid">Paid</option>
          <option value="due">Payment due</option>
        </select>
      </div>
      {bundleFilter && <div className="mb-4 flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm" style={{ background: "var(--color-cream)", border: "1px solid var(--color-border)" }}><span>Showing invoices linked to the selected order.</span><button onClick={clearBundleFilter} className="font-semibold underline" style={{ color: "var(--color-forest)" }}>Show all invoices</button></div>}

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-16 animate-pulse rounded-2xl" style={{ background: "var(--color-cream-dark)" }} />)}</div>
      ) : invoices.length === 0 ? (
        <div className="grid min-h-[55vh] place-items-center">
          <div className="w-full max-w-xl rounded-[2rem] border bg-white p-9 text-left" style={{ borderColor: "var(--color-border)" }}>
            <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: "var(--color-cream)", color: "var(--color-forest)", border: "1px solid var(--color-border)" }}><Receipt size={28} weight="duotone" /></div>
            <h2 className="text-2xl font-bold" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>No invoices yet</h2>
            <p className="mt-2 text-sm leading-6" style={{ color: "var(--color-muted)" }}>Create a standalone invoice or use an order as a starting point.</p>
            <button onClick={() => setPickerOpen(true)} className="mt-7 inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold" style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}><Plus size={18} weight="bold" /> Create Invoice</button>
          </div>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-[1.5rem] border bg-white" style={{ borderColor: "var(--color-border)" }}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px] border-collapse text-left text-sm">
                <thead style={{ background: "var(--color-cream)", color: "var(--color-muted)" }}><tr><th className="px-5 py-4 font-semibold">Invoice</th><th className="px-5 py-4 font-semibold">Customer</th><th className="px-5 py-4 font-semibold">Order</th><th className="px-5 py-4 font-semibold">Issue Date</th><th className="px-5 py-4 font-semibold">Due Date</th><th className="px-5 py-4 font-semibold">Total</th><th className="px-5 py-4 font-semibold">Payment</th><th className="px-5 py-4 text-right font-semibold">Actions</th></tr></thead>
                <tbody className="divide-y" style={{ borderColor: "var(--color-border)" }}>
                  {paged.length === 0 ? <tr><td colSpan={8} className="px-5 py-12 text-center" style={{ color: "var(--color-muted)" }}>No invoices match the current filters.</td></tr> : paged.map((invoice) => (
                    <tr key={invoice.id} onClick={() => router.push(`/admin/invoices/${invoice.id}`)} className="cursor-pointer transition-colors hover:bg-[color:var(--color-cream)]/70">
                      <td className="px-5 py-4 font-semibold" style={{ color: "var(--color-forest)" }}>{invoice.invoice_number}</td>
                      <td className="px-5 py-4"><div className="font-semibold" style={{ color: "var(--color-text)" }}>{invoice.customer_name}</div><div className="text-xs" style={{ color: "var(--color-muted)" }}>{invoice.customer_email ?? "No email"}</div></td>
                      <td className="px-5 py-4"><div style={{ color: "var(--color-text)" }}>{invoice.order_reference ? `#${invoice.order_reference}` : "Standalone"}</div><div className="text-xs" style={{ color: "var(--color-muted)" }}>{invoice.event_name ?? (invoice.order_reference ? "Event unavailable" : "No order reference")}</div></td>
                      <td className="px-5 py-4" style={{ color: "var(--color-muted)" }}>{formatInvoiceDate(invoice.issue_date)}</td>
                      <td className="px-5 py-4" style={{ color: "var(--color-muted)" }}>{formatInvoiceDate(invoice.due_date)}</td>
                      <td className="px-5 py-4 font-semibold" style={{ color: "var(--color-forest)" }}>{formatInvoiceMoney(invoice.total, invoice.currency)}</td>
                      <td className="px-5 py-4"><PaymentPill paid={invoice.payment.paid} /></td>
                      <td className="px-5 py-4"><div className="flex justify-end gap-2"><button onClick={(event) => { event.stopPropagation(); router.push(`/admin/invoices/${invoice.id}`); }} className="rounded-xl border px-3 py-2 text-xs font-semibold" style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}>Open</button><button onClick={(event) => { event.stopPropagation(); void exportPdf(invoice); }} title="Export PDF" className="rounded-xl border p-2" style={{ borderColor: "var(--color-border)", color: "var(--color-muted)" }}><DownloadSimple size={16} /></button></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {totalPages > 1 && <div className="mt-4 flex items-center justify-end gap-2"><button disabled={page === 1} onClick={() => setPage((value) => value - 1)} className="rounded-xl border bg-white px-3 py-2 text-sm disabled:opacity-40" style={{ borderColor: "var(--color-border)" }}>Previous</button><span className="text-sm" style={{ color: "var(--color-muted)" }}>Page {page} of {totalPages}</span><button disabled={page === totalPages} onClick={() => setPage((value) => value + 1)} className="rounded-xl border bg-white px-3 py-2 text-sm disabled:opacity-40" style={{ borderColor: "var(--color-border)" }}>Next</button></div>}
        </>
      )}

      <Modal isOpen={pickerOpen} onClose={() => setPickerOpen(false)} title="Create Invoice" size="xl">
        <div className="space-y-4">
          <button onClick={() => router.push("/admin/invoices/new")} className="flex w-full items-center justify-between rounded-2xl p-4 text-left" style={{ background: "var(--color-cream)", border: "1px solid var(--color-border)" }}><span><span className="block font-semibold" style={{ color: "var(--color-forest)" }}>Standalone invoice</span><span className="mt-1 block text-xs" style={{ color: "var(--color-muted)" }}>Start with a blank editable item.</span></span><Plus size={20} weight="bold" style={{ color: "var(--color-forest)" }} /></button>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-sage)" }}>Or prefill from an order</p>
          <label className="relative block"><MagnifyingGlass size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--color-muted)" }} /><input value={pickerSearch} onChange={(event) => setPickerSearch(event.target.value)} placeholder="Search customer, order, or event" className="w-full rounded-xl border py-2.5 pl-9 pr-4 text-sm outline-none" style={{ borderColor: "var(--color-border)" }} /></label>
          <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
            {pickerOrders.length === 0 ? <p className="py-8 text-center text-sm" style={{ color: "var(--color-muted)" }}>No orders found.</p> : pickerOrders.map((order) => <div key={order.bundle_id} className="flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center" style={{ borderColor: "var(--color-border)", background: "white" }}><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold" style={{ color: "var(--color-text)" }}>{order.name}</p><span className="rounded-full px-2 py-0.5 text-xs" style={{ background: "var(--color-cream)", color: "var(--color-muted)" }}>{order.status.replaceAll("_", " ")}</span></div><p className="mt-1 text-xs" style={{ color: "var(--color-muted)" }}>{eventNames.get(order.event_id) ?? `Event ${order.event_id}`} | {order.quantity_total} items | {formatInvoiceMoney(order.total_price, CURRENCY)}</p></div><button onClick={() => router.push(`/admin/invoices/new?bundle_id=${encodeURIComponent(order.bundle_id)}`)} className="shrink-0 rounded-xl px-4 py-2 text-sm font-semibold" style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}>Use Order</button></div>)}
          </div>
        </div>
      </Modal>
    </div>
  );
}
