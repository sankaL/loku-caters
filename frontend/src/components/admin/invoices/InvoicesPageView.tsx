import { DownloadSimple, MagnifyingGlass, Plus, Receipt } from "@phosphor-icons/react";

import Modal from "@/components/ui/Modal";
import { CURRENCY } from "@/config/event";
import { formatInvoiceDate, formatInvoiceMoney, type InvoiceSummary } from "@/lib/invoices";

export interface OrderBundle {
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

function PaymentPill({ paid }: { paid: boolean }) {
  return (
    <span className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: paid ? "var(--color-success-bg)" : "var(--color-warning-bg)", color: paid ? "var(--color-success-text)" : "var(--color-warning-text)", border: `1px solid ${paid ? "var(--color-success-border)" : "var(--color-warning-border)"}` }}>
      {paid ? "Paid" : "Payment Due"}
    </span>
  );
}

function InvoiceTable({ invoices, onOpen, onExport }: { invoices: InvoiceSummary[]; onOpen: (id: string) => void; onExport: (invoice: InvoiceSummary) => void }) {
  const columns = ["Invoice", "Customer", "Order", "Issue Date", "Due Date", "Total", "Payment"];
  return (
    <div className="overflow-hidden rounded-[1.5rem] border bg-white" style={{ borderColor: "var(--color-border)" }}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1050px] border-collapse text-left text-sm">
          <thead style={{ background: "var(--color-cream)", color: "var(--color-muted)" }}><tr>{columns.map((column) => <th key={column} className="px-5 py-4 font-semibold">{column}</th>)}<th className="px-5 py-4 text-right font-semibold">Actions</th></tr></thead>
          <tbody className="divide-y" style={{ borderColor: "var(--color-border)" }}>
            {invoices.length === 0 ? <tr><td colSpan={8} className="px-5 py-12 text-center" style={{ color: "var(--color-muted)" }}>No invoices match the current filters.</td></tr> : invoices.map((invoice) => (
              <tr key={invoice.id} onClick={() => onOpen(invoice.id)} className="cursor-pointer transition-colors hover:bg-[color:var(--color-cream)]/70">
                <td className="px-5 py-4 font-semibold" style={{ color: "var(--color-forest)" }}>{invoice.invoice_number}</td>
                <td className="px-5 py-4"><div className="font-semibold" style={{ color: "var(--color-text)" }}>{invoice.customer_name}</div><div className="text-xs" style={{ color: "var(--color-muted)" }}>{invoice.customer_email ?? "No email"}</div></td>
                <td className="px-5 py-4"><div style={{ color: "var(--color-text)" }}>{invoice.order_reference ? `#${invoice.order_reference}` : "Standalone"}</div><div className="text-xs" style={{ color: "var(--color-muted)" }}>{invoice.event_name ?? (invoice.order_reference ? "Event unavailable" : "No order reference")}</div></td>
                <td className="px-5 py-4" style={{ color: "var(--color-muted)" }}>{formatInvoiceDate(invoice.issue_date)}</td>
                <td className="px-5 py-4" style={{ color: "var(--color-muted)" }}>{formatInvoiceDate(invoice.due_date)}</td>
                <td className="px-5 py-4 font-semibold" style={{ color: "var(--color-forest)" }}>{formatInvoiceMoney(invoice.total, invoice.currency)}</td>
                <td className="px-5 py-4"><PaymentPill paid={invoice.payment.paid} /></td>
                <td className="px-5 py-4"><div className="flex justify-end gap-2"><button onClick={(event) => { event.stopPropagation(); onOpen(invoice.id); }} className="rounded-xl border px-3 py-2 text-xs font-semibold" style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}>Open</button><button onClick={(event) => { event.stopPropagation(); onExport(invoice); }} title="Export PDF" className="rounded-xl border p-2" style={{ borderColor: "var(--color-border)", color: "var(--color-muted)" }}><DownloadSimple size={16} /></button></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InvoicePagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  if (totalPages <= 1) return null;
  return <div className="mt-4 flex items-center justify-end gap-2"><button disabled={page === 1} onClick={() => onChange(page - 1)} className="rounded-xl border bg-white px-3 py-2 text-sm disabled:opacity-40" style={{ borderColor: "var(--color-border)" }}>Previous</button><span className="text-sm" style={{ color: "var(--color-muted)" }}>Page {page} of {totalPages}</span><button disabled={page === totalPages} onClick={() => onChange(page + 1)} className="rounded-xl border bg-white px-3 py-2 text-sm disabled:opacity-40" style={{ borderColor: "var(--color-border)" }}>Next</button></div>;
}

export function InvoicesContent({ loading, allInvoices, pageInvoices, page, totalPages, onPageChange, onCreate, onOpen, onExport }: { loading: boolean; allInvoices: InvoiceSummary[]; pageInvoices: InvoiceSummary[]; page: number; totalPages: number; onPageChange: (page: number) => void; onCreate: () => void; onOpen: (id: string) => void; onExport: (invoice: InvoiceSummary) => void }) {
  if (loading) return <div className="space-y-3">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-16 animate-pulse rounded-2xl" style={{ background: "var(--color-cream-dark)" }} />)}</div>;
  if (allInvoices.length === 0) {
    return <div className="grid min-h-[55vh] place-items-center"><div className="w-full max-w-xl rounded-[2rem] border bg-white p-9 text-left" style={{ borderColor: "var(--color-border)" }}><div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: "var(--color-cream)", color: "var(--color-forest)", border: "1px solid var(--color-border)" }}><Receipt size={28} weight="duotone" /></div><h2 className="text-2xl font-bold" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>No invoices yet</h2><p className="mt-2 text-sm leading-6" style={{ color: "var(--color-muted)" }}>Create a standalone invoice or use an order as a starting point.</p><button onClick={onCreate} className="mt-7 inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold" style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}><Plus size={18} weight="bold" /> Create Invoice</button></div></div>;
  }
  return <><InvoiceTable invoices={pageInvoices} onOpen={onOpen} onExport={onExport} /><InvoicePagination page={page} totalPages={totalPages} onChange={onPageChange} /></>;
}

export function InvoicePicker({ open, search, orders, eventNames, onClose, onSearchChange, onStandalone, onUseOrder }: { open: boolean; search: string; orders: OrderBundle[]; eventNames: Map<number, string>; onClose: () => void; onSearchChange: (value: string) => void; onStandalone: () => void; onUseOrder: (bundleId: string) => void }) {
  return (
    <Modal isOpen={open} onClose={onClose} title="Create Invoice" size="xl">
      <div className="space-y-4">
        <button onClick={onStandalone} className="flex w-full items-center justify-between rounded-2xl p-4 text-left" style={{ background: "var(--color-cream)", border: "1px solid var(--color-border)" }}><span><span className="block font-semibold" style={{ color: "var(--color-forest)" }}>Standalone invoice</span><span className="mt-1 block text-xs" style={{ color: "var(--color-muted)" }}>Start with a blank editable item.</span></span><Plus size={20} weight="bold" style={{ color: "var(--color-forest)" }} /></button>
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-sage)" }}>Or prefill from an order</p>
        <label className="relative block"><MagnifyingGlass size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--color-muted)" }} /><input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search customer, order, or event" className="w-full rounded-xl border py-2.5 pl-9 pr-4 text-sm outline-none" style={{ borderColor: "var(--color-border)" }} /></label>
        <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
          {orders.length === 0 ? <p className="py-8 text-center text-sm" style={{ color: "var(--color-muted)" }}>No orders found.</p> : orders.map((order) => <div key={order.bundle_id} className="flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center" style={{ borderColor: "var(--color-border)", background: "white" }}><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold" style={{ color: "var(--color-text)" }}>{order.name}</p><span className="rounded-full px-2 py-0.5 text-xs" style={{ background: "var(--color-cream)", color: "var(--color-muted)" }}>{order.status.replaceAll("_", " ")}</span></div><p className="mt-1 text-xs" style={{ color: "var(--color-muted)" }}>{eventNames.get(order.event_id) ?? `Event ${order.event_id}`} | {order.quantity_total} items | {formatInvoiceMoney(order.total_price, CURRENCY)}</p></div><button onClick={() => onUseOrder(order.bundle_id)} className="shrink-0 rounded-xl px-4 py-2 text-sm font-semibold" style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}>Use Order</button></div>)}
        </div>
      </div>
    </Modal>
  );
}
