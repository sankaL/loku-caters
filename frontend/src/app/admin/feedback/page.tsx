"use client";

import { useState, useEffect, useMemo, Fragment, type Dispatch, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { API_URL } from "@/config/event";
import { CompactMetricCard, CompactMetricRail, CompactMetricSkeletonRail, CompactMetricTotalCard } from "@/components/admin/CompactMetricRail";
import { AdminBulkTableFrame, AdminClearFiltersButton, AdminDateCell, AdminDeleteIconButton, AdminPagination, AdminRowCheckboxCell, AdminSearchInput, AdminSelectableTable, AdminTableEmptyState, buildAdminBulkStatusProps } from "@/components/admin/AdminCrudParts";
import AdminToast from "@/components/admin/AdminToast";
import { usePendingStatusChange } from "@/hooks/usePendingStatusChange";
import { useObjectState } from "@/hooks/useObjectState";
import { usePageSelection } from "@/hooks/usePageSelection";
import { useAdminToast } from "@/hooks/useAdminToast";
import { loadAuthenticatedAdminResource } from "@/lib/adminCrud";
import { filterAdminItemsBySearch } from "@/lib/adminSearch";
import { getAdminToken } from "@/lib/auth";
import Modal from "@/components/ui/Modal";
import StarRating from "@/components/ui/StarRating";
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
import { PRE_ORDER_REASON_OPTIONS } from "@/lib/feedbackOptions";

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
  price_too_high:          { bg: "var(--color-error-bg)", text: "var(--color-error-text)" },
  location_not_convenient: { bg: "var(--color-warning-bg)", text: "var(--color-warning-text)" },
  dietary_needs:           { bg: "var(--color-warning-bg)", text: "var(--color-warning-text)" },
  not_available:           { bg: "var(--color-success-bg)", text: "var(--color-success-text)" },
  different_menu:          { bg: "var(--color-info-bg)", text: "var(--color-info-text)" },
  prefer_delivery:         { bg: "var(--color-info-bg)", text: "var(--color-info-text)" },
  not_interested:          { bg: "var(--color-cream)", text: "var(--color-muted)" },
  other:                   { bg: "var(--color-cream)", text: "var(--color-muted)" },
};

const ORIGIN_STYLES: Record<FeedbackOrigin, { bg: string; color: string; border: string; label: string }> = {
  contact_us: {
    bg: "var(--color-info-bg)",
    color: "var(--color-info-text)",
    border: "1px solid var(--color-info-border)",
    label: "Contact Us",
  },
  events_page_non_customer: {
    bg: "var(--color-cream)",
    color: "var(--color-muted)",
    border: "1px solid var(--color-border)",
    label: "Events Page (Non-customer)",
  },
  events_page_customer: {
    bg: "var(--color-success-bg)",
    color: "var(--color-success-text)",
    border: "1px solid var(--color-success-border)",
    label: "Events Page (Customer)",
  },
  event_reminder_email: {
    bg: "var(--color-info-bg)",
    color: "var(--color-info-text)",
    border: "1px solid var(--color-info-border)",
    label: "Event Reminder Email",
  },
  reviews_page: {
    bg: "var(--color-warning-bg)",
    color: "var(--color-warning-text)",
    border: "1px solid var(--color-warning-border)",
    label: "Reviews Page",
  },
  admin_submission: {
    bg: "var(--color-success-bg)",
    color: "var(--color-success-text)",
    border: "1px solid var(--color-success-border)",
    label: "Admin Submission",
  },
};

const TYPE_STYLES: Record<FeedbackType, { bg: string; color: string; border: string; label: string }> = {
  general_question: {
    bg: "var(--color-info-bg)",
    color: "var(--color-info-text)",
    border: "1px solid var(--color-info-border)",
    label: "General Question",
  },
  feedback: {
    bg: "var(--color-success-bg)",
    color: "var(--color-success-text)",
    border: "1px solid var(--color-success-border)",
    label: "Feedback",
  },
  collaboration: {
    bg: "var(--color-error-bg)",
    color: "var(--color-error-text)",
    border: "1px solid var(--color-error-border)",
    label: "Collaboration",
  },
  other: {
    bg: "var(--color-cream)",
    color: "var(--color-muted)",
    border: "1px solid var(--color-border)",
    label: "Other",
  },
};

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
    new:         { bg: "var(--color-cream)", text: "var(--color-text)", label: "New" },
    in_progress: { bg: "var(--color-warning-bg)", text: "var(--color-warning-text)", label: "In Progress" },
    resolved:    { bg: "var(--color-success-bg)", text: "var(--color-success-text)", label: "Resolved" },
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

function FeedbackStatusControl({ item, onStatusChange }: { item: FeedbackItem; onStatusChange: (id: string, status: string) => Promise<void> }) {
  const { updating, pendingStatus, setPendingStatus, confirmStatusChange, cancelStatusChange } = usePendingStatusChange(item.id, onStatusChange);

  return (
    <DetailField label="Status">
      <select
        value={item.status}
        onChange={(event) => setPendingStatus(event.target.value)}
        disabled={updating}
        style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid var(--color-border)", fontSize: 13, color: "var(--color-text)", background: "white", cursor: updating ? "not-allowed" : "pointer", outline: "none" }}
      >
        <option value="new">New</option>
        <option value="in_progress">In Progress</option>
        <option value="resolved">Resolved</option>
      </select>
      {pendingStatus && (
        <div style={{ marginTop: 10, padding: "10px 12px", background: "var(--color-warning-bg)", border: "1px solid var(--color-warning-border)", borderRadius: 10 }}>
          <p style={{ fontSize: 12, color: "var(--color-text)", marginBottom: 8 }}>Change status from <strong>{item.status}</strong> to <strong>{pendingStatus}</strong>?</p>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={cancelStatusChange} disabled={updating} style={{ padding: "5px 10px", borderRadius: 8, border: "1px solid var(--color-border)", background: "white", color: "var(--color-text)", fontSize: 12, fontWeight: 600, cursor: updating ? "not-allowed" : "pointer" }}>Cancel</button>
            <button onClick={confirmStatusChange} disabled={updating} style={{ padding: "5px 10px", borderRadius: 8, border: "none", background: "var(--color-forest)", color: "var(--color-cream)", fontSize: 12, fontWeight: 600, cursor: updating ? "not-allowed" : "pointer" }}>{updating ? "Updating..." : "Confirm"}</button>
          </div>
        </div>
      )}
    </DetailField>
  );
}

function FeedbackTextSection({ label, value, emptyMessage }: { label: string; value: string | null; emptyMessage: string }) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</p>
      <div style={{ padding: 16, borderRadius: 16, border: "1px solid var(--color-border)", background: "var(--color-cream)" }}>
        {value
          ? <p style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", color: "var(--color-text)", lineHeight: 1.7 }}>{value}</p>
          : <p style={{ margin: 0, color: "var(--color-muted)", fontStyle: "italic" }}>{emptyMessage}</p>}
      </div>
    </div>
  );
}

function OriginMetricCard({ label, count, description, icon, selected, onClick }: {
  label: string;
  count: number;
  description: string;
  icon: React.ReactNode;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <CompactMetricCard onClick={onClick} selected={selected}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <p style={{ fontSize: 10, fontWeight: 600, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</p>
        {icon}
      </div>
      <p style={{ fontSize: "clamp(24px, 2vw, 28px)", fontWeight: 700, color: "var(--color-forest)", fontFamily: "var(--font-serif)", lineHeight: 1 }}>{count}</p>
      <p style={{ fontSize: 10, color: "var(--color-muted)", marginTop: 6, lineHeight: 1.4 }}>{description}</p>
    </CompactMetricCard>
  );
}

function FeedbackEmptyState({ hasFilters, onCreate, buttonStyle }: { hasFilters: boolean; onCreate: () => void; buttonStyle: React.CSSProperties }) {
  return (
    <AdminTableEmptyState
      icon={<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>}
      title="No feedback yet"
      description={hasFilters ? "No results match your filters." : "Feedback, contact messages, customer notes, and admin-submitted entries will appear here."}
      action={!hasFilters ? <button onClick={onCreate} style={buttonStyle}>Submit feedback</button> : undefined}
    />
  );
}

function FeedbackRatingStars({ rating }: { rating: number | null }) {
  if (rating == null) return null;
  return <div style={{ display: "flex", gap: 1 }}>{[1, 2, 3, 4, 5].map((star) => <svg key={star} width="11" height="11" viewBox="0 0 24 24" fill={star <= rating ? "var(--color-accent)" : "none"} stroke={star <= rating ? "var(--color-accent)" : "var(--color-border)"} strokeWidth="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>)}</div>;
}

function FeedbackPreview({ item }: { item: FeedbackItem }) {
  const value = item.message || item.other_details;
  const color = item.message ? "var(--color-text)" : value ? "var(--color-muted)" : "var(--color-border)";
  return <span style={{ color, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{value || "-"}</span>;
}

function FeedbackReviewToggle({ visible, onClick }: { visible: boolean; onClick: () => void }) {
  return <button onClick={onClick} title={visible ? "Hide from reviews" : "Show in reviews"} style={{ padding: "5px 8px", borderRadius: 8, border: visible ? "1px solid var(--color-warning-border)" : "1px solid var(--color-border)", background: visible ? "var(--color-warning-bg)" : "white", cursor: "pointer", color: visible ? "var(--color-warning-text)" : "var(--color-muted)", display: "inline-flex", alignItems: "center", transition: "all 0.15s" }}><svg width="13" height="13" viewBox="0 0 24 24" fill={visible ? "var(--color-accent)" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg></button>;
}

function FeedbackTableRow({ item, selected, last, onOpen, onToggleSelected, onToggleReview, onDelete }: {
  item: FeedbackItem;
  selected: boolean;
  last: boolean;
  onOpen: () => void;
  onToggleSelected: () => void;
  onToggleReview: () => void;
  onDelete: () => void;
}) {
  return (
    <tr onClick={onOpen} style={{ borderBottom: last ? "none" : "1px solid var(--color-border)", background: "white", cursor: "pointer", transition: "background 0.1s" }}>
      <AdminRowCheckboxCell checked={selected} onChange={onToggleSelected} />
      <AdminDateCell date={formatDate(item.created_at)} time={formatTime(item.created_at)} />
      <td style={{ padding: "13px 16px", whiteSpace: "nowrap", verticalAlign: "top" }}><OriginBadge origin={item.origin} label={item.origin_label} /></td>
      <td style={{ padding: "13px 16px", whiteSpace: "nowrap", verticalAlign: "top" }}><TypeBadge type={item.feedback_type} label={item.feedback_type_label} /></td>
      <td style={{ padding: "13px 16px", whiteSpace: "nowrap", verticalAlign: "top" }}><span style={{ fontWeight: item.name ? 500 : 400, color: item.name ? "var(--color-text)" : "var(--color-muted)", fontStyle: item.name ? "normal" : "italic" }}>{item.name || "Anonymous"}</span></td>
      <td style={{ padding: "13px 16px", whiteSpace: "nowrap", verticalAlign: "top" }}><span style={{ color: item.contact ? "var(--color-text)" : "var(--color-border)" }}>{item.contact || "-"}</span></td>
      <td style={{ padding: "13px 16px", verticalAlign: "top" }}>{item.reason && item.reason_label ? <ReasonBadge reason={item.reason} label={item.reason_label} /> : <span style={{ color: "var(--color-border)" }}>-</span>}</td>
      <td style={{ padding: "13px 16px", verticalAlign: "top", whiteSpace: "nowrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <StatusBadge status={item.status} />
          <FeedbackRatingStars rating={item.rating} />
        </div>
      </td>
      <td style={{ padding: "13px 16px", color: "var(--color-text)", maxWidth: 280, verticalAlign: "top" }}><FeedbackPreview item={item} /></td>
      <td style={{ padding: "13px 16px", verticalAlign: "top", whiteSpace: "nowrap" }} onClick={(event) => event.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <FeedbackReviewToggle visible={item.show_in_reviews} onClick={onToggleReview} />
          <AdminDeleteIconButton onClick={onDelete} />
        </div>
      </td>
    </tr>
  );
}

function FeedbackMetrics({ loading, data, sortedMetrics, originFilter, reasonFilter, onOriginFilter, onReasonFilter }: {
  loading: boolean;
  data: FeedbackResponse | null;
  sortedMetrics: FeedbackMetric[];
  originFilter: string;
  reasonFilter: string;
  onOriginFilter: (origin: string) => void;
  onReasonFilter: (reason: string) => void;
}) {
  if (loading) {
    return <CompactMetricSkeletonRail count={5} />;
  }
  if (!data) return null;
  const topReason = sortedMetrics[0];
  const reasonColors = topReason ? REASON_COLORS[topReason.reason] ?? { bg: "var(--color-cream)", text: "var(--color-muted)" } : null;
  const toggleOrigin = (origin: string) => onOriginFilter(originFilter === origin ? "all" : origin);
  return (
    <CompactMetricRail>
      <CompactMetricTotalCard label="Total Responses" value={data.total} />
      <OriginMetricCard label="Contact Us" count={data.origin_counts.contact_us} description="Messages and inquiries" selected={originFilter === "contact_us"} onClick={() => toggleOrigin("contact_us")} icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-info-text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>} />
      <OriginMetricCard label="Events Page" count={data.origin_counts.events_page_non_customer} description="Pre-order feedback" selected={originFilter === "events_page_non_customer"} onClick={() => toggleOrigin("events_page_non_customer")} icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-bark)" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>} />
      <OriginMetricCard label="Customers" count={data.origin_counts.events_page_customer} description="Post-order feedback" selected={originFilter === "events_page_customer"} onClick={() => toggleOrigin("events_page_customer")} icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-success-text)" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>} />
      <OriginMetricCard label="Reminder Email" count={data.origin_counts.event_reminder_email} description="Event reminder responses" selected={originFilter === "event_reminder_email"} onClick={() => toggleOrigin("event_reminder_email")} icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-info-text)" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>} />
      <OriginMetricCard label="Admin Submitted" count={data.origin_counts.admin_submission} description="Captured outside the platform" selected={originFilter === "admin_submission"} onClick={() => toggleOrigin("admin_submission")} icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-success-text)" strokeWidth="2"><path d="M9 12h6" /><path d="M12 9v6" /><path d="M9 3h6l1 2h4v16H4V5h4l1-2z" /></svg>} />
      {topReason && reasonColors && <CompactMetricCard onClick={() => onReasonFilter(reasonFilter === topReason.reason ? "all" : topReason.reason)} selected={reasonFilter === topReason.reason}><div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}><p style={{ fontSize: 10, fontWeight: 600, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Top Reason</p><span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: "999px", background: reasonColors.bg, color: reasonColors.text }}>{topReason.pct}%</span></div><p style={{ fontSize: 13, fontWeight: 700, color: "var(--color-forest)", lineHeight: 1.3, marginBottom: 6 }}>{topReason.label}</p><p style={{ fontSize: "clamp(22px, 1.8vw, 24px)", fontWeight: 700, color: "var(--color-forest)", fontFamily: "var(--font-serif)", lineHeight: 1 }}>{topReason.count}</p></CompactMetricCard>}
    </CompactMetricRail>
  );
}

function FeedbackReasonBreakdown({ visible, metrics, activeReason, onReasonChange }: { visible: boolean; metrics: FeedbackMetric[]; activeReason: string; onReasonChange: (reason: string) => void }) {
  if (!visible) return null;
  return (
    <div style={{ background: "white", border: "1px solid var(--color-border)", borderRadius: 20, padding: 20, marginBottom: 24 }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>Batch Feedback Reason Breakdown</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {metrics.map((metric) => {
          const colors = REASON_COLORS[metric.reason] ?? { text: "var(--color-muted)" };
          const active = activeReason === metric.reason;
          return <div key={metric.reason} style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }} onClick={() => onReasonChange(active ? "all" : metric.reason)}><div style={{ width: 140, flexShrink: 0, fontSize: 13, color: active ? "var(--color-forest)" : "var(--color-text)", fontWeight: active ? 600 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{metric.label}</div><div style={{ flex: 1, height: 8, borderRadius: 4, background: "var(--color-cream)", overflow: "hidden" }}><div style={{ height: 8, borderRadius: 4, width: `${metric.pct}%`, background: active ? "var(--color-forest)" : colors.text, opacity: active ? 1 : 0.6, transition: "width 0.4s ease, background 0.15s" }} /></div><div style={{ width: 36, flexShrink: 0, textAlign: "right", fontSize: 13, fontWeight: 600, color: "var(--color-forest)" }}>{metric.count}</div><div style={{ width: 36, flexShrink: 0, textAlign: "right", fontSize: 12, color: "var(--color-muted)" }}>{metric.pct}%</div></div>;
        })}
      </div>
    </div>
  );
}

function FeedbackFilters({ filters, loading, resultCount, onChange, onClear }: { filters: { originFilter: string; typeFilter: string; preOrderReasonFilter: string; statusFilter: string; searchQuery: string }; loading: boolean; resultCount: number; onChange: (field: "originFilter" | "typeFilter" | "preOrderReasonFilter" | "statusFilter" | "searchQuery", value: string) => void; onClear: () => void }) {
  const hasFilters = filters.originFilter !== "all" || filters.typeFilter !== "all" || filters.preOrderReasonFilter !== "all" || filters.statusFilter !== "all" || Boolean(filters.searchQuery);
  const selectStyle = { padding: "9px 12px", borderRadius: 12, border: "1px solid var(--color-border)", fontSize: 13, color: "var(--color-text)", background: "white", cursor: "pointer", outline: "none" };
  return <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}><AdminSearchInput value={filters.searchQuery} onChange={(value) => onChange("searchQuery", value)} placeholder="Search origin, type, name, contact, message..." /><select value={filters.originFilter} onChange={(event) => onChange("originFilter", event.target.value)} style={selectStyle}><option value="all">All origins</option><option value="contact_us">Contact Us</option><option value="events_page_non_customer">Events Page (Non-customer)</option><option value="events_page_customer">Events Page (Customer)</option><option value="event_reminder_email">Event Reminder Email</option><option value="reviews_page">Reviews Page</option><option value="admin_submission">Admin Submission</option></select><select value={filters.typeFilter} onChange={(event) => onChange("typeFilter", event.target.value)} style={selectStyle}><option value="all">All types</option><option value="general_question">General Question</option><option value="feedback">Feedback</option><option value="collaboration">Collaboration</option><option value="other">Other</option></select><select value={filters.preOrderReasonFilter} onChange={(event) => onChange("preOrderReasonFilter", event.target.value)} style={selectStyle}><option value="all">All pre-order reasons</option>{PRE_ORDER_REASON_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><select value={filters.statusFilter} onChange={(event) => onChange("statusFilter", event.target.value)} style={selectStyle}><option value="all">All statuses</option><option value="new">New</option><option value="in_progress">In Progress</option><option value="resolved">Resolved</option></select>{hasFilters && <AdminClearFiltersButton onClick={onClear} />}{!loading && <span style={{ fontSize: 13, color: "var(--color-muted)", marginLeft: "auto" }}>{resultCount} result{resultCount === 1 ? "" : "s"}</span>}</div>;
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

  useEffect(() => {
    setCommentText(item.admin_comment ?? "");
  }, [item.admin_comment, item.id]);

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

          <FeedbackStatusControl item={item} onStatusChange={onStatusChange} />

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

        <FeedbackTextSection label="Message" value={item.message} emptyMessage="No message provided." />
        <FeedbackTextSection label="Other details" value={item.other_details} emptyMessage="No additional details provided." />

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

function buildAdminFeedbackPayload(
  form: AdminFeedbackFormState,
  typeConfig: AdminFeedbackTypeConfig,
  supportsReviews: boolean,
) {
  const hasRating = supportsReviews && form.rating > 0;
  return {
    feedback_type: form.feedback_type,
    name: form.name.trim() || undefined,
    contact: form.contact.trim() || undefined,
    order_id: typeConfig.showOrderId ? form.order_id.trim() || undefined : undefined,
    message: form.message.trim(),
    other_details: typeConfig.showOtherDetails ? form.other_details.trim() || undefined : undefined,
    rating: hasRating ? form.rating : undefined,
    show_in_reviews: hasRating ? form.show_in_reviews : false,
  };
}

async function submitAdminFeedback(headers: Record<string, string>, payload: ReturnType<typeof buildAdminFeedbackPayload>) {
  const response = await fetch(`${API_URL}/api/admin/feedback`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (response.status === 401) return null;
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    const detail = typeof result?.detail === "string" ? result.detail : "Failed to submit feedback";
    throw new Error(detail);
  }
  return response.json() as Promise<FeedbackItem>;
}

type SetFeedbackData = Dispatch<SetStateAction<FeedbackResponse | null>>;

async function getFeedbackAuthHeader(): Promise<Record<string, string>> {
  const token = await getAdminToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function filterFeedbackItems(data: FeedbackResponse | null, origin: string, type: string, reason: string, status: string, search: string): FeedbackItem[] {
  if (!data) return [];
  let items = data.items;
  if (origin !== "all") items = items.filter((item) => item.origin === origin);
  if (type !== "all") items = items.filter((item) => item.feedback_type === type);
  if (reason !== "all") items = items.filter((item) => item.reason === reason);
  if (status !== "all") items = items.filter((item) => item.status === status);
  return filterAdminItemsBySearch(items, search, (item) => [item.origin_label, item.feedback_type_label, item.name, item.contact, item.reason_label, item.other_details, item.message].filter(Boolean).join(" "));
}

function recomputeReasonMetrics(items: FeedbackItem[], template: FeedbackMetric[]): FeedbackMetric[] {
  const batchItems = items.filter((item) => item.origin === "events_page_non_customer" || item.origin === "event_reminder_email");
  return template.map((metric) => {
    const count = batchItems.filter((item) => item.reason === metric.reason).length;
    return { ...metric, count, pct: batchItems.length > 0 ? Math.round((count / batchItems.length) * 100) : 0 };
  });
}

function rebuildFeedbackData(previous: FeedbackResponse, items: FeedbackItem[]): FeedbackResponse {
  return { ...previous, items, total: items.length, origin_counts: buildOriginCounts(items), type_counts: buildTypeCounts(items), reason_metrics: recomputeReasonMetrics(items, previous.reason_metrics) };
}

type FeedbackNotify = (message: string, type: "success" | "error") => void;

function patchFeedbackItem(setData: SetFeedbackData, id: string, patch: Partial<FeedbackItem>) {
  setData((previous) => previous ? { ...previous, items: previous.items.map((item) => item.id === id ? { ...item, ...patch } : item) } : previous);
}

async function updateFeedbackStatus(id: string, status: string, data: FeedbackResponse | null, setData: SetFeedbackData, notify: FeedbackNotify) {
  const previousStatus = data?.items.find((item) => item.id === id)?.status;
  patchFeedbackItem(setData, id, { status });
  try {
    const response = await fetch(`${API_URL}/api/admin/feedback/${id}/status`, { method: "PATCH", headers: { ...await getFeedbackAuthHeader(), "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (!response.ok) throw new Error("Failed to update status");
    notify("Status updated", "success");
  } catch {
    if (previousStatus) patchFeedbackItem(setData, id, { status: previousStatus });
    notify("Failed to update status", "error");
  }
}

async function saveFeedbackComment(id: string, adminComment: string | null, setData: SetFeedbackData, notify: FeedbackNotify) {
  try {
    const response = await fetch(`${API_URL}/api/admin/feedback/${id}/comment`, { method: "PATCH", headers: { ...await getFeedbackAuthHeader(), "Content-Type": "application/json" }, body: JSON.stringify({ admin_comment: adminComment }) });
    if (!response.ok) throw new Error("Failed to save note");
    patchFeedbackItem(setData, id, { admin_comment: adminComment });
    notify("Note saved", "success");
  } catch {
    notify("Failed to save note", "error");
  }
}

async function toggleFeedbackReviewVisibility(id: string, visible: boolean, data: FeedbackResponse | null, setData: SetFeedbackData, notify: FeedbackNotify) {
  const previousValue = data?.items.find((item) => item.id === id)?.show_in_reviews;
  patchFeedbackItem(setData, id, { show_in_reviews: visible });
  try {
    const response = await fetch(`${API_URL}/api/admin/feedback/${id}/show-in-reviews`, { method: "PATCH", headers: { ...await getFeedbackAuthHeader(), "Content-Type": "application/json" }, body: JSON.stringify({ show_in_reviews: visible }) });
    if (!response.ok) throw new Error("Failed to update review visibility");
    const result = await response.json() as { show_in_reviews: boolean };
    notify(result.show_in_reviews ? "Shown in reviews" : "Hidden from reviews", "success");
  } catch {
    if (previousValue !== undefined) patchFeedbackItem(setData, id, { show_in_reviews: previousValue });
    notify("Failed to update review visibility", "error");
  }
}

async function deleteFeedbackEntry(id: string, setData: SetFeedbackData, setSelectedIds: Dispatch<SetStateAction<Set<string>>>, selectedFeedbackId: string | null, setSelectedFeedbackId: Dispatch<SetStateAction<string | null>>, closeModal: () => void, notify: FeedbackNotify) {
  try {
    const response = await fetch(`${API_URL}/api/admin/feedback/${id}`, { method: "DELETE", headers: await getFeedbackAuthHeader() });
    if (!response.ok) throw new Error("Failed to delete entry");
    setData((previous) => previous ? rebuildFeedbackData(previous, previous.items.filter((item) => item.id !== id)) : previous);
    setSelectedIds((previous) => removeSelectedIds(previous, [id]));
    if (selectedFeedbackId === id) setSelectedFeedbackId(null);
    closeModal();
    notify("Entry deleted", "success");
  } catch {
    notify("Failed to delete entry", "error");
  }
}

async function deleteFeedbackEntries(ids: string[], setData: SetFeedbackData, setSelectedIds: Dispatch<SetStateAction<Set<string>>>, selectedFeedbackId: string | null, setSelectedFeedbackId: Dispatch<SetStateAction<string | null>>, closeModal: () => void, notify: FeedbackNotify) {
  await runAdminBulkAction({
    ids,
    request: async () => postAdminBulkDelete(`${API_URL}/api/admin/feedback/bulk-delete`, ids, await getFeedbackAuthHeader()),
    applyCompleted: (completedIds) => {
      setData((previous) => previous ? rebuildFeedbackData(previous, removeItemsByIds(previous.items, completedIds)) : previous);
      setSelectedIds((previous) => removeSelectedIds(previous, completedIds));
      if (selectedFeedbackId && completedIds.includes(selectedFeedbackId)) setSelectedFeedbackId(null);
    },
    closeModal,
    notify,
    successMessage: `${ids.length} entr${ids.length === 1 ? "y" : "ies"} deleted`,
    failureAction: "Deleted",
    failureMessage: "Failed to delete entries",
  });
}

async function updateFeedbackStatuses(ids: string[], status: string, setData: SetFeedbackData, closeModal: () => void, notify: FeedbackNotify) {
  await runAdminBulkAction({
    ids,
    request: async () => postAdminBulkStatus(`${API_URL}/api/admin/feedback/bulk-status`, ids, await getFeedbackAuthHeader(), status),
    applyCompleted: (completedIds) => setData((previous) => previous ? { ...previous, items: updateItemStatuses(previous.items, completedIds, status) } : previous),
    closeModal,
    notify,
    successMessage: `${ids.length} entr${ids.length === 1 ? "y" : "ies"} updated`,
    failureAction: "Updated",
    failureMessage: "Failed to update status",
  });
}

function useFeedbackResource() {
  const router = useRouter();
  const [resource, setResource] = useObjectState({ data: null as FeedbackResponse | null, loading: true, error: "" });
  useEffect(() => {
    void loadAuthenticatedAdminResource<FeedbackResponse>({ resourcePath: "/api/admin/feedback", failureMessage: "Could not load feedback. Please refresh.", setLoading: (value) => setResource("loading", value), setError: (value) => setResource("error", value), onLoaded: (value) => setResource("data", value), onUnauthorized: () => router.push("/admin/login") });
  }, [router, setResource]);
  const setData: SetFeedbackData = (value) => setResource("data", value);
  return { ...resource, setData };
}

function useFeedbackFilters(data: FeedbackResponse | null) {
  const [filters, setFilter] = useObjectState({ originFilter: "all", typeFilter: "all", preOrderReasonFilter: "all", statusFilter: "all", searchQuery: "", page: 1 });
  const filtered = useMemo(() => filterFeedbackItems(data, filters.originFilter, filters.typeFilter, filters.preOrderReasonFilter, filters.statusFilter, filters.searchQuery), [data, filters.originFilter, filters.preOrderReasonFilter, filters.searchQuery, filters.statusFilter, filters.typeFilter]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / 15));
  const paginated = filtered.slice((filters.page - 1) * 15, filters.page * 15);
  const sortedMetrics = useMemo(() => data ? [...data.reason_metrics].sort((left, right) => right.count - left.count).filter((metric) => metric.count > 0) : [], [data]);
  useEffect(() => setFilter("page", 1), [filters.originFilter, filters.typeFilter, filters.preOrderReasonFilter, filters.statusFilter, filters.searchQuery, setFilter]);
  useEffect(() => setFilter("page", (previous) => Math.min(previous, totalPages)), [setFilter, totalPages]);
  const hasFilters = filters.originFilter !== "all" || filters.typeFilter !== "all" || filters.preOrderReasonFilter !== "all" || filters.statusFilter !== "all" || Boolean(filters.searchQuery);
  return { filters, setFilter, filtered, paginated, totalPages, sortedMetrics, hasFilters };
}

function useFeedbackSelection(data: FeedbackResponse | null, paginated: FeedbackItem[]) {
  const selection = usePageSelection(paginated, null as string | null);
  const selectedFeedback = useMemo(() => selection.detail ? data?.items.find((item) => item.id === selection.detail) ?? null : null, [data, selection.detail]);
  return { selectedIds: selection.selectedIds, setSelectedIds: selection.setSelectedIds, selectedFeedbackId: selection.detail, setSelectedFeedbackId: selection.setDetail, selectedFeedback, headerCheckboxRef: selection.headerCheckboxRef, allOnPageSelected: selection.allOnPageSelected, toggleSelectAll: selection.toggleAll, toggleSelect: selection.toggleOne };
}

function useFeedbackOverlays() {
  const [overlays, setOverlay] = useObjectState({ deleteTarget: null as string | null, showBulkDeleteModal: false, showBulkStatusModal: false, bulkStatusTarget: "resolved", pendingReviewToggle: null as { id: string; show: boolean } | null, showCreateModal: false });
  const { toast, showToast } = useAdminToast();
  return { overlays, setOverlay, toast, showToast };
}

function useFeedbackCreateState() {
  return useObjectState({ createForm: INITIAL_ADMIN_FEEDBACK_FORM, createErrors: {} as AdminFeedbackFieldErrors, createError: "", creating: false });
}

const FEEDBACK_CREATE_INPUT_STYLE: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: 12, border: "1px solid var(--color-border)", fontSize: 13, color: "var(--color-text)", background: "white", outline: "none", boxSizing: "border-box" };

function FeedbackFormSectionIntro({ title, description }: { title: string; description: string }) {
  return <div><p style={{ fontSize: 11, fontWeight: 600, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.06em", margin: 0, marginBottom: 6 }}>{title}</p><p style={{ margin: 0, fontSize: 13, color: "var(--color-muted)", lineHeight: 1.6 }}>{description}</p></div>;
}

function FeedbackOptionalContext({ form, typeConfig, onChange }: { form: AdminFeedbackFormState; typeConfig: AdminFeedbackTypeConfig; onChange: <K extends keyof AdminFeedbackFormState>(field: K, value: AdminFeedbackFormState[K]) => void }) {
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
        <div style={{ display: "grid", gap: 6 }}><label style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)" }}>Name</label><input type="text" value={form.name} onChange={(event) => onChange("name", event.target.value)} placeholder="Who shared this feedback?" style={FEEDBACK_CREATE_INPUT_STYLE} /></div>
        {typeConfig.showContact && !typeConfig.contactRequired && <div style={{ display: "grid", gap: 6 }}><label style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)" }}>{typeConfig.contactLabel}</label><input type="text" value={form.contact} onChange={(event) => onChange("contact", event.target.value)} placeholder={typeConfig.contactPlaceholder} style={FEEDBACK_CREATE_INPUT_STYLE} /></div>}
        {typeConfig.showOrderId && <div style={{ display: "grid", gap: 6 }}><label style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)" }}>Related order ID</label><input type="text" value={form.order_id} onChange={(event) => onChange("order_id", event.target.value)} placeholder="Add an order ID only if this feedback links to one" style={FEEDBACK_CREATE_INPUT_STYLE} /></div>}
      </div>
      {typeConfig.showOtherDetails && <div style={{ display: "grid", gap: 6 }}><label style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)" }}>{typeConfig.otherDetailsLabel}</label><textarea value={form.other_details} onChange={(event) => onChange("other_details", event.target.value)} placeholder={typeConfig.otherDetailsPlaceholder} rows={3} style={{ ...FEEDBACK_CREATE_INPUT_STYLE, resize: "vertical", fontFamily: "inherit" }} /></div>}
    </>
  );
}

function FeedbackReviewOptions({ enabled, form, buttonStyle, onRatingChange, onFormChange }: { enabled: boolean; form: AdminFeedbackFormState; buttonStyle: React.CSSProperties; onRatingChange: (rating: number) => void; onFormChange: <K extends keyof AdminFeedbackFormState>(field: K, value: AdminFeedbackFormState[K]) => void }) {
  if (!enabled) return null;
  const hasRating = form.rating > 0;
  return (
    <div style={{ padding: 16, borderRadius: 16, border: "1px solid var(--color-warning-border)", background: "var(--color-warning-bg)", display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gap: 4 }}><label style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)" }}>Star rating</label><p style={{ margin: 0, fontSize: 12, color: "var(--color-muted)", lineHeight: 1.5 }}>Add an optional rating if this entry should appear as a starred review.</p></div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}><StarRating value={form.rating} onChange={onRatingChange} size={28} mode="input" /><span style={{ fontSize: 13, color: "var(--color-muted)" }}>{hasRating ? `${form.rating} out of 5` : "No rating selected"}</span>{hasRating && <button onClick={() => onRatingChange(0)} style={buttonStyle}>Clear rating</button>}</div>
      <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: hasRating ? "pointer" : "not-allowed", opacity: hasRating ? 1 : 0.6 }}><input type="checkbox" checked={form.show_in_reviews} disabled={!hasRating} onChange={(event) => onFormChange("show_in_reviews", event.target.checked)} style={{ marginTop: 2, cursor: hasRating ? "pointer" : "not-allowed" }} /><span style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)" }}>Show on public reviews page</span><span style={{ fontSize: 12, color: "var(--color-muted)", lineHeight: 1.5 }}>This is available after you add a star rating. The entry can still stay internal if this remains unchecked.</span></span></label>
    </div>
  );
}

function FeedbackTypePicker({ selectedType, onChange }: { selectedType: FeedbackType; onChange: (type: FeedbackType) => void }) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.06em", margin: 0 }}>Feedback type</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
        {(Object.keys(ADMIN_FEEDBACK_TYPE_CONFIG) as FeedbackType[]).map((type) => {
          const config = ADMIN_FEEDBACK_TYPE_CONFIG[type];
          const selected = selectedType === type;
          return <button key={type} onClick={() => onChange(type)} style={{ textAlign: "left", padding: 14, borderRadius: 14, border: selected ? "1px solid var(--color-forest)" : "1px solid var(--color-border)", background: selected ? "var(--color-success-bg)" : "white", cursor: "pointer", display: "grid", gap: 6 }}><span style={{ fontSize: 14, fontWeight: 600, color: selected ? "var(--color-forest)" : "var(--color-text)" }}>{config.title}</span><span style={{ fontSize: 12, color: "var(--color-muted)", lineHeight: 1.5 }}>{config.description}</span></button>;
        })}
      </div>
    </div>
  );
}

function FeedbackRequiredFields({ form, errors, typeConfig, onChange }: { form: AdminFeedbackFormState; errors: AdminFeedbackFieldErrors; typeConfig: AdminFeedbackTypeConfig; onChange: <K extends keyof AdminFeedbackFormState>(field: K, value: AdminFeedbackFormState[K]) => void }) {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <FeedbackFormSectionIntro title="Required details" description={typeConfig.description} />
      {typeConfig.showContact && typeConfig.contactRequired && <div style={{ display: "grid", gap: 6 }}><label style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)" }}>{typeConfig.contactLabel} <span style={{ color: "var(--color-error-text)" }}>*</span></label><input type="text" value={form.contact} onChange={(event) => onChange("contact", event.target.value)} placeholder={typeConfig.contactPlaceholder} style={{ ...FEEDBACK_CREATE_INPUT_STYLE, border: errors.contact ? "1px solid var(--color-error-text)" : "1px solid var(--color-border)" }} />{errors.contact && <p style={{ margin: 0, fontSize: 12, color: "var(--color-error-text)" }}>{errors.contact}</p>}</div>}
      <div style={{ display: "grid", gap: 6 }}><label style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)" }}>{typeConfig.messageLabel} <span style={{ color: "var(--color-error-text)" }}>*</span></label><textarea value={form.message} onChange={(event) => onChange("message", event.target.value)} placeholder={typeConfig.messagePlaceholder} rows={5} style={{ ...FEEDBACK_CREATE_INPUT_STYLE, border: errors.message ? "1px solid var(--color-error-text)" : "1px solid var(--color-border)", resize: "vertical", fontFamily: "inherit" }} />{errors.message && <p style={{ margin: 0, fontSize: 12, color: "var(--color-error-text)" }}>{errors.message}</p>}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function FeedbackCreateModal({ showCreateModal, closeCreateModal, handleCreateFeedback, creating, btnBase, btnPrimary, createForm, createErrors, createError, activeCreateType, createFormSupportsReviews, updateCreateForm, updateCreateRating }: {
  showCreateModal: boolean;
  closeCreateModal: () => void;
  handleCreateFeedback: () => void;
  creating: boolean;
  btnBase: React.CSSProperties;
  btnPrimary: React.CSSProperties;
  createForm: AdminFeedbackFormState;
  createErrors: AdminFeedbackFieldErrors;
  createError: string;
  activeCreateType: AdminFeedbackTypeConfig;
  createFormSupportsReviews: boolean;
  updateCreateForm: <K extends keyof AdminFeedbackFormState>(field: K, value: AdminFeedbackFormState[K]) => void;
  updateCreateRating: (rating: number) => void;
}) {
  return (
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
            border: "1px solid var(--color-success-border)",
            background: "var(--color-success-bg)",
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

        <FeedbackTypePicker selectedType={createForm.feedback_type} onChange={(type) => updateCreateForm("feedback_type", type)} />
        <FeedbackRequiredFields form={createForm} errors={createErrors} typeConfig={activeCreateType} onChange={updateCreateForm} />

        <div style={{ display: "grid", gap: 14 }}>
          <FeedbackFormSectionIntro title="Optional context" description="Add supporting details only if they help the team understand or follow up on the entry." />

          <FeedbackOptionalContext form={createForm} typeConfig={activeCreateType} onChange={updateCreateForm} />
          <FeedbackReviewOptions enabled={createFormSupportsReviews} form={createForm} buttonStyle={btnBase} onRatingChange={updateCreateRating} onFormChange={updateCreateForm} />
        </div>

        {createError && (
          <div style={{ padding: "12px 14px", borderRadius: 12, border: "1px solid var(--color-error-border)", background: "var(--color-error-bg)", color: "var(--color-error-text)", fontSize: 13 }}>
            {createError}
          </div>
        )}
      </div>
    </Modal>

  );
}

function FeedbackReviewModal({ pendingReviewToggle, cancelStyle, confirmStyle, onClose, onConfirm }: { pendingReviewToggle: { id: string; show: boolean } | null; cancelStyle: React.CSSProperties; confirmStyle: React.CSSProperties; onClose: () => void; onConfirm: (id: string, show: boolean) => void }) {
  const action = pendingReviewToggle?.show ? "Show" : "Hide";
  return <Modal isOpen={Boolean(pendingReviewToggle)} onClose={onClose} title={`${action} from Reviews`} actions={<><button onClick={onClose} style={cancelStyle}>Cancel</button><button onClick={() => pendingReviewToggle && onConfirm(pendingReviewToggle.id, pendingReviewToggle.show)} style={confirmStyle}>{action}</button></>}><p style={{ color: "var(--color-muted)", fontSize: 14 }}>{pendingReviewToggle?.show ? "This feedback will be visible on the reviews page. Continue?" : "This feedback will be hidden from the reviews page. Continue?"}</p></Modal>;
}

function FeedbackDeleteModals({ deleteTarget, selectedCount, showBulkDeleteModal, cancelStyle, deleteStyle, onCloseDelete, onDelete, onCloseBulkDelete, onBulkDelete }: {
  deleteTarget: string | null;
  selectedCount: number;
  showBulkDeleteModal: boolean;
  cancelStyle: React.CSSProperties;
  deleteStyle: React.CSSProperties;
  onCloseDelete: () => void;
  onDelete: (id: string) => void;
  onCloseBulkDelete: () => void;
  onBulkDelete: () => void;
}) {
  const entryWord = selectedCount === 1 ? "entry" : "entries";
  return <><Modal isOpen={Boolean(deleteTarget)} onClose={onCloseDelete} title="Delete feedback entry" variant="danger" actions={<><button onClick={onCloseDelete} style={cancelStyle}>Cancel</button><button onClick={() => deleteTarget && onDelete(deleteTarget)} style={deleteStyle}>Delete</button></>}>This feedback entry will be permanently deleted. This action cannot be undone.</Modal><Modal isOpen={showBulkDeleteModal} onClose={onCloseBulkDelete} title={`Delete ${selectedCount} ${entryWord}`} variant="danger" actions={<><button onClick={onCloseBulkDelete} style={cancelStyle}>Cancel</button><button onClick={onBulkDelete} style={deleteStyle}>Delete all</button></>}>{selectedCount} feedback {entryWord} will be permanently deleted. This action cannot be undone.</Modal></>;
}

function FeedbackBulkStatusModal({ open, selectedCount, status, cancelStyle, confirmStyle, onClose, onConfirm }: { open: boolean; selectedCount: number; status: string; cancelStyle: React.CSSProperties; confirmStyle: React.CSSProperties; onClose: () => void; onConfirm: () => void }) {
  const entryWord = selectedCount === 1 ? "entry" : "entries";
  const statusLabel = status === "in_progress" ? "In Progress" : status === "resolved" ? "Resolved" : "New";
  return <Modal isOpen={open} onClose={onClose} title={`Update ${selectedCount} ${entryWord}`} actions={<><button onClick={onClose} style={cancelStyle}>Cancel</button><button onClick={onConfirm} style={confirmStyle}>Apply</button></>}>Mark {selectedCount} selected {entryWord} as <strong>{statusLabel}</strong>?</Modal>;
}

export default function AdminFeedbackPage() {
  const router = useRouter();
  const { data, loading, error, setData } = useFeedbackResource();
  const { filters, setFilter, filtered, paginated, totalPages, sortedMetrics, hasFilters } = useFeedbackFilters(data);
  const { selectedIds, setSelectedIds, selectedFeedbackId, setSelectedFeedbackId, selectedFeedback, headerCheckboxRef, allOnPageSelected, toggleSelectAll, toggleSelect } = useFeedbackSelection(data, paginated);
  const { overlays, setOverlay, toast, showToast } = useFeedbackOverlays();
  const [createState, setCreateState] = useFeedbackCreateState();

  const { originFilter, typeFilter, preOrderReasonFilter, statusFilter, searchQuery, page } = filters;
  const { deleteTarget, showBulkDeleteModal, showBulkStatusModal, bulkStatusTarget, pendingReviewToggle, showCreateModal } = overlays;
  const { createForm, createErrors, createError, creating } = createState;
  const setOriginFilter = (value: string) => setFilter("originFilter", value);
  const setPreOrderReasonFilter = (value: string) => setFilter("preOrderReasonFilter", value);
  const setPage = (value: number) => setFilter("page", value);
  const setDeleteTarget = (value: string | null) => setOverlay("deleteTarget", value);
  const setShowBulkDeleteModal = (value: boolean) => setOverlay("showBulkDeleteModal", value);
  const setShowBulkStatusModal = (value: boolean) => setOverlay("showBulkStatusModal", value);
  const setBulkStatusTarget = (value: string) => setOverlay("bulkStatusTarget", value);
  const setPendingReviewToggle = (value: { id: string; show: boolean } | null) => setOverlay("pendingReviewToggle", value);
  const setShowCreateModal = (value: boolean) => setOverlay("showCreateModal", value);
  const setCreateForm: Dispatch<SetStateAction<AdminFeedbackFormState>> = (value) => setCreateState("createForm", value);
  const setCreateErrors: Dispatch<SetStateAction<AdminFeedbackFieldErrors>> = (value) => setCreateState("createErrors", value);
  const setCreateError = (value: string) => setCreateState("createError", value);
  const setCreating = (value: boolean) => setCreateState("creating", value);

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

    setCreating(true);
    setCreateError("");

    try {
      const headers = await getFeedbackAuthHeader();
      const payload = buildAdminFeedbackPayload(createForm, activeCreateType, createFormSupportsReviews);
      const created = await submitAdminFeedback(headers, payload);
      if (!created) {
        router.push("/admin/login");
        return;
      }
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

  function handleStatusChange(id: string, status: string) {
    return updateFeedbackStatus(id, status, data, setData, showToast);
  }

  function handleCommentSave(id: string, adminComment: string | null) {
    return saveFeedbackComment(id, adminComment, setData, showToast);
  }

  function handleToggleShowInReviews(id: string, visible: boolean) {
    return toggleFeedbackReviewVisibility(id, visible, data, setData, showToast);
  }

  function handleDelete(id: string) {
    return deleteFeedbackEntry(id, setData, setSelectedIds, selectedFeedbackId, setSelectedFeedbackId, () => setDeleteTarget(null), showToast);
  }

  function handleBulkDelete() {
    return deleteFeedbackEntries(Array.from(selectedIds), setData, setSelectedIds, selectedFeedbackId, setSelectedFeedbackId, () => setShowBulkDeleteModal(false), showToast);
  }

  function handleBulkStatus() {
    return updateFeedbackStatuses(Array.from(selectedIds), bulkStatusTarget, setData, () => setShowBulkStatusModal(false), showToast);
  }

  // ---------------------------------------------------------------------------
  // Button styles
  // ---------------------------------------------------------------------------

  const btnBase = ADMIN_BUTTON_BASE_STYLE;
  const btnDanger = ADMIN_BUTTON_DANGER_STYLE;
  const btnPrimary = ADMIN_BUTTON_PRIMARY_STYLE;

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

      <FeedbackMetrics
        loading={loading}
        data={data}
        sortedMetrics={sortedMetrics}
        originFilter={originFilter}
        reasonFilter={preOrderReasonFilter}
        onOriginFilter={setOriginFilter}
        onReasonFilter={setPreOrderReasonFilter}
      />

      <FeedbackReasonBreakdown
        visible={!loading && Boolean(data) && ((data?.origin_counts.events_page_non_customer ?? 0) + (data?.origin_counts.event_reminder_email ?? 0) > 0)}
        metrics={sortedMetrics}
        activeReason={preOrderReasonFilter}
        onReasonChange={setPreOrderReasonFilter}
      />

      <FeedbackFilters
        filters={{ originFilter, typeFilter, preOrderReasonFilter, statusFilter, searchQuery }}
        loading={loading}
        resultCount={filtered.length}
        onChange={(field, value) => setFilter(field, value)}
        onClear={() => {
          setFilter("originFilter", "all");
          setFilter("typeFilter", "all");
          setFilter("preOrderReasonFilter", "all");
          setFilter("statusFilter", "all");
          setFilter("searchQuery", "");
        }}
      />

      <AdminBulkTableFrame
        bulk={buildAdminBulkStatusProps(selectedIds.size, bulkStatusTarget, [{ value: "new", label: "New" }, { value: "in_progress", label: "In Progress" }, { value: "resolved", label: "Resolved" }], setBulkStatusTarget, () => setShowBulkStatusModal(true), () => setShowBulkDeleteModal(true), () => setSelectedIds(new Set()), btnBase, btnDanger)}
        loading={loading}
        empty={filtered.length === 0}
        emptyState={<FeedbackEmptyState hasFilters={hasFilters} onCreate={openCreateModal} buttonStyle={btnPrimary} />}
      >
          <AdminSelectableTable
            headerCheckboxRef={headerCheckboxRef}
            allSelected={allOnPageSelected}
            onToggleAll={toggleSelectAll}
            headers={["Date", "Origin", "Type", "Name", "Contact", "Pre-order Reason", "Status", "Message / Details"]}
          >
            {paginated.map((item, index) => (
              <FeedbackTableRow
                key={item.id}
                item={item}
                selected={selectedIds.has(item.id)}
                last={index === paginated.length - 1}
                onOpen={() => setSelectedFeedbackId(item.id)}
                onToggleSelected={() => toggleSelect(item.id)}
                onToggleReview={() => setPendingReviewToggle({ id: item.id, show: !item.show_in_reviews })}
                onDelete={() => setDeleteTarget(item.id)}
              />
            ))}
          </AdminSelectableTable>
      </AdminBulkTableFrame>

      {!loading && <AdminPagination page={page} totalPages={totalPages} onPageChange={setPage} />}

      {/* Single delete modal */}
      <FeedbackCreateModal
        showCreateModal={showCreateModal}
        closeCreateModal={closeCreateModal}
        handleCreateFeedback={handleCreateFeedback}
        creating={creating}
        btnBase={btnBase}
        btnPrimary={btnPrimary}
        createForm={createForm}
        createErrors={createErrors}
        createError={createError}
        activeCreateType={activeCreateType}
        createFormSupportsReviews={createFormSupportsReviews}
        updateCreateForm={updateCreateForm}
        updateCreateRating={updateCreateRating}
      />

      <FeedbackDeleteModals deleteTarget={deleteTarget} selectedCount={selectedIds.size} showBulkDeleteModal={showBulkDeleteModal} cancelStyle={btnBase} deleteStyle={btnDanger} onCloseDelete={() => setDeleteTarget(null)} onDelete={handleDelete} onCloseBulkDelete={() => setShowBulkDeleteModal(false)} onBulkDelete={handleBulkDelete} />
      <FeedbackBulkStatusModal open={showBulkStatusModal} selectedCount={selectedIds.size} status={bulkStatusTarget} cancelStyle={btnBase} confirmStyle={btnPrimary} onClose={() => setShowBulkStatusModal(false)} onConfirm={handleBulkStatus} />
      <FeedbackReviewModal pendingReviewToggle={pendingReviewToggle} cancelStyle={btnBase} confirmStyle={btnPrimary} onClose={() => setPendingReviewToggle(null)} onConfirm={(id, show) => { void handleToggleShowInReviews(id, show); setPendingReviewToggle(null); }} />

      {/* Feedback details modal */}
      {selectedFeedback && (
        <FeedbackDetailsModal
          item={selectedFeedback}
          onClose={() => setSelectedFeedbackId(null)}
          onStatusChange={handleStatusChange}
          onCommentSave={handleCommentSave}
        />
      )}

      <AdminToast toast={toast} />
    </div>
  );
}
