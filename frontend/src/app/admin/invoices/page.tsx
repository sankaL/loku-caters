"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { GearSix, MagnifyingGlass, Plus } from "@phosphor-icons/react";
import { API_URL } from "@/config/event";
import { getAdminToken } from "@/lib/auth";
import { getApiErrorMessage } from "@/lib/apiError";
import AdminToast from "@/components/admin/AdminToast";
import { useAdminToast } from "@/hooks/useAdminToast";
import {
  InvoicePicker,
  InvoicesContent,
  type OrderBundle,
} from "@/components/admin/invoices/InvoicesPageView";
import { InvoiceSummary } from "@/lib/invoices";
import { downloadResponseBlob } from "@/lib/browserDownload";
import GroupedMultiFilterDropdown, {
  parseMultiFilter,
  serializeMultiFilter,
} from "@/components/admin/GroupedMultiFilterDropdown";

interface AdminEvent {
  id: number;
  name: string;
}

const PAGE_SIZE = 15;

interface InvoicesPageState {
  invoices: InvoiceSummary[];
  orders: OrderBundle[];
  events: AdminEvent[];
  loading: boolean;
  pickerOpen: boolean;
  search: string;
  eventFilter: string;
  paymentFilter: string;
  bundleFilter: string;
  pickerSearch: string;
  page: number;
}

const INITIAL_STATE: InvoicesPageState = {
  invoices: [],
  orders: [],
  events: [],
  loading: true,
  pickerOpen: false,
  search: "",
  eventFilter: "all",
  paymentFilter: "all",
  bundleFilter: "",
  pickerSearch: "",
  page: 1,
};

async function fetchInvoicesPageData(): Promise<{
  invoices: InvoiceSummary[];
  orders: OrderBundle[];
  events: AdminEvent[];
} | null> {
  const token = await getAdminToken();
  if (!token) return null;
  const headers = { Authorization: `Bearer ${token}` };
  const [invoiceResponse, orderResponse, eventResponse] = await Promise.all([
    fetch(`${API_URL}/api/admin/invoices`, { headers }),
    fetch(`${API_URL}/api/admin/orders?view=bundle`, { headers }),
    fetch(`${API_URL}/api/admin/events`, { headers }),
  ]);
  if (!invoiceResponse.ok) throw new Error(await getApiErrorMessage(invoiceResponse, "Failed to load invoices"));
  if (!orderResponse.ok) throw new Error(await getApiErrorMessage(orderResponse, "Failed to load orders"));
  if (!eventResponse.ok) throw new Error(await getApiErrorMessage(eventResponse, "Failed to load events"));
  return {
    invoices: (await invoiceResponse.json()) as InvoiceSummary[],
    orders: (await orderResponse.json()) as OrderBundle[],
    events: (await eventResponse.json()) as AdminEvent[],
  };
}

function filterInvoices(
  invoices: InvoiceSummary[],
  filters: { bundle: string; event: string; payment: string; search: string },
): InvoiceSummary[] {
  const query = filters.search.trim().toLowerCase();
  const selectedEvents = new Set(parseMultiFilter(filters.event));
  const selectedPayments = new Set(parseMultiFilter(filters.payment));
  return invoices.filter((invoice) => {
    if (filters.bundle && invoice.source_bundle_id !== filters.bundle) return false;
    if (selectedEvents.size > 0 && !selectedEvents.has(String(invoice.source_event_id))) return false;
    if (selectedPayments.size > 0 && !selectedPayments.has(invoice.payment.paid ? "paid" : "due")) return false;
    if (!query) return true;
    return `${invoice.invoice_number} ${invoice.customer_name} ${invoice.customer_email ?? ""} ${invoice.order_reference ?? ""} ${invoice.event_name ?? ""}`.toLowerCase().includes(query);
  });
}

function filterPickerOrders(
  orders: OrderBundle[],
  eventNames: Map<number, string>,
  search: string,
): OrderBundle[] {
  const query = search.trim().toLowerCase();
  return orders.filter((order) => !query ||
    `${order.name} ${order.email ?? ""} ${order.bundle_id} ${eventNames.get(order.event_id) ?? ""}`.toLowerCase().includes(query)
  ).slice(0, 40);
}

async function downloadInvoicePdf(invoice: InvoiceSummary): Promise<void> {
  const token = await getAdminToken();
  if (!token) return;
  const response = await fetch(`${API_URL}/api/admin/invoices/${invoice.id}/pdf`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(await getApiErrorMessage(response, "Failed to export PDF"));
  await downloadResponseBlob(response, `${invoice.invoice_number}.pdf`);
}

export default function InvoicesPage() {
  const router = useRouter();
  const [state, setState] = useState<InvoicesPageState>(INITIAL_STATE);
  const {
    invoices,
    orders,
    events,
    loading,
    pickerOpen,
    search,
    eventFilter,
    paymentFilter,
    bundleFilter,
    pickerSearch,
    page,
  } = state;
  const updateState = useCallback((patch: Partial<InvoicesPageState>) => {
    setState((current) => ({ ...current, ...patch }));
  }, []);
  const { toast, showToast } = useAdminToast(4200);

  const loadData = useCallback(async () => {
    updateState({ loading: true });
    try {
      const data = await fetchInvoicesPageData();
      if (!data) return;
      updateState({ invoices: data.invoices, orders: data.orders, events: data.events });
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to load invoices", "error");
    } finally {
      updateState({ loading: false });
    }
  }, [showToast, updateState]);

  useEffect(() => {
    updateState({ bundleFilter: new URLSearchParams(window.location.search).get("bundle_id") ?? "" });
  }, [updateState]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const eventNames = useMemo(() => new Map(events.map((event) => [event.id, event.name])), [events]);
  const filtered = useMemo(() => filterInvoices(invoices, {
    bundle: bundleFilter,
    event: eventFilter,
    payment: paymentFilter,
    search,
  }), [bundleFilter, eventFilter, invoices, paymentFilter, search]);

  useEffect(() => {
    updateState({ page: 1 });
  }, [bundleFilter, eventFilter, paymentFilter, search, updateState]);

  function clearBundleFilter() {
    updateState({ bundleFilter: "" });
    window.history.replaceState(null, "", "/admin/invoices");
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pickerOrders = useMemo(
    () => filterPickerOrders(orders, eventNames, pickerSearch),
    [eventNames, orders, pickerSearch],
  );

  async function exportPdf(invoice: InvoiceSummary) {
    try {
      await downloadInvoicePdf(invoice);
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
          <button onClick={() => updateState({ pickerSearch: "", pickerOpen: true })} className="inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold" style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}>
            <Plus size={18} weight="bold" /> Create Invoice
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="relative min-w-[320px] flex-[1_1_720px]">
          <MagnifyingGlass size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--color-muted)" }} />
          <input value={search} onChange={(event) => updateState({ search: event.target.value })} placeholder="Search invoice, customer, order, or event" className="h-10 w-full rounded-xl border bg-white pl-9 pr-4 text-sm outline-none focus:ring-2 focus:ring-[color:var(--color-sage)]" style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }} />
        </label>
        <GroupedMultiFilterDropdown
          groups={[
            {
              id: "event",
              label: "Event",
              options: events.map((event) => ({ value: String(event.id), label: event.name })),
            },
            {
              id: "payment",
              label: "Payment",
              options: [
                { value: "paid", label: "Paid" },
                { value: "due", label: "Payment due" },
              ],
            },
          ]}
          selections={{
            event: parseMultiFilter(eventFilter),
            payment: parseMultiFilter(paymentFilter),
          }}
          onChange={(groupId, values) => updateState({
            [groupId === "event" ? "eventFilter" : "paymentFilter"]: serializeMultiFilter(values),
          })}
        />
      </div>
      {bundleFilter && <div className="mb-4 flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm" style={{ background: "var(--color-cream)", border: "1px solid var(--color-border)" }}><span>Showing invoices linked to the selected order.</span><button onClick={clearBundleFilter} className="font-semibold underline" style={{ color: "var(--color-forest)" }}>Show all invoices</button></div>}

      <InvoicesContent
        loading={loading}
        allInvoices={invoices}
        pageInvoices={paged}
        page={page}
        totalPages={totalPages}
        onPageChange={(nextPage) => updateState({ page: nextPage })}
        onCreate={() => updateState({ pickerOpen: true })}
        onOpen={(id) => router.push(`/admin/invoices/${id}`)}
        onExport={(invoice) => void exportPdf(invoice)}
      />

      <InvoicePicker
        open={pickerOpen}
        search={pickerSearch}
        orders={pickerOrders}
        eventNames={eventNames}
        onClose={() => updateState({ pickerOpen: false })}
        onSearchChange={(value) => updateState({ pickerSearch: value })}
        onStandalone={() => router.push("/admin/invoices/new")}
        onUseOrder={(bundleId) => router.push(`/admin/invoices/new?bundle_id=${encodeURIComponent(bundleId)}`)}
      />
    </div>
  );
}
