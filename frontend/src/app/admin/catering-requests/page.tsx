"use client";

import { Fragment, useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { API_URL } from "@/config/event";
import { CompactMetricCard, CompactMetricRail, CompactMetricSkeletonRail, CompactMetricTotalCard } from "@/components/admin/CompactMetricRail";
import { AdminBulkTableFrame, AdminClearFiltersButton, AdminDateCell, AdminDeleteIconButton, AdminPagination, AdminRowCheckboxCell, AdminSearchInput, AdminSelectableTable, AdminTableEmptyState, buildAdminBulkStatusProps } from "@/components/admin/AdminCrudParts";
import Modal from "@/components/ui/Modal";
import { usePendingStatusChange } from "@/hooks/usePendingStatusChange";
import { useObjectState } from "@/hooks/useObjectState";
import { usePageSelection } from "@/hooks/usePageSelection";
import { useAdminToast } from "@/hooks/useAdminToast";
import { loadAuthenticatedAdminResource } from "@/lib/adminCrud";
import { filterAdminItemsBySearch } from "@/lib/adminSearch";
import { getAdminToken } from "@/lib/auth";
import {
  postAdminBulkDelete,
  postAdminBulkStatus,
  removeItemsByIds,
  removeSelectedIds,
  runAdminBulkAction,
  updateItemStatuses,
} from "@/lib/adminBulk";
import {
  ADMIN_BUTTON_BASE_STYLE,
  ADMIN_BUTTON_DANGER_STYLE,
  ADMIN_BUTTON_PRIMARY_STYLE,
} from "@/lib/adminStyles";
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
type SetCateringData = Dispatch<SetStateAction<CateringRequestsResponse | null>>;

function useCateringResource() {
  const router = useRouter();
  const [resource, setResource] = useObjectState({ data: null as CateringRequestsResponse | null, loading: true, error: "" });
  const setData: SetCateringData = useCallback((value) => setResource("data", value), [setResource]);
  useEffect(() => {
    void loadAuthenticatedAdminResource<CateringRequestsResponse>({ resourcePath: "/api/admin/catering-requests", failureMessage: "Could not load catering requests. Please refresh.", setLoading: (value) => setResource("loading", value), setError: (value) => setResource("error", value), onLoaded: setData, onUnauthorized: () => router.push("/admin/login") });
  }, [router, setData, setResource]);
  return { ...resource, setData };
}

function useCateringFilters(data: CateringRequestsResponse | null) {
  const [filters, setFilter] = useObjectState({ searchQuery: "", eventTypeFilter: "all", budgetFilter: "all", statusFilter: "all", page: 1 });
  const filtered = useMemo(() => filterCateringRequests(data, filters.eventTypeFilter, filters.budgetFilter, filters.statusFilter, filters.searchQuery), [data, filters.budgetFilter, filters.eventTypeFilter, filters.searchQuery, filters.statusFilter]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((filters.page - 1) * PAGE_SIZE, filters.page * PAGE_SIZE);
  const averageGuests = useMemo(() => {
    if (!data?.items.length) return 0;
    return Math.round(data.items.reduce((sum, item) => sum + item.guest_count, 0) / data.items.length);
  }, [data]);
  useEffect(() => setFilter("page", 1), [filters.searchQuery, filters.eventTypeFilter, filters.budgetFilter, filters.statusFilter, setFilter]);
  useEffect(() => setFilter("page", (previous) => Math.min(previous, totalPages)), [setFilter, totalPages]);
  const hasFilters = filters.eventTypeFilter !== "all" || filters.budgetFilter !== "all" || filters.statusFilter !== "all" || Boolean(filters.searchQuery.trim());
  return { filters, setFilter, filtered, paginated, totalPages, averageGuests, hasFilters };
}

function useCateringSelection(paginated: CateringRequestItem[]) {
  const selection = usePageSelection(paginated, null as string | null);
  return { selectedIds: selection.selectedIds, setSelectedIds: selection.setSelectedIds, expandedId: selection.detail, setExpandedId: selection.setDetail, headerCheckboxRef: selection.headerCheckboxRef, allOnPageSelected: selection.allOnPageSelected, toggleSelectAll: selection.toggleAll, toggleSelect: selection.toggleOne };
}

function useCateringOverlays() {
  const [overlays, setOverlay] = useObjectState({ deleteTarget: null as string | null, showBulkDeleteModal: false, showBulkStatusModal: false, bulkStatusTarget: "in_review" as CateringRequestStatus });
  const { toast, showToast } = useAdminToast();
  return { overlays, setOverlay, toast, showToast };
}

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

function rebuildCateringData(previous: CateringRequestsResponse, items: CateringRequestItem[]): CateringRequestsResponse {
  return { ...previous, total: items.length, status_counts: buildStatusCounts(items), items };
}

function filterCateringRequests(data: CateringRequestsResponse | null, eventType: string, budget: string, status: string, search: string): CateringRequestItem[] {
  if (!data) return [];
  let items = data.items;
  if (eventType !== "all") items = items.filter((item) => item.event_type === eventType);
  if (budget !== "all") items = items.filter((item) => item.budget_range === budget);
  if (status !== "all") items = items.filter((item) => item.status === status);
  return filterAdminItemsBySearch(items, search, (item) => {
    const searchableText = [
      item.full_name,
      item.email,
      item.phone_number ?? "",
      getCateringEventTypeLabel(item.event_type),
      getCateringBudgetRangeLabel(item.budget_range),
      item.special_requests ?? "",
      ...item.comments.map((comment) => comment.body),
    ].join(" ");
    return searchableText;
  });
}

async function getAuthHeader(): Promise<Record<string, string>> {
  const token = await getAdminToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

type CateringNotify = (message: string, type: "success" | "error") => void;

async function updateCateringStatus(id: string, status: CateringRequestStatus, data: CateringRequestsResponse | null, setData: SetCateringData, notify: CateringNotify) {
  const headers = await getAuthHeader();
  const previousStatus = data?.items.find((item) => item.id === id)?.status;
  setData((previous) => previous ? rebuildCateringData(previous, previous.items.map((item) => item.id === id ? { ...item, status } : item)) : previous);
  try {
    const response = await fetch(`${API_URL}/api/admin/catering-requests/${id}/status`, { method: "PATCH", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (!response.ok) throw new Error("Failed to update status");
    notify("Status updated", "success");
  } catch {
    if (previousStatus) {
      setData((previous) => previous ? rebuildCateringData(previous, previous.items.map((item) => item.id === id ? { ...item, status: previousStatus } : item)) : previous);
    }
    notify("Failed to update status", "error");
  }
}

async function addCateringComment(id: string, comment: string, setData: SetCateringData, notify: CateringNotify) {
  try {
    const response = await fetch(`${API_URL}/api/admin/catering-requests/${id}/comments`, { method: "POST", headers: { ...await getAuthHeader(), "Content-Type": "application/json" }, body: JSON.stringify({ comment }) });
    if (!response.ok) throw new Error("Failed to post comment");
    const result = await response.json() as { success: boolean; comment: CateringRequestComment };
    setData((previous) => previous ? rebuildCateringData(previous, previous.items.map((item) => item.id === id ? { ...item, comments: [result.comment, ...item.comments] } : item)) : previous);
    notify("Comment posted", "success");
  } catch {
    notify("Failed to post comment", "error");
    throw new Error("Failed to post comment");
  }
}

async function deleteCateringRequest(id: string, setData: SetCateringData, setSelectedIds: Dispatch<SetStateAction<Set<string>>>, expandedId: string | null, setExpandedId: Dispatch<SetStateAction<string | null>>, setDeleteTarget: Dispatch<SetStateAction<string | null>>, notify: CateringNotify) {
  try {
    const response = await fetch(`${API_URL}/api/admin/catering-requests/${id}`, { method: "DELETE", headers: await getAuthHeader() });
    if (!response.ok) throw new Error("Failed to delete request");
    setData((previous) => previous ? rebuildCateringData(previous, previous.items.filter((item) => item.id !== id)) : previous);
    setSelectedIds((previous) => removeSelectedIds(previous, [id]));
    if (expandedId === id) setExpandedId(null);
    setDeleteTarget(null);
    notify("Request deleted", "success");
  } catch {
    notify("Failed to delete request", "error");
  }
}

async function deleteCateringRequests(ids: string[], setData: SetCateringData, setSelectedIds: Dispatch<SetStateAction<Set<string>>>, expandedId: string | null, setExpandedId: Dispatch<SetStateAction<string | null>>, closeModal: () => void, notify: CateringNotify) {
  await runAdminBulkAction({
    ids,
    request: async () => postAdminBulkDelete(`${API_URL}/api/admin/catering-requests/bulk-delete`, ids, await getAuthHeader()),
    applyCompleted: (completedIds) => {
      setData((previous) => previous ? rebuildCateringData(previous, removeItemsByIds(previous.items, completedIds)) : previous);
      setSelectedIds((previous) => removeSelectedIds(previous, completedIds));
      if (expandedId && completedIds.includes(expandedId)) setExpandedId(null);
    },
    closeModal,
    notify,
    successMessage: `${ids.length} request${ids.length === 1 ? "" : "s"} deleted`,
    failureAction: "Deleted",
    failureMessage: "Failed to delete requests",
  });
}

async function updateCateringRequestStatuses(ids: string[], status: CateringRequestStatus, setData: SetCateringData, closeModal: () => void, notify: CateringNotify) {
  await runAdminBulkAction({
    ids,
    request: async () => postAdminBulkStatus(`${API_URL}/api/admin/catering-requests/bulk-status`, ids, await getAuthHeader(), status),
    applyCompleted: (completedIds) => setData((previous) => previous ? rebuildCateringData(previous, updateItemStatuses(previous.items, completedIds, status)) : previous),
    closeModal,
    notify,
    successMessage: `${ids.length} request${ids.length === 1 ? "" : "s"} updated`,
    failureAction: "Updated",
    failureMessage: "Failed to update requests",
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
    new: { bg: "var(--color-cream)", text: "var(--color-text)", border: "1px solid var(--color-border)" },
    in_review: { bg: "var(--color-info-bg)", text: "var(--color-info-text)", border: "1px solid var(--color-info-border)" },
    in_progress: { bg: "var(--color-warning-bg)", text: "var(--color-warning-text)", border: "1px solid var(--color-warning-border)" },
    rejected: { bg: "var(--color-error-bg)", text: "var(--color-error-text)", border: "1px solid var(--color-error-border)" },
    done: { bg: "var(--color-success-bg)", text: "var(--color-success-text)", border: "1px solid var(--color-success-border)" },
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
        background: "var(--color-info-bg)",
        color: "var(--color-info-text)",
        border: "1px solid var(--color-info-border)",
        whiteSpace: "nowrap",
      }}
    >
      {getCateringEventTypeLabel(eventType)}
    </span>
  );
}

function CateringStatusControl({ item, onStatusChange }: { item: CateringRequestItem; onStatusChange: (id: string, status: CateringRequestStatus) => Promise<void> }) {
  const { updating, pendingStatus, setPendingStatus, confirmStatusChange, cancelStatusChange } = usePendingStatusChange(item.id, onStatusChange);

  return (
    <div>
      <label style={{ fontSize: 11, fontWeight: 600, color: "var(--color-muted)", display: "block", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Status</label>
      <select value={item.status} onChange={(event) => setPendingStatus(event.target.value as CateringRequestStatus)} disabled={updating} style={{ padding: "7px 12px", borderRadius: 10, border: "1px solid var(--color-border)", fontSize: 13, color: "var(--color-text)", background: "white", cursor: updating ? "not-allowed" : "pointer", outline: "none" }}>
        {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      {pendingStatus && (
        <div style={{ marginTop: 12, padding: "12px 14px", background: "var(--color-warning-bg)", border: "1px solid var(--color-warning-border)", borderRadius: 12 }}>
          <p style={{ fontSize: 13, color: "var(--color-text)", marginBottom: 10 }}>Change status from <strong>{item.status}</strong> to <strong>{pendingStatus}</strong>?</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={cancelStatusChange} disabled={updating} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--color-border)", background: "white", color: "var(--color-text)", fontSize: 12, fontWeight: 600, cursor: updating ? "not-allowed" : "pointer" }}>Cancel</button>
            <button onClick={confirmStatusChange} disabled={updating} style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "var(--color-forest)", color: "var(--color-cream)", fontSize: 12, fontWeight: 600, cursor: updating ? "not-allowed" : "pointer" }}>{updating ? "Updating..." : "Confirm"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function CateringCommentsControl({ item, onCommentAdd }: { item: CateringRequestItem; onCommentAdd: (id: string, comment: string) => Promise<void> }) {
  const [commentText, setCommentText] = useState("");
  const [saving, setSaving] = useState(false);

  async function addComment() {
    const comment = commentText.trim();
    if (!comment) return;
    setSaving(true);
    try {
      await onCommentAdd(item.id, comment);
      setCommentText("");
    } catch {
      // Parent handler shows the failure toast.
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div style={{ gridColumn: "1 / -1" }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Posted Comments</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14, borderRadius: 12, border: "1px solid var(--color-border)", background: "white" }}>
          {item.comments.length === 0
            ? <span style={{ fontSize: 13, color: "var(--color-muted)" }}>No comments posted yet.</span>
            : item.comments.map((comment) => (
              <div key={comment.id} style={{ paddingBottom: 10, borderBottom: "1px solid var(--color-cream)" }}>
                <div style={{ fontSize: 11, color: "var(--color-muted)", marginBottom: 4 }}>{formatCreatedDate(comment.created_at)} {formatCreatedTime(comment.created_at)}</div>
                <div style={{ fontSize: 13, color: "var(--color-text)", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{comment.body}</div>
              </div>
            ))}
        </div>
      </div>
      <div style={{ gridColumn: "1 / -1" }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: "var(--color-muted)", display: "block", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Add New Comment</label>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <textarea value={commentText} onChange={(event) => setCommentText(event.target.value)} placeholder="Add an internal comment..." rows={3} style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: "1px solid var(--color-border)", fontSize: 13, color: "var(--color-text)", background: "white", resize: "vertical", fontFamily: "inherit", outline: "none" }} />
          <button onClick={addComment} disabled={saving || !commentText.trim()} style={{ padding: "10px 14px", borderRadius: 10, border: "none", background: "var(--color-forest)", color: "white", fontSize: 13, fontWeight: 600, cursor: saving || !commentText.trim() ? "not-allowed" : "pointer", whiteSpace: "nowrap", opacity: saving || !commentText.trim() ? 0.7 : 1 }}>{saving ? "Posting..." : "Post comment"}</button>
        </div>
      </div>
    </>
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
  return (
    <tr>
      <td
        colSpan={colSpan}
        style={{
          padding: "18px 20px",
          background: "var(--color-cream)",
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

          <CateringStatusControl item={item} onStatusChange={onStatusChange} />

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

          <CateringCommentsControl item={item} onCommentAdd={onCommentAdd} />
        </div>
      </td>
    </tr>
  );
}

function CateringRequestRow({ item, selected, expanded, last, onToggleSelected, onToggleExpanded, onDelete, onStatusChange, onCommentAdd }: {
  item: CateringRequestItem;
  selected: boolean;
  expanded: boolean;
  last: boolean;
  onToggleSelected: () => void;
  onToggleExpanded: () => void;
  onDelete: () => void;
  onStatusChange: (id: string, status: CateringRequestStatus) => Promise<void>;
  onCommentAdd: (id: string, comment: string) => Promise<void>;
}) {
  return (
    <Fragment>
      <tr onClick={onToggleExpanded} style={{ borderBottom: !expanded && !last ? "1px solid var(--color-border)" : "none", background: expanded ? "var(--color-cream)" : "white", cursor: "pointer", transition: "background 0.1s" }}>
        <AdminRowCheckboxCell checked={selected} onChange={onToggleSelected} />
        <AdminDateCell date={formatCreatedDate(item.created_at)} time={formatCreatedTime(item.created_at)} />
        <td style={{ padding: "13px 16px", whiteSpace: "nowrap", verticalAlign: "top" }}><span style={{ fontWeight: 500, color: "var(--color-text)" }}>{item.full_name}</span></td>
        <td style={{ padding: "13px 16px", verticalAlign: "top", minWidth: 220 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ color: "var(--color-text)" }}>{item.email}</span>
            <span style={{ color: item.phone_number ? "var(--color-muted)" : "var(--color-border)" }}>{item.phone_number || "No phone"}</span>
          </div>
        </td>
        <td style={{ padding: "13px 16px", whiteSpace: "nowrap", verticalAlign: "top" }}><span style={{ color: "var(--color-text)" }}>{formatEventDate(item.event_date)}</span></td>
        <td style={{ padding: "13px 16px", whiteSpace: "nowrap", verticalAlign: "top" }}><EventTypeBadge eventType={item.event_type} /></td>
        <td style={{ padding: "13px 16px", whiteSpace: "nowrap", verticalAlign: "top" }}><span style={{ color: "var(--color-text)", fontWeight: 500 }}>{item.guest_count}</span></td>
        <td style={{ padding: "13px 16px", verticalAlign: "top", minWidth: 150 }}><span style={{ color: item.budget_range ? "var(--color-text)" : "var(--color-muted)" }}>{getCateringBudgetRangeLabel(item.budget_range)}</span></td>
        <td style={{ padding: "13px 16px", verticalAlign: "top", whiteSpace: "nowrap" }}><StatusBadge status={item.status} /></td>
        <td style={{ padding: "13px 16px", color: "var(--color-text)", maxWidth: 280, verticalAlign: "top" }}>
          {item.special_requests
            ? <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{item.special_requests}</span>
            : <span style={{ color: "var(--color-border)" }}>No special requests</span>}
        </td>
        <td style={{ padding: "13px 16px", verticalAlign: "top", whiteSpace: "nowrap" }} onClick={(event) => event.stopPropagation()}>
          <AdminDeleteIconButton onClick={onDelete} />
        </td>
      </tr>
      {expanded && <ExpandedRow item={item} colSpan={COL_COUNT} onStatusChange={onStatusChange} onCommentAdd={onCommentAdd} />}
      {expanded && !last && <tr><td colSpan={COL_COUNT} style={{ padding: 0, borderBottom: "1px solid var(--color-border)" }} /></tr>}
    </Fragment>
  );
}

function CateringMetrics({ loading, data, averageGuests, statusFilter, onStatusFilterChange }: {
  loading: boolean;
  data: CateringRequestsResponse | null;
  averageGuests: number;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
}) {
  if (loading) {
    return <CompactMetricSkeletonRail count={7} />;
  }
  if (!data) return null;
  return (
    <CompactMetricRail>
      <CompactMetricTotalCard label="Total Requests" value={data.total} />
      {STATUS_OPTIONS.map((option) => {
        const selected = statusFilter === option.value;
        return (
          <CompactMetricCard key={option.value} onClick={() => onStatusFilterChange(selected ? "all" : option.value)} selected={selected}>
            <p style={{ fontSize: 10, fontWeight: 600, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>{option.label}</p>
            <p style={{ fontSize: "clamp(24px, 2vw, 28px)", fontWeight: 700, color: "var(--color-forest)", fontFamily: "var(--font-serif)", lineHeight: 1 }}>{data.status_counts[option.value]}</p>
            <p style={{ fontSize: 10, color: "var(--color-muted)", marginTop: 6, lineHeight: 1.4 }}>Click to filter</p>
          </CompactMetricCard>
        );
      })}
      <CompactMetricCard>
        <p style={{ fontSize: 10, fontWeight: 600, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Average Guests</p>
        <p style={{ fontSize: "clamp(24px, 2vw, 28px)", fontWeight: 700, color: "var(--color-forest)", fontFamily: "var(--font-serif)", lineHeight: 1 }}>{averageGuests}</p>
        <p style={{ fontSize: 10, color: "var(--color-muted)", marginTop: 6, lineHeight: 1.4 }}>Rounded across all requests</p>
      </CompactMetricCard>
    </CompactMetricRail>
  );
}

function CateringFilters({ searchQuery, eventTypeFilter, budgetFilter, statusFilter, resultCount, loading, onSearchChange, onEventTypeChange, onBudgetChange, onStatusChange, onClear }: {
  searchQuery: string;
  eventTypeFilter: string;
  budgetFilter: string;
  statusFilter: string;
  resultCount: number;
  loading: boolean;
  onSearchChange: (value: string) => void;
  onEventTypeChange: (value: string) => void;
  onBudgetChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onClear: () => void;
}) {
  const hasFilters = eventTypeFilter !== "all" || budgetFilter !== "all" || statusFilter !== "all" || Boolean(searchQuery.trim());
  const selectStyle = { padding: "9px 12px", borderRadius: 12, border: "1px solid var(--color-border)", fontSize: 13, color: "var(--color-text)", background: "white", cursor: "pointer", outline: "none" };
  return (
    <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
      <AdminSearchInput value={searchQuery} onChange={onSearchChange} placeholder="Search name, contact, type, budget, requests, comments..." />
      <select value={eventTypeFilter} onChange={(event) => onEventTypeChange(event.target.value)} style={selectStyle}>
        <option value="all">All event types</option>
        {CATERING_EVENT_TYPES.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
      </select>
      <select value={budgetFilter} onChange={(event) => onBudgetChange(event.target.value)} style={selectStyle}>
        <option value="all">All budgets</option>
        {CATERING_BUDGET_RANGES.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
      </select>
      <select value={statusFilter} onChange={(event) => onStatusChange(event.target.value)} style={selectStyle}>
        <option value="all">All statuses</option>
        {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      {hasFilters && <AdminClearFiltersButton onClick={onClear} />}
      {!loading && <span style={{ fontSize: 13, color: "var(--color-muted)", marginLeft: "auto" }}>{resultCount} result{resultCount === 1 ? "" : "s"}</span>}
    </div>
  );
}

function CateringEmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <AdminTableEmptyState
      icon={<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3v9" /><path d="M12 3v9" /><path d="M10 12v9" /><path d="M17 3v18" /><path d="M17 8a4 4 0 0 0 0-5" /><path d="M6 3v5a2 2 0 0 0 4 0V3" /></svg>}
      title="No catering requests yet"
      description={hasFilters ? "No results match your filters." : "New catering inquiries will appear here."}
    />
  );
}

export default function AdminCateringRequestsPage() {
  const { data, loading, error, setData } = useCateringResource();
  const { filters, setFilter, filtered, paginated, totalPages, averageGuests, hasFilters } = useCateringFilters(data);
  const { selectedIds, setSelectedIds, expandedId, setExpandedId, headerCheckboxRef, allOnPageSelected, toggleSelectAll, toggleSelect } = useCateringSelection(paginated);
  const { overlays, setOverlay, toast, showToast } = useCateringOverlays();

  const { searchQuery, eventTypeFilter, budgetFilter, statusFilter, page } = filters;
  const { deleteTarget, showBulkDeleteModal, showBulkStatusModal, bulkStatusTarget } = overlays;
  const setSearchQuery = (value: string) => setFilter("searchQuery", value);
  const setEventTypeFilter = (value: string) => setFilter("eventTypeFilter", value);
  const setBudgetFilter = (value: string) => setFilter("budgetFilter", value);
  const setStatusFilter = (value: string) => setFilter("statusFilter", value);
  const setPage = (value: number) => setFilter("page", value);
  const setDeleteTarget: Dispatch<SetStateAction<string | null>> = (value) => setOverlay("deleteTarget", value);
  const setShowBulkDeleteModal = (value: boolean) => setOverlay("showBulkDeleteModal", value);
  const setShowBulkStatusModal = (value: boolean) => setOverlay("showBulkStatusModal", value);
  const setBulkStatusTarget = (value: CateringRequestStatus) => setOverlay("bulkStatusTarget", value);

  function handleStatusChange(id: string, status: CateringRequestStatus) {
    return updateCateringStatus(id, status, data, setData, showToast);
  }

  function handleCommentAdd(id: string, comment: string) {
    return addCateringComment(id, comment, setData, showToast);
  }

  function handleDelete(id: string) {
    return deleteCateringRequest(id, setData, setSelectedIds, expandedId, setExpandedId, setDeleteTarget, showToast);
  }

  function handleBulkDelete() {
    return deleteCateringRequests(Array.from(selectedIds), setData, setSelectedIds, expandedId, setExpandedId, () => setShowBulkDeleteModal(false), showToast);
  }

  function handleBulkStatus() {
    return updateCateringRequestStatuses(Array.from(selectedIds), bulkStatusTarget, setData, () => setShowBulkStatusModal(false), showToast);
  }

  const btnBase = ADMIN_BUTTON_BASE_STYLE;
  const btnDanger = ADMIN_BUTTON_DANGER_STYLE;
  const btnPrimary = ADMIN_BUTTON_PRIMARY_STYLE;

  return (
    <div style={{ padding: "clamp(20px, 2vw, 32px) clamp(16px, 1.25vw, 24px) 56px", maxWidth: 1320, margin: "0 auto" }}>
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
            background: "var(--color-error-bg)",
            border: "1px solid var(--color-error-border)",
            borderRadius: 12,
            padding: "12px 16px",
            fontSize: 14,
            color: "var(--color-error-text)",
            marginBottom: 24,
          }}
        >
          {error}
        </div>
      )}

      <CateringMetrics
        loading={loading}
        data={data}
        averageGuests={averageGuests}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
      />

      <CateringFilters
        searchQuery={searchQuery}
        eventTypeFilter={eventTypeFilter}
        budgetFilter={budgetFilter}
        statusFilter={statusFilter}
        resultCount={filtered.length}
        loading={loading}
        onSearchChange={setSearchQuery}
        onEventTypeChange={setEventTypeFilter}
        onBudgetChange={setBudgetFilter}
        onStatusChange={setStatusFilter}
        onClear={() => {
          setSearchQuery("");
          setEventTypeFilter("all");
          setBudgetFilter("all");
          setStatusFilter("all");
        }}
      />

      <AdminBulkTableFrame
        bulk={buildAdminBulkStatusProps(selectedIds.size, bulkStatusTarget, STATUS_OPTIONS, setBulkStatusTarget, () => setShowBulkStatusModal(true), () => setShowBulkDeleteModal(true), () => setSelectedIds(new Set()), btnBase, btnDanger)}
        loading={loading}
        empty={filtered.length === 0}
        emptyState={<CateringEmptyState hasFilters={hasFilters} />}
      >
          <AdminSelectableTable
            headerCheckboxRef={headerCheckboxRef}
            allSelected={allOnPageSelected}
            onToggleAll={toggleSelectAll}
            headers={["Submitted", "Requester", "Contact", "Event Date", "Event Type", "Guests", "Budget", "Status", "Special Requests"]}
          >
            {paginated.map((item, index) => (
              <CateringRequestRow
                key={item.id}
                item={item}
                selected={selectedIds.has(item.id)}
                expanded={expandedId === item.id}
                last={index === paginated.length - 1}
                onToggleSelected={() => toggleSelect(item.id)}
                onToggleExpanded={() => setExpandedId(expandedId === item.id ? null : item.id)}
                onDelete={() => setDeleteTarget(item.id)}
                onStatusChange={handleStatusChange}
                onCommentAdd={handleCommentAdd}
              />
            ))}

          </AdminSelectableTable>
      </AdminBulkTableFrame>

      {!loading && <AdminPagination page={page} totalPages={totalPages} onPageChange={setPage} />}

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
            background: toast.type === "success" ? "var(--color-forest)" : "var(--color-error-text)",
            boxShadow: "0 4px 20px color-mix(in srgb, var(--color-text) 15%, transparent)",
          }}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
