"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { API_URL } from "@/config/event";
import Modal from "@/components/ui/Modal";
import { getAdminToken } from "@/lib/auth";
import {
  CATERING_BUDGET_RANGES,
  CATERING_EVENT_TYPES,
  getCateringBudgetRangeLabel,
  getCateringEventTypeLabel,
} from "@/lib/cateringRequestOptions";

type CateringRequestStatus = "new" | "in_review" | "in_progress" | "rejected" | "done";

interface CateringRequestComment {
  id: string;
  body: string;
  created_at: string | null;
}

interface CateringRequestItem {
  id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  phone_number: string | null;
  event_date: string;
  guest_count: number;
  event_type: string;
  budget_range: string | null;
  special_requests: string | null;
  status: CateringRequestStatus;
  created_at: string | null;
  comments: CateringRequestComment[];
}

interface CateringRequestsResponse {
  total: number;
  status_counts: Record<CateringRequestStatus, number>;
  items: CateringRequestItem[];
}

const STATUS_OPTIONS: Array<{ value: CateringRequestStatus; label: string }> = [
  { value: "new", label: "New" },
  { value: "in_review", label: "In Review" },
  { value: "in_progress", label: "In Progress" },
  { value: "rejected", label: "Rejected" },
  { value: "done", label: "Done" },
];

const PAGE_SIZE = 15;
const COL_COUNT = 11;

function formatCreatedDate(iso: string | null): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatCreatedTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-CA", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatEventDate(value: string): string {
  const parts = value.split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return value;
  const [year, month, day] = parts;
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function buildStatusCounts(items: CateringRequestItem[]): Record<CateringRequestStatus, number> {
  return {
    new: items.filter((item) => item.status === "new").length,
    in_review: items.filter((item) => item.status === "in_review").length,
    in_progress: items.filter((item) => item.status === "in_progress").length,
    rejected: items.filter((item) => item.status === "rejected").length,
    done: items.filter((item) => item.status === "done").length,
  };
}

function getStatusLabel(status: CateringRequestStatus): string {
  return STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

function StatusBadge({ status }: { status: CateringRequestStatus }) {
  const styles: Record<CateringRequestStatus, { bg: string; text: string; border: string }> = {
    new: { bg: "#f3f4f6", text: "#374151", border: "1px solid #e5e7eb" },
    in_review: { bg: "#eff6ff", text: "#1d4ed8", border: "1px solid #bfdbfe" },
    in_progress: { bg: "#fffbeb", text: "#92400e", border: "1px solid #fde68a" },
    rejected: { bg: "#fef2f2", text: "#b91c1c", border: "1px solid #fecaca" },
    done: { bg: "#f0fdf4", text: "#166534", border: "1px solid #bbf7d0" },
  };
  const style = styles[status];

  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: "999px",
        fontSize: "12px",
        fontWeight: 600,
        background: style.bg,
        color: style.text,
        border: style.border,
        whiteSpace: "nowrap",
      }}
    >
      {getStatusLabel(status)}
    </span>
  );
}

function EventTypeBadge({ eventType }: { eventType: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: "999px",
        fontSize: "12px",
        fontWeight: 600,
        background: "#eff6ff",
        color: "#1d4ed8",
        border: "1px solid #bfdbfe",
        whiteSpace: "nowrap",
      }}
    >
      {getCateringEventTypeLabel(eventType)}
    </span>
  );
}

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

function ExpandedRow({
  item,
  colSpan,
  onStatusChange,
  onCommentAdd,
}: {
  item: CateringRequestItem;
  colSpan: number;
  onStatusChange: (id: string, status: CateringRequestStatus) => Promise<void>;
  onCommentAdd: (id: string, comment: string) => Promise<void>;
}) {
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [savingComment, setSavingComment] = useState(false);

  async function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const nextStatus = e.target.value as CateringRequestStatus;
    setUpdatingStatus(true);
    try {
      await onStatusChange(item.id, nextStatus);
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function handleAddComment() {
    const trimmed = commentText.trim();
    if (!trimmed) return;

    setSavingComment(true);
    try {
      await onCommentAdd(item.id, trimmed);
      setCommentText("");
    } catch {
      // Parent handler already shows the failure toast.
    } finally {
      setSavingComment(false);
    }
  }

  return (
    <tr>
      <td
        colSpan={colSpan}
        style={{
          padding: "18px 20px",
          background: "#fafaf9",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 20,
            alignItems: "flex-start",
          }}
        >
          <div>
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--color-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 8,
              }}
            >
              Requester
            </p>
            <p style={{ fontSize: 14, fontWeight: 600, color: "var(--color-forest)", marginBottom: 4 }}>
              {item.full_name}
            </p>
            <p style={{ fontSize: 12, color: "var(--color-muted)" }}>
              Submitted {formatCreatedDate(item.created_at)} at {formatCreatedTime(item.created_at) || "-"}
            </p>
          </div>

          <div>
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--color-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 8,
              }}
            >
              Contact
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <a
                href={`mailto:${item.email}`}
                style={{ fontSize: 13, color: "var(--color-forest)", textDecoration: "none" }}
              >
                {item.email}
              </a>
              {item.phone_number ? (
                <a
                  href={`tel:${item.phone_number}`}
                  style={{ fontSize: 13, color: "var(--color-text)", textDecoration: "none" }}
                >
                  {item.phone_number}
                </a>
              ) : (
                <span style={{ fontSize: 13, color: "var(--color-muted)" }}>No phone number provided</span>
              )}
            </div>
          </div>

          <div>
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--color-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 8,
              }}
            >
              Event Details
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "var(--color-text)" }}>
              <span>Date: {formatEventDate(item.event_date)}</span>
              <span>Type: {getCateringEventTypeLabel(item.event_type)}</span>
              <span>Guests: {item.guest_count}</span>
              <span>Budget: {getCateringBudgetRangeLabel(item.budget_range)}</span>
            </div>
          </div>

          <div>
            <label
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--color-muted)",
                display: "block",
                marginBottom: 8,
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
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--color-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 8,
              }}
            >
              Special Requests
            </p>
            <div
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                border: "1px solid var(--color-border)",
                background: "white",
                fontSize: 13,
                color: item.special_requests ? "var(--color-text)" : "var(--color-muted)",
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
              }}
            >
              {item.special_requests || "No special requests provided."}
            </div>
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--color-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: 8,
              }}
            >
              Posted Comments
            </p>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                padding: 14,
                borderRadius: 12,
                border: "1px solid var(--color-border)",
                background: "white",
              }}
            >
              {item.comments.length === 0 ? (
                <span style={{ fontSize: 13, color: "var(--color-muted)" }}>No comments posted yet.</span>
              ) : (
                item.comments.map((comment) => (
                  <div
                    key={comment.id}
                    style={{
                      paddingBottom: 10,
                      borderBottom: "1px solid var(--color-cream)",
                    }}
                  >
                    <div style={{ fontSize: 11, color: "var(--color-muted)", marginBottom: 4 }}>
                      {formatCreatedDate(comment.created_at)} {formatCreatedTime(comment.created_at)}
                    </div>
                    <div style={{ fontSize: 13, color: "var(--color-text)", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                      {comment.body}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <label
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--color-muted)",
                display: "block",
                marginBottom: 8,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Add New Comment
            </label>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Add an internal comment..."
                rows={3}
                style={{
                  flex: 1,
                  padding: "10px 12px",
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
                onClick={handleAddComment}
                disabled={savingComment || !commentText.trim()}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "none",
                  background: "var(--color-forest)",
                  color: "white",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: savingComment || !commentText.trim() ? "not-allowed" : "pointer",
                  whiteSpace: "nowrap",
                  opacity: savingComment || !commentText.trim() ? 0.7 : 1,
                }}
              >
                {savingComment ? "Posting..." : "Post comment"}
              </button>
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

export default function AdminCateringRequestsPage() {
  const router = useRouter();

  const [data, setData] = useState<CateringRequestsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState("all");
  const [budgetFilter, setBudgetFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [showBulkStatusModal, setShowBulkStatusModal] = useState(false);
  const [bulkStatusTarget, setBulkStatusTarget] = useState<CateringRequestStatus>("in_review");

  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const headerCheckboxRef = useRef<HTMLInputElement>(null);

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
        const res = await fetch(`${API_URL}/api/admin/catering-requests`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401) {
          router.push("/admin/login");
          return;
        }
        if (!res.ok) throw new Error("Failed to load catering requests");
        const json: CateringRequestsResponse = await res.json();
        setData(json);
      } catch {
        setError("Could not load catering requests. Please refresh.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [router]);

  function showToast(message: string, type: "success" | "error") {
    setToast({ message, type });
  }

  useEffect(() => {
    if (!toast) return;
    const timeoutId = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timeoutId);
  }, [toast]);

  const filtered = useMemo(() => {
    if (!data) return [];

    let items = data.items;

    if (eventTypeFilter !== "all") {
      items = items.filter((item) => item.event_type === eventTypeFilter);
    }
    if (budgetFilter !== "all") {
      items = items.filter((item) => item.budget_range === budgetFilter);
    }
    if (statusFilter !== "all") {
      items = items.filter((item) => item.status === statusFilter);
    }
    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase();
      items = items.filter((item) => {
        const eventTypeLabel = getCateringEventTypeLabel(item.event_type).toLowerCase();
        const budgetLabel = getCateringBudgetRangeLabel(item.budget_range).toLowerCase();
        const commentText = item.comments.map((comment) => comment.body).join(" ").toLowerCase();
        return (
          item.full_name.toLowerCase().includes(query) ||
          item.email.toLowerCase().includes(query) ||
          (item.phone_number ?? "").toLowerCase().includes(query) ||
          eventTypeLabel.includes(query) ||
          budgetLabel.includes(query) ||
          (item.special_requests ?? "").toLowerCase().includes(query) ||
          commentText.includes(query)
        );
      });
    }

    return items;
  }, [budgetFilter, data, eventTypeFilter, searchQuery, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, eventTypeFilter, budgetFilter, statusFilter]);

  useEffect(() => {
    setPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const averageGuests = useMemo(() => {
    if (!data || data.items.length === 0) return 0;
    const totalGuests = data.items.reduce((sum, item) => sum + item.guest_count, 0);
    return Math.round(totalGuests / data.items.length);
  }, [data]);

  const hasFilters =
    eventTypeFilter !== "all" ||
    budgetFilter !== "all" ||
    statusFilter !== "all" ||
    !!searchQuery.trim();

  const allOnPageSelected = paginated.length > 0 && paginated.every((item) => selectedIds.has(item.id));
  const someOnPageSelected = paginated.some((item) => selectedIds.has(item.id));

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someOnPageSelected && !allOnPageSelected;
    }
  }, [allOnPageSelected, someOnPageSelected]);

  function toggleSelectAll() {
    if (allOnPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        paginated.forEach((item) => next.delete(item.id));
        return next;
      });
      return;
    }

    setSelectedIds((prev) => {
      const next = new Set(prev);
      paginated.forEach((item) => next.add(item.id));
      return next;
    });
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function rebuildData(previous: CateringRequestsResponse, items: CateringRequestItem[]): CateringRequestsResponse {
    return {
      ...previous,
      total: items.length,
      status_counts: buildStatusCounts(items),
      items,
    };
  }

  async function getAuthHeader(): Promise<Record<string, string>> {
    const token = await getAdminToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function handleStatusChange(id: string, status: CateringRequestStatus): Promise<void> {
    const headers = await getAuthHeader();
    const previousStatus = data?.items.find((item) => item.id === id)?.status;

    setData((prev) => {
      if (!prev) return prev;
      const nextItems = prev.items.map((item) => (item.id === id ? { ...item, status } : item));
      return rebuildData(prev, nextItems);
    });

    try {
      const res = await fetch(`${API_URL}/api/admin/catering-requests/${id}/status`, {
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
          const nextItems = prev.items.map((item) => (
            item.id === id ? { ...item, status: previousStatus } : item
          ));
          return rebuildData(prev, nextItems);
        });
      }
      showToast("Failed to update status", "error");
    }
  }

  async function handleCommentAdd(id: string, comment: string): Promise<void> {
    const headers = await getAuthHeader();

    try {
      const res = await fetch(`${API_URL}/api/admin/catering-requests/${id}/comments`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ comment }),
      });
      if (!res.ok) throw new Error("Failed");

      const json: { success: boolean; comment: CateringRequestComment } = await res.json();
      setData((prev) => {
        if (!prev) return prev;
        const nextItems = prev.items.map((item) => (
          item.id === id
            ? { ...item, comments: [json.comment, ...item.comments] }
            : item
        ));
        return rebuildData(prev, nextItems);
      });
      showToast("Comment posted", "success");
    } catch {
      showToast("Failed to post comment", "error");
      throw new Error("Failed to post comment");
    }
  }

  async function handleDelete(id: string) {
    const headers = await getAuthHeader();

    try {
      const res = await fetch(`${API_URL}/api/admin/catering-requests/${id}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) throw new Error("Failed");

      setData((prev) => {
        if (!prev) return prev;
        const nextItems = prev.items.filter((item) => item.id !== id);
        return rebuildData(prev, nextItems);
      });
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      if (expandedId === id) setExpandedId(null);
      setDeleteTarget(null);
      showToast("Request deleted", "success");
    } catch {
      showToast("Failed to delete request", "error");
    }
  }

  async function handleBulkDelete() {
    const ids = Array.from(selectedIds);
    const headers = await getAuthHeader();

    try {
      const res = await fetch(`${API_URL}/api/admin/catering-requests/bulk-delete`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error("Failed");

      const idSet = new Set(ids);
      setData((prev) => {
        if (!prev) return prev;
        const nextItems = prev.items.filter((item) => !idSet.has(item.id));
        return rebuildData(prev, nextItems);
      });
      setSelectedIds(new Set());
      if (expandedId && idSet.has(expandedId)) setExpandedId(null);
      setShowBulkDeleteModal(false);
      showToast(`${ids.length} request${ids.length === 1 ? "" : "s"} deleted`, "success");
    } catch {
      showToast("Failed to delete requests", "error");
    }
  }

  async function handleBulkStatus() {
    const ids = Array.from(selectedIds);
    const headers = await getAuthHeader();

    try {
      const res = await fetch(`${API_URL}/api/admin/catering-requests/bulk-status`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ ids, status: bulkStatusTarget }),
      });
      if (!res.ok) throw new Error("Failed");

      const idSet = new Set(ids);
      setData((prev) => {
        if (!prev) return prev;
        const nextItems = prev.items.map((item) => (
          idSet.has(item.id) ? { ...item, status: bulkStatusTarget } : item
        ));
        return rebuildData(prev, nextItems);
      });
      setShowBulkStatusModal(false);
      showToast(`${ids.length} request${ids.length === 1 ? "" : "s"} updated`, "success");
    } catch {
      showToast("Failed to update requests", "error");
    }
  }

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

  return (
    <div style={{ padding: "32px 32px 64px", maxWidth: 1320, margin: "0 auto" }}>
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
          Catering Requests
        </h1>
        <p style={{ fontSize: 14, color: "var(--color-muted)" }}>
          Quote inquiries submitted from the public catering request form, including internal comment history.
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

      {loading ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 16,
            marginBottom: 28,
          }}
        >
          {[...Array(7)].map((_, idx) => (
            <div
              key={idx}
              style={{
                background: "white",
                border: "1px solid var(--color-border)",
                borderRadius: 20,
                padding: 20,
              }}
            >
              <Skeleton w="60%" h={12} />
              <div style={{ marginTop: 12 }}>
                <Skeleton w="40%" h={28} />
              </div>
            </div>
          ))}
        </div>
      ) : data && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 16,
            marginBottom: 28,
          }}
        >
          <div style={{ background: "var(--color-forest)", borderRadius: 20, padding: 20 }}>
            <p
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--color-sage)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 8,
              }}
            >
              Total Requests
            </p>
            <p
              style={{
                fontSize: 32,
                fontWeight: 700,
                color: "var(--color-cream)",
                fontFamily: "var(--font-serif)",
                lineHeight: 1,
              }}
            >
              {data.total}
            </p>
          </div>

          {STATUS_OPTIONS.map((option) => {
            const isActive = statusFilter === option.value;
            return (
              <div
                key={option.value}
                style={{
                  background: "white",
                  border: `2px solid ${isActive ? "var(--color-sage)" : "var(--color-border)"}`,
                  borderRadius: 20,
                  padding: 20,
                  cursor: "pointer",
                  transition: "border-color 0.15s",
                }}
                onClick={() => setStatusFilter(isActive ? "all" : option.value)}
              >
                <p
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--color-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.07em",
                    marginBottom: 8,
                  }}
                >
                  {option.label}
                </p>
                <p
                  style={{
                    fontSize: 28,
                    fontWeight: 700,
                    color: "var(--color-forest)",
                    fontFamily: "var(--font-serif)",
                    lineHeight: 1,
                  }}
                >
                  {data.status_counts[option.value]}
                </p>
                <p style={{ fontSize: 11, color: "var(--color-muted)", marginTop: 6 }}>
                  Click to filter
                </p>
              </div>
            );
          })}

          <div
            style={{
              background: "white",
              border: "1px solid var(--color-border)",
              borderRadius: 20,
              padding: 20,
            }}
          >
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--color-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.07em",
                marginBottom: 8,
              }}
            >
              Average Guests
            </p>
            <p
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: "var(--color-forest)",
                fontFamily: "var(--font-serif)",
                lineHeight: 1,
              }}
            >
              {averageGuests}
            </p>
            <p style={{ fontSize: 11, color: "var(--color-muted)", marginTop: 6 }}>
              Rounded across all requests
            </p>
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 240px", minWidth: 0 }}>
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              position: "absolute",
              left: 12,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--color-muted)",
              pointerEvents: "none",
            }}
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Search name, contact, type, budget, requests, comments..."
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
          value={eventTypeFilter}
          onChange={(e) => setEventTypeFilter(e.target.value)}
          style={{
            padding: "9px 12px",
            borderRadius: 12,
            border: "1px solid var(--color-border)",
            fontSize: 13,
            color: "var(--color-text)",
            background: "white",
            cursor: "pointer",
            outline: "none",
          }}
        >
          <option value="all">All event types</option>
          {CATERING_EVENT_TYPES.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>

        <select
          value={budgetFilter}
          onChange={(e) => setBudgetFilter(e.target.value)}
          style={{
            padding: "9px 12px",
            borderRadius: 12,
            border: "1px solid var(--color-border)",
            fontSize: 13,
            color: "var(--color-text)",
            background: "white",
            cursor: "pointer",
            outline: "none",
          }}
        >
          <option value="all">All budgets</option>
          {CATERING_BUDGET_RANGES.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            padding: "9px 12px",
            borderRadius: 12,
            border: "1px solid var(--color-border)",
            fontSize: 13,
            color: "var(--color-text)",
            background: "white",
            cursor: "pointer",
            outline: "none",
          }}
        >
          <option value="all">All statuses</option>
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {hasFilters && (
          <button
            onClick={() => {
              setSearchQuery("");
              setEventTypeFilter("all");
              setBudgetFilter("all");
              setStatusFilter("all");
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 12px",
              borderRadius: 12,
              border: "1px solid var(--color-border)",
              background: "white",
              fontSize: 13,
              color: "var(--color-muted)",
              cursor: "pointer",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            Clear
          </button>
        )}

        {!loading && (
          <span style={{ fontSize: 13, color: "var(--color-muted)", marginLeft: "auto" }}>
            {filtered.length} result{filtered.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

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
              onChange={(e) => setBulkStatusTarget(e.target.value as CateringRequestStatus)}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid #c8ddb4",
                fontSize: 13,
                color: "var(--color-text)",
                background: "white",
                cursor: "pointer",
                outline: "none",
              }}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button onClick={() => setShowBulkStatusModal(true)} style={btnBase}>
              Mark all as
            </button>
          </div>
          <div style={{ width: 1, height: 20, background: "#c8ddb4" }} />
          <button onClick={() => setShowBulkDeleteModal(true)} style={btnDanger}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14H6L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4h6v2" />
            </svg>
            Delete selected
          </button>
          <button onClick={() => setSelectedIds(new Set())} style={{ ...btnBase, marginLeft: "auto" }}>
            Clear
          </button>
        </div>
      )}

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
            {[...Array(5)].map((_, idx) => (
              <Skeleton key={idx} h={20} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center" }}>
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-border)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ margin: "0 auto 12px" }}
            >
              <path d="M8 3v9" />
              <path d="M12 3v9" />
              <path d="M10 12v9" />
              <path d="M17 3v18" />
              <path d="M17 8a4 4 0 0 0 0-5" />
              <path d="M6 3v5a2 2 0 0 0 4 0V3" />
            </svg>
            <p style={{ fontSize: 15, fontWeight: 600, color: "var(--color-forest)", marginBottom: 4 }}>
              No catering requests yet
            </p>
            <p style={{ fontSize: 13, color: "var(--color-muted)" }}>
              {hasFilters ? "No results match your filters." : "New catering inquiries will appear here."}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-cream)" }}>
                  <th style={{ padding: "11px 12px 11px 16px", width: 36 }}>
                    <input
                      ref={headerCheckboxRef}
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={toggleSelectAll}
                      style={{ cursor: "pointer" }}
                    />
                  </th>
                  {[
                    "Submitted",
                    "Requester",
                    "Contact",
                    "Event Date",
                    "Event Type",
                    "Guests",
                    "Budget",
                    "Status",
                    "Special Requests",
                    "",
                  ].map((column) => (
                    <th
                      key={column}
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
                      {column}
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
                          borderBottom: !isExpanded && !isLast ? "1px solid var(--color-border)" : "none",
                          background: isExpanded ? "#fafaf9" : "white",
                          cursor: "pointer",
                          transition: "background 0.1s",
                        }}
                      >
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

                        <td style={{ padding: "13px 16px", whiteSpace: "nowrap", verticalAlign: "top" }}>
                          <div style={{ fontWeight: 500, color: "var(--color-text)" }}>
                            {formatCreatedDate(item.created_at)}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--color-muted)", marginTop: 2 }}>
                            {formatCreatedTime(item.created_at)}
                          </div>
                        </td>

                        <td style={{ padding: "13px 16px", whiteSpace: "nowrap", verticalAlign: "top" }}>
                          <span style={{ fontWeight: 500, color: "var(--color-text)" }}>{item.full_name}</span>
                        </td>

                        <td style={{ padding: "13px 16px", verticalAlign: "top", minWidth: 220 }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <span style={{ color: "var(--color-text)" }}>{item.email}</span>
                            {item.phone_number ? (
                              <span style={{ color: "var(--color-muted)" }}>{item.phone_number}</span>
                            ) : (
                              <span style={{ color: "var(--color-border)" }}>No phone</span>
                            )}
                          </div>
                        </td>

                        <td style={{ padding: "13px 16px", whiteSpace: "nowrap", verticalAlign: "top" }}>
                          <span style={{ color: "var(--color-text)" }}>{formatEventDate(item.event_date)}</span>
                        </td>

                        <td style={{ padding: "13px 16px", whiteSpace: "nowrap", verticalAlign: "top" }}>
                          <EventTypeBadge eventType={item.event_type} />
                        </td>

                        <td style={{ padding: "13px 16px", whiteSpace: "nowrap", verticalAlign: "top" }}>
                          <span style={{ color: "var(--color-text)", fontWeight: 500 }}>{item.guest_count}</span>
                        </td>

                        <td style={{ padding: "13px 16px", verticalAlign: "top", minWidth: 150 }}>
                          <span style={{ color: item.budget_range ? "var(--color-text)" : "var(--color-muted)" }}>
                            {getCateringBudgetRangeLabel(item.budget_range)}
                          </span>
                        </td>

                        <td style={{ padding: "13px 16px", verticalAlign: "top", whiteSpace: "nowrap" }}>
                          <StatusBadge status={item.status} />
                        </td>

                        <td style={{ padding: "13px 16px", color: "var(--color-text)", maxWidth: 280, verticalAlign: "top" }}>
                          {item.special_requests ? (
                            <span
                              style={{
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                              }}
                            >
                              {item.special_requests}
                            </span>
                          ) : (
                            <span style={{ color: "var(--color-border)" }}>No special requests</span>
                          )}
                        </td>

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
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6l-1 14H6L5 6" />
                              <path d="M10 11v6M14 11v6" />
                              <path d="M9 6V4h6v2" />
                            </svg>
                          </button>
                        </td>
                      </tr>

                      {isExpanded && (
                        <ExpandedRow
                          key={`expanded-${item.id}`}
                          item={item}
                          colSpan={COL_COUNT}
                          onStatusChange={handleStatusChange}
                          onCommentAdd={handleCommentAdd}
                        />
                      )}

                      {isExpanded && !isLast && (
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

      {!loading && totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 16 }}>
          <button
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={page === 1}
            style={{
              padding: "7px 14px",
              borderRadius: 10,
              border: "1px solid var(--color-border)",
              background: "white",
              fontSize: 13,
              color: page === 1 ? "var(--color-border)" : "var(--color-text)",
              cursor: page === 1 ? "not-allowed" : "pointer",
            }}
          >
            Previous
          </button>
          <span style={{ fontSize: 13, color: "var(--color-muted)" }}>
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={page === totalPages}
            style={{
              padding: "7px 14px",
              borderRadius: 10,
              border: "1px solid var(--color-border)",
              background: "white",
              fontSize: 13,
              color: page === totalPages ? "var(--color-border)" : "var(--color-text)",
              cursor: page === totalPages ? "not-allowed" : "pointer",
            }}
          >
            Next
          </button>
        </div>
      )}

      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete catering request"
        variant="danger"
        actions={
          <>
            <button onClick={() => setDeleteTarget(null)} style={btnBase}>Cancel</button>
            <button onClick={() => deleteTarget && handleDelete(deleteTarget)} style={btnDanger}>Delete</button>
          </>
        }
      >
        This catering request and its internal comments will be permanently deleted. This action cannot be undone.
      </Modal>

      <Modal
        isOpen={showBulkDeleteModal}
        onClose={() => setShowBulkDeleteModal(false)}
        title={`Delete ${selectedIds.size} request${selectedIds.size === 1 ? "" : "s"}`}
        variant="danger"
        actions={
          <>
            <button onClick={() => setShowBulkDeleteModal(false)} style={btnBase}>Cancel</button>
            <button onClick={handleBulkDelete} style={btnDanger}>Delete all</button>
          </>
        }
      >
        {selectedIds.size} catering request{selectedIds.size === 1 ? "" : "s"} and all related comments will be permanently deleted. This action cannot be undone.
      </Modal>

      <Modal
        isOpen={showBulkStatusModal}
        onClose={() => setShowBulkStatusModal(false)}
        title={`Update ${selectedIds.size} request${selectedIds.size === 1 ? "" : "s"}`}
        actions={
          <>
            <button onClick={() => setShowBulkStatusModal(false)} style={btnBase}>Cancel</button>
            <button onClick={handleBulkStatus} style={btnPrimary}>Apply</button>
          </>
        }
      >
        Mark {selectedIds.size} selected request{selectedIds.size === 1 ? "" : "s"} as{" "}
        <strong>{getStatusLabel(bulkStatusTarget)}</strong>?
      </Modal>

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
          }}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
