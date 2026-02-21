"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { API_URL } from "@/config/event";
import { getAdminToken } from "@/lib/auth";

interface Order {
  id: string;
  name: string;
  email: string;
  phone_number: string;
  item_name: string;
  quantity: number;
  pickup_location: string;
  pickup_time_slot: string;
  total_price: number;
  status: string;
  created_at: string;
}

type SortCol = "status" | "total" | "date";

const STATUS_FILTERS = ["all", "pending", "confirmed"] as const;
const PAGE_SIZE = 15;

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  pending:   { bg: "#fef3c7", color: "#92400e", label: "Pending" },
  confirmed: { bg: "#d1fae5", color: "#065f46", label: "Confirmed" },
  paid:      { bg: "#dbeafe", color: "#1e40af", label: "Paid" },
  picked_up: { bg: "#e0e7ff", color: "#3730a3", label: "Picked Up" },
  no_show:   { bg: "#fee2e2", color: "#991b1b", label: "No Show" },
  cancelled: { bg: "#f3f4f6", color: "#374151", label: "Cancelled" },
};

function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) {
    return (
      <svg width="10" height="10" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ opacity: 0.3 }}>
        <path d="M5 9L10 5L15 9" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M5 11L10 15L15 11" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    );
  }
  return (
    <svg width="10" height="10" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5">
      {dir === "asc"
        ? <path d="M15 12.5L10 7.5L5 12.5" strokeLinecap="round" strokeLinejoin="round"/>
        : <path d="M5 7.5L10 12.5L15 7.5" strokeLinecap="round" strokeLinejoin="round"/>
      }
    </svg>
  );
}

function csvEscape(value: string | number): string {
  const normalized = String(value).replace(/"/g, "\"\"");
  if (/[",\n\r]/.test(normalized)) return `"${normalized}"`;
  return normalized;
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<string>("pending");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [sort, setSort] = useState<{ col: SortCol | null; dir: "asc" | "desc" }>({ col: null, dir: "asc" });
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getAdminToken();
      if (!token) return;
      const params = filter !== "all" ? `?status=${filter}` : "";
      const res = await fetch(`${API_URL}/api/admin/orders${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch orders");
      setOrders(await res.json());
      setPage(1);
    } catch {
      showToast("Failed to load orders", "error");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // Reset to page 1 whenever search changes
  useEffect(() => { setPage(1); }, [search]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.email.toLowerCase().includes(q) ||
        o.phone_number.toLowerCase().includes(q) ||
        o.pickup_location.toLowerCase().includes(q)
    );
  }, [orders, search]);

  const sorted = useMemo(() => {
    if (!sort.col) return filtered;
    return [...filtered].sort((a, b) => {
      if (sort.col === "total") return sort.dir === "asc" ? a.total_price - b.total_price : b.total_price - a.total_price;
      if (sort.col === "date") {
        const diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        return sort.dir === "asc" ? diff : -diff;
      }
      if (sort.col === "status") {
        return sort.dir === "asc" ? a.status.localeCompare(b.status) : b.status.localeCompare(a.status);
      }
      return 0;
    });
  }, [filtered, sort]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { setPage((prev) => Math.min(prev, totalPages)); }, [totalPages]);

  function toggleSort(col: SortCol) {
    setSort((prev) => prev.col === col
      ? { col, dir: prev.dir === "asc" ? "desc" : "asc" }
      : { col, dir: "asc" }
    );
    setPage(1);
  }

  async function handleConfirm(orderId: string) {
    setConfirming(orderId);
    try {
      const token = await getAdminToken();
      if (!token) return;
      const res = await fetch(`${API_URL}/api/admin/orders/${orderId}/confirm`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Failed to confirm order");
      }
      showToast("Confirmation email sent!", "success");
      await fetchOrders();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to send email", "error");
    } finally {
      setConfirming(null);
    }
  }

  async function handleStatusChange(orderId: string, newStatus: string) {
    setUpdatingStatus(orderId);
    try {
      const token = await getAdminToken();
      if (!token) return;
      const res = await fetch(`${API_URL}/api/admin/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Failed to update status");
      }
      setOrders((prev) => {
        if (filter !== "all" && newStatus !== filter) {
          return prev.filter((o) => o.id !== orderId);
        }
        return prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o));
      });
      showToast("Status updated", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to update status", "error");
    } finally {
      setUpdatingStatus(null);
    }
  }

  async function handleDelete(orderId: string) {
    if (!window.confirm("Delete this order? This cannot be undone.")) return;
    setDeleting(orderId);
    try {
      const token = await getAdminToken();
      if (!token) return;
      const res = await fetch(`${API_URL}/api/admin/orders/${orderId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Failed to delete order");
      }
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
      showToast("Order deleted", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to delete order", "error");
    } finally {
      setDeleting(null);
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString("en-CA", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function handleExportCsv() {
    if (sorted.length === 0) {
      showToast("No orders to export", "error");
      return;
    }

    const headers = [
      "Order ID",
      "Name",
      "Email",
      "Phone",
      "Item",
      "Quantity",
      "Pickup Location",
      "Pickup Time Slot",
      "Total Price",
      "Status",
      "Created At",
    ];

    const rows = sorted.map((order) => [
      order.id,
      order.name,
      order.email,
      order.phone_number,
      order.item_name,
      order.quantity,
      order.pickup_location,
      order.pickup_time_slot,
      order.total_price.toFixed(2),
      order.status,
      order.created_at,
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((value) => csvEscape(value)).join(","))
      .join("\n");

    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

    link.href = url;
    link.download = `orders-${filter}-${timestamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast(`Exported ${sorted.length} order${sorted.length === 1 ? "" : "s"}`, "success");
  }

  const thBase = "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider";

  return (
    <div className="p-8">
      {/* Toast */}
      {toast && (
        <div
          className="fixed top-6 right-6 z-50 px-5 py-3 rounded-xl text-sm font-medium shadow-lg"
          style={{
            background: toast.type === "success" ? "#d1fae5" : "#fee2e2",
            color: toast.type === "success" ? "#065f46" : "#991b1b",
            border: `1px solid ${toast.type === "success" ? "#6ee7b7" : "#fca5a5"}`,
          }}
        >
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <h1
          className="text-2xl font-bold mb-1"
          style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}
        >
          Orders
        </h1>
        <p className="text-sm" style={{ color: "var(--color-muted)" }}>
          Clicking Send Confirmation emails the customer and marks the order confirmed automatically.
        </p>
      </div>

      {/* Status filters + search + refresh */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-4 py-2 rounded-xl text-sm font-medium capitalize transition-all"
            style={{
              background: filter === f ? "var(--color-forest)" : "white",
              color: filter === f ? "var(--color-cream)" : "var(--color-text)",
              border: `1px solid ${filter === f ? "var(--color-forest)" : "var(--color-border)"}`,
            }}
          >
            {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}

        {/* Search */}
        <div className="relative flex-1 min-w-48">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: "var(--color-muted)" }}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, phone, location..."
            className="w-full pl-9 pr-4 py-2 rounded-xl text-sm border bg-white focus:outline-none focus:ring-2 transition-all border-[var(--color-border)] focus:ring-[var(--color-sage)] focus:border-[var(--color-sage)]"
            style={{ color: "var(--color-text)" }}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2"
              style={{ color: "var(--color-muted)" }}
              aria-label="Clear search"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        <button
          onClick={fetchOrders}
          className="px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 shrink-0"
          style={{ background: "white", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16" />
          </svg>
          Refresh
        </button>

        <button
          onClick={handleExportCsv}
          disabled={loading || sorted.length === 0}
          className="px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: "white", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12" />
            <path d="M7 10l5 5 5-5" />
            <path d="M4 21h16" />
          </svg>
          Export CSV
        </button>
      </div>

      {/* Result count */}
      {!loading && (
        <p className="text-xs mb-3" style={{ color: "var(--color-muted)" }}>
          {search
            ? `${filtered.length} result${filtered.length !== 1 ? "s" : ""} for "${search}"`
            : `${filtered.length} order${filtered.length !== 1 ? "s" : ""}`}
          {totalPages > 1 && ` - page ${page} of ${totalPages}`}
        </p>
      )}

      {/* Table */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: "white", border: "1px solid var(--color-border)" }}
      >
        {loading ? (
          <div className="flex justify-center py-16">
            <svg className="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" opacity="0.3" />
              <path d="M12 2a10 10 0 0 1 10 10" stroke="var(--color-sage)" />
            </svg>
          </div>
        ) : paginated.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-sm" style={{ color: "var(--color-muted)" }}>
              {search ? `No orders match "${search}".` : `No ${filter !== "all" ? filter : ""} orders found.`}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "var(--color-cream)", borderBottom: "1px solid var(--color-border)" }}>
                  <th className={thBase} style={{ color: "var(--color-muted)" }}>Name</th>
                  <th className={thBase} style={{ color: "var(--color-muted)" }}>Contact</th>
                  <th className={thBase} style={{ color: "var(--color-muted)" }}>Item</th>
                  <th className={thBase} style={{ color: "var(--color-muted)" }}>Location</th>
                  <th className={thBase} style={{ color: "var(--color-muted)" }}>Time Slot</th>
                  <th className={thBase} style={{ color: "var(--color-muted)" }}>
                    <button
                      onClick={() => toggleSort("total")}
                      className="flex items-center gap-1 uppercase tracking-wider font-semibold hover:opacity-70 transition-opacity"
                    >
                      Total <SortIcon active={sort.col === "total"} dir={sort.dir} />
                    </button>
                  </th>
                  <th className={thBase} style={{ color: "var(--color-muted)" }}>
                    <button
                      onClick={() => toggleSort("status")}
                      className="flex items-center gap-1 uppercase tracking-wider font-semibold hover:opacity-70 transition-opacity"
                    >
                      Status <SortIcon active={sort.col === "status"} dir={sort.dir} />
                    </button>
                  </th>
                  <th className={thBase} style={{ color: "var(--color-muted)" }}>
                    <button
                      onClick={() => toggleSort("date")}
                      className="flex items-center gap-1 uppercase tracking-wider font-semibold hover:opacity-70 transition-opacity"
                    >
                      Date <SortIcon active={sort.col === "date"} dir={sort.dir} />
                    </button>
                  </th>
                  <th className={thBase} style={{ color: "var(--color-muted)" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((order, idx) => {
                  const statusStyle = STATUS_STYLES[order.status] ?? STATUS_STYLES.pending;
                  const isConfirming = confirming === order.id;
                  const isUpdatingStatus = updatingStatus === order.id;
                  const isDeleting = deleting === order.id;
                  return (
                    <tr
                      key={order.id}
                      style={{ borderBottom: idx < paginated.length - 1 ? "1px solid var(--color-border)" : "none" }}
                    >
                      <td className="px-4 py-3 font-medium" style={{ color: "var(--color-text)" }}>
                        {order.name}
                      </td>
                      <td className="px-4 py-3" style={{ color: "var(--color-muted)" }}>
                        <div>{order.email}</div>
                        <div className="text-xs">{order.phone_number}</div>
                      </td>
                      <td className="px-4 py-3" style={{ color: "var(--color-text)" }}>
                        {order.item_name} x{order.quantity}
                      </td>
                      <td className="px-4 py-3" style={{ color: "var(--color-text)" }}>
                        {order.pickup_location}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap" style={{ color: "var(--color-text)" }}>
                        {order.pickup_time_slot}
                      </td>
                      <td className="px-4 py-3 font-semibold" style={{ color: "var(--color-forest)" }}>
                        ${order.total_price.toFixed(2)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="relative inline-block">
                          <select
                            value={order.status}
                            disabled={isUpdatingStatus}
                            onChange={(e) => handleStatusChange(order.id, e.target.value)}
                            className="appearance-none pl-2.5 pr-6 py-1 rounded-full text-xs font-semibold border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--color-sage)] disabled:opacity-60 transition-opacity"
                            style={{ background: statusStyle.bg, color: statusStyle.color }}
                          >
                            {Object.entries(STATUS_STYLES).map(([val, s]) => (
                              <option key={val} value={val}>{s.label}</option>
                            ))}
                          </select>
                          <span className="pointer-events-none absolute inset-y-0 right-1.5 flex items-center" style={{ color: statusStyle.color }}>
                            <svg width="10" height="10" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <path d="M5 7.5L10 12.5L15 7.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs" style={{ color: "var(--color-muted)" }}>
                        {formatDate(order.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {order.status === "pending" && (
                            <button
                              onClick={() => handleConfirm(order.id)}
                              disabled={isConfirming}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-60 whitespace-nowrap"
                              style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}
                            >
                              {isConfirming ? "Sending..." : "Send Confirmation"}
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(order.id)}
                            disabled={isDeleting}
                            className="p-1.5 rounded-lg transition-all disabled:opacity-60"
                            style={{ color: "#991b1b", background: "#fee2e2", border: "1px solid #fca5a5" }}
                            aria-label="Delete order"
                            title="Delete order"
                          >
                            {isDeleting ? (
                              <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" opacity="0.3" />
                                <path d="M12 2a10 10 0 0 1 10 10" />
                              </svg>
                            ) : (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6l-1 14H6L5 6" />
                                <path d="M10 11v6M14 11v6" />
                                <path d="M9 6V4h6v2" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-30"
            style={{ background: "white", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
          >
            Previous
          </button>

          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
            .reduce<(number | "...")[]>((acc, p, i, arr) => {
              if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("...");
              acc.push(p);
              return acc;
            }, [])
            .map((p, i) =>
              p === "..." ? (
                <span key={`ellipsis-${i}`} className="px-2 text-sm" style={{ color: "var(--color-muted)" }}>
                  ...
                </span>
              ) : (
                <button
                  key={p}
                  onClick={() => setPage(p as number)}
                  className="w-9 h-9 rounded-xl text-sm font-medium transition-all"
                  style={{
                    background: page === p ? "var(--color-forest)" : "white",
                    color: page === p ? "var(--color-cream)" : "var(--color-text)",
                    border: `1px solid ${page === p ? "var(--color-forest)" : "var(--color-border)"}`,
                  }}
                >
                  {p}
                </button>
              )
            )}

          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-30"
            style={{ background: "white", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
