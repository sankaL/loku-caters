"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { API_URL, CURRENCY, fetchEventConfig, EventConfig, type Item, type Location } from "@/config/event";
import { getAdminToken } from "@/lib/auth";
import { getApiErrorMessage } from "@/lib/apiError";
import Modal from "@/components/ui/Modal";
import SearchableSelect from "@/components/ui/SearchableSelect";
import ItemQuantityPicker from "@/components/admin/orders/ItemQuantityPicker";
import BundleEditModal from "@/components/admin/orders/BundleEditModal";
import {
  getMinimumOrderQuantity,
  linesFromQuantities,
  type OrderLineItem,
} from "@/lib/orderLineUtils";

interface Order {
  id: string;
  bundle_id: string;
  primary_order_id: string;
  event_id: number;
  group_id: string | null;
  name: string;
  email: string | null;
  phone_number: string | null;
  item_name?: string;
  item_id?: string;
  quantity?: number;
  line_count: number;
  quantity_total: number;
  pickup_location: string;
  pickup_time_slot: string;
  pickup_address?: string | null;
  pickup_date?: string | null;
  total_price: number;
  base_total_price?: number;
  discount_total?: number;
  pricing_meta?: Record<string, unknown>;
  status: string;
  status_breakdown?: Record<string, number>;
  reminded: boolean;
  paid: boolean;
  payment_method: string | null;
  payment_method_other: string | null;
  notes?: string | null;
  notes_mixed?: boolean;
  exclude_email?: boolean;
  created_at: string;
}

interface OrderLine {
  id: string;
  event_id: number;
  group_id: string | null;
  name: string;
  email: string | null;
  phone_number: string | null;
  item_name: string;
  item_id: string;
  quantity: number;
  pickup_location: string;
  pickup_time_slot: string;
  pickup_address?: string | null;
  pickup_date?: string | null;
  total_price: number;
  status: string;
  paid: boolean;
  reminded: boolean;
  payment_method: string | null;
  payment_method_other: string | null;
  notes?: string | null;
  exclude_email?: boolean;
  created_at: string;
}

interface AdminEvent {
  id: number;
  name: string;
  event_date: string;
  kind?: string;
  is_active: boolean;
}

type SortCol = "status" | "total" | "date" | "timeslot";
type StatusActionKey =
  | "cancel"
  | "mark_picked_up"
  | "mark_no_show"
  | "normalize_confirmed"
  | "restore_picked_up"
  | "restore_no_show";
type TablePrimaryAction =
  | { kind: "confirm"; label: string }
  | { kind: "status"; action: StatusActionKey; label: string }
  | { kind: "review"; label: string }
  | null;

const PAGE_SIZE = 15;

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  pending:   { bg: "#fef3c7", color: "#92400e", label: "Pending" },
  confirmed: { bg: "#d1fae5", color: "#065f46", label: "Confirmed" },
  picked_up: { bg: "#e0e7ff", color: "#3730a3", label: "Picked Up" },
  no_show:   { bg: "#fee2e2", color: "#991b1b", label: "No Show" },
  cancelled: { bg: "#f3f4f6", color: "#374151", label: "Cancelled" },
  mixed: { bg: "#ede9fe", color: "#5b21b6", label: "Mixed" },
};

const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ["pending", "confirmed", "cancelled"],
  confirmed: ["confirmed", "picked_up", "no_show", "cancelled"],
  picked_up: ["picked_up", "no_show", "cancelled"],
  no_show: ["no_show", "picked_up", "cancelled"],
  cancelled: ["cancelled", "picked_up", "no_show"],
  mixed: ["pending", "confirmed", "picked_up", "no_show", "cancelled"],
};

interface StatusActionSpec {
  key: StatusActionKey;
  label: string;
  tone?: "default" | "danger";
}

function getReminderUnavailableReason(order: Order): string | null {
  if (order.status !== "confirmed") return "Only confirmed bundles can be reminded";
  if (order.reminded) return "Reminder already sent";
  if (order.exclude_email) return "Email is excluded for this bundle";
  if (!(order.email ?? "").trim()) return "Customer is missing an email address";
  return null;
}

function getMixedBundleActionSpecs(order: Pick<Order, "status_breakdown">): StatusActionSpec[] {
  const statuses = Object.keys(order.status_breakdown ?? {}).filter((status) => status in ALLOWED_STATUS_TRANSITIONS);
  if (statuses.length === 0) return [];

  let allowedTargets = new Set(ALLOWED_STATUS_TRANSITIONS[statuses[0]] ?? []);
  for (const status of statuses.slice(1)) {
    allowedTargets = new Set((ALLOWED_STATUS_TRANSITIONS[status] ?? []).filter((target) => allowedTargets.has(target)));
  }

  const actions: StatusActionSpec[] = [];
  if (allowedTargets.has("confirmed")) {
    actions.push({ key: "normalize_confirmed", label: "Normalize to Confirmed" });
  }
  if (allowedTargets.has("picked_up")) {
    actions.push({ key: "mark_picked_up", label: "Normalize to Picked Up" });
  }
  if (allowedTargets.has("no_show")) {
    actions.push({ key: "mark_no_show", label: "Normalize to No Show", tone: "danger" });
  }
  if (allowedTargets.has("cancelled")) {
    actions.push({ key: "cancel", label: "Cancel Bundle", tone: "danger" });
  }
  return actions;
}

function getStatusActionSpecs(order: Order, context: "table" | "detail"): StatusActionSpec[] {
  if (order.status === "pending") {
    return [{ key: "cancel", label: "Cancel Bundle", tone: "danger" }];
  }
  if (order.status === "confirmed") {
    return [
      { key: "mark_picked_up", label: "Mark Picked Up" },
      { key: "mark_no_show", label: "Mark No Show", tone: "danger" },
      { key: "cancel", label: "Cancel Bundle", tone: "danger" },
    ];
  }
  if (order.status === "picked_up") {
    return [
      { key: "mark_no_show", label: "Correct to No Show", tone: "danger" },
      { key: "cancel", label: "Cancel Bundle", tone: "danger" },
    ];
  }
  if (order.status === "no_show") {
    return [
      { key: "mark_picked_up", label: "Correct to Picked Up" },
      { key: "cancel", label: "Cancel Bundle", tone: "danger" },
    ];
  }
  if (order.status === "cancelled") {
    return [
      { key: "restore_picked_up", label: "Restore to Picked Up" },
      { key: "restore_no_show", label: "Restore to No Show" },
    ];
  }
  if (order.status === "mixed" && context === "detail") {
    return getMixedBundleActionSpecs(order);
  }
  return [];
}

function getStatusActionRequest(action: StatusActionKey): { method: "PATCH" | "POST"; endpoint: string; body?: Record<string, string> } {
  if (action === "normalize_confirmed") {
    return { method: "PATCH", endpoint: "status", body: { status: "confirmed" } };
  }
  if (action === "mark_picked_up") return { method: "POST", endpoint: "actions/mark-picked-up" };
  if (action === "mark_no_show") return { method: "POST", endpoint: "actions/mark-no-show" };
  if (action === "cancel") return { method: "POST", endpoint: "actions/cancel" };
  if (action === "restore_picked_up") return { method: "POST", endpoint: "actions/restore", body: { target_status: "picked_up" } };
  return { method: "POST", endpoint: "actions/restore", body: { target_status: "no_show" } };
}

function getStatusActionModalCopy(action: StatusActionKey, order: Pick<Order, "name" | "status">): { title: string; body: string; confirmLabel: string } {
  if (action === "normalize_confirmed") {
    return {
      title: "Normalize to Confirmed",
      body: `Set every line in ${order.name}'s bundle to confirmed?`,
      confirmLabel: "Normalize bundle",
    };
  }

  if (action === "mark_picked_up") {
    if (order.status === "no_show") {
      return {
        title: "Correct to Picked Up",
        body: `Mark ${order.name} as picked up instead of no show?`,
        confirmLabel: "Mark picked up",
      };
    }
    if (order.status === "mixed") {
      return {
        title: "Normalize to Picked Up",
        body: `Set every line in ${order.name}'s bundle to picked up where the transition is allowed?`,
        confirmLabel: "Normalize bundle",
      };
    }
    return {
      title: "Mark Picked Up",
      body: `Confirm that ${order.name}'s bundle was collected?`,
      confirmLabel: "Mark picked up",
    };
  }

  if (action === "mark_no_show") {
    if (order.status === "picked_up") {
      return {
        title: "Correct to No Show",
        body: `Change ${order.name}'s bundle from picked up to no show?`,
        confirmLabel: "Mark no show",
      };
    }
    if (order.status === "mixed") {
      return {
        title: "Normalize to No Show",
        body: `Set every line in ${order.name}'s bundle to no show where the transition is allowed?`,
        confirmLabel: "Normalize bundle",
      };
    }
    return {
      title: "Mark No Show",
      body: `Mark ${order.name}'s bundle as no show?`,
      confirmLabel: "Mark no show",
    };
  }

  if (action === "cancel") {
    return {
      title: "Cancel Bundle",
      body: `Cancel ${order.name}'s bundle?`,
      confirmLabel: "Cancel bundle",
    };
  }

  if (action === "restore_picked_up") {
    return {
      title: "Restore to Picked Up",
      body: `Restore ${order.name}'s cancelled bundle to picked up?`,
      confirmLabel: "Restore bundle",
    };
  }

  return {
    title: "Restore to No Show",
    body: `Restore ${order.name}'s cancelled bundle to no show?`,
    confirmLabel: "Restore bundle",
  };
}

function getStatusActionSuccessMessage(action: StatusActionKey): string {
  if (action === "normalize_confirmed") return "Bundle normalized to confirmed";
  if (action === "mark_picked_up") return "Bundle marked picked up";
  if (action === "mark_no_show") return "Bundle marked no show";
  if (action === "cancel") return "Bundle cancelled";
  if (action === "restore_picked_up") return "Bundle restored to picked up";
  return "Bundle restored to no show";
}

function getTablePrimaryAction(order: Order): TablePrimaryAction {
  if (order.status === "pending") {
    return { kind: "confirm", label: "Confirm" };
  }
  if (order.status === "confirmed") {
    return { kind: "status", action: "mark_picked_up", label: "Picked Up" };
  }
  if (order.status === "no_show") {
    return { kind: "status", action: "mark_picked_up", label: "Correct Pickup" };
  }
  if (order.status === "mixed") {
    return { kind: "review", label: "Review" };
  }
  return null;
}

function getTableOverflowActions(order: Order): StatusActionSpec[] {
  if (order.status === "pending") {
    return [{ key: "cancel", label: "Cancel Bundle", tone: "danger" }];
  }
  if (order.status === "confirmed") {
    return [
      { key: "mark_picked_up", label: "Mark Picked Up" },
      { key: "mark_no_show", label: "Mark No Show", tone: "danger" },
      { key: "cancel", label: "Cancel Bundle", tone: "danger" },
    ];
  }
  if (order.status === "picked_up") {
    return [
      { key: "mark_no_show", label: "Correct to No Show", tone: "danger" },
      { key: "cancel", label: "Cancel Bundle", tone: "danger" },
    ];
  }
  if (order.status === "no_show") {
    return [{ key: "cancel", label: "Cancel Bundle", tone: "danger" }];
  }
  if (order.status === "cancelled") {
    return [
      { key: "restore_picked_up", label: "Restore to Picked Up" },
      { key: "restore_no_show", label: "Restore to No Show" },
    ];
  }
  return [];
}

function StatusBadge({ status }: { status: string }) {
  const statusStyle = STATUS_STYLES[status] ?? STATUS_STYLES.pending;
  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold"
      style={{ background: statusStyle.bg, color: statusStyle.color }}
    >
      {statusStyle.label}
    </span>
  );
}

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

const dropdownStyle: React.CSSProperties = {
  appearance: "none" as const,
  WebkitAppearance: "none" as const,
  background: "white",
  color: "var(--color-text)",
  border: "1px solid var(--color-border)",
  borderRadius: "0.75rem",
  padding: "0.5rem 2rem 0.5rem 0.75rem",
  fontSize: "0.875rem",
  cursor: "pointer",
  outline: "none",
};

function SelectChevron() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ pointerEvents: "none", position: "absolute", right: "0.625rem", top: "50%", transform: "translateY(-50%)", color: "var(--color-muted)" }}
    >
      <path d="M5 7.5L10 12.5L15 7.5" />
    </svg>
  );
}

const CashIcon = ({ width = 24, height = 24 }: { width?: number; height?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={width} height={height} viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <circle cx="12" cy="12" r="2" />
    <path d="M6 12h.01M18 12h.01" />
  </svg>
);

const EtransferIcon = ({ width = 24, height = 24 }: { width?: number; height?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={width} height={height} viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <path d="M2 10h20" />
    <path d="M6 15h4" />
    <path d="M14 15h4" />
  </svg>
);

const OtherPayIcon = ({ width = 24, height = 24 }: { width?: number; height?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={width} height={height} viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
    <circle cx="12" cy="17" r=".5" fill="currentColor" />
  </svg>
);

const BellIcon = ({ width = 16, height = 16 }: { width?: number; height?: number }) => (
  <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

const MoreIcon = ({ width = 16, height = 16 }: { width?: number; height?: number }) => (
  <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="5" cy="12" r="1" fill="currentColor" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
    <circle cx="19" cy="12" r="1" fill="currentColor" />
  </svg>
);

interface AddOrderForm {
  name: string;
  email: string;
  phone_number: string;
  pickup_location: string;
  pickup_time_slot: string;
  notes: string;
  exclude_email: boolean;
}

const EMPTY_ADD_FORM: AddOrderForm = {
  name: "", email: "", phone_number: "",
  pickup_location: "", pickup_time_slot: "",
  notes: "",
  exclude_email: false,
};

interface RandomAddOrderForm extends AddOrderForm {
  pickup_address: string;
  pickup_date: string;
}

const EMPTY_RANDOM_ADD_FORM: RandomAddOrderForm = {
  ...EMPTY_ADD_FORM,
  pickup_address: "",
  pickup_date: "",
};

interface BulkRow {
  name: string;
  email: string;
  phone_number: string;
  item_id: string;
  quantity: number;
  pickup_location: string;
  pickup_time_slot: string;
  _rowNum: number;
  _error?: string;
}

interface AdminLocationResponse {
  id: string;
  name: string;
  address?: string;
  time_slots?: string[];
}

type ReminderApiStatus =
  | "sent"
  | "failed"
  | "skipped_not_confirmed"
  | "skipped_already_reminded"
  | "skipped_excluded"
  | "skipped_missing_email";

interface ReminderSendResponse {
  success: boolean;
  order_id: string;
  status: ReminderApiStatus;
  message: string;
  email: string | null;
  name: string;
  reminded: boolean;
}

type PaymentReminderApiStatus =
  | "sent"
  | "failed"
  | "skipped_not_confirmed"
  | "skipped_paid"
  | "skipped_excluded"
  | "skipped_missing_email";

interface PaymentReminderSendResponse {
  success: boolean;
  order_id: string;
  status: PaymentReminderApiStatus;
  message: string;
  email: string | null;
  name: string;
  reminded: boolean;
}

type ReminderQueueStatus = "queued" | "sending" | "retrying" | "sent" | "failed" | "skipped";

interface ReminderQueueItem {
  orderId: string;
  name: string;
  email: string;
  pickupLabel: string;
  status: ReminderQueueStatus;
  attempts: number;
  message: string;
  lastResultCode: string | null;
}

interface ReminderRunState {
  isRunning: boolean;
  isComplete: boolean;
  total: number;
  completed: number;
  sent: number;
  failed: number;
  skipped: number;
  activeOrderId: string | null;
  items: ReminderQueueItem[];
}

interface PaymentReminderRecipient {
  recipientKey: string;
  orderId: string;
  name: string;
  email: string;
  pickupLabel: string;
  disabledReason: string | null;
}

const EMPTY_REMINDER_RUN: ReminderRunState = {
  isRunning: false,
  isComplete: false,
  total: 0,
  completed: 0,
  sent: 0,
  failed: 0,
  skipped: 0,
  activeOrderId: null,
  items: [],
};

const REMINDER_SEND_INTERVAL_MS = 1000;
const PAYMENT_REMINDER_SEND_INTERVAL_MS = 500;
const REMINDER_RETRY_BACKOFF_MS = [1000, 2000] as const;

type QueueAttemptResult = {
  outcome: "sent" | "skipped" | "retryable_failed" | "failed";
  message: string;
  resultCode: string | null;
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function buildReminderRunState(
  items: ReminderQueueItem[],
  options: { isRunning: boolean; isComplete: boolean; activeOrderId: string | null }
): ReminderRunState {
  const sent = items.filter((item) => item.status === "sent").length;
  const failed = items.filter((item) => item.status === "failed").length;
  const skipped = items.filter((item) => item.status === "skipped").length;
  const completed = sent + failed + skipped;

  return {
    isRunning: options.isRunning,
    isComplete: options.isComplete,
    total: items.length,
    completed,
    sent,
    failed,
    skipped,
    activeOrderId: options.activeOrderId,
    items,
  };
}

function getReminderStatusBadge(item: ReminderQueueItem): { label: string; bg: string; color: string; border: string } {
  switch (item.status) {
    case "sending":
      return {
        label: "Sending",
        bg: "var(--color-info-bg)",
        color: "var(--color-info-text)",
        border: "var(--color-info-border)",
      };
    case "retrying": {
      const retryNumber = Math.max(1, Math.min(2, item.attempts));
      return {
        label: `Retry ${retryNumber} of 2`,
        bg: "var(--color-warning-bg)",
        color: "var(--color-warning-text)",
        border: "var(--color-warning-border)",
      };
    }
    case "sent":
      return {
        label: "Sent",
        bg: "var(--color-success-bg)",
        color: "var(--color-success-text)",
        border: "var(--color-success-border)",
      };
    case "skipped":
      return {
        label: "Skipped",
        bg: "var(--color-cream-dark)",
        color: "var(--color-muted)",
        border: "var(--color-border)",
      };
    case "failed":
      return {
        label: "Failed",
        bg: "var(--color-error-bg)",
        color: "var(--color-error-text)",
        border: "var(--color-error-border)",
      };
    case "queued":
    default:
      return {
        label: "Queued",
        bg: "var(--color-cream)",
        color: "var(--color-muted)",
        border: "var(--color-border)",
      };
  }
}

function getPaymentReminderUnavailableReason(order: Order): string | null {
  if (order.paid) return "Payment reminder is only available for unpaid orders";
  if (!["confirmed", "picked_up"].includes(order.status)) return "Only confirmed or picked up unpaid orders can be reminded";
  if (order.exclude_email) return "Email is excluded for this order";
  if (!(order.email ?? "").trim()) return "Customer is missing an email address";
  return null;
}

function getPaymentMethodLabel(
  order: Pick<Order, "paid" | "payment_method" | "payment_method_other">
): string | null {
  if (!order.paid) return null;
  if (order.payment_method === "cash") return "Cash";
  if (order.payment_method === "etransfer") return "E-transfer";
  if (order.payment_method === "other") {
    const details = (order.payment_method_other ?? "").trim();
    return details ? `Other: ${details}` : "Other";
  }
  const fallback = (order.payment_method ?? "").trim();
  return fallback || "Method not set";
}

function PaymentMethodBadge({ order }: { order: Pick<Order, "paid" | "payment_method" | "payment_method_other"> }) {
  const label = getPaymentMethodLabel(order);
  if (!order.paid || !label) return null;

  let icon = <OtherPayIcon width={16} height={16} />;
  if (order.payment_method === "cash") icon = <CashIcon width={16} height={16} />;
  if (order.payment_method === "etransfer") icon = <EtransferIcon width={16} height={16} />;

  return (
    <div
      className="h-8 min-w-8 px-2 rounded-xl flex items-center justify-center border"
      style={{
        background: "white",
        color: "var(--color-text)",
        borderColor: "rgba(28,28,26,0.12)",
        boxShadow: "0 1px 0 rgba(28,28,26,0.08), 0 4px 10px rgba(28,28,26,0.08)",
      }}
      title={label}
      aria-label={label}
    >
      {icon}
    </div>
  );
}

function formatPickupLabel(order: Pick<Order, "pickup_location" | "pickup_time_slot" | "pickup_address">): string {
  const location = (order.pickup_location ?? "").trim();
  const timeSlot = (order.pickup_time_slot ?? "").trim();
  const address = (order.pickup_address ?? "").trim();
  const base = [location || "-", timeSlot || "-"].join(" - ");
  return address ? `${base} - ${address}` : base;
}

function getPaymentReminderRecipientKey(order: Pick<Order, "bundle_id">): string {
  return `bundle:${order.bundle_id}`;
}

function normalizeCsvHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]/g, " ").replace(/\s+/g, " ");
}

function isExpectedCsvHeaderRow(columns: string[]): boolean {
  const normalized = columns.map(normalizeCsvHeader);
  const expected: Array<Set<string>> = [
    new Set(["name"]),
    new Set(["email"]),
    new Set(["phone", "phone number"]),
    new Set(["item id", "item"]),
    new Set(["quantity", "qty"]),
    new Set(["pickup location", "location"]),
    new Set(["time slot", "pickup time slot"]),
  ];
  return expected.every((allowed, idx) => allowed.has(normalized[idx] ?? ""));
}

function getTimeSlotStartMinutes(slot: string): number {
  const match = slot.trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)\b/i);
  if (!match) return Number.POSITIVE_INFINITY;
  let hour = parseInt(match[1], 10) % 12;
  const minute = parseInt(match[2], 10);
  if (match[3].toUpperCase() === "PM") hour += 12;
  return hour * 60 + minute;
}

export default function AdminOrdersPage() {
  const router = useRouter();
  const [highlightBundleParam, setHighlightBundleParam] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [bundleLines, setBundleLines] = useState<OrderLine[]>([]);
  const [selectedBundle, setSelectedBundle] = useState<Order | null>(null);
  const [bundleInvoiceId, setBundleInvoiceId] = useState<string | null>(null);
  const [loadingBundleInvoice, setLoadingBundleInvoice] = useState(false);
  const [loadingBundleDetails, setLoadingBundleDetails] = useState(false);
  const [showBundleDetailsModal, setShowBundleDetailsModal] = useState(false);
  const [showEditBundleModal, setShowEditBundleModal] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [sendingReminder, setSendingReminder] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [updatingPayment, setUpdatingPayment] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [sort, setSort] = useState<{ col: SortCol | null; dir: "asc" | "desc" }>({ col: null, dir: "asc" });
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [eventConfig, setEventConfig] = useState<EventConfig | null>(null);
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [configUsesFallback, setConfigUsesFallback] = useState(false);

  // Single delete modal
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<Order | null>(null);
  const [statusActionTarget, setStatusActionTarget] = useState<{ order: Order; action: StatusActionKey } | null>(null);

  // Payment modals
  const [paymentTarget, setPaymentTarget] = useState<Order | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "etransfer" | "other">("cash");
  const [paymentMethodOther, setPaymentMethodOther] = useState("");
  const [unpayTarget, setUnpayTarget] = useState<Order | null>(null);

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [showBulkConfirmModal, setShowBulkConfirmModal] = useState(false);
  const [showBulkPickedUpModal, setShowBulkPickedUpModal] = useState(false);
  const [showBulkCancelModal, setShowBulkCancelModal] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkConfirming, setBulkConfirming] = useState(false);
  const [bulkMarkingPickedUp, setBulkMarkingPickedUp] = useState(false);
  const [bulkCancelling, setBulkCancelling] = useState(false);

  // Add order modal
  const [showAddOrderChoiceModal, setShowAddOrderChoiceModal] = useState(false);
  const [showAddOrderModal, setShowAddOrderModal] = useState(false);
  const [showRandomOrderModal, setShowRandomOrderModal] = useState(false);
  const [addOrderForm, setAddOrderForm] = useState<AddOrderForm>(EMPTY_ADD_FORM);
  const [addOrderQuantities, setAddOrderQuantities] = useState<Record<string, number>>({});
  const [addOrderItemsError, setAddOrderItemsError] = useState<string>("");
  const [addingOrder, setAddingOrder] = useState(false);
  const [addModalEventId, setAddModalEventId] = useState<number | null>(null);
  const [addModalEventConfig, setAddModalEventConfig] = useState<EventConfig | null>(null);
  const [addModalEventSearch, setAddModalEventSearch] = useState("");
  const [showAddEventDropdown, setShowAddEventDropdown] = useState(false);
  const [randomOrderForm, setRandomOrderForm] = useState<RandomAddOrderForm>(EMPTY_RANDOM_ADD_FORM);
  const [randomOrderQuantities, setRandomOrderQuantities] = useState<Record<string, number>>({});
  const [randomOrderPrices, setRandomOrderPrices] = useState<Record<string, number>>({});
  const [randomOrderItemsError, setRandomOrderItemsError] = useState<string>("");
  const [randomOrderGroupId, setRandomOrderGroupId] = useState<string | null>(null);
  const [catalogItems, setCatalogItems] = useState<Item[]>([]);
  const [catalogLocations, setCatalogLocations] = useState<Location[]>([]);

  // Bulk import modal
  const [showBulkImportModal, setShowBulkImportModal] = useState(false);
  const [bulkImportRows, setBulkImportRows] = useState<BulkRow[]>([]);
  const [bulkImporting, setBulkImporting] = useState(false);

  // Remind modal
  const [showRemindModal, setShowRemindModal] = useState(false);
  const [remindSelections, setRemindSelections] = useState<Set<string>>(new Set());
  const [reminderRun, setReminderRun] = useState<ReminderRunState>(EMPTY_REMINDER_RUN);
  const [remindSearch, setRemindSearch] = useState("");
  const [showReminderMenu, setShowReminderMenu] = useState(false);
  const reminderMenuRef = useRef<HTMLDivElement | null>(null);
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);
  const actionMenuRef = useRef<HTMLDivElement | null>(null);
  const remindLoading = reminderRun.isRunning;

  // Bulk reminder confirmation
  const [showBulkReminderConfirm, setShowBulkReminderConfirm] = useState(false);

  // Single reminder confirmation
  const [reminderConfirmTarget, setReminderConfirmTarget] = useState<Order | null>(null);

  // Payment reminder modal
  const [showPaymentRemindModal, setShowPaymentRemindModal] = useState(false);
  const [paymentRemindSelections, setPaymentRemindSelections] = useState<Set<string>>(new Set());
  const [paymentReminderRun, setPaymentReminderRun] = useState<ReminderRunState>(EMPTY_REMINDER_RUN);
  const [paymentRemindSearch, setPaymentRemindSearch] = useState("");
  const paymentReminderLoading = paymentReminderRun.isRunning;

  // Bulk payment reminder confirmation
  const [showBulkPaymentReminderConfirm, setShowBulkPaymentReminderConfirm] = useState(false);

  // Single payment reminder confirmation
  const [paymentReminderConfirmTarget, setPaymentReminderConfirmTarget] = useState<Order | null>(null);

  // Reset selection when filter/orders change
  useEffect(() => { setSelectedIds(new Set()); }, [filter, paymentFilter, eventFilter, locationFilter, orders]);
  useEffect(() => { setPage(1); }, [paymentFilter, eventFilter, locationFilter]);

  // Switching event should not keep a stale location selection
  useEffect(() => {
    setLocationFilter("all");
  }, [eventFilter]);

  useEffect(() => {
    if (!showReminderMenu) return;

    function handlePointerDown(event: MouseEvent) {
      if (!reminderMenuRef.current?.contains(event.target as Node)) {
        setShowReminderMenu(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setShowReminderMenu(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showReminderMenu]);

  useEffect(() => {
    if (!openActionMenuId) return;

    function handlePointerDown(event: MouseEvent) {
      if (!actionMenuRef.current?.contains(event.target as Node)) {
        setOpenActionMenuId(null);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenActionMenuId(null);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openActionMenuId]);

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Fetch all events for label + filtering
  useEffect(() => {
    async function loadEvents() {
      try {
        const token = await getAdminToken();
        if (!token) return;
        const res = await fetch(`${API_URL}/api/admin/events`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = (await res.json()) as AdminEvent[];
        setEvents(Array.isArray(data) ? data : []);
      } catch {
        // Non-blocking
      }
    }
    loadEvents();
  }, [showToast]);

  useEffect(() => {
    async function loadCatalogs() {
      try {
        const token = await getAdminToken();
        if (!token) return;
        const headers = { Authorization: `Bearer ${token}` };
        const [itemsRes, locationsRes] = await Promise.all([
          fetch(`${API_URL}/api/admin/items`, { headers }),
          fetch(`${API_URL}/api/admin/locations`, { headers }),
        ]);
        if (!itemsRes.ok || !locationsRes.ok) return;
        const itemsData = (await itemsRes.json()) as Item[];
        const locationsData = (await locationsRes.json()) as AdminLocationResponse[];
        setCatalogItems(Array.isArray(itemsData) ? itemsData : []);
        setCatalogLocations(
          Array.isArray(locationsData)
            ? locationsData.map((location) => ({
              id: location.id,
              name: location.name,
              address: location.address,
              timeSlots: Array.isArray(location.time_slots) ? location.time_slots : [],
            }))
            : []
        );
      } catch {
        // Non-blocking
      }
    }
    loadCatalogs();
  }, []);

  const activeEventId = useMemo(() => {
    const active = events.find((e) => e.is_active && e.kind !== "random_requests");
    return active ? active.id : null;
  }, [events]);

  const selectedFilterEvent = useMemo(
    () => (eventFilter === "all" ? null : events.find((e) => String(e.id) === eventFilter) ?? null),
    [eventFilter, events]
  );

  const configEventId = useMemo(() => {
    if (eventFilter !== "all") {
      if (selectedFilterEvent?.kind === "random_requests") {
        return activeEventId;
      }
      const parsed = parseInt(eventFilter, 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }
    return activeEventId;
  }, [eventFilter, activeEventId, selectedFilterEvent]);

  const configEventLabel = useMemo(() => {
    if (!configEventId) return "";
    const e = events.find((x) => x.id === configEventId);
    if (!e) return `Event ${configEventId}`;
    return `${e.name} (${e.event_date})`;
  }, [configEventId, events]);

  // Fetch event config for add/import dropdowns and validation
  useEffect(() => {
    let cancelled = false;
    async function loadEventConfig() {
      setConfigUsesFallback(false);

      if (configEventId) {
        try {
          const token = await getAdminToken();
          if (!token) return;
          const res = await fetch(`${API_URL}/api/admin/events/${configEventId}/config`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const data = (await res.json()) as EventConfig;
            if (!cancelled) setEventConfig(data);
            return;
          }
        } catch {
          // Non-blocking
        }
      }

      try {
        const cfg = await fetchEventConfig();
        if (!cancelled) {
          setEventConfig(cfg);
          setConfigUsesFallback(true);
        }
      } catch {
        // Non-blocking
      }
    }

    loadEventConfig();
    return () => {
      cancelled = true;
    };
  }, [configEventId]);

  useEffect(() => {
    if (!showAddOrderModal || addModalEventId === null) return;
    let cancelled = false;
    async function loadModalConfig() {
      try {
        const token = await getAdminToken();
        if (!token) return;
        const res = await fetch(`${API_URL}/api/admin/events/${addModalEventId}/config`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok && !cancelled) setAddModalEventConfig(await res.json());
      } catch { /* non-blocking */ }
    }
    loadModalConfig();
    return () => { cancelled = true; };
  }, [addModalEventId, showAddOrderModal]);

  const fetchOrders = useCallback(async (options?: { suppressErrorToast?: boolean }) => {
    setLoading(true);
    try {
      const token = await getAdminToken();
      if (!token) return false;
      const qs = new URLSearchParams();
      qs.set("view", "bundle");
      if (filter !== "all") qs.set("status", filter);
      if (paymentFilter === "paid") qs.set("paid", "true");
      if (paymentFilter === "unpaid") qs.set("paid", "false");
      if (eventFilter !== "all") qs.set("event_id", eventFilter);
      const query = qs.toString();
      const res = await fetch(`${API_URL}/api/admin/orders${query ? `?${query}` : ""}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch orders");
      const rows = (await res.json()) as Order[];
      setOrders(Array.isArray(rows) ? rows : []);
      setPage(1);
      return true;
    } catch {
      if (!options?.suppressErrorToast) {
        showToast("Failed to load orders", "error");
      }
      return false;
    } finally {
      setLoading(false);
    }
  }, [eventFilter, filter, paymentFilter, showToast]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);
  useEffect(() => { setPage(1); }, [search]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setHighlightBundleParam(params.get("highlight_bundle"));
  }, []);

  const fetchBundleDetails = useCallback(async (bundle: Order) => {
    setLoadingBundleDetails(true);
    try {
      const token = await getAdminToken();
      if (!token) return false;
      const res = await fetch(`${API_URL}/api/admin/orders/bundles/${encodeURIComponent(bundle.bundle_id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, "Failed to load bundle details"));
      }
      const payload = (await res.json()) as { bundle?: Order; lines?: OrderLine[] };
      const nextBundle = payload.bundle ?? bundle;
      setSelectedBundle(nextBundle);
      setBundleLines(Array.isArray(payload.lines) ? payload.lines : []);
      setShowBundleDetailsModal(true);
      setBundleInvoiceId(null);
      setLoadingBundleInvoice(true);
      try {
        const invoiceRes = await fetch(`${API_URL}/api/admin/invoices/by-bundle/${encodeURIComponent(nextBundle.bundle_id)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (invoiceRes.ok) {
          const invoice = (await invoiceRes.json()) as { id: string };
          setBundleInvoiceId(invoice.id);
        }
      } catch {
        setBundleInvoiceId(null);
      } finally {
        setLoadingBundleInvoice(false);
      }
      return true;
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to load bundle details", "error");
      return false;
    } finally {
      setLoadingBundleDetails(false);
    }
  }, [showToast]);

  useEffect(() => {
    const highlightBundle = highlightBundleParam;
    if (!highlightBundle || orders.length === 0 || showBundleDetailsModal) return;
    const matched = orders.find((order) => order.bundle_id === highlightBundle);
    if (!matched) return;
    void (async () => {
      const opened = await fetchBundleDetails(matched);
      if (!opened) return;
      const nextParams = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
      nextParams.delete("highlight_bundle");
      nextParams.delete("order_id");
      const query = nextParams.toString();
      router.replace(`/admin/orders${query ? `?${query}` : ""}`, { scroll: false });
      setHighlightBundleParam(null);
    })();
  }, [fetchBundleDetails, highlightBundleParam, orders, router, showBundleDetailsModal]);

  const eventLabelById = useMemo(() => {
    const map = new Map<number, string>();
    for (const e of events) {
      const label = `${e.name} (${e.event_date})`.trim();
      map.set(e.id, label || `Event ${e.id}`);
    }
    return map;
  }, [events]);

  const eventOptions = useMemo(
    () => [
      { value: "all", label: "All Events" },
      ...events.map((e) => ({ value: String(e.id), label: `${e.name} (${e.event_date})` })),
    ],
    [events]
  );

  const locationOptions = useMemo(() => {
    const set = new Set<string>();
    for (const o of orders) {
      const loc = (o.pickup_location || "").trim();
      if (loc) set.add(loc);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [orders]);

  const locationFilterOptions = useMemo(() => {
    if (locationOptions.length > 0) return locationOptions;
    const fromConfig = (eventConfig?.locations ?? []).map((l) => l.name).filter(Boolean);
    return Array.from(new Set(fromConfig)).sort((a, b) => a.localeCompare(b));
  }, [locationOptions, eventConfig]);

  const filtered = useMemo(() => {
    let result = orders;
    if (eventFilter !== "all") {
      result = result.filter((o) => String(o.event_id) === eventFilter);
    }
    if (locationFilter !== "all") {
      result = result.filter((o) => o.pickup_location === locationFilter);
    }
    const q = search.trim().toLowerCase();
    if (!q) return result;
    return result.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        (o.email ?? "").toLowerCase().includes(q) ||
        (o.phone_number ?? "").toLowerCase().includes(q) ||
        o.pickup_location.toLowerCase().includes(q) ||
        (eventLabelById.get(o.event_id) ?? "").toLowerCase().includes(q)
    );
  }, [orders, eventFilter, locationFilter, search, eventLabelById]);

  const timeSlotRank = useMemo(() => {
    const uniqueSlots = new Set<string>();
    orders.forEach((o) => {
      const slot = (o.pickup_time_slot || "").trim();
      if (slot) uniqueSlots.add(slot);
    });
    const sortedSlots = Array.from(uniqueSlots).sort((a, b) => {
      const diff = getTimeSlotStartMinutes(a) - getTimeSlotStartMinutes(b);
      if (diff !== 0) return diff;
      return a.localeCompare(b);
    });
    const rank: Record<string, number> = {};
    sortedSlots.forEach((slot, idx) => {
      rank[slot] = idx;
    });
    return rank;
  }, [orders]);

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
      if (sort.col === "timeslot") {
        const rankA = timeSlotRank[a.pickup_time_slot] ?? Number.MAX_SAFE_INTEGER;
        const rankB = timeSlotRank[b.pickup_time_slot] ?? Number.MAX_SAFE_INTEGER;
        const diff = rankA - rankB;
        if (diff !== 0) return sort.dir === "asc" ? diff : -diff;
        return sort.dir === "asc"
          ? a.pickup_time_slot.localeCompare(b.pickup_time_slot)
          : b.pickup_time_slot.localeCompare(a.pickup_time_slot);
      }
      return 0;
    });
  }, [filtered, sort, timeSlotRank]);

  const confirmedOrders = useMemo(() => orders.filter((o) => o.status === "confirmed"), [orders]);
  const eligibleReminderOrders = useMemo(
    () => confirmedOrders.filter((o) => !o.reminded && !o.exclude_email && (o.email ?? "").trim().length > 0),
    [confirmedOrders]
  );
  const ineligibleReminderCount = confirmedOrders.length - eligibleReminderOrders.length;
  const paymentReminderRecipients = useMemo<PaymentReminderRecipient[]>(() => {
    const seenRecipientKeys = new Set<string>();
    const recipients: PaymentReminderRecipient[] = [];

    for (const order of orders) {
      const recipientKey = getPaymentReminderRecipientKey(order);
      if (seenRecipientKeys.has(recipientKey)) continue;
      seenRecipientKeys.add(recipientKey);
      recipients.push({
        recipientKey,
        orderId: getOrderActionId(order),
        name: order.name,
        email: (order.email ?? "").trim(),
        pickupLabel: formatPickupLabel(order),
        disabledReason: getPaymentReminderUnavailableReason(order),
      });
    }

    return recipients;
  }, [orders]);
  const eligiblePaymentReminderRecipients = useMemo(
    () => paymentReminderRecipients.filter((recipient) => !recipient.disabledReason),
    [paymentReminderRecipients]
  );
  const ineligiblePaymentReminderCount = paymentReminderRecipients.length - eligiblePaymentReminderRecipients.length;
  const selectedOrders = useMemo(
    () => orders.filter((order) => selectedIds.has(order.id)),
    [orders, selectedIds]
  );
  const bulkConfirmableOrders = useMemo(
    () => selectedOrders.filter((order) => order.status === "pending"),
    [selectedOrders]
  );
  const bulkPickedUpOrders = useMemo(
    () => selectedOrders.filter((order) => order.status === "confirmed"),
    [selectedOrders]
  );
  const bulkCancelableOrders = useMemo(
    () => selectedOrders.filter((order) => order.status !== "mixed" && ["pending", "confirmed", "picked_up", "no_show"].includes(order.status)),
    [selectedOrders]
  );

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

  function getOrderActionId(order: Pick<Order, "id" | "primary_order_id">): string {
    return (order.primary_order_id ?? "").trim() || order.id;
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
        throw new Error(await getApiErrorMessage(res, "Failed to confirm order"));
      }
      const data = await res.json();
      if (data.email_suppressed) {
        showToast("Order confirmed (email excluded)", "success");
      } else if (data.email_sent) {
        showToast("Confirmation email sent!", "success");
      } else {
        showToast("Order confirmed, but email failed to send", "error");
      }
      await fetchOrders();
      if (selectedBundle && getOrderActionId(selectedBundle) === orderId) {
        await fetchBundleDetails(selectedBundle);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to send email", "error");
    } finally {
      setConfirming(null);
    }
  }

  async function handleSendSingleReminder(target: Order): Promise<boolean> {
    const orderId = getOrderActionId(target);
    setSendingReminder(orderId);
    try {
      const token = await getAdminToken();
      if (!token) return false;
      const res = await fetch(`${API_URL}/api/admin/orders/${orderId}/remind`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, "Failed to send reminder"));
      }
      const data = await res.json() as ReminderSendResponse;
      if (data.status !== "sent") {
        showToast(data.message || "Reminder skipped", "error");
        return false;
      }
      showToast("Reminder sent", "success");
      await fetchOrders();
      if (selectedBundle?.bundle_id === target.bundle_id) {
        await fetchBundleDetails(target);
      }
      return true;
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to send reminder", "error");
      return false;
    } finally {
      setSendingReminder(null);
    }
  }

  async function handleStatusAction(
    order: Order,
    action: StatusActionKey,
    options?: { skipRefresh?: boolean; skipToast?: boolean }
  ): Promise<boolean> {
    const orderId = getOrderActionId(order);
    const request = getStatusActionRequest(action);
    setUpdatingStatus(orderId);
    try {
      const token = await getAdminToken();
      if (!token) return false;
      const res = await fetch(`${API_URL}/api/admin/orders/${orderId}/${request.endpoint}`, {
        method: request.method,
        headers: request.body
          ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
          : { Authorization: `Bearer ${token}` },
        body: request.body ? JSON.stringify(request.body) : undefined,
      });
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, "Failed to update bundle status"));
      }
      if (!options?.skipToast) {
        showToast(getStatusActionSuccessMessage(action), "success");
      }
      if (!options?.skipRefresh) {
        await fetchOrders();
        if (selectedBundle?.bundle_id === order.bundle_id) {
          await fetchBundleDetails(order);
        }
      }
      return true;
    } catch (err) {
      if (!options?.skipToast) {
        showToast(err instanceof Error ? err.message : "Failed to update bundle status", "error");
      }
      return false;
    } finally {
      setUpdatingStatus(null);
    }
  }

  async function handlePaymentUpdate(
    orderId: string,
    payload: { paid: boolean; payment_method?: string; payment_method_other?: string }
  ): Promise<boolean> {
    setUpdatingPayment(orderId);
    try {
      const token = await getAdminToken();
      if (!token) return false;
      const res = await fetch(`${API_URL}/api/admin/orders/${orderId}/payment`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, "Failed to update payment"));
      }
      const data = await res.json();
      const nextPaid = !!data.paid;

      setOrders((prev) => {
        const matchesPayment =
          paymentFilter === "all" ||
          (paymentFilter === "paid" && nextPaid) ||
          (paymentFilter === "unpaid" && !nextPaid);
        if (!matchesPayment) return prev.filter((o) => o.id !== orderId);

        return prev.map((o) =>
          o.id === orderId
            ? {
              ...o,
              paid: nextPaid,
              payment_method: data.payment_method ?? null,
              payment_method_other: data.payment_method_other ?? null,
            }
            : o
        );
      });
      setSelectedBundle((prev) => (
        prev && getOrderActionId(prev) === orderId
          ? {
            ...prev,
            paid: nextPaid,
            payment_method: data.payment_method ?? null,
            payment_method_other: data.payment_method_other ?? null,
          }
          : prev
      ));

      showToast(nextPaid ? "Marked paid" : "Marked unpaid", "success");
      return true;
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to update payment", "error");
      return false;
    } finally {
      setUpdatingPayment(null);
    }
  }

  function openMarkPaidModal(order: Order) {
    setPaymentTarget(order);
    setPaymentMethod("cash");
    setPaymentMethodOther("");
  }

  async function handleSendSinglePaymentReminder(target: Order): Promise<boolean> {
    const items = buildPaymentReminderItems([target.id]);
    if (items.length === 0) {
      showToast("Payment reminder is not available for this order", "error");
      return false;
    }

    setPaymentTarget(null);
    setPaymentRemindSearch("");
    setPaymentRemindSelections(new Set());
    setPaymentReminderRun(EMPTY_REMINDER_RUN);
    setShowPaymentRemindModal(true);

    await executeQueueRun({
      itemsToTrack: items,
      orderIdsToProcess: items.map((item) => item.orderId),
      setRun: setPaymentReminderRun,
      sendAttempt: sendPaymentReminderAttempt,
      intervalMs: PAYMENT_REMINDER_SEND_INTERVAL_MS,
      noun: "payment reminder",
    });
    return true;
  }

  async function executeDelete(orderId: string) {
    setDeleting(orderId);
    try {
      const token = await getAdminToken();
      if (!token) return;
      const bundleId = orders.find((order) => order.id === orderId)?.bundle_id ?? orderId;
      const res = await fetch(`${API_URL}/api/admin/orders/bundles/${encodeURIComponent(bundleId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, "Failed to delete order bundle"));
      }
      setOrders((prev) => prev.filter((order) => order.bundle_id !== bundleId));
      if (selectedBundle?.bundle_id === bundleId) {
        setShowBundleDetailsModal(false);
        setSelectedBundle(null);
        setBundleLines([]);
      }
      showToast("Order bundle deleted", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to delete order", "error");
    } finally {
      setDeleting(null);
    }
  }

  async function executeBulkDelete() {
    setBulkDeleting(true);
    setShowBulkDeleteModal(false);
    const ids = Array.from(selectedIds);
    try {
      const token = await getAdminToken();
      if (!token) return;
      const selectedBundles = Array.from(
        new Set(
          ids.map((id) => orders.find((order) => order.id === id)?.bundle_id ?? id)
        )
      );
      const results = await Promise.allSettled(
        selectedBundles.map(async (bundleId) => {
          const res = await fetch(`${API_URL}/api/admin/orders/bundles/${encodeURIComponent(bundleId)}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          });
          return { bundleId, ok: res.ok };
        })
      );
      const succeededIds = results.flatMap((result) =>
        result.status === "fulfilled" && result.value.ok ? [result.value.bundleId] : []
      );
      const succeededSet = new Set(succeededIds);
      setOrders((prev) => prev.filter((order) => !succeededSet.has(order.bundle_id)));
      if (selectedBundle && succeededSet.has(selectedBundle.bundle_id)) {
        setShowBundleDetailsModal(false);
        setSelectedBundle(null);
        setBundleLines([]);
      }
      setSelectedIds(new Set());
      const failed = selectedBundles.length - succeededIds.length;
      if (failed > 0) {
        showToast(`Deleted ${succeededIds.length}, failed ${failed}`, "error");
      } else {
        showToast(`Deleted ${succeededIds.length} bundle${succeededIds.length !== 1 ? "s" : ""}`, "success");
      }
    } catch {
      showToast("Bulk delete failed", "error");
    } finally {
      setBulkDeleting(false);
    }
  }

  async function executeBulkConfirm() {
    setBulkConfirming(true);
    setShowBulkConfirmModal(false);
    const ids = bulkConfirmableOrders.map((order) => getOrderActionId(order));
    try {
      const token = await getAdminToken();
      if (!token) return;
      const results = await Promise.allSettled(
        ids.map(async (id) => {
          const res = await fetch(`${API_URL}/api/admin/orders/${id}/confirm`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          });
          return res.ok;
        })
      );
      const succeeded = results.reduce((count, result) => {
        return result.status === "fulfilled" && result.value ? count + 1 : count;
      }, 0);
      const failed = ids.length - succeeded;
      setSelectedIds(new Set());
      await fetchOrders();
      if (failed > 0) {
        showToast(`Confirmed ${succeeded}, failed ${failed}`, "error");
      } else {
        showToast(`Confirmed ${succeeded} order${succeeded !== 1 ? "s" : ""}`, "success");
      }
    } catch {
      showToast("Bulk confirm failed", "error");
    } finally {
      setBulkConfirming(false);
    }
  }

  async function executeBulkStatusAction(action: "mark_picked_up" | "cancel") {
    const targetOrders = action === "mark_picked_up" ? bulkPickedUpOrders : bulkCancelableOrders;
    const setLoadingState = action === "mark_picked_up" ? setBulkMarkingPickedUp : setBulkCancelling;
    const closeModal = action === "mark_picked_up" ? setShowBulkPickedUpModal : setShowBulkCancelModal;
    const noun = action === "mark_picked_up" ? "marked picked up" : "cancelled";

    setLoadingState(true);
    closeModal(false);
    try {
      const results = await Promise.allSettled(
        targetOrders.map((order) => handleStatusAction(order, action, { skipRefresh: true, skipToast: true }))
      );
      const succeeded = results.reduce((count, result) => (
        result.status === "fulfilled" && result.value ? count + 1 : count
      ), 0);
      const failed = targetOrders.length - succeeded;
      setSelectedIds(new Set());
      await fetchOrders();
      if (selectedBundle && targetOrders.some((order) => order.bundle_id === selectedBundle.bundle_id)) {
        await refreshSelectedBundleDetails();
      }
      if (failed > 0) {
        showToast(`Bulk action ${noun} ${succeeded}, failed ${failed}`, "error");
      } else {
        showToast(`Bulk action ${noun} ${succeeded} bundle${succeeded !== 1 ? "s" : ""}`, "success");
      }
    } finally {
      setLoadingState(false);
    }
  }

  function closeRemindModal() {
    if (remindLoading) return;
    setShowRemindModal(false);
    setRemindSearch("");
    setRemindSelections(new Set());
    setReminderRun(EMPTY_REMINDER_RUN);
  }

  function openRemindModal() {
    setShowReminderMenu(false);
    setRemindSelections(new Set(eligibleReminderOrders.map((o) => o.id)));
    setRemindSearch("");
    setReminderRun(EMPTY_REMINDER_RUN);
    setShowRemindModal(true);
  }

  function openBulkReminderConfirm() {
    setShowRemindModal(false);
    setShowBulkReminderConfirm(true);
  }

  function closeBulkReminderConfirm() {
    if (remindLoading) return;
    setShowBulkReminderConfirm(false);
    setShowRemindModal(true);
  }

  function closePaymentRemindModal() {
    if (paymentReminderLoading) return;
    setShowPaymentRemindModal(false);
    setPaymentRemindSearch("");
    setPaymentRemindSelections(new Set());
    setPaymentReminderRun(EMPTY_REMINDER_RUN);
  }

  function openPaymentRemindModal() {
    setShowReminderMenu(false);
    setPaymentRemindSelections(new Set(eligiblePaymentReminderRecipients.map((recipient) => recipient.orderId)));
    setPaymentRemindSearch("");
    setPaymentReminderRun(EMPTY_REMINDER_RUN);
    setShowPaymentRemindModal(true);
  }

  function openBulkPaymentReminderConfirm() {
    setShowPaymentRemindModal(false);
    setShowBulkPaymentReminderConfirm(true);
  }

  function closeBulkPaymentReminderConfirm() {
    if (paymentReminderLoading) return;
    setShowBulkPaymentReminderConfirm(false);
    setShowPaymentRemindModal(true);
  }

  function openPaymentReminderConfirmFromPaymentModal() {
    if (!paymentTarget) return;
    setPaymentTarget(null);
    setPaymentReminderConfirmTarget(paymentTarget);
  }

  function closePaymentReminderConfirm() {
    if (paymentReminderLoading) return;
    const target = paymentReminderConfirmTarget;
    setPaymentReminderConfirmTarget(null);
    if (target) setPaymentTarget(target);
  }

  function closeBundleDetailsModal() {
    if (loadingBundleDetails) return;
    setShowBundleDetailsModal(false);
    setSelectedBundle(null);
    setBundleLines([]);
    setBundleInvoiceId(null);
    setShowEditBundleModal(false);
  }

  async function refreshSelectedBundleDetails() {
    if (!selectedBundle) return;
    const refreshed = orders.find((order) => order.bundle_id === selectedBundle.bundle_id) ?? selectedBundle;
    await fetchBundleDetails(refreshed);
  }

  function buildReminderItems(orderIds: string[]): ReminderQueueItem[] {
    const ordersById = new Map(orders.map((order) => [order.id, order]));

    return orderIds.flatMap((orderId) => {
      const order = ordersById.get(orderId);
      if (!order) return [];

      return [{
        orderId: order.id,
        name: order.name,
        email: (order.email ?? "").trim(),
        pickupLabel: formatPickupLabel(order),
        status: "queued",
        attempts: 0,
        message: "",
        lastResultCode: null,
      }];
    });
  }

  function buildPaymentReminderItems(orderIds: string[]): ReminderQueueItem[] {
    const ordersById = new Map(orders.map((order) => [order.id, order]));
    const recipientsByKey = new Map(
      paymentReminderRecipients.map((recipient) => [recipient.recipientKey, recipient])
    );
    const queuedRecipientKeys = new Set<string>();

    return orderIds.flatMap((orderId) => {
      const order = ordersById.get(orderId);
      if (!order) return [];

      const recipientKey = getPaymentReminderRecipientKey(order);
      if (queuedRecipientKeys.has(recipientKey)) return [];
      queuedRecipientKeys.add(recipientKey);

      const recipient = recipientsByKey.get(recipientKey);
      if (!recipient || recipient.disabledReason) return [];

      return [{
        orderId: order.id,
        name: recipient.name,
        email: recipient.email,
        pickupLabel: recipient.pickupLabel,
        status: "queued",
        attempts: 0,
        message: "",
        lastResultCode: null,
      }];
    });
  }

  async function sendReminderAttempt(
    orderId: string,
    token: string
  ): Promise<QueueAttemptResult> {
    try {
      const res = await fetch(`${API_URL}/api/admin/orders/${orderId}/remind`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 404) {
        return {
          outcome: "failed",
          message: await getApiErrorMessage(res, "Order not found"),
          resultCode: null,
        };
      }

      if (!res.ok) {
        const message = await getApiErrorMessage(res, "Failed to send reminder");
        const retryable = res.status >= 500 || res.status === 429;
        return {
          outcome: retryable ? "retryable_failed" : "failed",
          message,
          resultCode: null,
        };
      }

      const data = await res.json() as ReminderSendResponse;
      if (data.status === "sent") {
        return {
          outcome: "sent",
          message: data.message || "Reminder sent",
          resultCode: data.status,
        };
      }
      if (data.status === "failed") {
        return {
          outcome: "retryable_failed",
          message: data.message || "Failed to send reminder",
          resultCode: data.status,
        };
      }
      return {
        outcome: "skipped",
        message: data.message || "Reminder skipped",
        resultCode: data.status,
      };
    } catch (err) {
      return {
        outcome: "retryable_failed",
        message: err instanceof Error ? err.message : "Failed to send reminder",
        resultCode: null,
      };
    }
  }

  async function sendPaymentReminderAttempt(
    orderId: string,
    token: string
  ): Promise<QueueAttemptResult> {
    try {
      const res = await fetch(`${API_URL}/api/admin/orders/${orderId}/payment-remind`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 404) {
        return {
          outcome: "failed",
          message: await getApiErrorMessage(res, "Order not found"),
          resultCode: null,
        };
      }

      if (!res.ok) {
        const message = await getApiErrorMessage(res, "Failed to send payment reminder");
        const retryable = res.status >= 500 || res.status === 429;
        return {
          outcome: retryable ? "retryable_failed" : "failed",
          message,
          resultCode: null,
        };
      }

      const data = await res.json() as PaymentReminderSendResponse;
      if (data.status === "sent") {
        return {
          outcome: "sent",
          message: data.message || "Payment reminder sent",
          resultCode: data.status,
        };
      }
      if (data.status === "failed") {
        return {
          outcome: "retryable_failed",
          message: data.message || "Failed to send payment reminder",
          resultCode: data.status,
        };
      }
      return {
        outcome: "skipped",
        message: data.message || "Payment reminder skipped",
        resultCode: data.status,
      };
    } catch (err) {
      return {
        outcome: "retryable_failed",
        message: err instanceof Error ? err.message : "Failed to send payment reminder",
        resultCode: null,
      };
    }
  }

  function buildQueueSummary(
    runState: ReminderRunState,
    noun: string
  ): { message: string; type: "success" | "error" } {
    let message = `Sent ${runState.sent} ${noun}${runState.sent !== 1 ? "s" : ""}`;
    if (runState.skipped > 0) {
      message += `, skipped ${runState.skipped}`;
    }
    if (runState.failed > 0) {
      message += `, failed ${runState.failed}`;
    }
    return {
      message,
      type: runState.failed > 0 ? "error" : "success",
    };
  }

  async function executeQueueRun(options: {
    itemsToTrack: ReminderQueueItem[];
    orderIdsToProcess: string[];
    setRun: (nextRun: ReminderRunState) => void;
    sendAttempt: (orderId: string, token: string) => Promise<QueueAttemptResult>;
    intervalMs: number;
    noun: string;
  }) {
    const { itemsToTrack, orderIdsToProcess, setRun, sendAttempt, intervalMs, noun } = options;
    if (orderIdsToProcess.length === 0) return;

    const token = await getAdminToken();
    if (!token) return;

    let items = itemsToTrack.map((item) => ({ ...item }));
    setRun(buildReminderRunState(items, { isRunning: true, isComplete: false, activeOrderId: null }));

    for (let orderIdx = 0; orderIdx < orderIdsToProcess.length; orderIdx += 1) {
      const orderId = orderIdsToProcess[orderIdx];
      const itemIndex = items.findIndex((item) => item.orderId === orderId);
      if (itemIndex < 0) continue;

      let itemCompleted = false;

      for (let attempt = 1; attempt <= 3; attempt += 1) {
        items = items.map((item, idx) => (idx === itemIndex
          ? {
            ...item,
            status: "sending",
            attempts: attempt,
            message: "",
          }
          : item
        ));
        setRun(buildReminderRunState(items, { isRunning: true, isComplete: false, activeOrderId: orderId }));

        const result = await sendAttempt(orderId, token);

        if (result.outcome === "sent") {
          items = items.map((item, idx) => (idx === itemIndex
            ? {
              ...item,
              status: "sent",
              message: result.message,
              lastResultCode: result.resultCode,
            }
            : item
          ));
          setRun(buildReminderRunState(items, { isRunning: true, isComplete: false, activeOrderId: null }));
          itemCompleted = true;
          break;
        }

        if (result.outcome === "skipped") {
          items = items.map((item, idx) => (idx === itemIndex
            ? {
              ...item,
              status: "skipped",
              message: result.message,
              lastResultCode: result.resultCode,
            }
            : item
          ));
          setRun(buildReminderRunState(items, { isRunning: true, isComplete: false, activeOrderId: null }));
          itemCompleted = true;
          break;
        }

        if (result.outcome === "failed") {
          items = items.map((item, idx) => (idx === itemIndex
            ? {
              ...item,
              status: "failed",
              message: result.message,
              lastResultCode: result.resultCode,
            }
            : item
          ));
          setRun(buildReminderRunState(items, { isRunning: true, isComplete: false, activeOrderId: null }));
          itemCompleted = true;
          break;
        }

        if (attempt < 3) {
          items = items.map((item, idx) => (idx === itemIndex
            ? {
              ...item,
              status: "retrying",
              message: "Retrying after send failure",
              lastResultCode: result.resultCode,
            }
            : item
          ));
          setRun(buildReminderRunState(items, { isRunning: true, isComplete: false, activeOrderId: orderId }));
          await wait(REMINDER_RETRY_BACKOFF_MS[attempt - 1]);
          continue;
        }

        items = items.map((item, idx) => (idx === itemIndex
          ? {
            ...item,
            status: "failed",
            message: "Send failed after 3 attempts",
            lastResultCode: result.resultCode,
          }
          : item
        ));
        setRun(buildReminderRunState(items, { isRunning: true, isComplete: false, activeOrderId: null }));
        itemCompleted = true;
      }

      if (!itemCompleted) {
        items = items.map((item, idx) => (idx === itemIndex
          ? {
            ...item,
            status: "failed",
            message: "Send failed after 3 attempts",
          }
          : item
        ));
        setRun(buildReminderRunState(items, { isRunning: true, isComplete: false, activeOrderId: null }));
      }

      if (orderIdx < orderIdsToProcess.length - 1) {
        await wait(intervalMs);
      }
    }

    const completedRun = buildReminderRunState(items, { isRunning: false, isComplete: true, activeOrderId: null });
    setRun(completedRun);

    const refreshed = await fetchOrders({ suppressErrorToast: true });
    const summary = buildQueueSummary(completedRun, noun);
    if (!refreshed) {
      showToast("Emails finished, but orders could not be refreshed", "error");
      setTimeout(() => {
        showToast(summary.message, summary.type);
      }, 900);
      return;
    }
    showToast(summary.message, summary.type);
  }

  async function handleSendReminders() {
    const ids = Array.from(remindSelections);
    if (ids.length === 0) return;

    const items = buildReminderItems(ids);
    if (items.length === 0) {
      showToast("No reminder recipients available", "error");
      return;
    }

    await executeQueueRun({
      itemsToTrack: items,
      orderIdsToProcess: items.map((item) => item.orderId),
      setRun: setReminderRun,
      sendAttempt: sendReminderAttempt,
      intervalMs: REMINDER_SEND_INTERVAL_MS,
      noun: "reminder",
    });
  }

  async function handleRetryFailedReminders() {
    if (remindLoading) return;

    const retryOrderIds = reminderRun.items
      .filter((item) => item.status === "failed")
      .map((item) => item.orderId);
    if (retryOrderIds.length === 0) return;

    const nextItems: ReminderQueueItem[] = reminderRun.items.map((item): ReminderQueueItem => (
      item.status === "failed"
        ? {
          ...item,
          status: "queued",
          attempts: 0,
          message: "",
          lastResultCode: null,
        }
        : { ...item }
    ));

    await executeQueueRun({
      itemsToTrack: nextItems,
      orderIdsToProcess: retryOrderIds,
      setRun: setReminderRun,
      sendAttempt: sendReminderAttempt,
      intervalMs: REMINDER_SEND_INTERVAL_MS,
      noun: "reminder",
    });
  }

  async function handleSendPaymentReminders() {
    const ids = Array.from(paymentRemindSelections);
    if (ids.length === 0) return;

    const items = buildPaymentReminderItems(ids);
    if (items.length === 0) {
      showToast("No payment reminder recipients available", "error");
      return;
    }

    await executeQueueRun({
      itemsToTrack: items,
      orderIdsToProcess: items.map((item) => item.orderId),
      setRun: setPaymentReminderRun,
      sendAttempt: sendPaymentReminderAttempt,
      intervalMs: PAYMENT_REMINDER_SEND_INTERVAL_MS,
      noun: "payment reminder",
    });
  }

  async function handleRetryFailedPaymentReminders() {
    if (paymentReminderLoading) return;

    const retryOrderIds = paymentReminderRun.items
      .filter((item) => item.status === "failed")
      .map((item) => item.orderId);
    if (retryOrderIds.length === 0) return;

    const nextItems: ReminderQueueItem[] = paymentReminderRun.items.map((item): ReminderQueueItem => (
      item.status === "failed"
        ? {
          ...item,
          status: "queued",
          attempts: 0,
          message: "",
          lastResultCode: null,
        }
        : { ...item }
    ));

    await executeQueueRun({
      itemsToTrack: nextItems,
      orderIdsToProcess: retryOrderIds,
      setRun: setPaymentReminderRun,
      sendAttempt: sendPaymentReminderAttempt,
      intervalMs: PAYMENT_REMINDER_SEND_INTERVAL_MS,
      noun: "payment reminder",
    });
  }

  async function handleAddOrder(e: React.FormEvent) {
    e.preventDefault();
    if (addModalEventId === null) {
      showToast("Please select an event", "error");
      return;
    }

    const addModalItems: OrderLineItem[] = (addModalEventConfig?.items ?? []).map((item) => ({
      ...item,
      is_locked: false,
    }));
    const selectedLines = linesFromQuantities(addModalItems, addOrderQuantities);
    if (selectedLines.length === 0) {
      setAddOrderItemsError("Please add at least one item.");
      return;
    }
    for (const { item, qty } of selectedLines) {
      const minimumOrderQuantity = getMinimumOrderQuantity(item);
      if (qty < minimumOrderQuantity) {
        setAddOrderItemsError(`${item.name} requires a minimum order of ${minimumOrderQuantity}.`);
        return;
      }
    }

    setAddingOrder(true);
    try {
      const token = await getAdminToken();
      if (!token) return;
      const groupId = selectedLines.length > 1 ? crypto.randomUUID() : null;

      const createResults = await Promise.allSettled(
        selectedLines.map(async ({ item, qty }) => {
          const res = await fetch(`${API_URL}/api/admin/orders`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              ...addOrderForm,
              item_id: item.id,
              quantity: qty,
              event_id: addModalEventId,
              group_id: groupId,
            }),
          });
          if (!res.ok) {
            throw new Error(await getApiErrorMessage(res, `Failed to create item for ${item.name}`));
          }
          return true;
        })
      );

      const succeeded = createResults.filter((result) => result.status === "fulfilled").length;
      const failed = createResults.length - succeeded;
      const failedLines = selectedLines.filter((_, index) => createResults[index]?.status === "rejected");

      if (succeeded > 0) {
        await fetchOrders();
        if (failed > 0) {
          const nextQuantities: Record<string, number> = {};
          for (const { item, qty } of failedLines) {
            nextQuantities[item.id] = qty;
          }
          setAddOrderQuantities(nextQuantities);
          setAddOrderItemsError("Some items were created. Only failed items remain selected for retry.");
        }
      }

      if (failed === 0) {
        showToast(`Created ${succeeded} order item${succeeded !== 1 ? "s" : ""}`, "success");
        setShowAddOrderModal(false);
        setAddOrderForm(EMPTY_ADD_FORM);
        setAddOrderQuantities({});
        setAddOrderItemsError("");
        return;
      }

      const firstFailure = createResults.find((result) => result.status === "rejected");
      const firstFailureMessage = firstFailure && firstFailure.status === "rejected"
        ? firstFailure.reason instanceof Error
          ? firstFailure.reason.message
          : "Unknown error"
        : "Unknown error";

      if (succeeded === 0) {
        throw new Error(firstFailureMessage);
      }

      showToast(`Created ${succeeded}, failed ${failed}. First error: ${firstFailureMessage}`, "error");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to create order", "error");
    } finally {
      setAddingOrder(false);
    }
  }

  async function handleAddRandomOrder(e: React.FormEvent) {
    e.preventDefault();

    const addModalItems = randomOrderPickerItems;
    const selectedLines = linesFromQuantities(addModalItems, randomOrderQuantities);
    if (selectedLines.length === 0) {
      setRandomOrderItemsError("Please add at least one item.");
      return;
    }

    for (const { item, qty } of selectedLines) {
      if (qty < 1) {
        setRandomOrderItemsError(`${item.name} requires at least one portion.`);
        return;
      }
      const unitPrice = randomOrderPrices[item.id] ?? item.discounted_price ?? item.price;
      if (unitPrice <= 0) {
        setRandomOrderItemsError(`${item.name} needs a unit price greater than 0.`);
        return;
      }
    }

    if (!randomOrderForm.name.trim()) {
      setRandomOrderItemsError("Name is required.");
      return;
    }
    if (!randomOrderForm.exclude_email && !randomOrderForm.email.trim()) {
      setRandomOrderItemsError("Email is required unless email is excluded.");
      return;
    }
    if (!randomOrderForm.pickup_location.trim() || !randomOrderForm.pickup_time_slot.trim()) {
      setRandomOrderItemsError("Pickup location and time slot are required.");
      return;
    }
    if (!randomOrderForm.pickup_date.trim()) {
      setRandomOrderItemsError("Pickup date is required.");
      return;
    }

    setAddingOrder(true);
    try {
      const token = await getAdminToken();
      if (!token) return;

      const groupId = randomOrderGroupId ?? crypto.randomUUID();
      if (!randomOrderGroupId) {
        setRandomOrderGroupId(groupId);
      }

      const createResults = await Promise.allSettled(
        selectedLines.map(async ({ item, qty }) => {
          const unitPrice = randomOrderPrices[item.id] ?? item.discounted_price ?? item.price;
          const res = await fetch(`${API_URL}/api/admin/orders`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              ...randomOrderForm,
              mode: "random",
              group_id: groupId,
              item_id: item.id,
              quantity: qty,
              unit_price: unitPrice,
            }),
          });
          if (!res.ok) {
            throw new Error(await getApiErrorMessage(res, `Failed to create item for ${item.name}`));
          }
          return true;
        })
      );

      const succeeded = createResults.filter((result) => result.status === "fulfilled").length;
      const failed = createResults.length - succeeded;
      const failedLines = selectedLines.filter((_, index) => createResults[index]?.status === "rejected");

      if (succeeded > 0) {
        await fetchOrders();
        if (failed > 0) {
          const nextQuantities: Record<string, number> = {};
          for (const { item, qty } of failedLines) {
            nextQuantities[item.id] = qty;
          }
          setRandomOrderQuantities(nextQuantities);
          setRandomOrderItemsError("Some items were created. Only failed items remain selected for retry.");
        }
      }

      if (failed === 0) {
        showToast(`Created ${succeeded} random request item${succeeded !== 1 ? "s" : ""}`, "success");
        resetRandomOrderModalState();
        return;
      }

      const firstFailure = createResults.find((result) => result.status === "rejected");
      const firstFailureMessage = firstFailure && firstFailure.status === "rejected"
        ? firstFailure.reason instanceof Error
          ? firstFailure.reason.message
          : "Unknown error"
        : "Unknown error";

      if (succeeded === 0) {
        throw new Error(firstFailureMessage);
      }

      showToast(`Created ${succeeded}, failed ${failed}. First error: ${firstFailureMessage}`, "error");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to create random order", "error");
    } finally {
      setAddingOrder(false);
    }
  }

  function downloadCsvTemplate() {
    const headers = "Name,Email,Phone,Item ID,Quantity,Pickup Location,Time Slot";
    const example = eventConfig
      ? `John Smith,john@example.com,905-555-0123,${eventConfig.items[0]?.id ?? "lamprais-01"},2,${eventConfig.locations[0]?.name ?? "Welland"},${eventConfig.locations[0]?.timeSlots[0] ?? "11:00 AM - 12:00 PM"}`
      : "John Smith,john@example.com,905-555-0123,lamprais-01,2,Welland,11:00 AM - 12:00 PM";
    const blob = new Blob([headers + "\n" + example], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "order-import-template.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function parseCsvForImport(text: string): BulkRow[] {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length === 0) return [];
    const firstLineCols = lines[0].split(",").map((c) => c.trim());
    const hasHeader = isExpectedCsvHeaderRow(firstLineCols);
    const dataLines = hasHeader ? lines.slice(1) : lines;
    const rowNumberOffset = hasHeader ? 2 : 1;
    const rows: BulkRow[] = dataLines.map((line, idx) => {
      const cols = line.split(",").map((c) => c.trim());
      const [name, email, phone_number, item_id, quantityStr, pickup_location, ...timeSlotParts] = cols;
      const pickup_time_slot = timeSlotParts.join(",").trim();
      const quantity = parseInt(quantityStr ?? "0", 10);
      const row: BulkRow = {
        name: name ?? "",
        email: email ?? "",
        phone_number: phone_number ?? "",
        item_id: item_id ?? "",
        quantity: isNaN(quantity) ? 0 : quantity,
        pickup_location: pickup_location ?? "",
        pickup_time_slot,
        _rowNum: idx + rowNumberOffset,
      };
      const errors: string[] = [];
      if (!row.name) errors.push("name is required");
      if (!row.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) errors.push("valid email required");
      if (row.quantity < 1) errors.push("quantity must be >= 1");
      if (eventConfig) {
        const validItem = eventConfig.items.find((i) => i.id === row.item_id);
        if (!validItem) errors.push(`unknown item_id "${row.item_id}"`);
        const validLoc = eventConfig.locations.find((l) => l.name === row.pickup_location);
        if (!validLoc) errors.push(`unknown location "${row.pickup_location}"`);
        else if (validItem && !validLoc.timeSlots.includes(row.pickup_time_slot)) {
          errors.push(`time slot "${row.pickup_time_slot}" not available at ${row.pickup_location}`);
        }
      }
      if (errors.length > 0) row._error = errors.join("; ");
      return row;
    });
    return rows;
  }

  function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setBulkImportRows(parseCsvForImport(text));
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  async function executeBulkImport() {
    const validRows = bulkImportRows.filter((r) => !r._error);
    if (validRows.length === 0) return;
    setBulkImporting(true);
    try {
      const token = await getAdminToken();
      if (!token) return;
      const results = await Promise.allSettled(
        validRows.map((row) =>
          fetch(`${API_URL}/api/admin/orders`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              event_id: configEventId,
              name: row.name,
              email: row.email,
              phone_number: row.phone_number,
              item_id: row.item_id,
              quantity: row.quantity,
              pickup_location: row.pickup_location,
              pickup_time_slot: row.pickup_time_slot,
            }),
          }).then((r) => r.ok)
        )
      );
      const succeeded = results.filter((r) => r.status === "fulfilled" && r.value).length;
      const failed = validRows.length - succeeded;
      setShowBulkImportModal(false);
      setBulkImportRows([]);
      await fetchOrders();
      if (failed > 0) {
        showToast(`Imported ${succeeded}, failed ${failed}`, "error");
      } else {
        showToast(`Imported ${succeeded} order${succeeded !== 1 ? "s" : ""}`, "success");
      }
    } catch {
      showToast("Bulk import failed", "error");
    } finally {
      setBulkImporting(false);
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

  function formatMoney(value: number) {
    return new Intl.NumberFormat("en-CA", {
      style: "currency",
      currency: CURRENCY,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }

  // Checkbox select-all (current page)
  const pageIds = paginated.map((o) => o.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const somePageSelected = pageIds.some((id) => selectedIds.has(id)) && !allPageSelected;

  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = somePageSelected;
    }
  }, [somePageSelected]);

  function toggleSelectAll() {
    if (allPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        pageIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        pageIds.forEach((id) => next.add(id));
        return next;
      });
    }
  }

  function toggleSelectOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const thBase = "px-3 md:px-4 py-3 text-left text-[11px] md:text-xs font-semibold uppercase tracking-wider";

  // Time slots for selected location in the add order form
  const addOrderTimeSlots = useMemo(() => {
    if (!addModalEventConfig || !addOrderForm.pickup_location) return [];
    const loc = addModalEventConfig.locations.find((l) => l.name === addOrderForm.pickup_location);
    return loc?.timeSlots ?? [];
  }, [addModalEventConfig, addOrderForm.pickup_location]);

  const addOrderPickerItems = useMemo<OrderLineItem[]>(
    () => (addModalEventConfig?.items ?? []).map((item) => ({ ...item, is_locked: false })),
    [addModalEventConfig]
  );

  const randomOrderPickerItems = useMemo<OrderLineItem[]>(
    () => catalogItems.map((item) => ({ ...item, is_locked: false })),
    [catalogItems]
  );

  const randomLocationSuggestions = useMemo(
    () => Array.from(new Set(catalogLocations.map((location) => location.name).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [catalogLocations]
  );

  const randomTimeSlotSuggestions = useMemo(
    () => Array.from(new Set(catalogLocations.flatMap((location) => location.timeSlots || []))).filter(Boolean).sort((a, b) => a.localeCompare(b)),
    [catalogLocations]
  );

  function resetAddOrderModalState() {
    setShowAddOrderModal(false);
    setAddOrderForm(EMPTY_ADD_FORM);
    setAddOrderQuantities({});
    setAddOrderItemsError("");
  }

  function resetRandomOrderModalState() {
    setShowRandomOrderModal(false);
    setRandomOrderForm(EMPTY_RANDOM_ADD_FORM);
    setRandomOrderQuantities({});
    setRandomOrderPrices({});
    setRandomOrderItemsError("");
    setRandomOrderGroupId(null);
  }

  function openEventAddOrderModal() {
    setShowAddOrderChoiceModal(false);
    setShowRandomOrderModal(false);
    setShowAddOrderModal(true);
    setAddOrderForm(EMPTY_ADD_FORM);
    setAddOrderQuantities({});
    setAddOrderItemsError("");
    setAddModalEventId(configEventId);
    setAddModalEventConfig(configEventId ? eventConfig : null);
    const matchedEvent = configEventId ? events.find((evt) => evt.id === configEventId) : null;
    setAddModalEventSearch(matchedEvent ? `${matchedEvent.name} (${matchedEvent.event_date})` : "");
    setShowAddEventDropdown(false);
  }

  function openRandomAddOrderModal() {
    setShowAddOrderChoiceModal(false);
    setShowAddOrderModal(false);
    setShowRandomOrderModal(true);
    setRandomOrderForm(EMPTY_RANDOM_ADD_FORM);
    setRandomOrderQuantities({});
    setRandomOrderPrices({});
    setRandomOrderItemsError("");
    setRandomOrderGroupId(crypto.randomUUID());
  }

  const normalizedAddModalEventQuery = useMemo(() => {
    return addModalEventSearch
      .toLowerCase()
      .replace(/[()]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }, [addModalEventSearch]);

  const filteredAddModalEvents = useMemo(() => {
    const q = normalizedAddModalEventQuery;
    const eventChoices = events.filter((e) => e.kind !== "random_requests");
    if (!q) return eventChoices;
    return eventChoices.filter((e) => {
      const haystack = `${e.name} ${e.event_date}`
        .toLowerCase()
        .replace(/[()]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return haystack.includes(q);
    });
  }, [events, normalizedAddModalEventQuery]);

  const randomEventLabel = useMemo(() => {
    const randomEvent = events.find((event) => event.kind === "random_requests");
    if (!randomEvent) return "Random Requests";
    return randomEvent.name === randomEvent.event_date
      ? randomEvent.name
      : `${randomEvent.name} (${randomEvent.event_date})`;
  }, [events]);

  const validBulkRows = bulkImportRows.filter((r) => !r._error);
  const invalidBulkRows = bulkImportRows.filter((r) => r._error);

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "0.5rem 0.75rem",
    borderRadius: "0.75rem",
    border: "1px solid var(--color-border)",
    fontSize: "0.875rem",
    color: "var(--color-text)",
    background: "white",
    outline: "none",
  };

  const isReminderProgressMode = reminderRun.total > 0;
  const failedReminderItems = reminderRun.items.filter((item) => item.status === "failed");
  const reminderProgressPercent = reminderRun.total > 0
    ? Math.round((reminderRun.completed / reminderRun.total) * 100)
    : 0;
  const isPaymentReminderProgressMode = paymentReminderRun.total > 0;
  const failedPaymentReminderItems = paymentReminderRun.items.filter((item) => item.status === "failed");
  const paymentReminderProgressPercent = paymentReminderRun.total > 0
    ? Math.round((paymentReminderRun.completed / paymentReminderRun.total) * 100)
    : 0;

  return (
    <div className="p-4 sm:p-8">
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-6">
        <div>
          <h1
            className="text-2xl font-bold mb-1"
            style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}
          >
            Orders
          </h1>
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            Clicking Send Confirmation emails the customer and marks the order confirmed automatically (unless email is excluded).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative" ref={reminderMenuRef}>
            <button
              onClick={() => setShowReminderMenu((prev) => !prev)}
              className="px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2"
              style={{ background: "var(--color-bark)", color: "var(--color-cream)", border: "1px solid var(--color-bark)" }}
              aria-haspopup="menu"
              aria-expanded={showReminderMenu}
            >
              <BellIcon width={14} height={14} />
              Remind
              <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 7.5L10 12.5L15 7.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {showReminderMenu && (
              <div
                role="menu"
                className="absolute right-0 mt-2 w-56 rounded-2xl p-2"
                style={{
                  background: "white",
                  border: "1px solid var(--color-border)",
                  boxShadow: "0 20px 40px rgba(0,0,0,0.12)",
                  zIndex: 20,
                }}
              >
                <button
                  onClick={openRemindModal}
                  className="w-full flex items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium"
                  style={{ color: "var(--color-text)" }}
                  role="menuitem"
                >
                  <BellIcon width={15} height={15} />
                  Pickup reminder
                </button>
                <button
                  onClick={openPaymentRemindModal}
                  className="w-full flex items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium"
                  style={{ color: "var(--color-text)" }}
                  role="menuitem"
                >
                  <BellIcon width={15} height={15} />
                  Payment reminder
                </button>
              </div>
            )}
          </div>
          <button
            onClick={() => setShowAddOrderChoiceModal(true)}
            className="px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2"
            style={{ background: "#F2AF29", color: "#1C1C1A", border: "1px solid #F2AF29" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Order
          </button>
          <button
            onClick={() => {
              setBulkImportRows([]);
              setShowBulkImportModal(true);
            }}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2"
            style={{ background: "white", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Bulk Import
          </button>
        </div>
      </div>

      {/* Filters + search + actions */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {/* Status dropdown */}
        <div className="relative w-full sm:w-auto">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ ...dropdownStyle, width: "100%" }}
          >
            <option value="all">All Statuses</option>
            {Object.entries(STATUS_STYLES).map(([val, s]) => (
              <option key={val} value={val}>{s.label}</option>
            ))}
          </select>
          <SelectChevron />
        </div>

        {/* Payment dropdown */}
        <div className="relative w-full sm:w-auto">
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            style={{ ...dropdownStyle, width: "100%" }}
          >
            <option value="all">All Payments</option>
            <option value="paid">Paid</option>
            <option value="unpaid">Unpaid</option>
          </select>
          <SelectChevron />
        </div>

        {/* Location dropdown */}
        <div className="relative w-full sm:w-auto">
          <select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
            style={{ ...dropdownStyle, width: "100%" }}
          >
            <option value="all">All Locations</option>
            {locationFilterOptions.map((loc) => (
              <option key={loc} value={loc}>{loc}</option>
            ))}
          </select>
          <SelectChevron />
        </div>

        {/* Event dropdown (searchable) */}
        <div className="w-full sm:w-[320px]">
          <SearchableSelect
            options={eventOptions}
            value={eventFilter}
            onChange={setEventFilter}
            placeholder="All Events"
            searchPlaceholder="Search events..."
          />
        </div>

        {/* Clear filters */}
        {(filter !== "all" || paymentFilter !== "all" || eventFilter !== "all" || locationFilter !== "all" || search) && (
          <button
            onClick={() => { setFilter("all"); setPaymentFilter("all"); setEventFilter("all"); setLocationFilter("all"); setSearch(""); }}
            className="px-3 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-1.5 shrink-0"
            style={{ background: "#fee2e2", color: "#991b1b", border: "1px solid #fca5a5" }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            Clear filters
          </button>
        )}

        {/* Search */}
        <div className="relative w-full sm:flex-1 sm:min-w-48">
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
            placeholder="Search name, email, phone, location, event..."
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
          onClick={() => {
            void fetchOrders();
          }}
          className="px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 w-full sm:w-auto"
          style={{
            background: "#111111",
            color: "white",
            border: "1px solid #111111",
            boxShadow: "0 2px 0 rgba(0,0,0,0.45), 0 8px 16px rgba(0,0,0,0.16)",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Result count */}
      {!loading && (
        <p className="text-xs mb-3" style={{ color: "var(--color-muted)" }}>
          {search
            ? `${filtered.length} result${filtered.length !== 1 ? "s" : ""} for "${search}"`
            : `${filtered.length} bundle${filtered.length !== 1 ? "s" : ""}`}
          {totalPages > 1 && ` - page ${page} of ${totalPages}`}
        </p>
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-xl mb-3 text-sm font-medium"
          style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}
        >
          <span className="flex-1">{selectedIds.size} bundle{selectedIds.size !== 1 ? "s" : ""} selected</span>
          {bulkConfirmableOrders.length > 0 && (
            <button
              onClick={() => setShowBulkConfirmModal(true)}
              disabled={bulkConfirming}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-60"
              style={{ background: "rgba(255,255,255,0.15)", color: "var(--color-cream)" }}
            >
              {bulkConfirming ? "Confirming..." : `Confirm (${bulkConfirmableOrders.length})`}
            </button>
          )}
          {bulkPickedUpOrders.length > 0 && (
            <button
              onClick={() => setShowBulkPickedUpModal(true)}
              disabled={bulkMarkingPickedUp}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-60"
              style={{ background: "rgba(255,255,255,0.15)", color: "var(--color-cream)" }}
            >
              {bulkMarkingPickedUp ? "Updating..." : `Picked Up (${bulkPickedUpOrders.length})`}
            </button>
          )}
          {bulkCancelableOrders.length > 0 && (
            <button
              onClick={() => setShowBulkCancelModal(true)}
              disabled={bulkCancelling}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-60"
              style={{ background: "rgba(220,38,38,0.3)", color: "#fecaca" }}
            >
              {bulkCancelling ? "Cancelling..." : `Cancel (${bulkCancelableOrders.length})`}
            </button>
          )}
          <button
            onClick={() => setShowBulkDeleteModal(true)}
            disabled={bulkDeleting}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-60"
            style={{ background: "rgba(220,38,38,0.3)", color: "#fca5a5" }}
          >
            {bulkDeleting ? "Deleting..." : "Delete Selected"}
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
            style={{ background: "rgba(255,255,255,0.1)", color: "rgba(247,245,240,0.7)" }}
          >
            Clear
          </button>
        </div>
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
              {search ? `No bundles match "${search}".` : "No bundles found."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] lg:min-w-0 text-sm">
              <thead>
                <tr style={{ background: "var(--color-cream)", borderBottom: "1px solid var(--color-border)" }}>
                  <th className="px-3 md:px-4 py-3 w-10">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={toggleSelectAll}
                      className="cursor-pointer"
                      aria-label="Select all on page"
                    />
                  </th>
                  <th className={thBase} style={{ color: "var(--color-muted)" }}>Name</th>
                  <th className={`${thBase} hidden lg:table-cell`} style={{ color: "var(--color-muted)" }}>Contact</th>
                  <th className={thBase} style={{ color: "var(--color-muted)" }}>Items</th>
                  <th className={thBase} style={{ color: "var(--color-muted)" }}>
                    <button
                      onClick={() => toggleSort("timeslot")}
                      className="flex items-center gap-1 uppercase tracking-wider font-semibold hover:opacity-70 transition-opacity"
                    >
                      Pickup <SortIcon active={sort.col === "timeslot"} dir={sort.dir} />
                    </button>
                  </th>
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
                  <th className={thBase} style={{ color: "var(--color-muted)" }}>Payment</th>
                  <th className={`${thBase} hidden xl:table-cell`} style={{ color: "var(--color-muted)" }}>
                    <span className="flex items-center gap-1 uppercase tracking-wider font-semibold" title="Reminded">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                      </svg>
                    </span>
                  </th>
                  <th className={`${thBase} hidden md:table-cell`} style={{ color: "var(--color-muted)" }}>
                    <button
                      onClick={() => toggleSort("date")}
                      className="flex items-center gap-1 uppercase tracking-wider font-semibold hover:opacity-70 transition-opacity"
                    >
                      Order Date <SortIcon active={sort.col === "date"} dir={sort.dir} />
                    </button>
                  </th>
                  <th className={`${thBase} text-right`} style={{ color: "var(--color-muted)" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((order, idx) => {
                  const actionId = getOrderActionId(order);
                  const isConfirming = confirming === actionId;
                  const isSendingReminder = sendingReminder === actionId;
                  const isUpdatingStatus = updatingStatus === actionId;
                  const isUpdatingPayment = updatingPayment === actionId;
                  const isDeleting = deleting === actionId;
                  const isSelected = selectedIds.has(order.id);
                  const primaryAction = getTablePrimaryAction(order);
                  const overflowActions = getTableOverflowActions(order);
                  const isActionMenuOpen = openActionMenuId === actionId;
                  return (
                    <tr
                      key={order.id}
                      onClick={() => { void fetchBundleDetails(order); }}
                      className="cursor-pointer transition-colors"
                      style={{
                        borderBottom: idx < paginated.length - 1 ? "1px solid var(--color-border)" : "none",
                        background: isSelected ? "rgba(114,145,82,0.06)" : "transparent",
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) (e.currentTarget as HTMLTableRowElement).style.background = "var(--color-cream)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLTableRowElement).style.background = isSelected ? "rgba(114,145,82,0.06)" : "transparent";
                      }}
                    >
                      <td className="px-3 md:px-4 py-3 w-10 align-top" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectOne(order.id)}
                          className="cursor-pointer"
                          aria-label={`Select order ${order.id}`}
                        />
                      </td>
                      <td className="px-3 md:px-4 py-3 font-medium align-top" style={{ color: "var(--color-text)" }}>
                        <div>{order.name}</div>
                        <div className="lg:hidden mt-1 space-y-1 text-xs font-normal" style={{ color: "var(--color-muted)" }}>
                          {(order.email || !order.exclude_email) && (
                            <div className="break-all">{order.email ?? "-"}</div>
                          )}
                          {order.phone_number && <div>{order.phone_number}</div>}
                          {order.exclude_email && (
                            <span
                              className="inline-flex text-[10px] px-2 py-0.5 rounded-full font-semibold"
                              style={{ background: "#f3f4f6", color: "#374151", border: "1px solid var(--color-border)" }}
                            >
                              Email Excluded
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="hidden lg:table-cell px-4 py-3 align-top" style={{ color: "var(--color-muted)" }}>
                        <div className="flex items-center gap-2 flex-wrap">
                          {(order.email || !order.exclude_email) && (
                            <span>{order.email ?? "-"}</span>
                          )}
                          {order.exclude_email && (
                            <span
                              className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                              style={{ background: "#f3f4f6", color: "#374151", border: "1px solid var(--color-border)" }}
                            >
                              Email Excluded
                            </span>
                          )}
                        </div>
                        {order.phone_number && (
                          <div className="text-xs">{order.phone_number}</div>
                        )}
                      </td>
                      <td className="px-3 md:px-4 py-3 align-top" style={{ color: "var(--color-text)" }}>
                        <div className="text-lg font-semibold" style={{ lineHeight: 1.1 }}>
                          {order.quantity_total}
                        </div>
                      </td>
                      <td className="px-3 md:px-4 py-3 align-top" style={{ color: "var(--color-text)", minWidth: 220 }}>
                        <div className="font-medium" style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {eventLabelById.get(order.event_id) ?? `Event ${order.event_id}`}
                        </div>
                        <div className="mt-0.5">{order.pickup_location}</div>
                        <div className="text-xs" style={{ color: "var(--color-muted)" }}>
                          <span>{order.pickup_time_slot}</span>
                          {order.pickup_address && (
                            <span> | {order.pickup_address}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 md:px-4 py-3 font-semibold align-top whitespace-nowrap" style={{ color: "var(--color-forest)" }}>
                        {formatMoney(order.total_price)}
                      </td>
                      <td className="px-3 md:px-4 py-3 align-top" onClick={(e) => e.stopPropagation()}>
                        <StatusBadge status={order.status} />
                      </td>
                      <td className="px-3 md:px-4 py-3 align-top" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              if (order.paid) {
                                setUnpayTarget(order);
                                return;
                              }
                              openMarkPaidModal(order);
                            }}
                            disabled={isUpdatingPayment}
                            className="px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all disabled:opacity-60"
                            style={{
                              background: order.paid ? "var(--color-success-bg)" : "var(--color-error-bg)",
                              color: order.paid ? "var(--color-success-text)" : "var(--color-error-text)",
                              borderColor: order.paid ? "var(--color-success-border)" : "var(--color-error-border)",
                              boxShadow: order.paid
                                ? "0 2px 0 var(--color-success-border), 0 8px 16px rgba(6,95,70,0.12)"
                                : "0 2px 0 var(--color-error-border), 0 8px 16px rgba(153,27,27,0.12)",
                            }}
                            aria-label={order.paid ? "Open mark unpaid dialog" : "Open mark paid dialog"}
                            title={order.paid ? "Mark as unpaid" : "Mark as paid"}
                          >
                            {order.paid ? "Paid" : "Unpaid"}
                          </button>
                          <PaymentMethodBadge order={order} />
                        </div>
                      </td>
                      <td className="hidden xl:table-cell px-4 py-3 text-center align-top" title={order.reminded ? "Reminder sent" : "Not reminded"}>
                        {order.reminded ? (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-sage)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                          </svg>
                        ) : (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                            <line x1="1" y1="1" x2="23" y2="23"/>
                          </svg>
                        )}
                      </td>
                      <td className="hidden md:table-cell px-4 py-3 whitespace-nowrap text-xs align-top" style={{ color: "var(--color-muted)" }}>
                        {formatDate(order.created_at)}
                      </td>
                      <td className="px-3 md:px-4 py-3 align-top" onClick={(e) => e.stopPropagation()}>
                        <div className="relative flex items-start justify-end" ref={isActionMenuOpen ? actionMenuRef : null}>
                          <div className="flex items-center gap-2">
                            {primaryAction?.kind === "confirm" && (
                              <button
                                onClick={() => setConfirmTarget(order)}
                                disabled={isConfirming}
                                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all disabled:opacity-60"
                                style={{
                                  background: "var(--color-bark)",
                                  color: "white",
                                  border: "1px solid rgba(28,28,26,0.08)",
                                  boxShadow: "0 2px 0 rgba(88,58,37,0.45), 0 8px 16px rgba(139,94,60,0.22)",
                                }}
                                title={order.exclude_email ? "Confirm bundle without email" : "Confirm and send email"}
                              >
                                {isConfirming ? "Confirming..." : primaryAction.label}
                              </button>
                            )}
                            {primaryAction?.kind === "status" && (
                              <button
                                onClick={() => setStatusActionTarget({ order, action: primaryAction.action })}
                                disabled={isUpdatingStatus}
                                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all disabled:opacity-60"
                                style={{
                                  background: primaryAction.action === "mark_picked_up" ? "var(--color-sage)" : "white",
                                  color: primaryAction.action === "mark_picked_up" ? "white" : "var(--color-text)",
                                  border: primaryAction.action === "mark_picked_up"
                                    ? "1px solid var(--color-sage)"
                                    : "1px solid rgba(28,28,26,0.12)",
                                  boxShadow: primaryAction.action === "mark_picked_up"
                                    ? "0 2px 0 rgba(114,145,82,0.45), 0 8px 16px rgba(114,145,82,0.18)"
                                    : "0 1px 0 rgba(28,28,26,0.06), 0 6px 14px rgba(28,28,26,0.06)",
                                }}
                              >
                                {primaryAction.label}
                              </button>
                            )}
                            {primaryAction?.kind === "review" && (
                              <button
                                onClick={() => { void fetchBundleDetails(order); }}
                                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all"
                                style={{
                                  background: "white",
                                  color: "var(--color-text)",
                                  border: "1px solid rgba(28,28,26,0.12)",
                                  boxShadow: "0 1px 0 rgba(28,28,26,0.06), 0 6px 14px rgba(28,28,26,0.06)",
                                }}
                              >
                                {primaryAction.label}
                              </button>
                            )}
                            <button
                              onClick={() => setOpenActionMenuId((prev) => (prev === actionId ? null : actionId))}
                              className="h-9 w-9 rounded-xl transition-all flex items-center justify-center"
                              style={{
                                background: "white",
                                color: "var(--color-text)",
                                border: "1px solid rgba(28,28,26,0.12)",
                                boxShadow: "0 1px 0 rgba(28,28,26,0.06), 0 6px 14px rgba(28,28,26,0.06)",
                              }}
                              aria-label="More actions"
                              title="More actions"
                            >
                              <MoreIcon width={15} height={15} />
                            </button>
                          </div>
                          {isActionMenuOpen && (
                            <div
                              className="absolute right-0 top-[calc(100%+0.5rem)] min-w-[220px] rounded-2xl overflow-hidden"
                              style={{
                                background: "white",
                                border: "1px solid var(--color-border)",
                                boxShadow: "0 18px 36px rgba(28,28,26,0.14)",
                                zIndex: 40,
                              }}
                            >
                              <button
                                onClick={() => {
                                  setOpenActionMenuId(null);
                                  void fetchBundleDetails(order);
                                }}
                                className="w-full px-4 py-3 text-left text-sm font-medium transition-colors"
                                style={{ color: "var(--color-text)", borderBottom: "1px solid var(--color-border)" }}
                              >
                                Open Bundle
                              </button>
                              {order.status === "confirmed" && (
                                <button
                                  onClick={() => {
                                    setOpenActionMenuId(null);
                                    setReminderConfirmTarget(order);
                                  }}
                                  disabled={isSendingReminder || !!getReminderUnavailableReason(order)}
                                  className="w-full px-4 py-3 text-left text-sm font-medium transition-colors disabled:opacity-60"
                                  style={{
                                    color: "var(--color-text)",
                                    borderBottom: "1px solid var(--color-border)",
                                  }}
                                >
                                  {isSendingReminder ? "Sending Reminder..." : (order.reminded ? "Reminder Sent" : "Send Reminder")}
                                </button>
                              )}
                              {overflowActions.map((action, index) => (
                                <button
                                  key={action.key}
                                  onClick={() => {
                                    setOpenActionMenuId(null);
                                    setStatusActionTarget({ order, action: action.key });
                                  }}
                                  disabled={isUpdatingStatus}
                                  className="w-full px-4 py-3 text-left text-sm font-medium transition-colors disabled:opacity-60"
                                  style={{
                                    color: action.key === "mark_picked_up"
                                      ? "var(--color-sage)"
                                      : action.tone === "danger"
                                        ? "#991b1b"
                                        : "var(--color-text)",
                                    borderBottom: index === overflowActions.length - 1 ? "none" : "1px solid var(--color-border)",
                                  }}
                                >
                                  {action.label}
                                </button>
                              ))}
                              <button
                                onClick={() => {
                                  setOpenActionMenuId(null);
                                  setDeleteTarget(actionId);
                                }}
                                disabled={isDeleting}
                                className="w-full px-4 py-3 text-left text-sm font-medium transition-colors disabled:opacity-60"
                                style={{
                                  color: "#991b1b",
                                  borderTop: overflowActions.length > 0 ? "1px solid var(--color-border)" : "none",
                                  background: "#fff7f7",
                                }}
                              >
                                {isDeleting ? "Deleting..." : "Delete Bundle"}
                              </button>
                            </div>
                          )}
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

      {showBundleDetailsModal && selectedBundle && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            zIndex: 110,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeBundleDetailsModal();
          }}
        >
          <div
            style={{
              background: "white",
              borderRadius: "24px",
              border: "1px solid var(--color-border)",
              maxWidth: "900px",
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              padding: "24px",
              boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
            }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 mb-5">
              <div>
                <h2 className="text-2xl font-bold" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>
                  Order Bundle
                </h2>
                <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
                  Bundle: {selectedBundle.bundle_id}
                </p>
              </div>
              <button
                onClick={closeBundleDetailsModal}
                className="w-9 h-9 rounded-lg"
                style={{ background: "var(--color-cream)", border: "1px solid var(--color-border)", color: "var(--color-muted)" }}
                aria-label="Close details"
              >
                X
              </button>
            </div>

            {loadingBundleDetails ? (
              <div className="flex justify-center py-12">
                <svg className="animate-spin" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" opacity="0.3" />
                  <path d="M12 2a10 10 0 0 1 10 10" stroke="var(--color-sage)" />
                </svg>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-2xl p-4" style={{ border: "1px solid var(--color-border)", background: "white" }}>
                    <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--color-sage)" }}>Customer Details</p>
                    <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>{selectedBundle.name}</p>
                    <p className="text-sm" style={{ color: "var(--color-muted)" }}>{selectedBundle.email ?? "-"}</p>
                    <p className="text-sm" style={{ color: "var(--color-muted)" }}>{selectedBundle.phone_number ?? "-"}</p>
                  </div>

                  <div className="rounded-2xl p-4" style={{ border: "1px solid var(--color-border)", background: "white" }}>
                    <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--color-sage)" }}>Order Actions</p>
                    <div className="flex items-center gap-2 flex-wrap mb-3">
                      <StatusBadge status={selectedBundle.status} />
                      {selectedBundle.status === "pending" && (
                        <button
                          onClick={() => setConfirmTarget(selectedBundle)}
                          disabled={confirming === getOrderActionId(selectedBundle)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-60"
                          style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}
                        >
                          {selectedBundle.exclude_email ? "Confirm (No Email)" : "Confirm & Email"}
                        </button>
                      )}
                      {selectedBundle.status === "confirmed" && (
                        <button
                          onClick={() => { setReminderConfirmTarget(selectedBundle); }}
                          disabled={sendingReminder === getOrderActionId(selectedBundle) || !!getReminderUnavailableReason(selectedBundle)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-60"
                          style={{
                            background: getReminderUnavailableReason(selectedBundle) ? "var(--color-cream)" : "rgba(114,145,82,0.12)",
                            color: getReminderUnavailableReason(selectedBundle) ? "var(--color-muted)" : "var(--color-forest)",
                            border: "1px solid var(--color-border)",
                          }}
                          title={getReminderUnavailableReason(selectedBundle) ?? "Send pickup reminder"}
                        >
                          {sendingReminder === getOrderActionId(selectedBundle) ? "Sending..." : (selectedBundle.reminded ? "Reminder Sent" : "Send Reminder")}
                        </button>
                      )}
                      {getStatusActionSpecs(selectedBundle, "detail").map((action) => (
                        <button
                          key={action.key}
                          onClick={() => setStatusActionTarget({ order: selectedBundle, action: action.key })}
                          disabled={updatingStatus === getOrderActionId(selectedBundle)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-60"
                          style={{
                            background: action.tone === "danger" ? "#fee2e2" : "white",
                            color: action.tone === "danger" ? "#991b1b" : "var(--color-text)",
                            border: action.tone === "danger" ? "1px solid #fca5a5" : "1px solid var(--color-border)",
                          }}
                        >
                          {action.label}
                        </button>
                      ))}
                      {selectedBundle.paid ? (
                        <button
                          onClick={() => setUnpayTarget(selectedBundle)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                          style={{ background: "#dc2626", color: "white" }}
                        >
                          Mark Unpaid
                        </button>
                      ) : (
                        <button
                          onClick={() => openMarkPaidModal(selectedBundle)}
                          disabled={selectedBundle.status === "pending"}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-60"
                          style={{ background: "var(--color-sage)", color: "white" }}
                        >
                          Mark Paid
                        </button>
                      )}
                    </div>
                    {selectedBundle.status === "mixed" && (
                      <p className="text-xs mb-2" style={{ color: "var(--color-muted)" }}>
                        Mixed bundles do not expose quick actions in the table. Review the bundle here before normalizing it.
                      </p>
                    )}
                    <p className="text-xs" style={{ color: "var(--color-muted)" }}>
                      Payment: {selectedBundle.paid ? "Paid" : "Unpaid"}{selectedBundle.payment_method ? ` (${selectedBundle.payment_method}${selectedBundle.payment_method_other ? `: ${selectedBundle.payment_method_other}` : ""})` : ""}
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl p-4" style={{ border: "1px solid var(--color-border)", background: "white" }}>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--color-sage)" }}>Order Details</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div><span style={{ color: "var(--color-muted)" }}>Event:</span><div style={{ color: "var(--color-text)" }}>{eventLabelById.get(selectedBundle.event_id) ?? `Event ${selectedBundle.event_id}`}</div></div>
                    <div><span style={{ color: "var(--color-muted)" }}>Items:</span><div style={{ color: "var(--color-text)" }}>{selectedBundle.quantity_total}</div></div>
                    <div><span style={{ color: "var(--color-muted)" }}>Item Types:</span><div style={{ color: "var(--color-text)" }}>{selectedBundle.line_count}</div></div>
                    <div><span style={{ color: "var(--color-muted)" }}>Total:</span><div style={{ color: "var(--color-forest)", fontWeight: 700 }}>{formatMoney(selectedBundle.total_price)}</div></div>
                    <div><span style={{ color: "var(--color-muted)" }}>Location:</span><div style={{ color: "var(--color-text)" }}>{selectedBundle.pickup_location}</div></div>
                    <div><span style={{ color: "var(--color-muted)" }}>Time Slot:</span><div style={{ color: "var(--color-text)" }}>{selectedBundle.pickup_time_slot}</div></div>
                    <div><span style={{ color: "var(--color-muted)" }}>Address:</span><div style={{ color: "var(--color-text)" }}>{selectedBundle.pickup_address ?? "-"}</div></div>
                    <div><span style={{ color: "var(--color-muted)" }}>Date Placed:</span><div style={{ color: "var(--color-text)" }}>{formatDate(selectedBundle.created_at)}</div></div>
                  </div>
                  {selectedBundle.status === "mixed" && selectedBundle.status_breakdown && (
                    <p className="text-xs mt-2" style={{ color: "var(--color-muted)" }}>
                      Mixed status: {Object.entries(selectedBundle.status_breakdown).map(([status, count]) => `${status}: ${count}`).join(", ")}
                    </p>
                  )}
                </div>

                <div className="rounded-2xl p-4" style={{ border: "1px solid var(--color-border)", background: "white" }}>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--color-sage)" }}>Items Ordered</p>
                  {bundleLines.length === 0 ? (
                    <p className="text-sm" style={{ color: "var(--color-muted)" }}>No items found for this order.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                            <th className="text-left font-semibold py-2" style={{ color: "var(--color-muted)" }}>Item</th>
                            <th className="text-left font-semibold py-2" style={{ color: "var(--color-muted)" }}>Qty</th>
                            <th className="text-left font-semibold py-2" style={{ color: "var(--color-muted)" }}>Unit Cost</th>
                            <th className="text-left font-semibold py-2" style={{ color: "var(--color-muted)" }}>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bundleLines.map((item) => {
                            const qty = Number(item.quantity) || 0;
                            const lineTotal = Number(item.total_price) || 0;
                            const unitCost = qty > 0 ? lineTotal / qty : lineTotal;
                            return (
                              <tr key={item.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                                <td className="py-2" style={{ color: "var(--color-text)" }}>{item.item_name}</td>
                                <td className="py-2" style={{ color: "var(--color-text)" }}>{qty}</td>
                                <td className="py-2" style={{ color: "var(--color-text)" }}>{formatMoney(unitCost)}</td>
                                <td className="py-2 font-semibold" style={{ color: "var(--color-forest)" }}>{formatMoney(lineTotal)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl p-4" style={{ border: "1px solid var(--color-border)", background: "white" }}>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--color-sage)" }}>Notes</p>
                  <p className="text-sm" style={{ color: "var(--color-text)", whiteSpace: "pre-wrap" }}>{selectedBundle.notes ? selectedBundle.notes : "-"}</p>
                  {selectedBundle.notes_mixed && (
                    <p className="text-xs mt-2" style={{ color: "var(--color-muted)" }}>
                      Some item-level notes differ. Editing this bundle will resync shared notes.
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => router.push(bundleInvoiceId ? `/admin/invoices/${bundleInvoiceId}` : `/admin/invoices/new?bundle_id=${encodeURIComponent(selectedBundle.bundle_id)}`)}
                    disabled={loadingBundleInvoice}
                    className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-60"
                    style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}
                  >
                    {loadingBundleInvoice ? "Checking Invoice..." : bundleInvoiceId ? "View Invoice" : "Create Invoice"}
                  </button>
                  <button
                    onClick={() => setShowEditBundleModal(true)}
                    className="px-4 py-2 rounded-xl text-sm font-semibold"
                    style={{ background: "white", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
                  >
                    Edit Bundle
                  </button>
                  <button
                    onClick={() => setDeleteTarget(getOrderActionId(selectedBundle))}
                    className="px-4 py-2 rounded-xl text-sm font-semibold"
                    style={{ background: "#fee2e2", color: "#991b1b", border: "1px solid #fca5a5" }}
                  >
                    Delete Bundle
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <BundleEditModal
        isOpen={showEditBundleModal && !!selectedBundle}
        bundle={selectedBundle ? {
          bundle_id: selectedBundle.bundle_id,
          primary_order_id: selectedBundle.primary_order_id,
          event_id: selectedBundle.event_id,
          status: selectedBundle.status,
          name: selectedBundle.name,
          email: selectedBundle.email,
          phone_number: selectedBundle.phone_number,
          pickup_location: selectedBundle.pickup_location,
          pickup_time_slot: selectedBundle.pickup_time_slot,
          pickup_address: selectedBundle.pickup_address,
          pickup_date: selectedBundle.pickup_date,
          notes: selectedBundle.notes,
          exclude_email: selectedBundle.exclude_email,
        } : null}
        lines={bundleLines}
        onClose={() => setShowEditBundleModal(false)}
        onSaved={async () => {
          await fetchOrders({ suppressErrorToast: true });
          await refreshSelectedBundleDetails();
        }}
        notify={showToast}
      />

      {/* Single delete modal */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Bundle"
        variant="danger"
        actions={
          <>
            <button
              onClick={() => setDeleteTarget(null)}
              className="px-4 py-2 rounded-xl text-sm font-medium"
              style={{ background: "var(--color-cream)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                const id = deleteTarget!;
                setDeleteTarget(null);
                executeDelete(id);
              }}
              className="px-4 py-2 rounded-xl text-sm font-semibold"
              style={{ background: "#dc2626", color: "white" }}
            >
              Delete
            </button>
          </>
        }
      >
        This order bundle will be permanently deleted. This cannot be undone.
      </Modal>

      <Modal
        isOpen={!!confirmTarget}
        onClose={() => {
          if (confirmTarget && confirming === getOrderActionId(confirmTarget)) return;
          setConfirmTarget(null);
        }}
        title={confirmTarget?.exclude_email ? "Confirm Order Without Email" : "Send Confirmation Email"}
        actions={
          <>
            <button
              onClick={() => setConfirmTarget(null)}
              disabled={!!confirmTarget && confirming === getOrderActionId(confirmTarget)}
              className="px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-60"
              style={{ background: "var(--color-cream)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                const target = confirmTarget;
                if (!target) return;
                const orderId = getOrderActionId(target);
                await handleConfirm(orderId);
                setConfirmTarget(null);
              }}
              disabled={!!confirmTarget && confirming === getOrderActionId(confirmTarget)}
              className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-60"
              style={{ background: "var(--color-bark)", color: "white" }}
            >
              {confirmTarget?.exclude_email ? "Confirm order" : "Send email"}
            </button>
          </>
        }
      >
        {confirmTarget?.exclude_email
          ? `This will mark ${confirmTarget.name} as confirmed without sending an email because email is excluded for this bundle.`
          : `This will send the confirmation email to ${confirmTarget?.name ?? "this customer"} and mark the bundle as confirmed.`}
      </Modal>

      <Modal
        isOpen={!!statusActionTarget}
        onClose={() => {
          if (statusActionTarget && updatingStatus === getOrderActionId(statusActionTarget.order)) return;
          setStatusActionTarget(null);
        }}
        title={statusActionTarget ? getStatusActionModalCopy(statusActionTarget.action, statusActionTarget.order).title : "Update Bundle Status"}
        variant={statusActionTarget?.action === "cancel" || statusActionTarget?.action === "mark_no_show" ? "danger" : "default"}
        actions={
          <>
            <button
              onClick={() => setStatusActionTarget(null)}
              disabled={!!statusActionTarget && updatingStatus === getOrderActionId(statusActionTarget.order)}
              className="px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-60"
              style={{ background: "var(--color-cream)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                const target = statusActionTarget;
                if (!target) return;
                const ok = await handleStatusAction(target.order, target.action);
                if (ok) setStatusActionTarget(null);
              }}
              disabled={!!statusActionTarget && updatingStatus === getOrderActionId(statusActionTarget.order)}
              className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-60"
              style={{
                background: statusActionTarget?.action === "cancel" || statusActionTarget?.action === "mark_no_show" ? "#dc2626" : "var(--color-forest)",
                color: "white",
              }}
            >
              {statusActionTarget ? getStatusActionModalCopy(statusActionTarget.action, statusActionTarget.order).confirmLabel : "Confirm"}
            </button>
          </>
        }
      >
        {statusActionTarget ? getStatusActionModalCopy(statusActionTarget.action, statusActionTarget.order).body : ""}
      </Modal>

      {/* Bulk delete modal */}
      <Modal
        isOpen={showBulkDeleteModal}
        onClose={() => setShowBulkDeleteModal(false)}
        title={`Delete ${selectedIds.size} Bundle${selectedIds.size !== 1 ? "s" : ""}?`}
        variant="danger"
        actions={
          <>
            <button
              onClick={() => setShowBulkDeleteModal(false)}
              className="px-4 py-2 rounded-xl text-sm font-medium"
              style={{ background: "var(--color-cream)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
            >
              Cancel
            </button>
            <button
              onClick={executeBulkDelete}
              className="px-4 py-2 rounded-xl text-sm font-semibold"
              style={{ background: "#dc2626", color: "white" }}
            >
              Delete All
            </button>
          </>
        }
      >
        {selectedIds.size} bundle{selectedIds.size !== 1 ? "s" : ""} will be permanently deleted. This cannot be undone.
      </Modal>

      {/* Bulk confirm modal */}
      <Modal
        isOpen={showBulkConfirmModal}
        onClose={() => setShowBulkConfirmModal(false)}
        title={`Confirm ${bulkConfirmableOrders.length} Bundle${bulkConfirmableOrders.length !== 1 ? "s" : ""}?`}
        actions={
          <>
            <button
              onClick={() => setShowBulkConfirmModal(false)}
              className="px-4 py-2 rounded-xl text-sm font-medium"
              style={{ background: "var(--color-cream)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
            >
              Cancel
            </button>
            <button
              onClick={executeBulkConfirm}
              className="px-4 py-2 rounded-xl text-sm font-semibold"
              style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}
            >
              Send Confirmations
            </button>
          </>
        }
      >
        Confirmation emails will be sent to {bulkConfirmableOrders.length} customer{bulkConfirmableOrders.length !== 1 ? "s" : ""} and their bundles will be marked as confirmed (bundles with Email Excluded will be confirmed without email).
      </Modal>

      <Modal
        isOpen={showBulkPickedUpModal}
        onClose={() => setShowBulkPickedUpModal(false)}
        title={`Mark ${bulkPickedUpOrders.length} Bundle${bulkPickedUpOrders.length !== 1 ? "s" : ""} Picked Up?`}
        actions={
          <>
            <button
              onClick={() => setShowBulkPickedUpModal(false)}
              className="px-4 py-2 rounded-xl text-sm font-medium"
              style={{ background: "var(--color-cream)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
            >
              Cancel
            </button>
            <button
              onClick={() => { void executeBulkStatusAction("mark_picked_up"); }}
              className="px-4 py-2 rounded-xl text-sm font-semibold"
              style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}
            >
              Mark picked up
            </button>
          </>
        }
      >
        This will mark {bulkPickedUpOrders.length} confirmed bundle{bulkPickedUpOrders.length !== 1 ? "s" : ""} as picked up.
      </Modal>

      <Modal
        isOpen={showBulkCancelModal}
        onClose={() => setShowBulkCancelModal(false)}
        title={`Cancel ${bulkCancelableOrders.length} Bundle${bulkCancelableOrders.length !== 1 ? "s" : ""}?`}
        variant="danger"
        actions={
          <>
            <button
              onClick={() => setShowBulkCancelModal(false)}
              className="px-4 py-2 rounded-xl text-sm font-medium"
              style={{ background: "var(--color-cream)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
            >
              Keep bundles
            </button>
            <button
              onClick={() => { void executeBulkStatusAction("cancel"); }}
              className="px-4 py-2 rounded-xl text-sm font-semibold"
              style={{ background: "#dc2626", color: "white" }}
            >
              Cancel bundles
            </button>
          </>
        }
      >
        This will cancel {bulkCancelableOrders.length} selected bundle{bulkCancelableOrders.length !== 1 ? "s" : ""}. Mixed bundles are excluded from this bulk action.
      </Modal>

      {/* Mark paid modal */}
      <Modal
        isOpen={!!paymentTarget}
        onClose={() => {
          if (paymentTarget && updatingPayment === getOrderActionId(paymentTarget)) return;
          setPaymentTarget(null);
        }}
        title="Mark Paid"
        actions={
          <>
            <button
              onClick={() => setPaymentTarget(null)}
              disabled={!!paymentTarget && updatingPayment === getOrderActionId(paymentTarget)}
              className="px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-60"
              style={{ background: "var(--color-cream)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
            >
              Cancel
            </button>
            {paymentTarget && !getPaymentReminderUnavailableReason(paymentTarget) && (
              <button
                onClick={openPaymentReminderConfirmFromPaymentModal}
                disabled={paymentReminderLoading || updatingPayment === getOrderActionId(paymentTarget)}
                className="px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-60"
                style={{ background: "white", color: "var(--color-bark)", border: "1px solid var(--color-border)" }}
              >
                Send payment reminder
              </button>
            )}
            <button
              onClick={async () => {
                const target = paymentTarget;
                if (!target) return;
                const other = paymentMethodOther.trim();
                if (paymentMethod === "other" && !other) {
                  showToast("Enter payment details for Other", "error");
                  return;
                }

                const targetId = getOrderActionId(target);
                const ok = await handlePaymentUpdate(targetId, {
                  paid: true,
                  payment_method: paymentMethod,
                  payment_method_other: paymentMethod === "other" ? other : undefined,
                });
                if (ok) setPaymentTarget(null);
              }}
              disabled={
                !!paymentTarget && (
                  updatingPayment === getOrderActionId(paymentTarget) ||
                  paymentTarget.status === "pending"
                )
              }
              className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-60"
              style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}
            >
              Save
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p style={{ color: "var(--color-muted)" }}>
            Set payment information for <span className="font-semibold" style={{ color: "var(--color-text)" }}>{paymentTarget?.name ?? "this order"}</span>.
          </p>

          {paymentTarget?.status === "pending" && (
            <div
              className="rounded-xl px-3 py-2 text-sm"
              style={{
                background: "var(--color-warning-bg)",
                color: "var(--color-warning-text)",
                border: "1px solid var(--color-warning-border)",
              }}
            >
              Confirm the order before marking it paid.
            </div>
          )}

          <div className="flex gap-2">
            {(["cash", "etransfer", "other"] as const).map((method) => {
              const selected = paymentMethod === method;
              const labels = { cash: "Cash", etransfer: "E-transfer", other: "Other" };
              const icons = { cash: <CashIcon />, etransfer: <EtransferIcon />, other: <OtherPayIcon /> };
              return (
                <button
                  key={method}
                  type="button"
                  onClick={() => setPaymentMethod(method)}
                  className="flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 transition-all text-xs font-semibold"
                  style={{
                    borderColor: selected ? "var(--color-forest)" : "var(--color-border)",
                    background: selected ? "rgba(18,39,15,0.07)" : "var(--color-cream)",
                    color: selected ? "var(--color-forest)" : "var(--color-muted)",
                  }}
                >
                  {icons[method]}
                  {labels[method]}
                </button>
              );
            })}
          </div>

          {paymentMethod === "other" && (
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-muted)" }}>
                Details <span style={{ color: "red" }}>*</span>
              </label>
              <input
                value={paymentMethodOther}
                onChange={(e) => setPaymentMethodOther(e.target.value)}
                placeholder="e.g. Gift card, split payment, etc."
                style={inputStyle}
              />
            </div>
          )}
        </div>
      </Modal>

      {/* Mark unpaid modal */}
      <Modal
        isOpen={!!unpayTarget}
        onClose={() => {
          if (unpayTarget && updatingPayment === getOrderActionId(unpayTarget)) return;
          setUnpayTarget(null);
        }}
        title="Mark Unpaid"
        variant="danger"
        actions={
          <>
            <button
              onClick={() => setUnpayTarget(null)}
              disabled={!!unpayTarget && updatingPayment === getOrderActionId(unpayTarget)}
              className="px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-60"
              style={{ background: "var(--color-cream)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                const target = unpayTarget;
                if (!target) return;
                const ok = await handlePaymentUpdate(getOrderActionId(target), { paid: false });
                if (ok) setUnpayTarget(null);
              }}
              disabled={!!unpayTarget && updatingPayment === getOrderActionId(unpayTarget)}
              className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-60"
              style={{ background: "#dc2626", color: "white" }}
            >
              Mark unpaid
            </button>
          </>
        }
      >
        This will set paid to false and clear the payment method.
      </Modal>

      {/* Single Reminder Confirmation Modal */}
      <Modal
        isOpen={!!reminderConfirmTarget}
        onClose={() => setReminderConfirmTarget(null)}
        title="Send Pickup Reminder"
        actions={
          <>
            <button
              onClick={() => setReminderConfirmTarget(null)}
              className="px-4 py-2 rounded-xl text-sm font-medium"
              style={{ background: "var(--color-cream)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                const target = reminderConfirmTarget;
                if (!target) return;
                setReminderConfirmTarget(null);
                await handleSendSingleReminder(target);
              }}
              disabled={!!reminderConfirmTarget && sendingReminder === getOrderActionId(reminderConfirmTarget)}
              className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-60"
              style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}
            >
              Send Reminder
            </button>
          </>
        }
      >
        <p style={{ color: "var(--color-muted)" }}>
          Send a pickup reminder email to <span className="font-semibold" style={{ color: "var(--color-text)" }}>{reminderConfirmTarget?.name ?? "this customer"}</span> at <span className="font-semibold" style={{ color: "var(--color-text)" }}>{reminderConfirmTarget?.email ?? "their email"}</span>?
        </p>
      </Modal>

      {/* Single Payment Reminder Confirmation Modal */}
      <Modal
        isOpen={!!paymentReminderConfirmTarget}
        onClose={closePaymentReminderConfirm}
        title="Send Payment Reminder"
        actions={
          <>
            <button
              onClick={closePaymentReminderConfirm}
              className="px-4 py-2 rounded-xl text-sm font-medium"
              style={{ background: "var(--color-cream)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                const target = paymentReminderConfirmTarget;
                if (!target) return;
                setPaymentReminderConfirmTarget(null);
                setShowPaymentRemindModal(true);
                await handleSendSinglePaymentReminder(target);
              }}
              disabled={paymentReminderLoading}
              className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-60"
              style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}
            >
              Send Payment Reminder
            </button>
          </>
        }
      >
        <p style={{ color: "var(--color-muted)" }}>
          Send a payment reminder email to <span className="font-semibold" style={{ color: "var(--color-text)" }}>{paymentReminderConfirmTarget?.name ?? "this customer"}</span> at <span className="font-semibold" style={{ color: "var(--color-text)" }}>{paymentReminderConfirmTarget?.email ?? "their email"}</span>?
        </p>
      </Modal>

      {/* Add Order Type Modal */}
      {showAddOrderChoiceModal && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setShowAddOrderChoiceModal(false); }}
        >
          <div
            style={{ background: "white", borderRadius: "24px", border: "1px solid var(--color-border)", maxWidth: "560px", width: "100%", padding: "32px", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold mb-2" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>
              Add Order
            </h2>
            <p className="text-sm mb-6" style={{ color: "var(--color-muted)" }}>
              Choose whether this order belongs to a normal event or the reserved random requests bucket.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={openEventAddOrderModal}
                className="rounded-2xl p-5 text-left transition-all"
                style={{ background: "var(--color-cream)", border: "1px solid var(--color-border)" }}
              >
                <p className="text-sm font-semibold mb-1" style={{ color: "var(--color-forest)" }}>Event</p>
                <p className="text-xs" style={{ color: "var(--color-muted)" }}>
                  Use the normal event modal with event pricing, item minimums, and location restrictions.
                </p>
              </button>
              <button
                type="button"
                onClick={openRandomAddOrderModal}
                className="rounded-2xl p-5 text-left transition-all"
                style={{ background: "#f0f7ea", border: "1px solid var(--color-sage)" }}
              >
                <p className="text-sm font-semibold mb-1" style={{ color: "var(--color-forest)" }}>Random</p>
                <p className="text-xs" style={{ color: "var(--color-muted)" }}>
                  Use freeform pickup details and manual line pricing for the {randomEventLabel}.
                </p>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Order Modal */}
      {showAddOrderModal && (
          <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) resetAddOrderModalState(); }}
        >
          <div
            style={{ background: "white", borderRadius: "24px", border: "1px solid var(--color-border)", maxWidth: "580px", width: "100%", padding: "32px", boxShadow: "0 20px 60px rgba(0,0,0,0.15)", maxHeight: "90vh", overflowY: "auto" }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold mb-5" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>
              Add Order
            </h2>
            <form onSubmit={handleAddOrder} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {/* Event selector combobox */}
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-muted)" }}>
                  Event <span style={{ color: "red" }}>*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={addModalEventSearch}
                    onChange={(e) => {
                      const nextSearch = e.target.value;
                      setAddModalEventSearch(nextSearch);
                      setShowAddEventDropdown(true);
                      const selectedEvent = addModalEventId ? events.find((evt) => evt.id === addModalEventId) : null;
                      const selectedEventLabel = selectedEvent
                        ? `${selectedEvent.name} (${selectedEvent.event_date})`
                        : "";
                      if (!selectedEvent || nextSearch !== selectedEventLabel) {
                        setAddModalEventId(null);
                        setAddModalEventConfig(null);
                        setAddOrderForm((f) => ({ ...f, pickup_location: "", pickup_time_slot: "" }));
                        setAddOrderQuantities({});
                        setAddOrderItemsError("");
                      }
                    }}
                    onFocus={() => setShowAddEventDropdown(true)}
                    onBlur={() => setTimeout(() => setShowAddEventDropdown(false), 150)}
                    placeholder="Search events..."
                    style={{ ...inputStyle, paddingRight: "2rem" }}
                  />
                  {showAddEventDropdown && (
                    <div style={{
                      position: "absolute", top: "100%", left: 0, right: 0,
                      background: "white", border: "1px solid var(--color-border)",
                      borderRadius: "12px", boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                      zIndex: 200, maxHeight: "200px", overflowY: "auto", marginTop: "4px"
                    }}>
                      {filteredAddModalEvents.map((e) => (
                          <div
                            key={e.id}
                            onMouseDown={() => {
                              setAddModalEventId(e.id);
                              setAddModalEventSearch(`${e.name} (${e.event_date})`);
                              setShowAddEventDropdown(false);
                              setAddOrderForm(f => ({ ...f, pickup_location: "", pickup_time_slot: "" }));
                              setAddOrderQuantities({});
                              setAddOrderItemsError("");
                            }}
                            style={{
                              padding: "8px 12px", cursor: "pointer",
                              background: addModalEventId === e.id ? "var(--color-cream)" : "white",
                              display: "flex", justifyContent: "space-between", alignItems: "center"
                            }}
                          >
                            <span style={{ fontWeight: 500 }}>{e.name}</span>
                            <span style={{ fontSize: "12px", color: "var(--color-muted)" }}>
                              {e.event_date}{e.is_active ? " (active)" : ""}
                            </span>
                          </div>
                        ))}
                      {filteredAddModalEvents.length === 0 && (
                        <div style={{ padding: "8px 12px", color: "var(--color-muted)", fontSize: "13px" }}>No events found</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-muted)" }}>Name</label>
                  <input
                    required
                    type="text"
                    value={addOrderForm.name}
                    onChange={(e) => setAddOrderForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Full name"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-muted)" }}>Email</label>
                  <input
                    required={!addOrderForm.exclude_email}
                    type="email"
                    value={addOrderForm.email}
                    onChange={(e) => setAddOrderForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="email@example.com"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-muted)" }}>Phone (Optional)</label>
                  <input
                    type="tel"
                    value={addOrderForm.phone_number}
                    onChange={(e) => setAddOrderForm((f) => ({ ...f, phone_number: e.target.value }))}
                    placeholder="905-555-0123"
                    style={inputStyle}
                  />
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <label className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--color-text)" }}>
                    <input
                      type="checkbox"
                      checked={addOrderForm.exclude_email}
                      onChange={(e) => setAddOrderForm((f) => ({ ...f, exclude_email: e.target.checked }))}
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
                <ItemQuantityPicker
                  items={addOrderPickerItems}
                  quantities={addOrderQuantities}
                  onChange={(next) => {
                    setAddOrderQuantities(next);
                    setAddOrderItemsError("");
                  }}
                  currency={addModalEventConfig?.currency ?? CURRENCY}
                  disabled={!addModalEventConfig}
                  error={addOrderItemsError}
                />
                {configUsesFallback && (
                  <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
                    Using active event catalog as a fallback.
                  </p>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-muted)" }}>Pickup Location</label>
                  <div className="relative">
                    <select
                      required
                      value={addOrderForm.pickup_location}
                      onChange={(e) => setAddOrderForm((f) => ({ ...f, pickup_location: e.target.value, pickup_time_slot: "" }))}
                      style={{ ...inputStyle, paddingRight: "2rem" }}
                    >
                      <option value="">Select location...</option>
                      {addModalEventConfig?.locations.map((loc) => (
                        <option key={loc.id} value={loc.name}>{loc.name}</option>
                      ))}
                    </select>
                    <SelectChevron />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-muted)" }}>Time Slot</label>
                  <div className="relative">
                    <select
                      required
                      value={addOrderForm.pickup_time_slot}
                      onChange={(e) => setAddOrderForm((f) => ({ ...f, pickup_time_slot: e.target.value }))}
                      disabled={!addOrderForm.pickup_location}
                      style={{ ...inputStyle, paddingRight: "2rem", opacity: addOrderForm.pickup_location ? 1 : 0.5 }}
                    >
                      <option value="">Select time slot...</option>
                      {addOrderTimeSlots.map((slot) => (
                        <option key={slot} value={slot}>{slot}</option>
                      ))}
                    </select>
                    <SelectChevron />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-muted)" }}>Notes (admin only)</label>
                <textarea
                  value={addOrderForm.notes}
                  onChange={(e) => setAddOrderForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Internal notes for this order..."
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical" as const, minHeight: "88px" }}
                />
              </div>

              <p className="text-xs" style={{ color: "var(--color-muted)" }}>
                Price will be computed server-side. Order will be created with status: Pending.
              </p>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={resetAddOrderModalState}
                  className="px-4 py-2 rounded-xl text-sm font-medium"
                  style={{ background: "var(--color-cream)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingOrder}
                  className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-60"
                  style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}
                >
                  {addingOrder ? "Creating..." : "Create Order"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Random Add Order Modal */}
      {showRandomOrderModal && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) resetRandomOrderModalState(); }}
        >
          <div
            style={{ background: "white", borderRadius: "24px", border: "1px solid var(--color-border)", maxWidth: "760px", width: "100%", padding: "32px", boxShadow: "0 20px 60px rgba(0,0,0,0.15)", maxHeight: "90vh", overflowY: "auto" }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold mb-2" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>
              Random Requests Order
            </h2>
            <p className="text-sm mb-5" style={{ color: "var(--color-muted)" }}>
              Add any saved items with manual line prices and adjust the pickup details for this order bundle.
            </p>

            <form onSubmit={handleAddRandomOrder} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-muted)" }}>Name</label>
                  <input
                    required
                    type="text"
                    value={randomOrderForm.name}
                    onChange={(e) => setRandomOrderForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Full name"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-muted)" }}>Email</label>
                  <input
                    required={!randomOrderForm.exclude_email}
                    type="email"
                    value={randomOrderForm.email}
                    onChange={(e) => setRandomOrderForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="email@example.com"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-muted)" }}>Phone (Optional)</label>
                  <input
                    type="tel"
                    value={randomOrderForm.phone_number}
                    onChange={(e) => setRandomOrderForm((f) => ({ ...f, phone_number: e.target.value }))}
                    placeholder="905-555-0123"
                    style={inputStyle}
                  />
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <label className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--color-text)" }}>
                    <input
                      type="checkbox"
                      checked={randomOrderForm.exclude_email}
                      onChange={(e) => setRandomOrderForm((f) => ({ ...f, exclude_email: e.target.checked }))}
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
                <ItemQuantityPicker
                  items={randomOrderPickerItems}
                  quantities={randomOrderQuantities}
                  onChange={(next) => {
                    setRandomOrderQuantities(next);
                    setRandomOrderItemsError("");
                  }}
                  linePrices={randomOrderPrices}
                  onLinePricesChange={(next) => setRandomOrderPrices(next)}
                  currency={CURRENCY}
                  allowBelowMinimumOrder
                  allowPriceEdit
                  disabled={randomOrderPickerItems.length === 0}
                  error={randomOrderItemsError}
                />
                {!catalogItems.length && (
                  <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
                    Loading the full item catalog...
                  </p>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-muted)" }}>Pickup Location</label>
                  <input
                    list="random-location-options"
                    required
                    type="text"
                    value={randomOrderForm.pickup_location}
                    onChange={(e) => setRandomOrderForm((f) => ({ ...f, pickup_location: e.target.value }))}
                    placeholder="Any pickup location"
                    style={inputStyle}
                  />
                  <datalist id="random-location-options">
                    {randomLocationSuggestions.map((location) => (
                      <option key={location} value={location} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-muted)" }}>Pickup Time Slot</label>
                  <input
                    list="random-time-slot-options"
                    required
                    type="text"
                    value={randomOrderForm.pickup_time_slot}
                    onChange={(e) => setRandomOrderForm((f) => ({ ...f, pickup_time_slot: e.target.value }))}
                    placeholder="Any pickup time slot"
                    style={inputStyle}
                  />
                  <datalist id="random-time-slot-options">
                    {randomTimeSlotSuggestions.map((slot) => (
                      <option key={slot} value={slot} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-muted)" }}>Pickup Date</label>
                <input
                  required
                  type="date"
                  value={randomOrderForm.pickup_date}
                  onChange={(e) => setRandomOrderForm((f) => ({ ...f, pickup_date: e.target.value }))}
                  style={inputStyle}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-muted)" }}>Pickup Address</label>
                <textarea
                  value={randomOrderForm.pickup_address}
                  onChange={(e) => setRandomOrderForm((f) => ({ ...f, pickup_address: e.target.value }))}
                  placeholder="Freeform pickup address or special instructions"
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical" as const, minHeight: "88px" }}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-muted)" }}>Notes (admin only)</label>
                <textarea
                  value={randomOrderForm.notes}
                  onChange={(e) => setRandomOrderForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Internal notes for this random request..."
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical" as const, minHeight: "88px" }}
                />
              </div>

              <p className="text-xs" style={{ color: "var(--color-muted)" }}>
                Manual prices are stored on each line. The Random Requests bucket is always used for these orders.
              </p>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={resetRandomOrderModalState}
                  className="px-4 py-2 rounded-xl text-sm font-medium"
                  style={{ background: "var(--color-cream)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingOrder}
                  className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-60"
                  style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}
                >
                  {addingOrder ? "Creating..." : "Create Random Request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
        {showBulkImportModal && (
          <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setShowBulkImportModal(false); }}
        >
          <div
            style={{ background: "white", borderRadius: "24px", border: "1px solid var(--color-border)", maxWidth: "720px", width: "100%", padding: "32px", boxShadow: "0 20px 60px rgba(0,0,0,0.15)", maxHeight: "90vh", overflowY: "auto" }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold mb-1" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>
              Bulk Import Orders
            </h2>
            <p className="text-sm mb-5" style={{ color: "var(--color-muted)" }}>
              Upload a CSV file to create multiple orders at once. All imported orders will be set to Pending.
            </p>
            {configEventLabel && (
              <p className="text-xs mb-4" style={{ color: "var(--color-muted)" }}>
                Importing into: {configEventLabel}{configUsesFallback ? " (using active config fallback)" : ""}
              </p>
            )}

            <div
              className="rounded-xl p-4 mb-4 text-xs"
              style={{ background: "var(--color-cream)", border: "1px solid var(--color-border)" }}
            >
              <p className="font-semibold mb-1" style={{ color: "var(--color-text)" }}>Required CSV columns (in order):</p>
              <p style={{ color: "var(--color-muted)", fontFamily: "monospace" }}>
                Name, Email, Phone, Item ID, Quantity, Pickup Location, Time Slot
              </p>
              {eventConfig && (
                <p className="mt-2" style={{ color: "var(--color-muted)" }}>
                  Valid Item IDs: {eventConfig.items.map((i) => i.id).join(", ")} |{" "}
                  Valid Locations: {eventConfig.locations.map((l) => l.name).join(", ")}
                </p>
              )}
            </div>

            <div className="flex items-center gap-3 mb-5">
              <label
                className="px-4 py-2 rounded-xl text-sm font-medium cursor-pointer transition-all flex items-center gap-2"
                style={{ background: "var(--color-forest)", color: "var(--color-cream)", border: "1px solid var(--color-forest)" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Choose CSV File
                <input type="file" accept=".csv" onChange={handleCsvFile} className="hidden" />
              </label>
              <button
                onClick={downloadCsvTemplate}
                className="px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2"
                style={{ background: "white", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M4 21h16" />
                </svg>
                Download Template
              </button>
            </div>

            {bulkImportRows.length > 0 && (
              <>
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                    {bulkImportRows.length} row{bulkImportRows.length !== 1 ? "s" : ""} parsed
                  </span>
                  {validBulkRows.length > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "#d1fae5", color: "#065f46" }}>
                      {validBulkRows.length} valid
                    </span>
                  )}
                  {invalidBulkRows.length > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "#fee2e2", color: "#991b1b" }}>
                      {invalidBulkRows.length} invalid
                    </span>
                  )}
                </div>
                <div className="rounded-xl overflow-hidden mb-5" style={{ border: "1px solid var(--color-border)", maxHeight: "260px", overflowY: "auto" }}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ background: "var(--color-cream)", borderBottom: "1px solid var(--color-border)" }}>
                        <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--color-muted)" }}>#</th>
                        <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--color-muted)" }}>Name</th>
                        <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--color-muted)" }}>Email</th>
                        <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--color-muted)" }}>Item / Qty</th>
                        <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--color-muted)" }}>Location</th>
                        <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--color-muted)" }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkImportRows.map((row) => (
                        <tr
                          key={row._rowNum}
                          style={{
                            borderBottom: "1px solid var(--color-border)",
                            background: row._error ? "#fff5f5" : "white",
                          }}
                        >
                          <td className="px-3 py-2" style={{ color: "var(--color-muted)" }}>{row._rowNum}</td>
                          <td className="px-3 py-2" style={{ color: "var(--color-text)" }}>{row.name || "-"}</td>
                          <td className="px-3 py-2" style={{ color: "var(--color-muted)" }}>{row.email || "-"}</td>
                          <td className="px-3 py-2" style={{ color: "var(--color-text)" }}>{row.item_id} x{row.quantity}</td>
                          <td className="px-3 py-2" style={{ color: "var(--color-text)" }}>{row.pickup_location || "-"}</td>
                          <td className="px-3 py-2">
                            {row._error
                              ? <span style={{ color: "#991b1b" }} title={row._error}>Error: {row._error}</span>
                              : <span style={{ color: "#065f46" }}>OK</span>
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowBulkImportModal(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium"
                style={{ background: "var(--color-cream)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
              >
                Cancel
              </button>
              <button
                onClick={executeBulkImport}
                disabled={bulkImporting || validBulkRows.length === 0}
                className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}
              >
                {bulkImporting ? "Importing..." : `Import ${validBulkRows.length} Order${validBulkRows.length !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Reminder Modal */}
      {showPaymentRemindModal && (() => {
        const searchLower = paymentRemindSearch.trim().toLowerCase();
        const filteredPaymentReminderRecipients = searchLower
          ? eligiblePaymentReminderRecipients.filter(
              (recipient) =>
                recipient.name.toLowerCase().includes(searchLower) ||
                recipient.email.toLowerCase().includes(searchLower)
            )
          : eligiblePaymentReminderRecipients;

        return (
          <div
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
            onMouseDown={(e) => {
              if (!paymentReminderLoading && e.target === e.currentTarget) {
                closePaymentRemindModal();
              }
            }}
          >
            <div
              style={{ background: "white", borderRadius: "1.5rem", padding: "2rem", width: "100%", maxWidth: "620px", maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <h2 className="text-xl font-bold mb-1" style={{ color: "var(--color-bark)", fontFamily: "var(--font-serif)" }}>
                Send Payment Reminders
              </h2>
              <p className="text-sm mb-4" style={{ color: "var(--color-muted)" }}>
                {isPaymentReminderProgressMode
                  ? "Progress updates appear here while payment reminder emails are sent two per second."
                  : "Payment reminder emails will be sent to selected unpaid order bundles that are confirmed or picked up."}
              </p>

              {!isPaymentReminderProgressMode && ineligiblePaymentReminderCount > 0 && (
                <div
                  className="rounded-xl px-4 py-3 text-xs mb-4"
                  style={{ background: "var(--color-cream)", border: "1px solid var(--color-border)", color: "var(--color-muted)" }}
                >
                  {ineligiblePaymentReminderCount} order bundle{ineligiblePaymentReminderCount !== 1 ? "s are" : " is"} not eligible (not confirmed, already paid, excluded, or missing email).
                </div>
              )}

              {!isPaymentReminderProgressMode && eligiblePaymentReminderRecipients.length === 0 ? (
                <p className="text-sm py-6 text-center" style={{ color: "var(--color-muted)" }}>
                  No unpaid confirmed or picked up orders are currently eligible for payment reminders.
                </p>
              ) : !isPaymentReminderProgressMode ? (
                <>
                  <div className="relative mb-3">
                    <svg
                      width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
                    >
                      <circle cx="11" cy="11" r="8"/>
                      <path d="m21 21-4.35-4.35"/>
                    </svg>
                    <input
                      type="text"
                      placeholder="Search by name or email..."
                      value={paymentRemindSearch}
                      onChange={(e) => setPaymentRemindSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-xl text-sm"
                      style={{ border: "1px solid var(--color-border)", background: "var(--color-cream)", color: "var(--color-text)", outline: "none" }}
                    />
                  </div>

                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                      {filteredPaymentReminderRecipients.length} of {eligiblePaymentReminderRecipients.length} shown &middot; {paymentRemindSelections.size} selected
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setPaymentRemindSelections((prev) => {
                            const next = new Set(prev);
                            for (const recipient of filteredPaymentReminderRecipients) next.add(recipient.orderId);
                            return next;
                          });
                        }}
                        className="text-xs font-medium px-2 py-1 rounded-lg transition-opacity hover:opacity-70"
                        style={{ color: "var(--color-forest)" }}
                      >
                        Select all
                      </button>
                      <button
                        onClick={() => {
                          setPaymentRemindSelections((prev) => {
                            const next = new Set(prev);
                            for (const recipient of filteredPaymentReminderRecipients) next.delete(recipient.orderId);
                            return next;
                          });
                        }}
                        className="text-xs font-medium px-2 py-1 rounded-lg transition-opacity hover:opacity-70"
                        style={{ color: "var(--color-muted)" }}
                      >
                        Unselect all
                      </button>
                    </div>
                  </div>

                  <div style={{ overflowY: "auto", maxHeight: "320px", marginBottom: "1.25rem", border: "1px solid var(--color-border)", borderRadius: "0.75rem" }}>
                    {filteredPaymentReminderRecipients.length === 0 ? (
                      <p className="text-sm py-6 text-center" style={{ color: "var(--color-muted)" }}>
                        No unpaid recipients match your search.
                      </p>
                    ) : (
                      filteredPaymentReminderRecipients.map((recipient) => (
                        <label
                          key={recipient.recipientKey}
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "0.75rem",
                            padding: "0.875rem 1rem",
                            borderBottom: "1px solid var(--color-border)",
                            cursor: "pointer",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={paymentRemindSelections.has(recipient.orderId)}
                            onChange={(e) => {
                              setPaymentRemindSelections((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(recipient.orderId);
                                else next.delete(recipient.orderId);
                                return next;
                              });
                            }}
                            style={{ marginTop: "2px", accentColor: "var(--color-bark)", width: "15px", height: "15px", flexShrink: 0 }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p className="text-sm font-semibold" style={{ color: "var(--color-text)", margin: 0 }}>{recipient.name}</p>
                            <p className="text-xs" style={{ color: "var(--color-muted)", margin: "2px 0 0" }}>{recipient.email || "-"}</p>
                            <p className="text-xs" style={{ color: "var(--color-muted)", margin: "1px 0 0" }}>{recipient.pickupLabel}</p>
                          </div>
                        </label>
                      ))
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div
                    className="rounded-2xl p-4 mb-4"
                    style={{ background: "var(--color-cream)", border: "1px solid var(--color-border)" }}
                  >
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                        {paymentReminderRun.completed} of {paymentReminderRun.total} processed
                      </p>
                      <span className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>
                        {paymentReminderProgressPercent}% complete
                      </span>
                    </div>
                    <div
                      style={{
                        width: "100%",
                        height: "12px",
                        borderRadius: "999px",
                        background: "var(--color-cream)",
                        border: "1px solid var(--color-border)",
                        overflow: "hidden",
                        marginBottom: "0.875rem",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${paymentReminderProgressPercent}%`,
                          background: "var(--color-bark)",
                          transition: "width 200ms ease",
                        }}
                      />
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                        gap: "0.75rem",
                      }}
                    >
                      <div>
                        <p className="text-[11px] uppercase font-semibold" style={{ color: "var(--color-muted)", margin: 0 }}>Sent</p>
                        <p className="text-sm font-semibold" style={{ color: "var(--color-text)", margin: "0.2rem 0 0" }}>{paymentReminderRun.sent}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase font-semibold" style={{ color: "var(--color-muted)", margin: 0 }}>Failed</p>
                        <p className="text-sm font-semibold" style={{ color: "var(--color-text)", margin: "0.2rem 0 0" }}>{paymentReminderRun.failed}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase font-semibold" style={{ color: "var(--color-muted)", margin: 0 }}>Skipped</p>
                        <p className="text-sm font-semibold" style={{ color: "var(--color-text)", margin: "0.2rem 0 0" }}>{paymentReminderRun.skipped}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase font-semibold" style={{ color: "var(--color-muted)", margin: 0 }}>Remaining</p>
                        <p className="text-sm font-semibold" style={{ color: "var(--color-text)", margin: "0.2rem 0 0" }}>{Math.max(paymentReminderRun.total - paymentReminderRun.completed, 0)}</p>
                      </div>
                    </div>
                  </div>

                  <p className="text-xs mb-3" style={{ color: "var(--color-muted)" }}>
                    Please keep this window open until sending finishes.
                  </p>

                  <div
                    style={{
                      overflowY: "auto",
                      maxHeight: "320px",
                      marginBottom: "1.25rem",
                      border: "1px solid var(--color-border)",
                      borderRadius: "0.75rem",
                    }}
                  >
                    {paymentReminderRun.items.map((item, idx) => {
                      const badge = getReminderStatusBadge(item);
                      return (
                        <div
                          key={item.orderId}
                          style={{
                            padding: "0.875rem 1rem",
                            borderBottom: idx === paymentReminderRun.items.length - 1 ? "none" : "1px solid var(--color-border)",
                            background: item.orderId === paymentReminderRun.activeOrderId ? "var(--color-cream)" : "white",
                          }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <p className="text-sm font-semibold" style={{ color: "var(--color-text)", margin: 0 }}>{item.name}</p>
                              <p className="text-xs" style={{ color: "var(--color-muted)", margin: "2px 0 0" }}>{item.email || "-"}</p>
                              <p className="text-xs" style={{ color: "var(--color-muted)", margin: "1px 0 0" }}>{item.pickupLabel}</p>
                              {item.message && (
                                <p className="text-xs" style={{ color: "var(--color-text)", margin: "0.45rem 0 0" }}>
                                  {item.message}
                                </p>
                              )}
                              {item.attempts > 0 && (
                                <p className="text-[11px]" style={{ color: "var(--color-muted)", margin: "0.3rem 0 0" }}>
                                  Attempt {item.attempts} of 3
                                </p>
                              )}
                            </div>
                            <span
                              className="text-xs font-semibold px-2.5 py-1 rounded-full"
                              style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`, flexShrink: 0 }}
                            >
                              {badge.label}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                {isPaymentReminderProgressMode ? (
                  <>
                    {failedPaymentReminderItems.length > 0 && (
                      <button
                        onClick={handleRetryFailedPaymentReminders}
                        disabled={paymentReminderLoading}
                        className="px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{ background: "var(--color-cream)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
                      >
                        Retry Failed ({failedPaymentReminderItems.length})
                      </button>
                    )}
                    <button
                      onClick={closePaymentRemindModal}
                      disabled={paymentReminderLoading}
                      className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ background: "var(--color-bark)", color: "var(--color-cream)", border: "1px solid var(--color-bark)" }}
                    >
                      {paymentReminderLoading ? "Sending..." : "Done"}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={closePaymentRemindModal}
                      className="px-4 py-2 rounded-xl text-sm font-medium"
                      style={{ background: "var(--color-cream)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={openBulkPaymentReminderConfirm}
                      disabled={paymentReminderLoading || paymentRemindSelections.size === 0}
                      className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ background: "var(--color-bark)", color: "var(--color-cream)", border: "1px solid var(--color-bark)" }}
                    >
                      {paymentReminderLoading ? "Sending..." : `Send Payment Reminder${paymentRemindSelections.size !== 1 ? "s" : ""} (${paymentRemindSelections.size})`}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Remind Modal */}
      {showRemindModal && (() => {
        const searchLower = remindSearch.trim().toLowerCase();
        const filteredRemindOrders = searchLower
          ? eligibleReminderOrders.filter(
              (o) =>
                o.name.toLowerCase().includes(searchLower) ||
                (o.email ?? "").toLowerCase().includes(searchLower)
            )
          : eligibleReminderOrders;

        return (
          <div
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
            onMouseDown={(e) => {
              if (!remindLoading && e.target === e.currentTarget) {
                closeRemindModal();
              }
            }}
          >
            <div
              style={{ background: "white", borderRadius: "1.5rem", padding: "2rem", width: "100%", maxWidth: "620px", maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <h2 className="text-xl font-bold mb-1" style={{ color: "var(--color-bark)", fontFamily: "var(--font-serif)" }}>
                Send Pickup Reminders
              </h2>
              <p className="text-sm mb-4" style={{ color: "var(--color-muted)" }}>
                {isReminderProgressMode
                  ? "Progress updates appear here while reminder emails are sent one at a time."
                  : "Reminder emails will be sent to all selected customers. Only confirmed orders that have not yet been reminded are shown."}
              </p>

              {!isReminderProgressMode && ineligibleReminderCount > 0 && (
                <div
                  className="rounded-xl px-4 py-3 text-xs mb-4"
                  style={{ background: "var(--color-cream)", border: "1px solid var(--color-border)", color: "var(--color-muted)" }}
                >
                  {ineligibleReminderCount} confirmed order{ineligibleReminderCount !== 1 ? "s are" : " is"} not eligible (already reminded, excluded, or missing email).
                </div>
              )}

              {!isReminderProgressMode && eligibleReminderOrders.length === 0 ? (
                <p className="text-sm py-6 text-center" style={{ color: "var(--color-muted)" }}>
                  {confirmedOrders.length === 0
                    ? "No confirmed orders to remind."
                    : "All confirmed orders have already been reminded or are not eligible."}
                </p>
              ) : !isReminderProgressMode ? (
                <>
                  <div className="relative mb-3">
                    <svg
                      width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
                    >
                      <circle cx="11" cy="11" r="8"/>
                      <path d="m21 21-4.35-4.35"/>
                    </svg>
                    <input
                      type="text"
                      placeholder="Search by name or email..."
                      value={remindSearch}
                      onChange={(e) => setRemindSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-xl text-sm"
                      style={{ border: "1px solid var(--color-border)", background: "var(--color-cream)", color: "var(--color-text)", outline: "none" }}
                    />
                  </div>

                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                      {filteredRemindOrders.length} of {eligibleReminderOrders.length} shown &middot; {remindSelections.size} selected
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setRemindSelections((prev) => {
                            const next = new Set(prev);
                            for (const o of filteredRemindOrders) next.add(o.id);
                            return next;
                          });
                        }}
                        className="text-xs font-medium px-2 py-1 rounded-lg transition-opacity hover:opacity-70"
                        style={{ color: "var(--color-forest)" }}
                      >
                        Select all
                      </button>
                      <button
                        onClick={() => {
                          setRemindSelections((prev) => {
                            const next = new Set(prev);
                            for (const o of filteredRemindOrders) next.delete(o.id);
                            return next;
                          });
                        }}
                        className="text-xs font-medium px-2 py-1 rounded-lg transition-opacity hover:opacity-70"
                        style={{ color: "var(--color-muted)" }}
                      >
                        Unselect all
                      </button>
                    </div>
                  </div>

                  <div style={{ overflowY: "auto", maxHeight: "320px", marginBottom: "1.25rem", border: "1px solid var(--color-border)", borderRadius: "0.75rem" }}>
                    {filteredRemindOrders.length === 0 ? (
                      <p className="text-sm py-6 text-center" style={{ color: "var(--color-muted)" }}>
                        No orders match your search.
                      </p>
                    ) : (
                      filteredRemindOrders.map((order) => (
                        <label
                          key={order.id}
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "0.75rem",
                            padding: "0.875rem 1rem",
                            borderBottom: "1px solid var(--color-border)",
                            cursor: "pointer",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={remindSelections.has(order.id)}
                            onChange={(e) => {
                              setRemindSelections((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(order.id);
                                else next.delete(order.id);
                                return next;
                              });
                            }}
                            style={{ marginTop: "2px", accentColor: "var(--color-bark)", width: "15px", height: "15px", flexShrink: 0 }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p className="text-sm font-semibold" style={{ color: "var(--color-text)", margin: 0 }}>{order.name}</p>
                            <p className="text-xs" style={{ color: "var(--color-muted)", margin: "2px 0 0" }}>{order.email ?? "-"}</p>
                            <p className="text-xs" style={{ color: "var(--color-muted)", margin: "1px 0 0" }}>{formatPickupLabel(order)}</p>
                          </div>
                        </label>
                      ))
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div
                    className="rounded-2xl p-4 mb-4"
                    style={{ background: "var(--color-cream)", border: "1px solid var(--color-border)" }}
                  >
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                        {reminderRun.completed} of {reminderRun.total} processed
                      </p>
                      <span className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>
                        {reminderProgressPercent}% complete
                      </span>
                    </div>
                    <div
                      style={{
                        width: "100%",
                        height: "12px",
                        borderRadius: "999px",
                        background: "var(--color-cream)",
                        border: "1px solid var(--color-border)",
                        overflow: "hidden",
                        marginBottom: "0.875rem",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${reminderProgressPercent}%`,
                          background: "var(--color-forest)",
                          transition: "width 200ms ease",
                        }}
                      />
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                        gap: "0.75rem",
                      }}
                    >
                      <div>
                        <p className="text-[11px] uppercase font-semibold" style={{ color: "var(--color-muted)", margin: 0 }}>Sent</p>
                        <p className="text-sm font-semibold" style={{ color: "var(--color-text)", margin: "0.2rem 0 0" }}>{reminderRun.sent}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase font-semibold" style={{ color: "var(--color-muted)", margin: 0 }}>Failed</p>
                        <p className="text-sm font-semibold" style={{ color: "var(--color-text)", margin: "0.2rem 0 0" }}>{reminderRun.failed}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase font-semibold" style={{ color: "var(--color-muted)", margin: 0 }}>Skipped</p>
                        <p className="text-sm font-semibold" style={{ color: "var(--color-text)", margin: "0.2rem 0 0" }}>{reminderRun.skipped}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase font-semibold" style={{ color: "var(--color-muted)", margin: 0 }}>Remaining</p>
                        <p className="text-sm font-semibold" style={{ color: "var(--color-text)", margin: "0.2rem 0 0" }}>{Math.max(reminderRun.total - reminderRun.completed, 0)}</p>
                      </div>
                    </div>
                  </div>

                  <p className="text-xs mb-3" style={{ color: "var(--color-muted)" }}>
                    Please keep this window open until sending finishes.
                  </p>

                  <div
                    style={{
                      overflowY: "auto",
                      maxHeight: "320px",
                      marginBottom: "1.25rem",
                      border: "1px solid var(--color-border)",
                      borderRadius: "0.75rem",
                    }}
                  >
                    {reminderRun.items.map((item, idx) => {
                      const badge = getReminderStatusBadge(item);
                      return (
                        <div
                          key={item.orderId}
                          style={{
                            padding: "0.875rem 1rem",
                            borderBottom: idx === reminderRun.items.length - 1 ? "none" : "1px solid var(--color-border)",
                            background: item.orderId === reminderRun.activeOrderId ? "var(--color-cream)" : "white",
                          }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <p className="text-sm font-semibold" style={{ color: "var(--color-text)", margin: 0 }}>{item.name}</p>
                              <p className="text-xs" style={{ color: "var(--color-muted)", margin: "2px 0 0" }}>{item.email || "-"}</p>
                              <p className="text-xs" style={{ color: "var(--color-muted)", margin: "1px 0 0" }}>{item.pickupLabel}</p>
                              {item.message && (
                                <p className="text-xs" style={{ color: "var(--color-text)", margin: "0.45rem 0 0" }}>
                                  {item.message}
                                </p>
                              )}
                              {item.attempts > 0 && (
                                <p className="text-[11px]" style={{ color: "var(--color-muted)", margin: "0.3rem 0 0" }}>
                                  Attempt {item.attempts} of 3
                                </p>
                              )}
                            </div>
                            <span
                              className="text-xs font-semibold px-2.5 py-1 rounded-full"
                              style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`, flexShrink: 0 }}
                            >
                              {badge.label}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                {isReminderProgressMode ? (
                  <>
                    {failedReminderItems.length > 0 && (
                      <button
                        onClick={handleRetryFailedReminders}
                        disabled={remindLoading}
                        className="px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{ background: "var(--color-cream)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
                      >
                        Retry Failed ({failedReminderItems.length})
                      </button>
                    )}
                    <button
                      onClick={closeRemindModal}
                      disabled={remindLoading}
                      className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ background: "var(--color-bark)", color: "var(--color-cream)", border: "1px solid var(--color-bark)" }}
                    >
                      {remindLoading ? "Sending..." : "Done"}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={closeRemindModal}
                      className="px-4 py-2 rounded-xl text-sm font-medium"
                      style={{ background: "var(--color-cream)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={openBulkReminderConfirm}
                      disabled={remindLoading || remindSelections.size === 0}
                      className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ background: "var(--color-bark)", color: "var(--color-cream)", border: "1px solid var(--color-bark)" }}
                    >
                      {remindLoading ? "Sending..." : `Send Reminder${remindSelections.size !== 1 ? "s" : ""} (${remindSelections.size})`}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Bulk Reminder Confirmation Modal */}
      <Modal
        isOpen={showBulkReminderConfirm}
        onClose={closeBulkReminderConfirm}
        title="Send Pickup Reminders"
        actions={
          <>
            <button
              onClick={closeBulkReminderConfirm}
              className="px-4 py-2 rounded-xl text-sm font-medium"
              style={{ background: "var(--color-cream)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                setShowBulkReminderConfirm(false);
                setShowRemindModal(true);
                void handleSendReminders();
              }}
              disabled={remindLoading}
              className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-60"
              style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}
            >
              Send {remindSelections.size} Reminder{remindSelections.size !== 1 ? "s" : ""}
            </button>
          </>
        }
      >
        <p style={{ color: "var(--color-muted)" }}>
          Send pickup reminder emails to <span className="font-semibold" style={{ color: "var(--color-text)" }}>{remindSelections.size} customer{remindSelections.size !== 1 ? "s" : ""}</span>?
        </p>
      </Modal>

      {/* Bulk Payment Reminder Confirmation Modal */}
      <Modal
        isOpen={showBulkPaymentReminderConfirm}
        onClose={closeBulkPaymentReminderConfirm}
        title="Send Payment Reminders"
        actions={
          <>
            <button
              onClick={closeBulkPaymentReminderConfirm}
              className="px-4 py-2 rounded-xl text-sm font-medium"
              style={{ background: "var(--color-cream)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                setShowBulkPaymentReminderConfirm(false);
                setShowPaymentRemindModal(true);
                void handleSendPaymentReminders();
              }}
              disabled={paymentReminderLoading}
              className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-60"
              style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}
            >
              Send {paymentRemindSelections.size} Payment Reminder{paymentRemindSelections.size !== 1 ? "s" : ""}
            </button>
          </>
        }
      >
        <p style={{ color: "var(--color-muted)" }}>
          Send payment reminder emails to <span className="font-semibold" style={{ color: "var(--color-text)" }}>{paymentRemindSelections.size} customer{paymentRemindSelections.size !== 1 ? "s" : ""}</span>?
        </p>
      </Modal>
    </div>
  );
}
