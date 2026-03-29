"use client";

import { useState, useEffect, useMemo, useRef, Fragment } from "react";
import { useRouter } from "next/navigation";
import { API_URL } from "@/config/event";
import { CompactMetricCard, CompactMetricRail } from "@/components/admin/CompactMetricRail";
import { getAdminToken } from "@/lib/auth";
import Modal from "@/components/ui/Modal";
import StarRating from "@/components/ui/StarRating";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FeedbackMetric {
  reason: string;
  label: string;
  count: number;
  pct: number;
}

type FeedbackOrigin = "contact_us" | "events_page_non_customer" | "events_page_customer" | "event_reminder_email" | "reviews_page" | "admin_submission";
type FeedbackType = "general_question" | "feedback" | "collaboration" | "other";

interface AdminFeedbackFormState {
  feedback_type: FeedbackType;
  name: string;
  contact: string;
  order_id: string;
  message: string;
  other_details: string;
  rating: number;
  show_in_reviews: boolean;
}

interface FeedbackItem {
  id: string;
  origin: FeedbackOrigin;
  origin_label: string;
  feedback_type: FeedbackType;
  feedback_type_label: string;
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
  rating: number | null;
  show_in_reviews: boolean;
}

interface FeedbackResponse {
  total: number;
  origin_counts: Record<FeedbackOrigin, number>;
  type_counts: Record<FeedbackType, number>;
  reason_metrics: FeedbackMetric[];
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
  other:                   { bg: "var(--color-cream)", text: "var(--color-muted)" },
};

const ORIGIN_STYLES: Record<FeedbackOrigin, { bg: string; color: string; border: string; label: string }> = {
  contact_us: {
    bg: "#eff6ff",
    color: "#1d4ed8",
    border: "1px solid #bfdbfe",
    label: "Contact Us",
  },
  events_page_non_customer: {
    bg: "var(--color-cream)",
    color: "var(--color-muted)",
    border: "1px solid var(--color-border)",
    label: "Events Page (Non-customer)",
  },
  events_page_customer: {
    bg: "#f0f7eb",
    color: "#2d6a2d",
    border: "1px solid #c8ddb4",
    label: "Events Page (Customer)",
  },
  event_reminder_email: {
    bg: "#eef2ff",
    color: "#4338ca",
    border: "1px solid #c7d2fe",
    label: "Event Reminder Email",
  },
  reviews_page: {
    bg: "#fffbeb",
    color: "#92400e",
    border: "1px solid #fcd34d",
    label: "Reviews Page",
  },
  admin_submission: {
    bg: "#ecfdf3",
    color: "#166534",
    border: "1px solid #bbf7d0",
    label: "Admin Submission",
  },
};

const TYPE_STYLES: Record<FeedbackType, { bg: string; color: string; border: string; label: string }> = {
  general_question: {
    bg: "#eff6ff",
    color: "#1d4ed8",
    border: "1px solid #bfdbfe",
    label: "General Question",
  },
  feedback: {
    bg: "#f0f7eb",
    color: "#2d6a2d",
    border: "1px solid #c8ddb4",
    label: "Feedback",
  },
  collaboration: {
    bg: "#fdf2f8",
    color: "#be185d",
    border: "1px solid #fbcfe8",
    label: "Collaboration",
  },
  other: {
    bg: "var(--color-cream)",
    color: "var(--color-muted)",
    border: "1px solid var(--color-border)",
    label: "Other",
  },
};

const PRE_ORDER_REASON_OPTIONS = [
  { value: "price_too_high", label: "Price too high" },
  { value: "location_not_convenient", label: "Pickup location not convenient" },
  { value: "dietary_needs", label: "Food does not meet dietary needs" },
  { value: "not_available", label: "Not available on the event date" },
  { value: "different_menu", label: "Prefer a different menu item" },
  { value: "prefer_delivery", label: "Prefer delivery over pickup" },
  { value: "not_interested", label: "Not interested at this time" },
  { value: "other", label: "Other" },
] as const;

const EMPTY_REASON_METRICS: FeedbackMetric[] = PRE_ORDER_REASON_OPTIONS.map((option) => ({
  reason: option.value,
  label: option.label,
  count: 0,
  pct: 0,
}));

type AdminFeedbackFieldErrors = Partial<Record<"name" | "contact" | "order_id" | "message" | "other_details", string>>;

type AdminFeedbackTypeConfig = {
  title: string;
  description: string;
  messageLabel: string;
  messagePlaceholder: string;
  showContact: boolean;
  contactRequired: boolean;
  contactLabel: string;
  contactPlaceholder: string;
  showOrderId: boolean;
  showOtherDetails: boolean;
  otherDetailsLabel: string;
  otherDetailsPlaceholder: string;
};

const ADMIN_FEEDBACK_TYPE_CONFIG: Record<FeedbackType, AdminFeedbackTypeConfig> = {
  general_question: {
    title: "General Question",
    description: "Capture a question or request shared by phone, text, email, or in person.",
    messageLabel: "Question or request",
    messagePlaceholder: "Summarize what the admin heard and what follow-up may be needed.",
    showContact: true,
    contactRequired: false,
    contactLabel: "Contact details",
    contactPlaceholder: "Email, phone number, Instagram handle, or anything useful",
    showOrderId: true,
    showOtherDetails: false,
    otherDetailsLabel: "Extra context",
    otherDetailsPlaceholder: "",
  },
  feedback: {
    title: "Feedback",
    description: "Record praise, complaints, or suggestions gathered outside the website.",
    messageLabel: "Feedback summary",
    messagePlaceholder: "What did they say? Capture the main feedback in a clear summary.",
    showContact: true,
    contactRequired: false,
    contactLabel: "Contact details",
    contactPlaceholder: "Email, phone number, Instagram handle, or anything useful",
    showOrderId: true,
    showOtherDetails: true,
    otherDetailsLabel: "Additional context",
    otherDetailsPlaceholder: "Any extra context, follow-up notes, or source details",
  },
  collaboration: {
    title: "Collaboration",
    description: "Track partnership, catering, or event opportunities that need follow-up.",
    messageLabel: "Opportunity details",
    messagePlaceholder: "What is the collaboration opportunity and what did they ask for?",
    showContact: true,
    contactRequired: true,
    contactLabel: "Contact details",
    contactPlaceholder: "Who should the team follow up with and how?",
    showOrderId: false,
    showOtherDetails: true,
    otherDetailsLabel: "Supporting context",
    otherDetailsPlaceholder: "Optional background, timeline, venue details, or next steps",
  },
  other: {
    title: "Other",
    description: "Capture anything that does not fit the standard feedback categories.",
    messageLabel: "Details",
    messagePlaceholder: "Summarize the feedback or request clearly.",
    showContact: true,
    contactRequired: false,
    contactLabel: "Contact details",
    contactPlaceholder: "Email, phone number, Instagram handle, or anything useful",
    showOrderId: false,
    showOtherDetails: true,
    otherDetailsLabel: "Additional context",
    otherDetailsPlaceholder: "Optional notes, background, or source details",
  },
};

const INITIAL_ADMIN_FEEDBACK_FORM: AdminFeedbackFormState = {
  feedback_type: "feedback",
  name: "",
  contact: "",
  order_id: "",
  message: "",
  other_details: "",
  rating: 0,
  show_in_reviews: false,
};

function buildOriginCounts(items: FeedbackItem[]): Record<FeedbackOrigin, number> {
  return {
    contact_us: items.filter((item) => item.origin === "contact_us").length,
    events_page_non_customer: items.filter((item) => item.origin === "events_page_non_customer").length,
    events_page_customer: items.filter((item) => item.origin === "events_page_customer").length,
    event_reminder_email: items.filter((item) => item.origin === "event_reminder_email").length,
    reviews_page: items.filter((item) => item.origin === "reviews_page").length,
    admin_submission: items.filter((item) => item.origin === "admin_submission").length,
  };
}

function buildTypeCounts(items: FeedbackItem[]): Record<FeedbackType, number> {
  return {
    general_question: items.filter((item) => item.feedback_type === "general_question").length,
    feedback: items.filter((item) => item.feedback_type === "feedback").length,
    collaboration: items.filter((item) => item.feedback_type === "collaboration").length,
    other: items.filter((item) => item.feedback_type === "other").length,
  };
}

function buildEmptyFeedbackData(items: FeedbackItem[]): FeedbackResponse {
  return {
    total: items.length,
    origin_counts: buildOriginCounts(items),
    type_counts: buildTypeCounts(items),
    reason_metrics: EMPTY_REASON_METRICS.map((metric) => ({ ...metric })),
    items,
  };
}

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

function OriginBadge({ origin, label }: { origin: FeedbackOrigin; label?: string }) {
  const style = ORIGIN_STYLES[origin];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: "999px",
        fontSize: "12px",
        fontWeight: 600,
        background: style.bg,
        color: style.color,
        whiteSpace: "nowrap",
        border: style.border,
      }}
    >
      {label ?? style.label}
    </span>
  );
}

function TypeBadge({ type, label }: { type: string; label?: string }) {
  const resolvedType = Object.prototype.hasOwnProperty.call(TYPE_STYLES, type) ? (type as FeedbackType) : "other";
  const style = TYPE_STYLES[resolvedType];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: "999px",
        fontSize: "12px",
        fontWeight: 600,
        background: style.bg,
        color: style.color,
        whiteSpace: "nowrap",
        border: style.border,
      }}
    >
      {label ?? style.label}
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
// Detail modal
// ---------------------------------------------------------------------------

function DetailField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <p
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "var(--color-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 6,
        }}
      >
        {label}
      </p>
      <div style={{ fontSize: 14, color: "var(--color-text)", lineHeight: 1.5, wordBreak: "break-word" }}>
        {children}
      </div>
    </div>
  );
}

function FeedbackDetailsModal({
  item,
  onClose,
  onStatusChange,
  onCommentSave,
}: {
  item: FeedbackItem;
  onClose: () => void;
  onStatusChange: (id: string, status: string) => Promise<void>;
  onCommentSave: (id: string, comment: string | null) => Promise<void>;
}) {
  const [commentText, setCommentText] = useState(item.admin_comment ?? "");
  const [savingComment, setSavingComment] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [pendingStatusChange, setPendingStatusChange] = useState<string | null>(null);

  useEffect(() => {
    setCommentText(item.admin_comment ?? "");
  }, [item.admin_comment, item.id]);

  async function handleStatusChangeSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    setPendingStatusChange(e.target.value);
  }

  async function confirmStatusChange() {
    if (!pendingStatusChange) return;
    const nextStatus = pendingStatusChange;
    setPendingStatusChange(null);
    setUpdatingStatus(true);
    try {
      await onStatusChange(item.id, nextStatus);
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
    <Modal
      isOpen
      onClose={onClose}
      title="Feedback details"
      size="xl"
      actions={
        <button
          onClick={onClose}
          style={{
            padding: "8px 14px",
            borderRadius: 10,
            border: "1px solid var(--color-border)",
            background: "white",
            color: "var(--color-text)",
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Close
        </button>
      }
    >
      <div style={{ display: "grid", gap: 20 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <OriginBadge origin={item.origin} label={item.origin_label} />
          <TypeBadge type={item.feedback_type} label={item.feedback_type_label} />
          <StatusBadge status={item.status} />
          {item.reason && item.reason_label && <ReasonBadge reason={item.reason} label={item.reason_label} />}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
          <DetailField label="Submitted">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "baseline" }}>
              <span style={{ fontWeight: 500 }}>{formatDate(item.created_at)}</span>
              <span style={{ color: "var(--color-muted)" }}>{formatTime(item.created_at)}</span>
            </div>
          </DetailField>

          <DetailField label="Status">
            <select
              value={item.status}
              onChange={handleStatusChangeSelect}
              disabled={updatingStatus}
              style={{
                width: "100%",
                padding: "9px 12px",
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
            {pendingStatusChange && (
              <div
                style={{
                  marginTop: 10,
                  padding: "10px 12px",
                  background: "#fff7ed",
                  border: "1px solid #fed7aa",
                  borderRadius: 10,
                }}
              >
                <p style={{ fontSize: 12, color: "var(--color-text)", marginBottom: 8 }}>
                  Change status from <strong>{item.status}</strong> to <strong>{pendingStatusChange}</strong>?
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => setPendingStatusChange(null)}
                    disabled={updatingStatus}
                    style={{
                      padding: "5px 10px",
                      borderRadius: 8,
                      border: "1px solid var(--color-border)",
                      background: "white",
                      color: "var(--color-text)",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: updatingStatus ? "not-allowed" : "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmStatusChange}
                    disabled={updatingStatus}
                    style={{
                      padding: "5px 10px",
                      borderRadius: 8,
                      border: "none",
                      background: "var(--color-forest)",
                      color: "var(--color-cream)",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: updatingStatus ? "not-allowed" : "pointer",
                    }}
                  >
                    {updatingStatus ? "Updating..." : "Confirm"}
                  </button>
                </div>
              </div>
            )}
          </DetailField>

          <DetailField label="Name">
            {item.name ? (
              <span style={{ fontWeight: 500 }}>{item.name}</span>
            ) : (
              <span style={{ color: "var(--color-muted)", fontStyle: "italic" }}>Anonymous</span>
            )}
          </DetailField>

          <DetailField label="Contact">
            {item.contact ? (
              <span>{item.contact}</span>
            ) : (
              <span style={{ color: "var(--color-muted)", fontStyle: "italic" }}>No contact provided</span>
            )}
          </DetailField>

          <DetailField label="Order ID">
            {item.order_id ? (
              <span style={{ fontFamily: "monospace" }}>{item.order_id}</span>
            ) : (
              <span style={{ color: "var(--color-muted)", fontStyle: "italic" }}>Not linked to an order</span>
            )}
          </DetailField>

          <DetailField label="Reason">
            {item.reason && item.reason_label ? (
              <ReasonBadge reason={item.reason} label={item.reason_label} />
            ) : (
              <span style={{ color: "var(--color-muted)", fontStyle: "italic" }}>No reason provided</span>
            )}
          </DetailField>

          <DetailField label="Feedback ID">
            <span style={{ fontFamily: "monospace" }}>{item.id}</span>
          </DetailField>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <p
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--color-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            Message
          </p>
          <div
            style={{
              padding: 16,
              borderRadius: 16,
              border: "1px solid var(--color-border)",
              background: "#fafaf9",
            }}
          >
            {item.message ? (
              <p style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", color: "var(--color-text)", lineHeight: 1.7 }}>
                {item.message}
              </p>
            ) : (
              <p style={{ margin: 0, color: "var(--color-muted)", fontStyle: "italic" }}>
                No message provided.
              </p>
            )}
          </div>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <p
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--color-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            Other details
          </p>
          <div
            style={{
              padding: 16,
              borderRadius: 16,
              border: "1px solid var(--color-border)",
              background: "#fafaf9",
            }}
          >
            {item.other_details ? (
              <p style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", color: "var(--color-text)", lineHeight: 1.7 }}>
                {item.other_details}
              </p>
            ) : (
              <p style={{ margin: 0, color: "var(--color-muted)", fontStyle: "italic" }}>
                No additional details provided.
              </p>
            )}
          </div>
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--color-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Internal note
            </p>
            <span style={{ fontSize: 12, color: "var(--color-muted)" }}>Visible only to admins</span>
          </div>
          <textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Add an internal note..."
            rows={4}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid var(--color-border)",
              fontSize: 13,
              color: "var(--color-text)",
              background: "white",
              resize: "vertical",
              fontFamily: "inherit",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
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
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminFeedbackPage() {
  const router = useRouter();

  const [data, setData] = useState<FeedbackResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters
  const [originFilter, setOriginFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [preOrderReasonFilter, setPreOrderReasonFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Pagination
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  // Selection / details
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedFeedbackId, setSelectedFeedbackId] = useState<string | null>(null);

  // Modals
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [showBulkStatusModal, setShowBulkStatusModal] = useState(false);
  const [bulkStatusTarget, setBulkStatusTarget] = useState("resolved");
  const [pendingReviewToggle, setPendingReviewToggle] = useState<{ id: string; show: boolean } | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<AdminFeedbackFormState>(INITIAL_ADMIN_FEEDBACK_FORM);
  const [createErrors, setCreateErrors] = useState<AdminFeedbackFieldErrors>({});
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);

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
    if (originFilter !== "all") items = items.filter((i) => i.origin === originFilter);
    if (typeFilter !== "all") items = items.filter((i) => i.feedback_type === typeFilter);
    if (preOrderReasonFilter !== "all") items = items.filter((i) => i.reason === preOrderReasonFilter);
    if (statusFilter !== "all") items = items.filter((i) => i.status === statusFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      items = items.filter(
        (i) =>
          i.origin_label.toLowerCase().includes(q) ||
          i.feedback_type_label.toLowerCase().includes(q) ||
          (i.name ?? "").toLowerCase().includes(q) ||
          (i.contact ?? "").toLowerCase().includes(q) ||
          (i.reason_label ?? "").toLowerCase().includes(q) ||
          (i.other_details ?? "").toLowerCase().includes(q) ||
          (i.message ?? "").toLowerCase().includes(q)
      );
    }
    return items;
  }, [data, originFilter, typeFilter, preOrderReasonFilter, statusFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const selectedFeedback = useMemo(
    () => (selectedFeedbackId ? data?.items.find((item) => item.id === selectedFeedbackId) ?? null : null),
    [data, selectedFeedbackId]
  );

  useEffect(() => { setPage(1); }, [originFilter, typeFilter, preOrderReasonFilter, statusFilter, searchQuery]);
  useEffect(() => { setPage((prev) => Math.min(prev, totalPages)); }, [totalPages]);

  const sortedMetrics = useMemo(
    () => (data ? [...data.reason_metrics].sort((a, b) => b.count - a.count).filter((m) => m.count > 0) : []),
    [data]
  );

  const hasFilters = originFilter !== "all"
    || typeFilter !== "all"
    || preOrderReasonFilter !== "all"
    || statusFilter !== "all"
    || !!searchQuery;

  function recomputeReasonMetrics(items: FeedbackItem[], template: FeedbackMetric[]): FeedbackMetric[] {
    const batchFeedbackCount = items.filter(
      (i) => i.origin === "events_page_non_customer" || i.origin === "event_reminder_email"
    ).length;
    return template.map((metric) => {
      const count = items.filter(
        (i) => (i.origin === "events_page_non_customer" || i.origin === "event_reminder_email") && i.reason === metric.reason
      ).length;
      return {
        ...metric,
        count,
        pct: batchFeedbackCount > 0 ? Math.round((count / batchFeedbackCount) * 100) : 0,
      };
    });
  }

  function rebuildFeedbackData(previous: FeedbackResponse, items: FeedbackItem[]): FeedbackResponse {
    return {
      ...previous,
      items,
      total: items.length,
      origin_counts: buildOriginCounts(items),
      type_counts: buildTypeCounts(items),
      reason_metrics: recomputeReasonMetrics(items, previous.reason_metrics),
    };
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

  const activeCreateType = ADMIN_FEEDBACK_TYPE_CONFIG[createForm.feedback_type];
  const createFormSupportsReviews = createForm.feedback_type === "feedback";

  function resetCreateForm() {
    setCreateForm(INITIAL_ADMIN_FEEDBACK_FORM);
    setCreateErrors({});
    setCreateError("");
  }

  function openCreateModal() {
    resetCreateForm();
    setShowCreateModal(true);
  }

  function closeCreateModal() {
    if (creating) return;
    setShowCreateModal(false);
    resetCreateForm();
  }

  function updateCreateForm<K extends keyof AdminFeedbackFormState>(field: K, value: AdminFeedbackFormState[K]) {
    setCreateForm((prev) => ({ ...prev, [field]: value }));
    setCreateErrors((prev) => ({ ...prev, [field]: undefined }));
    if (createError) setCreateError("");
  }

  function updateCreateRating(nextRating: number) {
    setCreateForm((prev) => ({
      ...prev,
      rating: nextRating,
      show_in_reviews: nextRating > 0 ? prev.show_in_reviews : false,
    }));
    if (createError) setCreateError("");
  }

  function validateCreateForm(): AdminFeedbackFieldErrors {
    const nextErrors: AdminFeedbackFieldErrors = {};
    if (!createForm.message.trim()) {
      nextErrors.message = `${activeCreateType.messageLabel} is required.`;
    }
    if (activeCreateType.contactRequired && !createForm.contact.trim()) {
      nextErrors.contact = "Contact details are required for collaboration feedback.";
    }
    return nextErrors;
  }

  async function handleCreateFeedback() {
    const nextErrors = validateCreateForm();
    setCreateErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    const headers = await getAuthHeader();
    const payload = {
      feedback_type: createForm.feedback_type,
      name: createForm.name.trim() || undefined,
      contact: createForm.contact.trim() || undefined,
      order_id: activeCreateType.showOrderId ? createForm.order_id.trim() || undefined : undefined,
      message: createForm.message.trim(),
      other_details: activeCreateType.showOtherDetails ? createForm.other_details.trim() || undefined : undefined,
      rating: createFormSupportsReviews && createForm.rating > 0 ? createForm.rating : undefined,
      show_in_reviews: createFormSupportsReviews && createForm.rating > 0 ? createForm.show_in_reviews : false,
    };

    setCreating(true);
    setCreateError("");

    try {
      const res = await fetch(`${API_URL}/api/admin/feedback`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.status === 401) {
        router.push("/admin/login");
        return;
      }

      if (!res.ok) {
        const result = await res.json().catch(() => null);
        const detail = typeof result?.detail === "string" ? result.detail : "Failed to submit feedback";
        throw new Error(detail);
      }

      const created: FeedbackItem = await res.json();
      setData((prev) => (prev ? rebuildFeedbackData(prev, [created, ...prev.items]) : buildEmptyFeedbackData([created])));
      setPage(1);
      setShowCreateModal(false);
      resetCreateForm();
      showToast("Admin feedback submitted", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to submit feedback";
      setCreateError(message);
      showToast("Failed to submit feedback", "error");
    } finally {
      setCreating(false);
    }
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

  async function handleToggleShowInReviews(id: string, nextShowInReviews: boolean) {
    const headers = await getAuthHeader();
    const previousValue = data?.items.find((i) => i.id === id)?.show_in_reviews;
    // Optimistic update
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map((item) =>
          item.id === id ? { ...item, show_in_reviews: nextShowInReviews } : item
        ),
      };
    });
    try {
      const res = await fetch(`${API_URL}/api/admin/feedback/${id}/show-in-reviews`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ show_in_reviews: nextShowInReviews }),
      });
      if (!res.ok) throw new Error("Failed");
      const result = await res.json();
      showToast(result.show_in_reviews ? "Shown in reviews" : "Hidden from reviews", "success");
    } catch {
      // Rollback
      if (previousValue !== undefined) {
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            items: prev.items.map((item) =>
              item.id === id ? { ...item, show_in_reviews: previousValue } : item
            ),
          };
        });
      }
      showToast("Failed to update review visibility", "error");
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
        const nextItems = prev.items.filter((i) => i.id !== id);
        return rebuildFeedbackData(prev, nextItems);
      });
      setSelectedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
      if (selectedFeedbackId === id) setSelectedFeedbackId(null);
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
        const nextItems = prev.items.filter((i) => !idSet.has(i.id));
        return rebuildFeedbackData(prev, nextItems);
      });
      setSelectedIds(new Set());
      if (selectedFeedbackId && idSet.has(selectedFeedbackId)) setSelectedFeedbackId(null);
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
    <div style={{ padding: "clamp(20px, 2vw, 32px) clamp(16px, 1.25vw, 24px) 56px", maxWidth: 1200, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ marginBottom: 28, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
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
            Pre-order feedback from visitors, contact messages, admin-captured notes, and post-order feedback from customers.
          </p>
        </div>
        <button onClick={openCreateModal} style={btnPrimary}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14" /><path d="M5 12h14" />
          </svg>
          Submit feedback
        </button>
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
          <CompactMetricRail>
          {[...Array(5)].map((_, i) => (
            <CompactMetricCard key={i} variant={i === 0 ? "dark" : "light"}>
              <Skeleton w="60%" h={10} />
              <div style={{ marginTop: 12 }}>
                <Skeleton w="40%" h={24} />
              </div>
            </CompactMetricCard>
          ))}
        </CompactMetricRail>
      ) : data && (
        <CompactMetricRail>
          <CompactMetricCard variant="dark">
            <p
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: "var(--color-sage)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: 8,
              }}
            >
              Total Responses
            </p>
            <p
              style={{
                fontSize: "clamp(24px, 2vw, 28px)",
                fontWeight: 700,
                color: "var(--color-cream)",
                fontFamily: "var(--font-serif)",
                lineHeight: 1,
              }}
            >
              {data.total}
            </p>
          </CompactMetricCard>

          <CompactMetricCard
            onClick={() => setOriginFilter(originFilter === "contact_us" ? "all" : "contact_us")}
            selected={originFilter === "contact_us"}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <p
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "var(--color-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Contact Us
              </p>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <p
              style={{
                fontSize: "clamp(24px, 2vw, 28px)",
                fontWeight: 700,
                color: "var(--color-forest)",
                fontFamily: "var(--font-serif)",
                lineHeight: 1,
              }}
            >
              {data.origin_counts.contact_us}
            </p>
            <p style={{ fontSize: 10, color: "var(--color-muted)", marginTop: 6, lineHeight: 1.4 }}>
              Messages and inquiries
            </p>
          </CompactMetricCard>

          <CompactMetricCard
            onClick={() => setOriginFilter(originFilter === "events_page_non_customer" ? "all" : "events_page_non_customer")}
            selected={originFilter === "events_page_non_customer"}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <p
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "var(--color-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Events Page
              </p>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-bark)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <p
              style={{
                fontSize: "clamp(24px, 2vw, 28px)",
                fontWeight: 700,
                color: "var(--color-forest)",
                fontFamily: "var(--font-serif)",
                lineHeight: 1,
              }}
            >
              {data.origin_counts.events_page_non_customer}
            </p>
            <p style={{ fontSize: 10, color: "var(--color-muted)", marginTop: 6, lineHeight: 1.4 }}>
              Pre-order feedback
            </p>
          </CompactMetricCard>

          <CompactMetricCard
            onClick={() => setOriginFilter(originFilter === "events_page_customer" ? "all" : "events_page_customer")}
            selected={originFilter === "events_page_customer"}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <p
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "var(--color-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Customers
              </p>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2d6a2d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <p
              style={{
                fontSize: "clamp(24px, 2vw, 28px)",
                fontWeight: 700,
                color: "var(--color-forest)",
                fontFamily: "var(--font-serif)",
                lineHeight: 1,
              }}
            >
              {data.origin_counts.events_page_customer}
            </p>
            <p style={{ fontSize: 10, color: "var(--color-muted)", marginTop: 6, lineHeight: 1.4 }}>
              Post-order feedback
            </p>
          </CompactMetricCard>

          <CompactMetricCard
            onClick={() => setOriginFilter(originFilter === "event_reminder_email" ? "all" : "event_reminder_email")}
            selected={originFilter === "event_reminder_email"}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <p
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "var(--color-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Reminder Email
              </p>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4338ca" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
            </div>
            <p
              style={{
                fontSize: "clamp(24px, 2vw, 28px)",
                fontWeight: 700,
                color: "var(--color-forest)",
                fontFamily: "var(--font-serif)",
                lineHeight: 1,
              }}
            >
              {data.origin_counts.event_reminder_email}
            </p>
            <p style={{ fontSize: 10, color: "var(--color-muted)", marginTop: 6, lineHeight: 1.4 }}>
              Event reminder responses
            </p>
          </CompactMetricCard>

          <CompactMetricCard
            onClick={() => setOriginFilter(originFilter === "admin_submission" ? "all" : "admin_submission")}
            selected={originFilter === "admin_submission"}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <p
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "var(--color-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Admin Submitted
              </p>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#166534" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 12h6" /><path d="M12 9v6" /><path d="M9 3h6l1 2h4v16H4V5h4l1-2z" />
              </svg>
            </div>
            <p
              style={{
                fontSize: "clamp(24px, 2vw, 28px)",
                fontWeight: 700,
                color: "var(--color-forest)",
                fontFamily: "var(--font-serif)",
                lineHeight: 1,
              }}
            >
              {data.origin_counts.admin_submission}
            </p>
            <p style={{ fontSize: 10, color: "var(--color-muted)", marginTop: 6, lineHeight: 1.4 }}>
              Captured outside the platform
            </p>
          </CompactMetricCard>

          {sortedMetrics[0] && (() => {
            const m = sortedMetrics[0];
            const colors = REASON_COLORS[m.reason] ?? { bg: "var(--color-cream)", text: "var(--color-muted)" };
            return (
              <CompactMetricCard
                onClick={() => setPreOrderReasonFilter(preOrderReasonFilter === m.reason ? "all" : m.reason)}
                selected={preOrderReasonFilter === m.reason}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <p
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: "var(--color-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    }}
                  >
                    Top Reason
                  </p>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: "999px", background: colors.bg, color: colors.text }}>
                    {m.pct}%
                  </span>
                </div>
                <p style={{ fontSize: 13, fontWeight: 700, color: "var(--color-forest)", lineHeight: 1.3, marginBottom: 6 }}>
                  {m.label}
                </p>
                <p
                  style={{
                    fontSize: "clamp(22px, 1.8vw, 24px)",
                    fontWeight: 700,
                    color: "var(--color-forest)",
                    fontFamily: "var(--font-serif)",
                    lineHeight: 1,
                  }}
                >
                  {m.count}
                </p>
              </CompactMetricCard>
            );
          })()}
        </CompactMetricRail>
      )}

      {/* Reason breakdown (non-customer only) */}
      {!loading && data && (data.origin_counts.events_page_non_customer + data.origin_counts.event_reminder_email) > 0 && (
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
            Batch Feedback Reason Breakdown
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {sortedMetrics.map((m) => {
              const colors = REASON_COLORS[m.reason] ?? { bg: "var(--color-cream)", text: "var(--color-muted)" };
              const isActive = preOrderReasonFilter === m.reason;
              return (
                <div
                  key={m.reason}
                  style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}
                  onClick={() => setPreOrderReasonFilter(isActive ? "all" : m.reason)}
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
            placeholder="Search origin, type, name, contact, message..."
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
          value={originFilter}
          onChange={(e) => setOriginFilter(e.target.value)}
          style={{ padding: "9px 12px", borderRadius: 12, border: "1px solid var(--color-border)", fontSize: 13, color: "var(--color-text)", background: "white", cursor: "pointer", outline: "none" }}
        >
          <option value="all">All origins</option>
          <option value="contact_us">Contact Us</option>
          <option value="events_page_non_customer">Events Page (Non-customer)</option>
          <option value="events_page_customer">Events Page (Customer)</option>
          <option value="event_reminder_email">Event Reminder Email</option>
          <option value="reviews_page">Reviews Page</option>
          <option value="admin_submission">Admin Submission</option>
        </select>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          style={{ padding: "9px 12px", borderRadius: 12, border: "1px solid var(--color-border)", fontSize: 13, color: "var(--color-text)", background: "white", cursor: "pointer", outline: "none" }}
        >
          <option value="all">All types</option>
          <option value="general_question">General Question</option>
          <option value="feedback">Feedback</option>
          <option value="collaboration">Collaboration</option>
          <option value="other">Other</option>
        </select>

        <select
          value={preOrderReasonFilter}
          onChange={(e) => setPreOrderReasonFilter(e.target.value)}
          style={{ padding: "9px 12px", borderRadius: 12, border: "1px solid var(--color-border)", fontSize: 13, color: "var(--color-text)", background: "white", cursor: "pointer", outline: "none" }}
        >
          <option value="all">All pre-order reasons</option>
          {PRE_ORDER_REASON_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
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
            onClick={() => {
              setOriginFilter("all");
              setTypeFilter("all");
              setPreOrderReasonFilter("all");
              setStatusFilter("all");
              setSearchQuery("");
            }}
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
              {hasFilters ? "No results match your filters." : "Feedback, contact messages, customer notes, and admin-submitted entries will appear here."}
            </p>
            {!hasFilters && (
              <div style={{ marginTop: 16, display: "flex", justifyContent: "center" }}>
                <button onClick={openCreateModal} style={btnPrimary}>Submit feedback</button>
              </div>
            )}
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
                  {["Date", "Origin", "Type", "Name", "Contact", "Pre-order Reason", "Status", "Message / Details", ""].map((col) => (
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
                  return (
                    <Fragment key={item.id}>
                      <tr
                        onClick={() => setSelectedFeedbackId(item.id)}
                        style={{
                          borderBottom: idx < paginated.length - 1 ? "1px solid var(--color-border)" : "none",
                          background: "white",
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

                        {/* Origin */}
                        <td style={{ padding: "13px 16px", whiteSpace: "nowrap", verticalAlign: "top" }}>
                          <OriginBadge origin={item.origin} label={item.origin_label} />
                        </td>

                        {/* Type */}
                        <td style={{ padding: "13px 16px", whiteSpace: "nowrap", verticalAlign: "top" }}>
                          <TypeBadge type={item.feedback_type} label={item.feedback_type_label} />
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

                        {/* Pre-order Reason */}
                        <td style={{ padding: "13px 16px", verticalAlign: "top" }}>
                          {item.reason && item.reason_label ? (
                            <ReasonBadge reason={item.reason} label={item.reason_label} />
                          ) : (
                            <span style={{ color: "var(--color-border)" }}>-</span>
                          )}
                        </td>

                        {/* Status */}
                        <td style={{ padding: "13px 16px", verticalAlign: "top", whiteSpace: "nowrap" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <StatusBadge status={item.status} />
                            {item.rating != null && (
                              <div style={{ display: "flex", gap: 1 }}>
                                {[1, 2, 3, 4, 5].map((s) => (
                                  <svg
                                    key={s}
                                    width="11"
                                    height="11"
                                    viewBox="0 0 24 24"
                                    fill={s <= item.rating! ? "#f59e0b" : "none"}
                                    stroke={s <= item.rating! ? "#f59e0b" : "var(--color-border)"}
                                    strokeWidth="1.5"
                                  >
                                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                  </svg>
                                ))}
                              </div>
                            )}
                          </div>
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
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            {/* Show in reviews toggle */}
                            <button
                              onClick={() => setPendingReviewToggle({ id: item.id, show: !item.show_in_reviews })}
                              title={item.show_in_reviews ? "Hide from reviews" : "Show in reviews"}
                              style={{
                                padding: "5px 8px",
                                borderRadius: 8,
                                border: item.show_in_reviews ? "1px solid #fcd34d" : "1px solid var(--color-border)",
                                background: item.show_in_reviews ? "#fffbeb" : "white",
                                cursor: "pointer",
                                color: item.show_in_reviews ? "#92400e" : "var(--color-muted)",
                                display: "inline-flex",
                                alignItems: "center",
                                transition: "all 0.15s",
                              }}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill={item.show_in_reviews ? "#f59e0b" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                              </svg>
                            </button>
                            {/* Delete */}
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
                          </div>
                        </td>
                      </tr>
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
        isOpen={showCreateModal}
        onClose={closeCreateModal}
        title="Submit admin feedback"
        size="xl"
        actions={
          <>
            <button onClick={closeCreateModal} disabled={creating} style={btnBase}>Cancel</button>
            <button onClick={handleCreateFeedback} disabled={creating} style={{ ...btnPrimary, opacity: creating ? 0.7 : 1, cursor: creating ? "not-allowed" : "pointer" }}>
              {creating ? "Submitting..." : "Submit feedback"}
            </button>
          </>
        }
      >
        <div style={{ display: "grid", gap: 20 }}>
          <div
            style={{
              padding: 16,
              borderRadius: 16,
              border: "1px solid #c8ddb4",
              background: "#f0f7eb",
              display: "grid",
              gap: 6,
            }}
          >
            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "var(--color-forest)" }}>
              Capture feedback shared outside the platform.
            </p>
            <p style={{ margin: 0, fontSize: 13, color: "var(--color-muted)", lineHeight: 1.6 }}>
              Start by choosing the type. The form keeps only the required fields up front, then moves optional context to the end.
            </p>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>
              Feedback type
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
              {(Object.keys(ADMIN_FEEDBACK_TYPE_CONFIG) as FeedbackType[]).map((type) => {
                const config = ADMIN_FEEDBACK_TYPE_CONFIG[type];
                const selected = createForm.feedback_type === type;
                return (
                  <button
                    key={type}
                    onClick={() => updateCreateForm("feedback_type", type)}
                    style={{
                      textAlign: "left",
                      padding: 14,
                      borderRadius: 14,
                      border: selected ? "1px solid var(--color-forest)" : "1px solid var(--color-border)",
                      background: selected ? "#f0f7eb" : "white",
                      cursor: "pointer",
                      display: "grid",
                      gap: 6,
                    }}
                  >
                    <span style={{ fontSize: 14, fontWeight: 600, color: selected ? "var(--color-forest)" : "var(--color-text)" }}>
                      {config.title}
                    </span>
                    <span style={{ fontSize: 12, color: "var(--color-muted)", lineHeight: 1.5 }}>
                      {config.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: "grid", gap: 14 }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 600, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.06em", margin: 0, marginBottom: 6 }}>
                Required details
              </p>
              <p style={{ margin: 0, fontSize: 13, color: "var(--color-muted)", lineHeight: 1.6 }}>
                {activeCreateType.description}
              </p>
            </div>

            {activeCreateType.showContact && activeCreateType.contactRequired && (
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)" }}>
                  {activeCreateType.contactLabel} <span style={{ color: "#c53030" }}>*</span>
                </label>
                <input
                  type="text"
                  value={createForm.contact}
                  onChange={(e) => updateCreateForm("contact", e.target.value)}
                  placeholder={activeCreateType.contactPlaceholder}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: createErrors.contact ? "1px solid #c53030" : "1px solid var(--color-border)",
                    fontSize: 13,
                    color: "var(--color-text)",
                    background: "white",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
                {createErrors.contact && <p style={{ margin: 0, fontSize: 12, color: "#c53030" }}>{createErrors.contact}</p>}
              </div>
            )}

            <div style={{ display: "grid", gap: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)" }}>
                {activeCreateType.messageLabel} <span style={{ color: "#c53030" }}>*</span>
              </label>
              <textarea
                value={createForm.message}
                onChange={(e) => updateCreateForm("message", e.target.value)}
                placeholder={activeCreateType.messagePlaceholder}
                rows={5}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: createErrors.message ? "1px solid #c53030" : "1px solid var(--color-border)",
                  fontSize: 13,
                  color: "var(--color-text)",
                  background: "white",
                  resize: "vertical",
                  fontFamily: "inherit",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              {createErrors.message && <p style={{ margin: 0, fontSize: 12, color: "#c53030" }}>{createErrors.message}</p>}
            </div>
          </div>

          <div style={{ display: "grid", gap: 14 }}>
            <div>
              <p style={{ fontSize: 11, fontWeight: 600, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.06em", margin: 0, marginBottom: 6 }}>
                Optional context
              </p>
              <p style={{ margin: 0, fontSize: 13, color: "var(--color-muted)", lineHeight: 1.6 }}>
                Add supporting details only if they help the team understand or follow up on the entry.
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)" }}>Name</label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => updateCreateForm("name", e.target.value)}
                  placeholder="Who shared this feedback?"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
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

              {activeCreateType.showContact && !activeCreateType.contactRequired && (
                <div style={{ display: "grid", gap: 6 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)" }}>{activeCreateType.contactLabel}</label>
                  <input
                    type="text"
                    value={createForm.contact}
                    onChange={(e) => updateCreateForm("contact", e.target.value)}
                    placeholder={activeCreateType.contactPlaceholder}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
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
              )}

              {activeCreateType.showOrderId && (
                <div style={{ display: "grid", gap: 6 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)" }}>Related order ID</label>
                  <input
                    type="text"
                    value={createForm.order_id}
                    onChange={(e) => updateCreateForm("order_id", e.target.value)}
                    placeholder="Add an order ID only if this feedback links to one"
                    style={{
                      width: "100%",
                      padding: "10px 12px",
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
              )}
            </div>

            {activeCreateType.showOtherDetails && (
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)" }}>{activeCreateType.otherDetailsLabel}</label>
                <textarea
                  value={createForm.other_details}
                  onChange={(e) => updateCreateForm("other_details", e.target.value)}
                  placeholder={activeCreateType.otherDetailsPlaceholder}
                  rows={3}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid var(--color-border)",
                    fontSize: 13,
                    color: "var(--color-text)",
                    background: "white",
                    resize: "vertical",
                    fontFamily: "inherit",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            )}

            {createFormSupportsReviews && (
              <div
                style={{
                  padding: 16,
                  borderRadius: 16,
                  border: "1px solid #f3e3b2",
                  background: "#fffaf0",
                  display: "grid",
                  gap: 12,
                }}
              >
                <div style={{ display: "grid", gap: 4 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)" }}>Star rating</label>
                  <p style={{ margin: 0, fontSize: 12, color: "var(--color-muted)", lineHeight: 1.5 }}>
                    Add an optional rating if this entry should appear as a starred review.
                  </p>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <StarRating value={createForm.rating} onChange={updateCreateRating} size={28} mode="input" />
                  <span style={{ fontSize: 13, color: "var(--color-muted)" }}>
                    {createForm.rating > 0 ? `${createForm.rating} out of 5` : "No rating selected"}
                  </span>
                  {createForm.rating > 0 && (
                    <button onClick={() => updateCreateRating(0)} style={btnBase}>
                      Clear rating
                    </button>
                  )}
                </div>

                <label
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    cursor: createForm.rating > 0 ? "pointer" : "not-allowed",
                    opacity: createForm.rating > 0 ? 1 : 0.6,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={createForm.show_in_reviews}
                    disabled={createForm.rating === 0}
                    onChange={(e) => updateCreateForm("show_in_reviews", e.target.checked)}
                    style={{ marginTop: 2, cursor: createForm.rating > 0 ? "pointer" : "not-allowed" }}
                  />
                  <span style={{ display: "grid", gap: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)" }}>Show on public reviews page</span>
                    <span style={{ fontSize: 12, color: "var(--color-muted)", lineHeight: 1.5 }}>
                      This is available after you add a star rating. The entry can still stay internal if this remains unchecked.
                    </span>
                  </span>
                </label>
              </div>
            )}
          </div>

          {createError && (
            <div style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid #fecaca", background: "#fef2f2", color: "#c53030", fontSize: 13 }}>
              {createError}
            </div>
          )}
        </div>
      </Modal>

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

      {/* Review visibility toggle confirmation */}
      <Modal
        isOpen={!!pendingReviewToggle}
        onClose={() => setPendingReviewToggle(null)}
        title={pendingReviewToggle?.show ? "Show in Reviews" : "Hide from Reviews"}
        actions={
          <>
            <button onClick={() => setPendingReviewToggle(null)} style={btnBase}>Cancel</button>
            <button
              onClick={() => {
                if (pendingReviewToggle) {
                  handleToggleShowInReviews(pendingReviewToggle.id, pendingReviewToggle.show);
                  setPendingReviewToggle(null);
                }
              }}
              style={btnPrimary}
            >
              {pendingReviewToggle?.show ? "Show" : "Hide"}
            </button>
          </>
        }
      >
        <p style={{ color: "var(--color-muted)", fontSize: 14 }}>
          {pendingReviewToggle?.show
            ? "This feedback will be visible on the reviews page. Continue?"
            : "This feedback will be hidden from the reviews page. Continue?"}
        </p>
      </Modal>

      {/* Feedback details modal */}
      {selectedFeedback && (
        <FeedbackDetailsModal
          item={selectedFeedback}
          onClose={() => setSelectedFeedbackId(null)}
          onStatusChange={handleStatusChange}
          onCommentSave={handleCommentSave}
        />
      )}

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
