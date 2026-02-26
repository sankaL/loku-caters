"use client";

import { useState, useEffect, use, useMemo } from "react";
import { useRouter } from "next/navigation";
import { API_URL, fetchEventConfig, EventConfig } from "@/config/event";
import { getAdminToken } from "@/lib/auth";
import { getApiErrorMessage } from "@/lib/apiError";
import CustomSelect from "@/components/ui/CustomSelect";
import Modal from "@/components/ui/Modal";

interface Order {
  id: string;
  name: string;
  email: string | null;
  phone_number: string | null;
  item_id: string;
  item_name: string;
  quantity: number;
  pickup_location: string;
  pickup_time_slot: string;
  total_price: number;
  status: string;
  notes?: string | null;
  exclude_email?: boolean;
  created_at: string;
}

interface EditOrderForm {
  name: string;
  email: string;
  phone_number: string;
  item_id: string;
  quantity: number;
  pickup_location: string;
  pickup_time_slot: string;
  notes: string;
  exclude_email: boolean;
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

  const [eventConfig, setEventConfig] = useState<EventConfig | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState<EditOrderForm | null>(null);
  const [savingEdits, setSavingEdits] = useState(false);

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
        const data = await res.json();
        setOrder(data);
        setEditForm({
          name: data.name ?? "",
          email: data.email ?? "",
          phone_number: data.phone_number ?? "",
          item_id: data.item_id ?? "",
          quantity: data.quantity ?? 1,
          pickup_location: data.pickup_location ?? "",
          pickup_time_slot: data.pickup_time_slot ?? "",
          notes: data.notes ?? "",
          exclude_email: !!data.exclude_email,
        });
      } catch {
        showToast("Failed to load order", "error");
      } finally {
        setLoading(false);
      }
    }
    fetchOrder();
  }, [id]);

  useEffect(() => {
    fetchEventConfig().then(setEventConfig).catch(() => {});
  }, []);

  const editTimeSlots = useMemo(() => {
    if (!eventConfig || !editForm?.pickup_location) return [];
    const loc = eventConfig.locations.find((l) => l.name === editForm.pickup_location);
    return loc?.timeSlots ?? [];
  }, [eventConfig, editForm?.pickup_location]);

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
        throw new Error(await getApiErrorMessage(res, "Failed to update status"));
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
        throw new Error(await getApiErrorMessage(res, "Failed to send confirmation"));
      }
      const data = await res.json();
      setOrder((prev) => prev ? { ...prev, status: "confirmed" } : prev);
      if (data.email_suppressed) {
        showToast("Order confirmed (email excluded)", "success");
      } else if (data.email_sent) {
        showToast("Confirmation email sent!", "success");
      } else {
        showToast("Order confirmed, but email failed to send", "error");
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to send email", "error");
    } finally {
      setSendingEmail(false);
    }
  }

  async function handleSaveEdits(e: React.FormEvent) {
    e.preventDefault();
    if (!editForm) return;
    setSavingEdits(true);
    try {
      const token = await getAdminToken();
      if (!token) return;
      const res = await fetch(`${API_URL}/api/admin/orders/${id}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, "Failed to update order"));
      }
      const data = await res.json();
      setOrder(data);
      setEditForm({
        name: data.name ?? "",
        email: data.email ?? "",
        phone_number: data.phone_number ?? "",
        item_id: data.item_id ?? "",
        quantity: data.quantity ?? 1,
        pickup_location: data.pickup_location ?? "",
        pickup_time_slot: data.pickup_time_slot ?? "",
        notes: data.notes ?? "",
        exclude_email: !!data.exclude_email,
      });
      setShowEditModal(false);
      showToast("Order updated", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to update order", "error");
    } finally {
      setSavingEdits(false);
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
        throw new Error(await getApiErrorMessage(res, "Failed to delete order"));
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

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    borderRadius: "12px",
    border: "1px solid var(--color-border)",
    background: "white",
    color: "var(--color-text)",
    fontSize: "14px",
    outline: "none",
  };

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
              <p style={valueStyle} className="break-all">{order.email ?? "-"}</p>
            </div>
            <div>
              <p style={labelStyle}>Phone</p>
              <p style={valueStyle}>{order.phone_number ?? "-"}</p>
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
            disabled={sendingEmail || order.status !== "pending"}
            className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-60"
            style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}
            title={order.status !== "pending" ? "Order is already confirmed" : undefined}
          >
            {sendingEmail
              ? "Sending..."
              : (order.exclude_email ? "Confirm (No Email)" : "Send Confirmation Email")
            }
          </button>

          <button
            onClick={() => setShowEditModal(true)}
            className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all"
            style={{ background: "white", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
          >
            Edit Order
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
              <p style={labelStyle}>Email Excluded</p>
              <p style={valueStyle}>{order.exclude_email ? "Yes" : "No"}</p>
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

        {/* Admin Notes */}
        <div style={cardStyle} className="md:col-span-3">
          <h2 className="text-sm font-semibold mb-2" style={{ color: "var(--color-forest)" }}>
            Notes
          </h2>
          <p className="text-sm" style={{ color: "var(--color-text)", whiteSpace: "pre-wrap" }}>
            {order.notes ? order.notes : "-"}
          </p>
        </div>
      </div>

      {/* Edit Order Modal */}
      {showEditModal && editForm && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setShowEditModal(false); }}
        >
          <div
            style={{ background: "white", borderRadius: "24px", border: "1px solid var(--color-border)", maxWidth: "720px", width: "100%", padding: "32px", boxShadow: "0 20px 60px rgba(0,0,0,0.15)", maxHeight: "90vh", overflowY: "auto" }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold mb-5" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>
              Edit Order
            </h2>
            <form onSubmit={handleSaveEdits} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-muted)" }}>Name</label>
                  <input
                    required
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm((f) => f ? ({ ...f, name: e.target.value }) : f)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-muted)" }}>Email</label>
                  <input
                    required={!editForm.exclude_email}
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm((f) => f ? ({ ...f, email: e.target.value }) : f)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-muted)" }}>Phone</label>
                  <input
                    required={!editForm.exclude_email}
                    type="tel"
                    value={editForm.phone_number}
                    onChange={(e) => setEditForm((f) => f ? ({ ...f, phone_number: e.target.value }) : f)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-muted)" }}>Quantity</label>
                  <input
                    required
                    type="number"
                    min={1}
                    value={editForm.quantity}
                    onChange={(e) => setEditForm((f) => f ? ({ ...f, quantity: parseInt(e.target.value, 10) || 1 }) : f)}
                    style={inputStyle}
                  />
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <label className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--color-text)" }}>
                    <input
                      type="checkbox"
                      checked={editForm.exclude_email}
                      onChange={(e) => setEditForm((f) => f ? ({ ...f, exclude_email: e.target.checked }) : f)}
                      style={{ accentColor: "var(--color-forest)", width: "15px", height: "15px" }}
                    />
                    Exclude Email (no confirmation or reminder emails)
                  </label>
                  <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
                    When enabled, Email and Phone are optional.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-muted)" }}>Item</label>
                <CustomSelect
                  options={(eventConfig?.items ?? []).map((i) => ({ value: i.id, label: i.name }))}
                  value={editForm.item_id}
                  onChange={(v) => setEditForm((f) => f ? ({ ...f, item_id: v }) : f)}
                  disabled={!eventConfig}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-muted)" }}>Pickup Location</label>
                  <CustomSelect
                    options={(eventConfig?.locations ?? []).map((l) => ({ value: l.name, label: l.name }))}
                    value={editForm.pickup_location}
                    onChange={(v) => setEditForm((f) => f ? ({ ...f, pickup_location: v, pickup_time_slot: "" }) : f)}
                    disabled={!eventConfig}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-muted)" }}>Time Slot</label>
                  <CustomSelect
                    options={editTimeSlots.map((s) => ({ value: s, label: s }))}
                    value={editForm.pickup_time_slot}
                    onChange={(v) => setEditForm((f) => f ? ({ ...f, pickup_time_slot: v }) : f)}
                    disabled={!eventConfig || !editForm.pickup_location}
                    placeholder={editForm.pickup_location ? "Select a time slot" : "Select a location first"}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-muted)" }}>Notes (admin only)</label>
                <textarea
                  value={editForm.notes}
                  onChange={(e) => setEditForm((f) => f ? ({ ...f, notes: e.target.value }) : f)}
                  rows={4}
                  style={{ ...inputStyle, resize: "vertical" as const, minHeight: "110px" }}
                />
              </div>

              <p className="text-xs" style={{ color: "var(--color-muted)" }}>
                Price will be computed server-side.
              </p>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 rounded-xl text-sm font-medium"
                  style={{ background: "var(--color-cream)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdits}
                  className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-60"
                  style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}
                >
                  {savingEdits ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
