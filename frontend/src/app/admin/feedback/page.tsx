"use client";

import { useState, useEffect, useMemo, useRef, Fragment } from "react";
import { useRouter } from "next/navigation";
import { API_URL } from "@/config/event";
import { getAdminToken } from "@/lib/auth";
import Modal from "@/components/ui/Modal";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FeedbackMetric {
  reason: string;
  label: string;
  count: number;
  pct: number;
}

interface FeedbackItem {
  id: string;
  feedback_type: string;
  order_id: string | null;
  name: string | null;
  contact: string | null;
  reason: string | null;
  reason_label: string | null;
  other_details: string | null;
  message: string | null;
  created_at: string | null;
  status: string;
  admin_comment: string | null;
}

interface FeedbackResponse {
  total: number;
  customer_count: number;
  non_customer_count: number;
  general_contact_count: number;
  metrics: FeedbackMetric[];
  items: FeedbackItem[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
}

function formatTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit" });
}

const REASON_COLORS: Record<string, { bg: string; text: string }> = {
  price_too_high:          { bg: "#fef2f2", text: "#c53030" },
  location_not_convenient: { bg: "#fff7ed", text: "#9a3412" },
  dietary_needs:           { bg: "#fefce8", text: "#854d0e" },
  not_available:           { bg: "#f0fdf4", text: "#166534" },
  different_menu:          { bg: "#eff6ff", text: "#1d4ed8" },
  prefer_delivery:         { bg: "#f0f9ff", text: "#0369a1" },
  not_interested:          { bg: "#faf5ff", text: "#6b21a8" },
  catering_inquiry:        { bg: "#ecfdf5", text: "#047857" },
  previous_order_inquiry:  { bg: "#eff6ff", text: "#1d4ed8" },
  stay_updated:            { bg: "#f0fdf4", text: "#166534" },
  general_feedback:        { bg: "var(--color-cream)", text: "var(--color-forest)" },
  other:                   { bg: "var(--color-cream)", text: "var(--color-muted)" },
};

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

function ReasonBadge({ reason, label }: { reason: string; label: string }) {
  const colors = REASON_COLORS[reason] ?? { bg: "var(--color-cream)", text: "var(--color-muted)" };
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: "999px",
        fontSize: "12px",
        fontWeight: 600,
        background: colors.bg,
        color: colors.text,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  const kind = type === "customer" ? "customer" : type === "general_contact" ? "general_contact" : "non_customer";
  const styleByKind: Record<string, { bg: string; color: string; border: string; label: string }> = {
    customer: {
      bg: "#f0f7eb",
      color: "#2d6a2d",
      border: "1px solid #c8ddb4",
      label: "Customer",
    },
    non_customer: {
      bg: "var(--color-cream)",
      color: "var(--color-muted)",
      border: "1px solid var(--color-border)",
      label: "Non-customer",
    },
    general_contact: {
      bg: "#eff6ff",
      color: "#1d4ed8",
      border: "1px solid #bfdbfe",
      label: "Contact",
    },
  };
  const s = styleByKind[kind];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: "999px",
        fontSize: "12px",
        fontWeight: 600,
        background: s.bg,
        color: s.color,
        whiteSpace: "nowrap",
        border: s.border,
      }}
    >
      {s.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; text: string; label: string }> = {
    new:         { bg: "#f3f4f6", text: "#374151", label: "New" },
    in_progress: { bg: "#fffbeb", text: "#92400e", label: "In Progress" },
    resolved:    { bg: "#f0fdf4", text: "#166534", label: "Resolved" },
  };
  const s = styles[status] ?? styles.new;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: "999px",
        fontSize: "12px",
        fontWeight: 600,
        background: s.bg,
        color: s.text,
        whiteSpace: "nowrap",
      }}
    >
      {s.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function Skeleton({ w = "100%", h = 16 }: { w?: string | number; h?: number }) {
  return (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: 8,
        background: "var(--color-cream)",
        animation: "pulse 1.5s ease-in-out infinite",
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// ExpandedRow
// ---------------------------------------------------------------------------

function ExpandedRow({
  item,
  colSpan,
  onStatusChange,
  onCommentSave,
}: {
  item: FeedbackItem;
  colSpan: number;
  onStatusChange: (id: string, status: string) => Promise<void>;
  onCommentSave: (id: string, comment: string | null) => Promise<void>;
}) {
  const [commentText, setCommentText] = useState(item.admin_comment ?? "");
  const [savingComment, setSavingComment] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  async function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setUpdatingStatus(true);
    try {
      await onStatusChange(item.id, e.target.value);
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function handleSaveComment() {
    setSavingComment(true);
    try {
      await onCommentSave(item.id, commentText.trim() || null);
    } finally {
      setSavingComment(false);
    }
  }

  return (
    <tr>
      <td
        colSpan={colSpan}
        style={{
          padding: "16px 20px",
          background: "#fafaf9",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
          {/* Status select */}
          <div>
            <label
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--color-muted)",
                display: "block",
                marginBottom: 6,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Status
            </label>
            <select
              value={item.status}
              onChange={handleStatusChange}
              disabled={updatingStatus}
              style={{
                padding: "7px 12px",
                borderRadius: 10,
                border: "1px solid var(--color-border)",
                fontSize: 13,
                color: "var(--color-text)",
                background: "white",
                cursor: updatingStatus ? "not-allowed" : "pointer",
                outline: "none",
              }}
            >
              <option value="new">New</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>

          {/* Admin comment */}
          <div style={{ flex: 1, minWidth: 260 }}>
            <label
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--color-muted)",
                display: "block",
                marginBottom: 6,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Internal Note
            </label>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Add an internal note..."
                rows={2}
                style={{
                  flex: 1,
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid var(--color-border)",
                  fontSize: 13,
                  color: "var(--color-text)",
                  background: "white",
                  resize: "vertical",
                  fontFamily: "inherit",
                  outline: "none",
                }}
              />
              <button
                onClick={handleSaveComment}
                disabled={savingComment}
                style={{
                  padding: "8px 14px",
                  borderRadius: 10,
                  border: "none",
                  background: "var(--color-forest)",
                  color: "white",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: savingComment ? "not-allowed" : "pointer",
                  whiteSpace: "nowrap",
                  opacity: savingComment ? 0.7 : 1,
                }}
              >
                {savingComment ? "Saving..." : "Save note"}
              </button>
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const COL_COUNT = 9; // checkbox, date, type, name, contact, reason, status, message, actions

export default function AdminFeedbackPage() {
  const router = useRouter();

  const [data, setData] = useState<FeedbackResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters
  const [typeFilter, setTypeFilter] = useState("all");
  const [reasonFilter, setReasonFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Pagination
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  // Selection / expansion
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Modals
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [showBulkStatusModal, setShowBulkStatusModal] = useState(false);
  const [bulkStatusTarget, setBulkStatusTarget] = useState("resolved");

  // Toast
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Header checkbox ref for indeterminate state
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  // ---------------------------------------------------------------------------
  // Load data
  // ---------------------------------------------------------------------------

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      const token = await getAdminToken();
      if (!token) {
        router.push("/admin/login");
        return;
      }
      try {
        const res = await fetch(`${API_URL}/api/admin/feedback`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401) {
          router.push("/admin/login");
          return;
        }
        if (!res.ok) throw new Error("Failed to load feedback");
        const json: FeedbackResponse = await res.json();
        setData(json);
      } catch {
        setError("Could not load feedback. Please refresh.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [router]);

  // ---------------------------------------------------------------------------
  // Toast
  // ---------------------------------------------------------------------------

  function showToast(message: string, type: "success" | "error") {
    setToast({ message, type });
  }

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // ---------------------------------------------------------------------------
  // Filtering / pagination
  // ---------------------------------------------------------------------------

  const filtered = useMemo(() => {
    if (!data) return [];
    let items = data.items;
    if (typeFilter !== "all") items = items.filter((i) => i.feedback_type === typeFilter);
    if (reasonFilter !== "all") items = items.filter((i) => i.reason === reasonFilter);
    if (statusFilter !== "all") items = items.filter((i) => i.status === statusFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      items = items.filter(
        (i) =>
          (i.name ?? "").toLowerCase().includes(q) ||
          (i.contact ?? "").toLowerCase().includes(q) ||
          (i.reason_label ?? "").toLowerCase().includes(q) ||
          (i.other_details ?? "").toLowerCase().includes(q) ||
          (i.message ?? "").toLowerCase().includes(q)
      );
    }
    return items;
  }, [data, typeFilter, reasonFilter, statusFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [typeFilter, reasonFilter, statusFilter, searchQuery]);
  useEffect(() => { setPage((prev) => Math.min(prev, totalPages)); }, [totalPages]);

  const sortedMetrics = useMemo(
    () => (data ? [...data.metrics].sort((a, b) => b.count - a.count).filter((m) => m.count > 0) : []),
    [data]
  );

  const hasFilters = typeFilter !== "all" || reasonFilter !== "all" || statusFilter !== "all" || !!searchQuery;

  function recomputeMetrics(items: FeedbackItem[], template: FeedbackMetric[]): FeedbackMetric[] {
    const nonCustomerCount = items.filter((i) => i.feedback_type === "non_customer").length;
    return template.map((metric) => {
      const count = items.filter(
        (i) => i.feedback_type === "non_customer" && i.reason === metric.reason
      ).length;
      return {
        ...metric,
        count,
        pct: nonCustomerCount > 0 ? Math.round((count / nonCustomerCount) * 100) : 0,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Header checkbox indeterminate state
  // ---------------------------------------------------------------------------

  const allOnPageSelected = paginated.length > 0 && paginated.every((i) => selectedIds.has(i.id));
  const someOnPageSelected = paginated.some((i) => selectedIds.has(i.id));

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someOnPageSelected && !allOnPageSelected;
    }
  }, [someOnPageSelected, allOnPageSelected]);

  function toggleSelectAll() {
    if (allOnPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        paginated.forEach((i) => next.delete(i.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        paginated.forEach((i) => next.add(i.id));
        return next;
      });
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ---------------------------------------------------------------------------
  // API mutation helpers
  // ---------------------------------------------------------------------------

  async function getAuthHeader(): Promise<Record<string, string>> {
    const token = await getAdminToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function handleStatusChange(id: string, status: string): Promise<void> {
    const headers = await getAuthHeader();
    const previousStatus = data?.items.find((i) => i.id === id)?.status;
    // Optimistic update
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map((item) => (item.id === id ? { ...item, status } : item)),
      };
    });
    try {
      const res = await fetch(`${API_URL}/api/admin/feedback/${id}/status`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed");
      showToast("Status updated", "success");
    } catch {
      if (previousStatus) {
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            items: prev.items.map((item) => (item.id === id ? { ...item, status: previousStatus } : item)),
          };
        });
      }
      showToast("Failed to update status", "error");
    }
  }

  async function handleCommentSave(id: string, admin_comment: string | null): Promise<void> {
    const headers = await getAuthHeader();
    try {
      const res = await fetch(`${API_URL}/api/admin/feedback/${id}/comment`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ admin_comment }),
      });
      if (!res.ok) throw new Error("Failed");
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map((item) => (item.id === id ? { ...item, admin_comment } : item)),
        };
      });
      showToast("Note saved", "success");
    } catch {
      showToast("Failed to save note", "error");
    }
  }

  async function handleDelete(id: string) {
    const headers = await getAuthHeader();
    try {
      const res = await fetch(`${API_URL}/api/admin/feedback/${id}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) throw new Error("Failed");
      setData((prev) => {
        if (!prev) return prev;
        const deleted = prev.items.find((i) => i.id === id);
        const nextItems = prev.items.filter((i) => i.id !== id);
        return {
          ...prev,
          items: nextItems,
          total: prev.total - 1,
          customer_count: deleted?.feedback_type === "customer" ? prev.customer_count - 1 : prev.customer_count,
          non_customer_count: deleted?.feedback_type === "non_customer" ? prev.non_customer_count - 1 : prev.non_customer_count,
          general_contact_count: deleted?.feedback_type === "general_contact" ? prev.general_contact_count - 1 : prev.general_contact_count,
          metrics: recomputeMetrics(nextItems, prev.metrics),
        };
      });
      setSelectedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
      if (expandedId === id) setExpandedId(null);
      setDeleteTarget(null);
      showToast("Entry deleted", "success");
    } catch {
      showToast("Failed to delete entry", "error");
    }
  }

  async function handleBulkDelete() {
    const ids = Array.from(selectedIds);
    const headers = await getAuthHeader();
    try {
      const res = await fetch(`${API_URL}/api/admin/feedback/bulk-delete`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error("Failed");
      const idSet = new Set(ids);
      setData((prev) => {
        if (!prev) return prev;
        const deleted = prev.items.filter((i) => idSet.has(i.id));
        const nextItems = prev.items.filter((i) => !idSet.has(i.id));
        return {
          ...prev,
          items: nextItems,
          total: prev.total - deleted.length,
          customer_count: prev.customer_count - deleted.filter((d) => d.feedback_type === "customer").length,
          non_customer_count: prev.non_customer_count - deleted.filter((d) => d.feedback_type === "non_customer").length,
          general_contact_count: prev.general_contact_count - deleted.filter((d) => d.feedback_type === "general_contact").length,
          metrics: recomputeMetrics(nextItems, prev.metrics),
        };
      });
      setSelectedIds(new Set());
      if (expandedId && idSet.has(expandedId)) setExpandedId(null);
      setShowBulkDeleteModal(false);
      showToast(`${ids.length} entr${ids.length === 1 ? "y" : "ies"} deleted`, "success");
    } catch {
      showToast("Failed to delete entries", "error");
    }
  }

  async function handleBulkStatus() {
    const ids = Array.from(selectedIds);
    const headers = await getAuthHeader();
    try {
      const res = await fetch(`${API_URL}/api/admin/feedback/bulk-status`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ ids, status: bulkStatusTarget }),
      });
      if (!res.ok) throw new Error("Failed");
      const idSet = new Set(ids);
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map((item) =>
            idSet.has(item.id) ? { ...item, status: bulkStatusTarget } : item
          ),
        };
      });
      setShowBulkStatusModal(false);
      showToast(`${ids.length} entr${ids.length === 1 ? "y" : "ies"} updated`, "success");
    } catch {
      showToast("Failed to update status", "error");
    }
  }

  // ---------------------------------------------------------------------------
  // Button styles
  // ---------------------------------------------------------------------------

  const btnBase: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 14px",
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    border: "1px solid var(--color-border)",
    background: "white",
    color: "var(--color-text)",
  };

  const btnDanger: React.CSSProperties = {
    ...btnBase,
    border: "1px solid #fecaca",
    background: "#fef2f2",
    color: "#c53030",
  };

  const btnPrimary: React.CSSProperties = {
    ...btnBase,
    border: "none",
    background: "var(--color-forest)",
    color: "white",
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div style={{ padding: "32px 32px 64px", maxWidth: 1200, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: "var(--color-forest)",
            fontFamily: "var(--font-serif)",
            marginBottom: 4,
          }}
        >
          Feedback
        </h1>
        <p style={{ fontSize: 14, color: "var(--color-muted)" }}>
          Pre-order feedback from visitors, contact messages, and post-order feedback from customers.
        </p>
      </div>

      {error && (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 12,
            padding: "12px 16px",
            fontSize: 14,
            color: "#c53030",
            marginBottom: 24,
          }}
        >
          {error}
        </div>
      )}

      {/* Top metric cards */}
      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16, marginBottom: 28 }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} style={{ background: "white", border: "1px solid var(--color-border)", borderRadius: 20, padding: 20 }}>
              <Skeleton w="60%" h={12} />
              <div style={{ marginTop: 12 }}><Skeleton w="40%" h={28} /></div>
            </div>
          ))}
        </div>
      ) : data && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16, marginBottom: 28 }}>
          {/* Total */}
          <div style={{ background: "var(--color-forest)", borderRadius: 20, padding: 20 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: "var(--color-sage)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
              Total Responses
            </p>
            <p style={{ fontSize: 32, fontWeight: 700, color: "var(--color-cream)", fontFamily: "var(--font-serif)", lineHeight: 1 }}>
              {data.total}
            </p>
          </div>

          {/* Customers */}
          <div
            style={{
              background: "white",
              border: `2px solid ${typeFilter === "customer" ? "var(--color-sage)" : "var(--color-border)"}`,
              borderRadius: 20,
              padding: 20,
              cursor: "pointer",
              transition: "border-color 0.15s",
            }}
            onClick={() => setTypeFilter(typeFilter === "customer" ? "all" : "customer")}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                Customers
              </p>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2d6a2d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <p style={{ fontSize: 28, fontWeight: 700, color: "var(--color-forest)", fontFamily: "var(--font-serif)", lineHeight: 1 }}>
              {data.customer_count}
            </p>
            <p style={{ fontSize: 11, color: "var(--color-muted)", marginTop: 6 }}>Post-order feedback</p>
          </div>

          {/* Non-customers */}
          <div
            style={{
              background: "white",
              border: `2px solid ${typeFilter === "non_customer" ? "var(--color-sage)" : "var(--color-border)"}`,
              borderRadius: 20,
              padding: 20,
              cursor: "pointer",
              transition: "border-color 0.15s",
            }}
            onClick={() => setTypeFilter(typeFilter === "non_customer" ? "all" : "non_customer")}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                Non-customers
              </p>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-bark)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <p style={{ fontSize: 28, fontWeight: 700, color: "var(--color-forest)", fontFamily: "var(--font-serif)", lineHeight: 1 }}>
              {data.non_customer_count}
            </p>
            <p style={{ fontSize: 11, color: "var(--color-muted)", marginTop: 6 }}>Pre-order feedback</p>
          </div>

          {/* Contact */}
          <div
            style={{
              background: "white",
              border: `2px solid ${typeFilter === "general_contact" ? "var(--color-sage)" : "var(--color-border)"}`,
              borderRadius: 20,
              padding: 20,
              cursor: "pointer",
              transition: "border-color 0.15s",
            }}
            onClick={() => setTypeFilter(typeFilter === "general_contact" ? "all" : "general_contact")}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                Contact
              </p>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <p style={{ fontSize: 28, fontWeight: 700, color: "var(--color-forest)", fontFamily: "var(--font-serif)", lineHeight: 1 }}>
              {data.general_contact_count}
            </p>
            <p style={{ fontSize: 11, color: "var(--color-muted)", marginTop: 6 }}>Messages and inquiries</p>
          </div>

          {/* Top non-customer reason */}
          {sortedMetrics[0] && (() => {
            const m = sortedMetrics[0];
            const colors = REASON_COLORS[m.reason] ?? { bg: "var(--color-cream)", text: "var(--color-muted)" };
            return (
              <div
                style={{
                  background: "white",
                  border: "1px solid var(--color-border)",
                  borderRadius: 20,
                  padding: 20,
                  cursor: "pointer",
                }}
                onClick={() => setReasonFilter(reasonFilter === m.reason ? "all" : m.reason)}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                    Top Reason
                  </p>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: "999px", background: colors.bg, color: colors.text }}>
                    {m.pct}%
                  </span>
                </div>
                <p style={{ fontSize: 14, fontWeight: 700, color: "var(--color-forest)", lineHeight: 1.3, marginBottom: 6 }}>
                  {m.label}
                </p>
                <p style={{ fontSize: 24, fontWeight: 700, color: "var(--color-forest)", fontFamily: "var(--font-serif)", lineHeight: 1 }}>
                  {m.count}
                </p>
              </div>
            );
          })()}
        </div>
      )}

      {/* Reason breakdown (non-customer only) */}
      {!loading && data && data.non_customer_count > 0 && (
        <div
          style={{
            background: "white",
            border: "1px solid var(--color-border)",
            borderRadius: 20,
            padding: 20,
            marginBottom: 24,
          }}
        >
          <p style={{ fontSize: 12, fontWeight: 600, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>
            Pre-order Reason Breakdown
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {sortedMetrics.map((m) => {
              const colors = REASON_COLORS[m.reason] ?? { bg: "var(--color-cream)", text: "var(--color-muted)" };
              const isActive = reasonFilter === m.reason;
              return (
                <div
                  key={m.reason}
                  style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}
                  onClick={() => setReasonFilter(isActive ? "all" : m.reason)}
                >
                  <div style={{ width: 140, flexShrink: 0, fontSize: 13, color: isActive ? "var(--color-forest)" : "var(--color-text)", fontWeight: isActive ? 600 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {m.label}
                  </div>
                  <div style={{ flex: 1, height: 8, borderRadius: 4, background: "var(--color-cream)", overflow: "hidden" }}>
                    <div
                      style={{
                        height: 8,
                        borderRadius: 4,
                        width: `${m.pct}%`,
                        background: isActive ? "var(--color-forest)" : colors.text,
                        opacity: isActive ? 1 : 0.6,
                        transition: "width 0.4s ease, background 0.15s",
                      }}
                    />
                  </div>
                  <div style={{ width: 36, flexShrink: 0, textAlign: "right", fontSize: 13, fontWeight: 600, color: "var(--color-forest)" }}>
                    {m.count}
                  </div>
                  <div style={{ width: 36, flexShrink: 0, textAlign: "right", fontSize: 12, color: "var(--color-muted)" }}>
                    {m.pct}%
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 220px", minWidth: 0 }}>
          <svg
            width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
            style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--color-muted)", pointerEvents: "none" }}
          >
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Search name, contact, message..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "9px 12px 9px 36px",
              borderRadius: 12,
              border: "1px solid var(--color-border)",
              fontSize: 13,
              color: "var(--color-text)",
              background: "white",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          style={{ padding: "9px 12px", borderRadius: 12, border: "1px solid var(--color-border)", fontSize: 13, color: "var(--color-text)", background: "white", cursor: "pointer", outline: "none" }}
        >
          <option value="all">All types</option>
          <option value="customer">Customer</option>
          <option value="non_customer">Non-customer</option>
          <option value="general_contact">Contact</option>
        </select>

        <select
          value={reasonFilter}
          onChange={(e) => setReasonFilter(e.target.value)}
          style={{ padding: "9px 12px", borderRadius: 12, border: "1px solid var(--color-border)", fontSize: 13, color: "var(--color-text)", background: "white", cursor: "pointer", outline: "none" }}
        >
          <option value="all">All reasons</option>
          <option value="price_too_high">Price too high</option>
          <option value="location_not_convenient">Pickup location not convenient</option>
          <option value="dietary_needs">Food does not meet dietary needs</option>
          <option value="not_available">Not available on the event date</option>
          <option value="different_menu">Prefer a different menu item</option>
          <option value="prefer_delivery">Prefer delivery over pickup</option>
          <option value="not_interested">Not interested at this time</option>
          <option value="catering_inquiry">Catering inquiry</option>
          <option value="previous_order_inquiry">Question about a past order</option>
          <option value="stay_updated">Stay updated on future events</option>
          <option value="general_feedback">General feedback or suggestions</option>
          <option value="other">Other</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ padding: "9px 12px", borderRadius: 12, border: "1px solid var(--color-border)", fontSize: 13, color: "var(--color-text)", background: "white", cursor: "pointer", outline: "none" }}
        >
          <option value="all">All statuses</option>
          <option value="new">New</option>
          <option value="in_progress">In Progress</option>
          <option value="resolved">Resolved</option>
        </select>

        {hasFilters && (
          <button
            onClick={() => { setTypeFilter("all"); setReasonFilter("all"); setStatusFilter("all"); setSearchQuery(""); }}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 12px", borderRadius: 12,
              border: "1px solid var(--color-border)", background: "white",
              fontSize: 13, color: "var(--color-muted)", cursor: "pointer",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            Clear
          </button>
        )}

        {!loading && (
          <span style={{ fontSize: 13, color: "var(--color-muted)", marginLeft: "auto" }}>
            {filtered.length} result{filtered.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 16px",
            background: "#f0f7eb",
            border: "1px solid #c8ddb4",
            borderRadius: 12,
            marginBottom: 12,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-forest)" }}>
            {selectedIds.size} selected
          </span>
          <div style={{ width: 1, height: 20, background: "#c8ddb4" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <select
              value={bulkStatusTarget}
              onChange={(e) => setBulkStatusTarget(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #c8ddb4", fontSize: 13, color: "var(--color-text)", background: "white", cursor: "pointer", outline: "none" }}
            >
              <option value="new">New</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
            </select>
            <button onClick={() => setShowBulkStatusModal(true)} style={btnBase}>
              Mark all as
            </button>
          </div>
          <div style={{ width: 1, height: 20, background: "#c8ddb4" }} />
          <button onClick={() => setShowBulkDeleteModal(true)} style={btnDanger}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
            </svg>
            Delete selected
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            style={{ ...btnBase, marginLeft: "auto" }}
          >
            Clear
          </button>
        </div>
      )}

      {/* Table */}
      <div
        style={{
          background: "white",
          border: "1px solid var(--color-border)",
          borderRadius: 20,
          overflow: "hidden",
        }}
      >
        {loading ? (
          <div style={{ padding: 32, display: "flex", flexDirection: "column", gap: 16 }}>
            {[...Array(5)].map((_, i) => <Skeleton key={i} h={20} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center" }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-border)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 12px" }}>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <p style={{ fontSize: 15, fontWeight: 600, color: "var(--color-forest)", marginBottom: 4 }}>No feedback yet</p>
            <p style={{ fontSize: 13, color: "var(--color-muted)" }}>
              {hasFilters ? "No results match your filters." : "Feedback from visitors and customers will appear here."}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-cream)" }}>
                  {/* Checkbox */}
                  <th style={{ padding: "11px 12px 11px 16px", width: 36 }}>
                    <input
                      ref={headerCheckboxRef}
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={toggleSelectAll}
                      style={{ cursor: "pointer" }}
                    />
                  </th>
                  {["Date", "Type", "Name", "Contact", "Reason", "Status", "Message / Details", ""].map((col) => (
                    <th
                      key={col}
                      style={{
                        textAlign: "left",
                        padding: "11px 16px",
                        fontSize: 11,
                        fontWeight: 600,
                        color: "var(--color-muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.07em",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.map((item, idx) => {
                  const isExpanded = expandedId === item.id;
                  const isLast = idx === paginated.length - 1;
                  return (
                    <Fragment key={item.id}>
                      <tr
                        onClick={() => setExpandedId(isExpanded ? null : item.id)}
                        style={{
                          borderBottom: (!isExpanded && !isLast) ? "1px solid var(--color-border)" : isExpanded ? "none" : "none",
                          background: isExpanded ? "#fafaf9" : "white",
                          cursor: "pointer",
                          transition: "background 0.1s",
                        }}
                      >
                        {/* Checkbox */}
                        <td
                          style={{ padding: "13px 12px 13px 16px", verticalAlign: "top" }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={selectedIds.has(item.id)}
                            onChange={() => toggleSelect(item.id)}
                            style={{ cursor: "pointer" }}
                          />
                        </td>

                        {/* Date */}
                        <td style={{ padding: "13px 16px", whiteSpace: "nowrap", verticalAlign: "top" }}>
                          <div style={{ fontWeight: 500, color: "var(--color-text)" }}>{formatDate(item.created_at)}</div>
                          <div style={{ fontSize: 11, color: "var(--color-muted)", marginTop: 2 }}>{formatTime(item.created_at)}</div>
                        </td>

                        {/* Type */}
                        <td style={{ padding: "13px 16px", whiteSpace: "nowrap", verticalAlign: "top" }}>
                          <TypeBadge type={item.feedback_type} />
                        </td>

                        {/* Name */}
                        <td style={{ padding: "13px 16px", whiteSpace: "nowrap", verticalAlign: "top" }}>
                          {item.name ? (
                            <span style={{ fontWeight: 500, color: "var(--color-text)" }}>{item.name}</span>
                          ) : (
                            <span style={{ color: "var(--color-muted)", fontStyle: "italic" }}>Anonymous</span>
                          )}
                        </td>

                        {/* Contact */}
                        <td style={{ padding: "13px 16px", whiteSpace: "nowrap", verticalAlign: "top" }}>
                          {item.contact ? (
                            <span style={{ fontSize: 13, color: "var(--color-text)" }}>{item.contact}</span>
                          ) : (
                            <span style={{ color: "var(--color-border)" }}>-</span>
                          )}
                        </td>

                        {/* Reason */}
                        <td style={{ padding: "13px 16px", verticalAlign: "top" }}>
                          {item.reason && item.reason_label ? (
                            <ReasonBadge reason={item.reason} label={item.reason_label} />
                          ) : (
                            <span style={{ color: "var(--color-border)" }}>-</span>
                          )}
                        </td>

                        {/* Status */}
                        <td style={{ padding: "13px 16px", verticalAlign: "top", whiteSpace: "nowrap" }}>
                          <StatusBadge status={item.status} />
                        </td>

                        {/* Message / Details */}
                        <td style={{ padding: "13px 16px", color: "var(--color-text)", maxWidth: 280, verticalAlign: "top" }}>
                          {item.message ? (
                            <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{item.message}</span>
                          ) : item.other_details ? (
                            <span style={{ color: "var(--color-muted)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{item.other_details}</span>
                          ) : (
                            <span style={{ color: "var(--color-border)" }}>-</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td
                          style={{ padding: "13px 16px", verticalAlign: "top", whiteSpace: "nowrap" }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => setDeleteTarget(item.id)}
                            title="Delete"
                            style={{
                              padding: "5px 8px",
                              borderRadius: 8,
                              border: "1px solid var(--color-border)",
                              background: "white",
                              cursor: "pointer",
                              color: "var(--color-muted)",
                              display: "inline-flex",
                              alignItems: "center",
                            }}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
                            </svg>
                          </button>
                        </td>
                      </tr>

                      {/* Expanded detail row */}
                      {isExpanded && (
                        <ExpandedRow
                          key={`expanded-${item.id}`}
                          item={item}
                          colSpan={COL_COUNT}
                          onStatusChange={handleStatusChange}
                          onCommentSave={handleCommentSave}
                        />
                      )}

                      {/* Row separator after expanded content */}
                      {(isExpanded && !isLast) && (
                        <tr key={`sep-${item.id}`}>
                          <td colSpan={COL_COUNT} style={{ padding: 0, borderBottom: "1px solid var(--color-border)" }} />
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 16 }}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{
              padding: "7px 14px", borderRadius: 10, border: "1px solid var(--color-border)",
              background: "white", fontSize: 13, color: page === 1 ? "var(--color-border)" : "var(--color-text)",
              cursor: page === 1 ? "not-allowed" : "pointer",
            }}
          >
            Previous
          </button>
          <span style={{ fontSize: 13, color: "var(--color-muted)" }}>
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={{
              padding: "7px 14px", borderRadius: 10, border: "1px solid var(--color-border)",
              background: "white", fontSize: 13, color: page === totalPages ? "var(--color-border)" : "var(--color-text)",
              cursor: page === totalPages ? "not-allowed" : "pointer",
            }}
          >
            Next
          </button>
        </div>
      )}

      {/* Single delete modal */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete feedback entry"
        variant="danger"
        actions={
          <>
            <button onClick={() => setDeleteTarget(null)} style={btnBase}>Cancel</button>
            <button onClick={() => deleteTarget && handleDelete(deleteTarget)} style={btnDanger}>Delete</button>
          </>
        }
      >
        This feedback entry will be permanently deleted. This action cannot be undone.
      </Modal>

      {/* Bulk delete modal */}
      <Modal
        isOpen={showBulkDeleteModal}
        onClose={() => setShowBulkDeleteModal(false)}
        title={`Delete ${selectedIds.size} entr${selectedIds.size === 1 ? "y" : "ies"}`}
        variant="danger"
        actions={
          <>
            <button onClick={() => setShowBulkDeleteModal(false)} style={btnBase}>Cancel</button>
            <button onClick={handleBulkDelete} style={btnDanger}>Delete all</button>
          </>
        }
      >
        {selectedIds.size} feedback {selectedIds.size === 1 ? "entry" : "entries"} will be permanently deleted. This action cannot be undone.
      </Modal>

      {/* Bulk status modal */}
      <Modal
        isOpen={showBulkStatusModal}
        onClose={() => setShowBulkStatusModal(false)}
        title={`Update ${selectedIds.size} entr${selectedIds.size === 1 ? "y" : "ies"}`}
        actions={
          <>
            <button onClick={() => setShowBulkStatusModal(false)} style={btnBase}>Cancel</button>
            <button onClick={handleBulkStatus} style={btnPrimary}>Apply</button>
          </>
        }
      >
        Mark {selectedIds.size} selected {selectedIds.size === 1 ? "entry" : "entries"} as{" "}
        <strong>{bulkStatusTarget === "in_progress" ? "In Progress" : bulkStatusTarget === "resolved" ? "Resolved" : "New"}</strong>?
      </Modal>

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 200,
            padding: "12px 20px",
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 500,
            color: "white",
            background: toast.type === "success" ? "var(--color-forest)" : "#c53030",
            boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
            transition: "opacity 0.2s",
          }}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
