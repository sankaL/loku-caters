"use client";

import { useState, useEffect, useCallback } from "react";
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

const STATUS_FILTERS = ["all", "pending", "confirmed"] as const;

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  pending: { bg: "#fef3c7", color: "#92400e", label: "Pending" },
  confirmed: { bg: "#d1fae5", color: "#065f46", label: "Confirmed" },
  paid: { bg: "#dbeafe", color: "#1e40af", label: "Paid" },
  picked_up: { bg: "#e0e7ff", color: "#3730a3", label: "Picked Up" },
  no_show: { bg: "#fee2e2", color: "#991b1b", label: "No Show" },
  cancelled: { bg: "#f3f4f6", color: "#374151", label: "Cancelled" },
};

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<string>("pending");
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState<string | null>(null);
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
    } catch {
      showToast("Failed to load orders", "error");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

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

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString("en-CA", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

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
          Review and confirm customer orders. Confirmation emails include pickup address.
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6">
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
        <button
          onClick={fetchOrders}
          className="ml-auto px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2"
          style={{ background: "white", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16" />
          </svg>
          Refresh
        </button>
      </div>

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
        ) : orders.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-sm" style={{ color: "var(--color-muted)" }}>
              No {filter !== "all" ? filter : ""} orders found.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "var(--color-cream)", borderBottom: "1px solid var(--color-border)" }}>
                  {["Name", "Contact", "Item", "Location", "Time Slot", "Total", "Status", "Date", "Action"].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                      style={{ color: "var(--color-muted)" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((order, idx) => {
                  const statusStyle = STATUS_STYLES[order.status] ?? STATUS_STYLES.pending;
                  const isConfirming = confirming === order.id;
                  return (
                    <tr
                      key={order.id}
                      style={{ borderBottom: idx < orders.length - 1 ? "1px solid var(--color-border)" : "none" }}
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
                        <span
                          className="px-2.5 py-1 rounded-full text-xs font-semibold"
                          style={{ background: statusStyle.bg, color: statusStyle.color }}
                        >
                          {statusStyle.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs" style={{ color: "var(--color-muted)" }}>
                        {formatDate(order.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        {order.status === "pending" && (
                          <button
                            onClick={() => handleConfirm(order.id)}
                            disabled={isConfirming}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-60"
                            style={{
                              background: "var(--color-forest)",
                              color: "var(--color-cream)",
                            }}
                          >
                            {isConfirming ? "Sending..." : "Send Confirmation"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
