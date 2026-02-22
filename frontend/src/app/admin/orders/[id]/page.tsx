"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { API_URL } from "@/config/event";
import { getAdminToken } from "@/lib/auth";
import CustomSelect from "@/components/ui/CustomSelect";
import Modal from "@/components/ui/Modal";

interface Order {
  id: string;
  name: string;
  email: string;
  phone_number: string;
  item_id: string;
  item_name: string;
  quantity: number;
  pickup_location: string;
  pickup_time_slot: string;
  total_price: number;
  status: string;
  created_at: string;
}

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  pending:   { bg: "#fef3c7", color: "#92400e", label: "Pending" },
  confirmed: { bg: "#d1fae5", color: "#065f46", label: "Confirmed" },
  reminded:  { bg: "#fdf0e8", color: "#7a3f1e", label: "Reminded" },
  paid:      { bg: "#dbeafe", color: "#1e40af", label: "Paid" },
  picked_up: { bg: "#e0e7ff", color: "#3730a3", label: "Picked Up" },
  no_show:   { bg: "#fee2e2", color: "#991b1b", label: "No Show" },
  cancelled: { bg: "#f3f4f6", color: "#374151", label: "Cancelled" },
};

const STATUS_OPTIONS = Object.entries(STATUS_STYLES).map(([value, s]) => ({
  value,
  label: s.label,
}));

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    async function fetchOrder() {
      try {
        const token = await getAdminToken();
        if (!token) return;
        const res = await fetch(`${API_URL}/api/admin/orders/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        if (!res.ok) throw new Error("Failed to fetch order");
        setOrder(await res.json());
      } catch {
        showToast("Failed to load order", "error");
      } finally {
        setLoading(false);
      }
    }
    fetchOrder();
  }, [id]);

  async function handleStatusChange(newStatus: string) {
    if (!order) return;
    setUpdatingStatus(true);
    try {
      const token = await getAdminToken();
      if (!token) return;
      const res = await fetch(`${API_URL}/api/admin/orders/${id}/status`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Failed to update status");
      }
      setOrder((prev) => prev ? { ...prev, status: newStatus } : prev);
      showToast("Status updated", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to update status", "error");
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function handleSendEmail() {
    if (!order) return;
    setSendingEmail(true);
    try {
      const token = await getAdminToken();
      if (!token) return;
      const res = await fetch(`${API_URL}/api/admin/orders/${id}/confirm`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Failed to send confirmation");
      }
      setOrder((prev) => prev ? { ...prev, status: "confirmed" } : prev);
      showToast("Confirmation email sent!", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to send email", "error");
    } finally {
      setSendingEmail(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const token = await getAdminToken();
      if (!token) {
        showToast("Admin session expired. Please sign in again.", "error");
        return;
      }
      const res = await fetch(`${API_URL}/api/admin/orders/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Failed to delete order");
      }
      router.push("/admin/orders");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to delete order", "error");
    } finally {
      setDeleting(false);
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString("en-CA", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  const cardStyle = {
    background: "white",
    border: "1px solid var(--color-border)",
    borderRadius: "24px",
    padding: "24px",
  };

  const labelStyle = { fontSize: "11px", fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.08em", color: "var(--color-sage)", marginBottom: "4px" };
  const valueStyle = { fontSize: "14px", color: "var(--color-text)", fontWeight: 500 };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-32">
        <svg className="animate-spin" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" opacity="0.3" />
          <path d="M12 2a10 10 0 0 1 10 10" stroke="var(--color-sage)" />
        </svg>
      </div>
    );
  }

  if (notFound || !order) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm mb-4" style={{ color: "var(--color-muted)" }}>Order not found.</p>
        <button
          onClick={() => router.push("/admin/orders")}
          className="text-sm font-medium"
          style={{ color: "var(--color-forest)" }}
        >
          Back to Orders
        </button>
      </div>
    );
  }

  const statusStyle = STATUS_STYLES[order.status] ?? STATUS_STYLES.pending;

  return (
    <div className="p-8 max-w-4xl">
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

      {/* Back button */}
      <button
        onClick={() => router.push("/admin/orders")}
        className="flex items-center gap-1.5 text-sm font-medium mb-6 transition-opacity hover:opacity-70"
        style={{ color: "var(--color-muted)" }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 5l-7 7 7 7" />
        </svg>
        Orders
      </button>

      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1
          className="text-2xl font-bold"
          style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}
        >
          Order #{order.id.slice(0, 8).toUpperCase()}
        </h1>
        <span
          className="px-3 py-1.5 rounded-full text-xs font-semibold"
          style={{ background: statusStyle.bg, color: statusStyle.color }}
        >
          {statusStyle.label}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Customer Details */}
        <div style={cardStyle} className="md:col-span-2">
          <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--color-forest)" }}>
            Customer Details
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p style={labelStyle}>Name</p>
              <p style={valueStyle}>{order.name}</p>
            </div>
            <div>
              <p style={labelStyle}>Email</p>
              <p style={valueStyle} className="break-all">{order.email}</p>
            </div>
            <div>
              <p style={labelStyle}>Phone</p>
              <p style={valueStyle}>{order.phone_number}</p>
            </div>
          </div>
        </div>

        {/* Order Actions */}
        <div style={cardStyle} className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold mb-1" style={{ color: "var(--color-forest)" }}>
            Order Actions
          </h2>

          <div>
            <p style={{ ...labelStyle, marginBottom: "8px" }}>Status</p>
            <CustomSelect
              options={STATUS_OPTIONS}
              value={order.status}
              onChange={handleStatusChange}
              disabled={updatingStatus}
            />
          </div>

          <button
            onClick={handleSendEmail}
            disabled={sendingEmail}
            className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-60"
            style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}
          >
            {sendingEmail ? "Sending..." : "Send Confirmation Email"}
          </button>

          <button
            onClick={() => setShowDeleteModal(true)}
            className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all"
            style={{ background: "#fee2e2", color: "#991b1b", border: "1px solid #fca5a5" }}
          >
            Delete Order
          </button>
        </div>

        {/* Order Details */}
        <div style={cardStyle} className="md:col-span-3">
          <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--color-forest)" }}>
            Order Details
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
            <div>
              <p style={labelStyle}>Item</p>
              <p style={valueStyle}>{order.item_name}</p>
            </div>
            <div>
              <p style={labelStyle}>Quantity</p>
              <p style={valueStyle}>{order.quantity}</p>
            </div>
            <div>
              <p style={labelStyle}>Total</p>
              <p style={{ ...valueStyle, color: "var(--color-forest)", fontWeight: 700 }}>
                ${order.total_price.toFixed(2)}
              </p>
            </div>
            <div>
              <p style={labelStyle}>Location</p>
              <p style={valueStyle}>{order.pickup_location}</p>
            </div>
            <div>
              <p style={labelStyle}>Time Slot</p>
              <p style={valueStyle}>{order.pickup_time_slot}</p>
            </div>
            <div>
              <p style={labelStyle}>Date Placed</p>
              <p style={valueStyle}>{formatDate(order.created_at)}</p>
            </div>
          </div>
        </div>
      </div>

      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Order"
        variant="danger"
        actions={
          <>
            <button
              onClick={() => setShowDeleteModal(false)}
              className="px-4 py-2 rounded-xl text-sm font-medium"
              style={{ background: "var(--color-cream)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                setShowDeleteModal(false);
                handleDelete();
              }}
              disabled={deleting}
              className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-60"
              style={{ background: "#dc2626", color: "white" }}
            >
              {deleting ? "Deleting..." : "Delete"}
            </button>
          </>
        }
      >
        This order from {order.name} will be permanently deleted. This cannot be undone.
      </Modal>
    </div>
  );
}
