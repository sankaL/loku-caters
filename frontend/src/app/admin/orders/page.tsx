"use client";

import { useEffect, useCallback, useMemo, useRef, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import { useObjectState } from "@/hooks/useObjectState";
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
  type QuantityLine,
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
  pending:   { bg: "var(--color-warning-bg)", color: "var(--color-warning-text)", label: "Pending" },
  confirmed: { bg: "var(--color-success-bg)", color: "var(--color-success-text)", label: "Confirmed" },
  picked_up: { bg: "var(--color-info-bg)", color: "var(--color-info-text)", label: "Picked Up" },
  no_show:   { bg: "var(--color-error-bg)", color: "var(--color-error-text)", label: "No Show" },
  cancelled: { bg: "var(--color-cream-dark)", color: "var(--color-muted)", label: "Cancelled" },
  mixed: { bg: "var(--color-info-bg)", color: "var(--color-info-text)", label: "Mixed" },
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

type SelectedOrderLine = QuantityLine<OrderLineItem>;
type OrderPayloadFactory = (line: SelectedOrderLine) => Record<string, unknown>;

interface OrderCreationSummary {
  succeeded: number;
  failed: number;
  failedQuantities: Record<string, number>;
  firstFailureMessage: string;
}

function validateEventOrderLines(lines: SelectedOrderLine[]): string | null {
  if (lines.length === 0) return "Please add at least one item.";
  const belowMinimum = lines.find(({ item, qty }) => qty < getMinimumOrderQuantity(item));
  if (!belowMinimum) return null;
  const minimum = getMinimumOrderQuantity(belowMinimum.item);
  return `${belowMinimum.item.name} requires a minimum order of ${minimum}.`;
}

function getRandomOrderUnitPrice(line: SelectedOrderLine, prices: Record<string, number>): number {
  return prices[line.item.id] ?? line.item.discounted_price ?? line.item.price;
}

function validateRandomOrderLines(lines: SelectedOrderLine[], prices: Record<string, number>): string | null {
  if (lines.length === 0) return "Please add at least one item.";
  const invalidQuantity = lines.find(({ qty }) => qty < 1);
  if (invalidQuantity) return `${invalidQuantity.item.name} requires at least one portion.`;
  const invalidPrice = lines.find((line) => getRandomOrderUnitPrice(line, prices) <= 0);
  return invalidPrice ? `${invalidPrice.item.name} needs a unit price greater than 0.` : null;
}

function validateRandomOrderForm(form: RandomAddOrderForm): string | null {
  if (!form.name.trim()) return "Name is required.";
  if (!form.exclude_email && !form.email.trim()) return "Email is required unless email is excluded.";
  if (!form.pickup_location.trim() || !form.pickup_time_slot.trim()) return "Pickup location and time slot are required.";
  return form.pickup_date.trim() ? null : "Pickup date is required.";
}

async function createAdminOrderLines(
  lines: SelectedOrderLine[],
  token: string,
  buildPayload: OrderPayloadFactory,
): Promise<PromiseSettledResult<boolean>[]> {
  return Promise.allSettled(lines.map(async (line) => {
    const response = await fetch(`${API_URL}/api/admin/orders`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload(line)),
    });
    if (!response.ok) {
      throw new Error(await getApiErrorMessage(response, `Failed to create item for ${line.item.name}`));
    }
    return true;
  }));
}

function summarizeOrderCreation(
  lines: SelectedOrderLine[],
  results: PromiseSettledResult<boolean>[],
): OrderCreationSummary {
  const succeeded = results.filter((result) => result.status === "fulfilled").length;
  const failedQuantities: Record<string, number> = {};
  lines.forEach((line, index) => {
    if (results[index]?.status === "rejected") failedQuantities[line.item.id] = line.qty;
  });
  const firstFailure = results.find((result) => result.status === "rejected");
  const firstFailureMessage = firstFailure?.status === "rejected" && firstFailure.reason instanceof Error
    ? firstFailure.reason.message
    : "Unknown error";
  return { succeeded, failed: results.length - succeeded, failedQuantities, firstFailureMessage };
}

function reportPartialOrderCreation(summary: OrderCreationSummary, showToast: AdminOrdersToast): void {
  if (summary.succeeded === 0) throw new Error(summary.firstFailureMessage);
  showToast(`Created ${summary.succeeded}, failed ${summary.failed}. First error: ${summary.firstFailureMessage}`, "error");
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

type ReminderRunSetter = (nextRun: ReminderRunState) => void;
type QueueAttemptSender = (orderId: string, token: string) => Promise<QueueAttemptResult>;

function replaceReminderQueueItem(
  items: ReminderQueueItem[],
  itemIndex: number,
  updates: Partial<ReminderQueueItem>,
): ReminderQueueItem[] {
  return items.map((item, index) => index === itemIndex ? { ...item, ...updates } : item);
}

function publishActiveReminderRun(
  setRun: ReminderRunSetter,
  items: ReminderQueueItem[],
  activeOrderId: string | null,
): void {
  setRun(buildReminderRunState(items, { isRunning: true, isComplete: false, activeOrderId }));
}

function getFinalAttemptUpdates(result: QueueAttemptResult): Partial<ReminderQueueItem> | null {
  if (result.outcome === "retryable_failed") return null;
  const status: ReminderQueueStatus = result.outcome === "sent"
    ? "sent"
    : result.outcome === "skipped" ? "skipped" : "failed";
  return { status, message: result.message, lastResultCode: result.resultCode };
}

async function processReminderQueueItem(options: {
  items: ReminderQueueItem[];
  itemIndex: number;
  orderId: string;
  token: string;
  setRun: ReminderRunSetter;
  sendAttempt: QueueAttemptSender;
}): Promise<ReminderQueueItem[]> {
  let { items } = options;
  const { itemIndex, orderId, token, setRun, sendAttempt } = options;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    items = replaceReminderQueueItem(items, itemIndex, { status: "sending", attempts: attempt, message: "" });
    publishActiveReminderRun(setRun, items, orderId);

    const result = await sendAttempt(orderId, token);
    const finalUpdates = getFinalAttemptUpdates(result);
    if (finalUpdates) {
      items = replaceReminderQueueItem(items, itemIndex, finalUpdates);
      publishActiveReminderRun(setRun, items, null);
      return items;
    }

    if (attempt < 3) {
      items = replaceReminderQueueItem(items, itemIndex, {
        status: "retrying",
        message: "Retrying after send failure",
        lastResultCode: result.resultCode,
      });
      publishActiveReminderRun(setRun, items, orderId);
      await wait(REMINDER_RETRY_BACKOFF_MS[attempt - 1]);
    }
  }
  items = replaceReminderQueueItem(items, itemIndex, {
    status: "failed",
    message: "Send failed after 3 attempts",
  });
  publishActiveReminderRun(setRun, items, null);
  return items;
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

function getOrderActionId(order: Pick<Order, "id" | "primary_order_id">): string {
  return (order.primary_order_id ?? "").trim() || order.id;
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

function getBulkRowErrors(row: BulkRow, eventConfig: EventConfig | null): string[] {
  const errors: string[] = [];
  if (!row.name) errors.push("name is required");
  if (!row.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) errors.push("valid email required");
  if (row.quantity < 1) errors.push("quantity must be >= 1");
  if (!eventConfig) return errors;

  const validItem = eventConfig.items.find((item) => item.id === row.item_id);
  if (!validItem) errors.push(`unknown item_id "${row.item_id}"`);
  const validLocation = eventConfig.locations.find((location) => location.name === row.pickup_location);
  if (!validLocation) errors.push(`unknown location "${row.pickup_location}"`);
  if (validItem && validLocation && !validLocation.timeSlots.includes(row.pickup_time_slot)) {
    errors.push(`time slot "${row.pickup_time_slot}" not available at ${row.pickup_location}`);
  }
  return errors;
}

function parseBulkRow(line: string, rowNumber: number, eventConfig: EventConfig | null): BulkRow {
  const columns = line.split(",").map((column) => column.trim());
  const [name, email, phoneNumber, itemId, quantityText, pickupLocation, ...timeSlotParts] = columns;
  const parsedQuantity = parseInt(quantityText ?? "0", 10);
  const row: BulkRow = {
    name: name ?? "",
    email: email ?? "",
    phone_number: phoneNumber ?? "",
    item_id: itemId ?? "",
    quantity: Number.isNaN(parsedQuantity) ? 0 : parsedQuantity,
    pickup_location: pickupLocation ?? "",
    pickup_time_slot: timeSlotParts.join(",").trim(),
    _rowNum: rowNumber,
  };
  const errors = getBulkRowErrors(row, eventConfig);
  return errors.length > 0 ? { ...row, _error: errors.join("; ") } : row;
}

function getTimeSlotStartMinutes(slot: string): number {
  const match = slot.trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)\b/i);
  if (!match) return Number.POSITIVE_INFINITY;
  let hour = parseInt(match[1], 10) % 12;
  const minute = parseInt(match[2], 10);
  if (match[3].toUpperCase() === "PM") hour += 12;
  return hour * 60 + minute;
}

function compareOrders(
  first: Order,
  second: Order,
  sort: { col: SortCol | null; dir: "asc" | "desc" },
  timeSlotRank: Record<string, number>,
): number {
  const direction = sort.dir === "asc" ? 1 : -1;
  if (sort.col === "total") return direction * (first.total_price - second.total_price);
  if (sort.col === "date") return direction * (new Date(first.created_at).getTime() - new Date(second.created_at).getTime());
  if (sort.col === "status") return direction * first.status.localeCompare(second.status);
  if (sort.col !== "timeslot") return 0;

  const rankDifference = (timeSlotRank[first.pickup_time_slot] ?? Number.MAX_SAFE_INTEGER)
    - (timeSlotRank[second.pickup_time_slot] ?? Number.MAX_SAFE_INTEGER);
  return rankDifference !== 0
    ? direction * rankDifference
    : direction * first.pickup_time_slot.localeCompare(second.pickup_time_slot);
}

function useAdminOrdersUiState() {
  const router = useRouter();
    const [state, setState] = useObjectState({
      highlightBundleParam: null as string | null,
      orders: [] as Order[],
      bundleLines: [] as OrderLine[],
      selectedBundle: null as Order | null,
      loadingBundleDetails: false,
      loadingBundleInvoices: false,
      bundleInvoiceCount: 0,
      showBundleDetailsModal: false,
      showEditBundleModal: false,
      filter: "all" as string,
      paymentFilter: "all" as string,
      eventFilter: "all" as string,
      locationFilter: "all" as string,
      search: "",
      page: 1,
      loading: true,
      confirming: null as string | null,
      sendingReminder: null as string | null,
      updatingStatus: null as string | null,
      updatingPayment: null as string | null,
      deleting: null as string | null,
      sort: { col: null, dir: "asc" } as { col: SortCol | null; dir: "asc" | "desc" },
      toast: null as { message: string; type: "success" | "error" } | null,
      eventConfig: null as EventConfig | null,
      events: [] as AdminEvent[],
      configUsesFallback: false,
      deleteTarget: null as string | null,
      confirmTarget: null as Order | null,
      statusActionTarget: null as { order: Order; action: StatusActionKey } | null,
      paymentTarget: null as Order | null,
      paymentMethod: "cash" as "cash" | "etransfer" | "other",
      paymentMethodOther: "",
      unpayTarget: null as Order | null,
      selectedIds: new Set() as Set<string>,
      showBulkDeleteModal: false,
      showBulkConfirmModal: false,
      showBulkPickedUpModal: false,
      showBulkCancelModal: false,
      bulkDeleting: false,
      bulkConfirming: false,
      bulkMarkingPickedUp: false,
      bulkCancelling: false,
      showAddOrderChoiceModal: false,
      showAddOrderModal: false,
      showRandomOrderModal: false,
      addOrderForm: EMPTY_ADD_FORM as AddOrderForm,
      addOrderQuantities: {} as Record<string, number>,
      addOrderItemsError: "" as string,
      addingOrder: false,
      addModalEventId: null as number | null,
      addModalEventConfig: null as EventConfig | null,
      addModalEventSearch: "",
      showAddEventDropdown: false,
      randomOrderForm: EMPTY_RANDOM_ADD_FORM as RandomAddOrderForm,
      randomOrderQuantities: {} as Record<string, number>,
      randomOrderPrices: {} as Record<string, number>,
      randomOrderItemsError: "" as string,
      randomOrderGroupId: null as string | null,
      catalogItems: [] as Item[],
      catalogLocations: [] as Location[],
      showBulkImportModal: false,
      bulkImportRows: [] as BulkRow[],
      bulkImporting: false,
      showRemindModal: false,
      remindSelections: new Set() as Set<string>,
      reminderRun: EMPTY_REMINDER_RUN as ReminderRunState,
      remindSearch: "",
      showReminderMenu: false,
      openActionMenuId: null as string | null,
      showBulkReminderConfirm: false,
      reminderConfirmTarget: null as Order | null,
      showPaymentRemindModal: false,
      paymentRemindSelections: new Set() as Set<string>,
      paymentReminderRun: EMPTY_REMINDER_RUN as ReminderRunState,
      paymentRemindSearch: "",
      showBulkPaymentReminderConfirm: false,
      paymentReminderConfirmTarget: null as Order | null,
    });
    const reminderMenuRef = useRef<HTMLDivElement | null>(null);
    const actionMenuRef = useRef<HTMLDivElement | null>(null);
    const remindLoading = state.reminderRun.isRunning;
    const paymentReminderLoading = state.paymentReminderRun.isRunning;

    const setHighlightBundleParam = (value: SetStateAction<typeof state.highlightBundleParam>) => setState("highlightBundleParam", value);
    const setOrders = (value: SetStateAction<typeof state.orders>) => setState("orders", value);
    const setBundleLines = (value: SetStateAction<typeof state.bundleLines>) => setState("bundleLines", value);
    const setSelectedBundle = (value: SetStateAction<typeof state.selectedBundle>) => setState("selectedBundle", value);
    const setLoadingBundleDetails = (value: SetStateAction<typeof state.loadingBundleDetails>) => setState("loadingBundleDetails", value);
    const setLoadingBundleInvoices = (value: SetStateAction<typeof state.loadingBundleInvoices>) => setState("loadingBundleInvoices", value);
    const setBundleInvoiceCount = (value: SetStateAction<typeof state.bundleInvoiceCount>) => setState("bundleInvoiceCount", value);
    const setShowBundleDetailsModal = (value: SetStateAction<typeof state.showBundleDetailsModal>) => setState("showBundleDetailsModal", value);
    const setShowEditBundleModal = (value: SetStateAction<typeof state.showEditBundleModal>) => setState("showEditBundleModal", value);
    const setFilter = (value: SetStateAction<typeof state.filter>) => setState("filter", value);
    const setPaymentFilter = (value: SetStateAction<typeof state.paymentFilter>) => setState("paymentFilter", value);
    const setEventFilter = (value: SetStateAction<typeof state.eventFilter>) => setState("eventFilter", value);
    const setLocationFilter = (value: SetStateAction<typeof state.locationFilter>) => setState("locationFilter", value);
    const setSearch = (value: SetStateAction<typeof state.search>) => setState("search", value);
    const setPage = (value: SetStateAction<typeof state.page>) => setState("page", value);
    const setLoading = (value: SetStateAction<typeof state.loading>) => setState("loading", value);
    const setConfirming = (value: SetStateAction<typeof state.confirming>) => setState("confirming", value);
    const setSendingReminder = (value: SetStateAction<typeof state.sendingReminder>) => setState("sendingReminder", value);
    const setUpdatingStatus = (value: SetStateAction<typeof state.updatingStatus>) => setState("updatingStatus", value);
    const setUpdatingPayment = (value: SetStateAction<typeof state.updatingPayment>) => setState("updatingPayment", value);
    const setDeleting = (value: SetStateAction<typeof state.deleting>) => setState("deleting", value);
    const setSort = (value: SetStateAction<typeof state.sort>) => setState("sort", value);
    const setToast = (value: SetStateAction<typeof state.toast>) => setState("toast", value);
    const setEventConfig = (value: SetStateAction<typeof state.eventConfig>) => setState("eventConfig", value);
    const setEvents = (value: SetStateAction<typeof state.events>) => setState("events", value);
    const setConfigUsesFallback = (value: SetStateAction<typeof state.configUsesFallback>) => setState("configUsesFallback", value);
    const setDeleteTarget = (value: SetStateAction<typeof state.deleteTarget>) => setState("deleteTarget", value);
    const setConfirmTarget = (value: SetStateAction<typeof state.confirmTarget>) => setState("confirmTarget", value);
    const setStatusActionTarget = (value: SetStateAction<typeof state.statusActionTarget>) => setState("statusActionTarget", value);
    const setPaymentTarget = (value: SetStateAction<typeof state.paymentTarget>) => setState("paymentTarget", value);
    const setPaymentMethod = (value: SetStateAction<typeof state.paymentMethod>) => setState("paymentMethod", value);
    const setPaymentMethodOther = (value: SetStateAction<typeof state.paymentMethodOther>) => setState("paymentMethodOther", value);
    const setUnpayTarget = (value: SetStateAction<typeof state.unpayTarget>) => setState("unpayTarget", value);
    const setSelectedIds = (value: SetStateAction<typeof state.selectedIds>) => setState("selectedIds", value);
    const setShowBulkDeleteModal = (value: SetStateAction<typeof state.showBulkDeleteModal>) => setState("showBulkDeleteModal", value);
    const setShowBulkConfirmModal = (value: SetStateAction<typeof state.showBulkConfirmModal>) => setState("showBulkConfirmModal", value);
    const setShowBulkPickedUpModal = (value: SetStateAction<typeof state.showBulkPickedUpModal>) => setState("showBulkPickedUpModal", value);
    const setShowBulkCancelModal = (value: SetStateAction<typeof state.showBulkCancelModal>) => setState("showBulkCancelModal", value);
    const setBulkDeleting = (value: SetStateAction<typeof state.bulkDeleting>) => setState("bulkDeleting", value);
    const setBulkConfirming = (value: SetStateAction<typeof state.bulkConfirming>) => setState("bulkConfirming", value);
    const setBulkMarkingPickedUp = (value: SetStateAction<typeof state.bulkMarkingPickedUp>) => setState("bulkMarkingPickedUp", value);
    const setBulkCancelling = (value: SetStateAction<typeof state.bulkCancelling>) => setState("bulkCancelling", value);
    const setShowAddOrderChoiceModal = (value: SetStateAction<typeof state.showAddOrderChoiceModal>) => setState("showAddOrderChoiceModal", value);
    const setShowAddOrderModal = (value: SetStateAction<typeof state.showAddOrderModal>) => setState("showAddOrderModal", value);
    const setShowRandomOrderModal = (value: SetStateAction<typeof state.showRandomOrderModal>) => setState("showRandomOrderModal", value);
    const setAddOrderForm = (value: SetStateAction<typeof state.addOrderForm>) => setState("addOrderForm", value);
    const setAddOrderQuantities = (value: SetStateAction<typeof state.addOrderQuantities>) => setState("addOrderQuantities", value);
    const setAddOrderItemsError = (value: SetStateAction<typeof state.addOrderItemsError>) => setState("addOrderItemsError", value);
    const setAddingOrder = (value: SetStateAction<typeof state.addingOrder>) => setState("addingOrder", value);
    const setAddModalEventId = (value: SetStateAction<typeof state.addModalEventId>) => setState("addModalEventId", value);
    const setAddModalEventConfig = (value: SetStateAction<typeof state.addModalEventConfig>) => setState("addModalEventConfig", value);
    const setAddModalEventSearch = (value: SetStateAction<typeof state.addModalEventSearch>) => setState("addModalEventSearch", value);
    const setShowAddEventDropdown = (value: SetStateAction<typeof state.showAddEventDropdown>) => setState("showAddEventDropdown", value);
    const setRandomOrderForm = (value: SetStateAction<typeof state.randomOrderForm>) => setState("randomOrderForm", value);
    const setRandomOrderQuantities = (value: SetStateAction<typeof state.randomOrderQuantities>) => setState("randomOrderQuantities", value);
    const setRandomOrderPrices = (value: SetStateAction<typeof state.randomOrderPrices>) => setState("randomOrderPrices", value);
    const setRandomOrderItemsError = (value: SetStateAction<typeof state.randomOrderItemsError>) => setState("randomOrderItemsError", value);
    const setRandomOrderGroupId = (value: SetStateAction<typeof state.randomOrderGroupId>) => setState("randomOrderGroupId", value);
    const setCatalogItems = (value: SetStateAction<typeof state.catalogItems>) => setState("catalogItems", value);
    const setCatalogLocations = (value: SetStateAction<typeof state.catalogLocations>) => setState("catalogLocations", value);
    const setShowBulkImportModal = (value: SetStateAction<typeof state.showBulkImportModal>) => setState("showBulkImportModal", value);
    const setBulkImportRows = (value: SetStateAction<typeof state.bulkImportRows>) => setState("bulkImportRows", value);
    const setBulkImporting = (value: SetStateAction<typeof state.bulkImporting>) => setState("bulkImporting", value);
    const setShowRemindModal = (value: SetStateAction<typeof state.showRemindModal>) => setState("showRemindModal", value);
    const setRemindSelections = (value: SetStateAction<typeof state.remindSelections>) => setState("remindSelections", value);
    const setReminderRun = (value: SetStateAction<typeof state.reminderRun>) => setState("reminderRun", value);
    const setRemindSearch = (value: SetStateAction<typeof state.remindSearch>) => setState("remindSearch", value);
    const setShowReminderMenu = (value: SetStateAction<typeof state.showReminderMenu>) => setState("showReminderMenu", value);
    const setOpenActionMenuId = (value: SetStateAction<typeof state.openActionMenuId>) => setState("openActionMenuId", value);
    const setShowBulkReminderConfirm = (value: SetStateAction<typeof state.showBulkReminderConfirm>) => setState("showBulkReminderConfirm", value);
    const setReminderConfirmTarget = (value: SetStateAction<typeof state.reminderConfirmTarget>) => setState("reminderConfirmTarget", value);
    const setShowPaymentRemindModal = (value: SetStateAction<typeof state.showPaymentRemindModal>) => setState("showPaymentRemindModal", value);
    const setPaymentRemindSelections = (value: SetStateAction<typeof state.paymentRemindSelections>) => setState("paymentRemindSelections", value);
    const setPaymentReminderRun = (value: SetStateAction<typeof state.paymentReminderRun>) => setState("paymentReminderRun", value);
    const setPaymentRemindSearch = (value: SetStateAction<typeof state.paymentRemindSearch>) => setState("paymentRemindSearch", value);
    const setShowBulkPaymentReminderConfirm = (value: SetStateAction<typeof state.showBulkPaymentReminderConfirm>) => setState("showBulkPaymentReminderConfirm", value);
    const setPaymentReminderConfirmTarget = (value: SetStateAction<typeof state.paymentReminderConfirmTarget>) => setState("paymentReminderConfirmTarget", value);
  return {
    router, ...state, setState, reminderMenuRef, actionMenuRef, remindLoading, paymentReminderLoading,
    setHighlightBundleParam, setOrders, setBundleLines, setSelectedBundle, setLoadingBundleDetails, setLoadingBundleInvoices,
    setBundleInvoiceCount, setShowBundleDetailsModal, setShowEditBundleModal, setFilter, setPaymentFilter, setEventFilter,
    setLocationFilter, setSearch, setPage, setLoading, setConfirming, setSendingReminder,
    setUpdatingStatus, setUpdatingPayment, setDeleting, setSort, setToast, setEventConfig,
    setEvents, setConfigUsesFallback, setDeleteTarget, setConfirmTarget, setStatusActionTarget, setPaymentTarget,
    setPaymentMethod, setPaymentMethodOther, setUnpayTarget, setSelectedIds, setShowBulkDeleteModal, setShowBulkConfirmModal,
    setShowBulkPickedUpModal, setShowBulkCancelModal, setBulkDeleting, setBulkConfirming, setBulkMarkingPickedUp, setBulkCancelling,
    setShowAddOrderChoiceModal, setShowAddOrderModal, setShowRandomOrderModal, setAddOrderForm, setAddOrderQuantities, setAddOrderItemsError,
    setAddingOrder, setAddModalEventId, setAddModalEventConfig, setAddModalEventSearch, setShowAddEventDropdown, setRandomOrderForm,
    setRandomOrderQuantities, setRandomOrderPrices, setRandomOrderItemsError, setRandomOrderGroupId, setCatalogItems, setCatalogLocations,
    setShowBulkImportModal, setBulkImportRows, setBulkImporting, setShowRemindModal, setRemindSelections, setReminderRun,
    setRemindSearch, setShowReminderMenu, setOpenActionMenuId, setShowBulkReminderConfirm, setReminderConfirmTarget, setShowPaymentRemindModal,
    setPaymentRemindSelections, setPaymentReminderRun, setPaymentRemindSearch, setShowBulkPaymentReminderConfirm, setPaymentReminderConfirmTarget,
  };
}

function useOrderEventSelection(events: AdminEvent[], eventFilter: string) {
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
  return { activeEventId, selectedFilterEvent, configEventId, configEventLabel };
}

function useOrderTableData(events: AdminEvent[], orders: Order[], eventConfig: EventConfig | null, eventFilter: string, locationFilter: string, search: string, sort: { col: SortCol | null; dir: "asc" | "desc" }) {
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
      return [...filtered].sort((first, second) => compareOrders(first, second, sort, timeSlotRank));
    }, [filtered, sort, timeSlotRank]);
  return { eventLabelById, eventOptions, locationOptions, locationFilterOptions, filtered, timeSlotRank, sorted };
}

function useOrderReminderData(orders: Order[], selectedIds: Set<string>) {
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
  return { confirmedOrders, eligibleReminderOrders, ineligibleReminderCount, paymentReminderRecipients, eligiblePaymentReminderRecipients, ineligiblePaymentReminderCount, selectedOrders, bulkConfirmableOrders, bulkPickedUpOrders, bulkCancelableOrders };
}

function useOrderPickerData(addModalEventConfig: EventConfig | null, addOrderForm: AddOrderForm, catalogItems: Item[], catalogLocations: Location[]) {
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
  return { addOrderTimeSlots, addOrderPickerItems, randomOrderPickerItems, randomLocationSuggestions, randomTimeSlotSuggestions };
}

function useAddOrderEventOptions(addModalEventSearch: string, events: AdminEvent[]) {
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
  return { normalizedAddModalEventQuery, filteredAddModalEvents, randomEventLabel };
}

function useAdminOrdersPagination(
  sortedOrders: Order[],
  page: number,
  selectedIds: Set<string>,
  setState: ReturnType<typeof useAdminOrdersUiState>["setState"],
) {
  const totalPages = Math.max(1, Math.ceil(sortedOrders.length / PAGE_SIZE));
  const paginated = sortedOrders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pageIds = paginated.map((order) => order.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const somePageSelected = pageIds.some((id) => selectedIds.has(id)) && !allPageSelected;
  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => setState("page", (current) => Math.min(current, totalPages)), [setState, totalPages]);
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = somePageSelected;
  }, [somePageSelected]);
  return { totalPages, paginated, pageIds, allPageSelected, selectAllRef };
}

function useAdminOrdersUiLifecycle(options: {
  filter: string; paymentFilter: string; eventFilter: string; locationFilter: string; orders: Order[];
  showReminderMenu: boolean; openActionMenuId: string | null;
  reminderMenuRef: React.RefObject<HTMLDivElement | null>; actionMenuRef: React.RefObject<HTMLDivElement | null>;
  setState: ReturnType<typeof useAdminOrdersUiState>["setState"];
}) {
  const { filter, paymentFilter, eventFilter, locationFilter, orders, showReminderMenu, openActionMenuId, reminderMenuRef, actionMenuRef, setState } = options;
  const closeReminderMenu = useCallback(() => setState("showReminderMenu", false), [setState]);
  const closeActionMenu = useCallback(() => setState("openActionMenuId", null), [setState]);
  useEffect(() => { setState("selectedIds", new Set()); }, [filter, paymentFilter, eventFilter, locationFilter, orders, setState]);
    useEffect(() => { setState("page", 1); }, [paymentFilter, eventFilter, locationFilter, setState]);

    // Switching event should not keep a stale location selection
    useEffect(() => {
      setState("locationFilter", "all");
    }, [eventFilter, setState]);

  useDismissibleAdminMenu(showReminderMenu, reminderMenuRef, closeReminderMenu);
  useDismissibleAdminMenu(!!openActionMenuId, actionMenuRef, closeActionMenu);
}

function useDismissibleAdminMenu(
  isOpen: boolean,
  containerRef: React.RefObject<HTMLDivElement | null>,
  onClose: () => void,
) {
  useEffect(() => {
    if (!isOpen) return;
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) onClose();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [containerRef, isOpen, onClose]);
}

function useAdminOrdersReferenceData(setState: ReturnType<typeof useAdminOrdersUiState>["setState"]) {
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
          setState("events", Array.isArray(data) ? data : []);
        } catch {
          // Non-blocking
        }
      }
      loadEvents();
    }, [setState]);

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
          setState("catalogItems", Array.isArray(itemsData) ? itemsData : []);
          setState("catalogLocations",
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
    }, [setState]);
}

function useAdminOrderEventConfig(options: { configEventId: number | null; showAddOrderModal: boolean; addModalEventId: number | null; setState: ReturnType<typeof useAdminOrdersUiState>["setState"] }) {
  const { configEventId, showAddOrderModal, addModalEventId, setState } = options;
  useEffect(() => {
      let cancelled = false;
      async function loadEventConfig() {
        setState("configUsesFallback", false);

        if (configEventId) {
          try {
            const token = await getAdminToken();
            if (!token) return;
            const res = await fetch(`${API_URL}/api/admin/events/${configEventId}/config`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
              const data = (await res.json()) as EventConfig;
              if (!cancelled) setState("eventConfig", data);
              return;
            }
          } catch {
            // Non-blocking
          }
        }

        try {
          const cfg = await fetchEventConfig();
          if (!cancelled) {
            setState("eventConfig", cfg);
            setState("configUsesFallback", true);
          }
        } catch {
          // Non-blocking
        }
      }

      loadEventConfig();
      return () => {
        cancelled = true;
      };
    }, [configEventId, setState]);

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
          if (res.ok && !cancelled) setState("addModalEventConfig", await res.json());
        } catch { /* non-blocking */ }
      }
      loadModalConfig();
      return () => { cancelled = true; };
    }, [addModalEventId, setState, showAddOrderModal]);
}

type AdminOrdersToast = (message: string, type: "success" | "error") => void;

function useAdminOrdersLoader(options: { eventFilter: string; filter: string; paymentFilter: string; search: string; showToast: AdminOrdersToast; setState: ReturnType<typeof useAdminOrdersUiState>["setState"] }) {
  const { eventFilter, filter, paymentFilter, search, showToast, setState } = options;
  const fetchOrders = useCallback(async (options?: { suppressErrorToast?: boolean }) => {
      setState("loading", true);
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
        setState("orders", Array.isArray(rows) ? rows : []);
        setState("page", 1);
        return true;
      } catch {
        if (!options?.suppressErrorToast) {
          showToast("Failed to load orders", "error");
        }
        return false;
      } finally {
        setState("loading", false);
      }
    }, [eventFilter, filter, paymentFilter, showToast, setState]);

    useEffect(() => { fetchOrders(); }, [fetchOrders]);
    useEffect(() => { setState("page", 1); }, [search, setState]);

    useEffect(() => {
      if (typeof window === "undefined") return;
      const params = new URLSearchParams(window.location.search);
      setState("highlightBundleParam", params.get("highlight_bundle"));
    }, [setState]);
  return fetchOrders;
}

function useBundleDetailsLoader(options: { orders: Order[]; highlightBundleParam: string | null; showBundleDetailsModal: boolean; router: ReturnType<typeof useRouter>; showToast: AdminOrdersToast; setState: ReturnType<typeof useAdminOrdersUiState>["setState"] }) {
  const { orders, highlightBundleParam, showBundleDetailsModal, router, showToast, setState } = options;
  const fetchBundleDetails = useCallback(async (bundle: Order) => {
      setState("loadingBundleDetails", true);
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
        setState("selectedBundle", nextBundle);
        setState("bundleLines", Array.isArray(payload.lines) ? payload.lines : []);
        setState("showBundleDetailsModal", true);
        setState("bundleInvoiceCount", 0);
        setState("loadingBundleInvoices", true);
        try {
          const invoiceRes = await fetch(`${API_URL}/api/admin/invoices?source_bundle_id=${encodeURIComponent(nextBundle.bundle_id)}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (invoiceRes.ok) {
            const linkedInvoices = (await invoiceRes.json()) as Array<{ id: string }>;
            setState("bundleInvoiceCount", linkedInvoices.length);
          }
        } catch {
          setState("bundleInvoiceCount", 0);
        } finally {
          setState("loadingBundleInvoices", false);
        }
        return true;
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Failed to load bundle details", "error");
        return false;
      } finally {
        setState("loadingBundleDetails", false);
      }
    }, [showToast, setState]);

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
        setState("highlightBundleParam", null);
      })();
    }, [fetchBundleDetails, highlightBundleParam, orders, router, setState, showBundleDetailsModal]);
  return fetchBundleDetails;
}

function useAdminOrdersModel() {
  const {
    actionMenuRef, addingOrder, addModalEventConfig, addModalEventId, addModalEventSearch, addOrderForm,
    addOrderItemsError, addOrderQuantities, bulkCancelling, bulkConfirming, bulkDeleting, bulkImporting,
    bulkImportRows, bulkMarkingPickedUp, bundleInvoiceCount, bundleLines, catalogItems, catalogLocations,
    configUsesFallback, confirming, confirmTarget, deleteTarget, deleting, eventConfig,
    eventFilter, events, filter, highlightBundleParam, loading, loadingBundleDetails,
    loadingBundleInvoices, locationFilter, openActionMenuId, orders, page, paymentFilter,
    paymentMethod, paymentMethodOther, paymentReminderConfirmTarget, paymentReminderLoading, paymentReminderRun, paymentRemindSearch,
    paymentRemindSelections, paymentTarget, randomOrderForm, randomOrderGroupId, randomOrderItemsError, randomOrderPrices,
    randomOrderQuantities, reminderConfirmTarget, reminderMenuRef, reminderRun, remindLoading, remindSearch,
    remindSelections, router, search, selectedBundle, selectedIds, sendingReminder,
    setAddingOrder, setAddModalEventConfig, setAddModalEventId, setAddModalEventSearch, setAddOrderForm, setAddOrderItemsError,
    setAddOrderQuantities, setBulkCancelling, setBulkConfirming, setBulkDeleting, setBulkImporting, setBulkImportRows,
    setBulkMarkingPickedUp, setBundleInvoiceCount, setBundleLines, setConfirming, setConfirmTarget, setDeleteTarget,
    setDeleting, setEventFilter, setFilter, setLoadingBundleInvoices, setLocationFilter, setOpenActionMenuId,
    setOrders, setPage, setPaymentFilter, setPaymentMethod, setPaymentMethodOther, setPaymentReminderConfirmTarget,
    setPaymentReminderRun, setPaymentRemindSearch, setPaymentRemindSelections, setPaymentTarget, setRandomOrderForm, setRandomOrderGroupId,
    setRandomOrderItemsError, setRandomOrderPrices, setRandomOrderQuantities, setReminderConfirmTarget, setReminderRun, setRemindSearch,
    setRemindSelections, setSearch, setSelectedBundle, setSelectedIds, setSendingReminder, setShowAddEventDropdown,
    setShowAddOrderChoiceModal, setShowAddOrderModal, setShowBulkCancelModal, setShowBulkConfirmModal, setShowBulkDeleteModal, setShowBulkImportModal,
    setShowBulkPaymentReminderConfirm, setShowBulkPickedUpModal, setShowBulkReminderConfirm, setShowBundleDetailsModal, setShowEditBundleModal, setShowPaymentRemindModal,
    setShowRandomOrderModal, setShowReminderMenu, setShowRemindModal, setSort, setState, setStatusActionTarget,
    setUnpayTarget, setUpdatingPayment, setUpdatingStatus, showAddEventDropdown, showAddOrderChoiceModal, showAddOrderModal,
    showBulkCancelModal, showBulkConfirmModal, showBulkDeleteModal, showBulkImportModal, showBulkPaymentReminderConfirm, showBulkPickedUpModal,
    showBulkReminderConfirm, showBundleDetailsModal, showEditBundleModal, showPaymentRemindModal, showRandomOrderModal, showReminderMenu,
    showRemindModal, sort, statusActionTarget, toast, unpayTarget, updatingPayment,
    updatingStatus
  } = useAdminOrdersUiState();


  // Reset selection when filter/orders change
  useAdminOrdersUiLifecycle({ filter, paymentFilter, eventFilter, locationFilter, orders, showReminderMenu, openActionMenuId, reminderMenuRef, actionMenuRef, setState });

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setState("toast", { message, type });
    setTimeout(() => setState("toast", null), 4000);
  }, [setState]);

  // Fetch all events for label + filtering
  useAdminOrdersReferenceData(setState);

  const { configEventId, configEventLabel } = useOrderEventSelection(events, eventFilter);

  // Fetch event config for add/import dropdowns and validation
  useAdminOrderEventConfig({ configEventId, showAddOrderModal, addModalEventId, setState });

  const fetchOrders = useAdminOrdersLoader({ eventFilter, filter, paymentFilter, search, showToast, setState });

  const fetchBundleDetails = useBundleDetailsLoader({ orders, highlightBundleParam, showBundleDetailsModal, router, showToast, setState });

  const { eventLabelById, eventOptions, locationFilterOptions, filtered, sorted } = useOrderTableData(events, orders, eventConfig, eventFilter, locationFilter, search, sort);

  const { confirmedOrders, eligibleReminderOrders, ineligibleReminderCount, paymentReminderRecipients, eligiblePaymentReminderRecipients, ineligiblePaymentReminderCount, bulkConfirmableOrders, bulkPickedUpOrders, bulkCancelableOrders } = useOrderReminderData(orders, selectedIds);

  const { totalPages, paginated, pageIds, allPageSelected, selectAllRef } = useAdminOrdersPagination(sorted, page, selectedIds, setState);

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
    setBundleInvoiceCount(0);
    setLoadingBundleInvoices(false);
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
      items = await processReminderQueueItem({ items, itemIndex, orderId, token, setRun, sendAttempt });

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
    const validationError = validateEventOrderLines(selectedLines);
    if (validationError) return setAddOrderItemsError(validationError);

    setAddingOrder(true);
    try {
      const token = await getAdminToken();
      if (!token) return;
      const groupId = selectedLines.length > 1 ? crypto.randomUUID() : null;
      const results = await createAdminOrderLines(selectedLines, token, ({ item, qty }) => ({
        ...addOrderForm,
        item_id: item.id,
        quantity: qty,
        event_id: addModalEventId,
        group_id: groupId,
      }));
      const summary = summarizeOrderCreation(selectedLines, results);

      if (summary.succeeded > 0) {
        await fetchOrders();
        if (summary.failed > 0) {
          setAddOrderQuantities(summary.failedQuantities);
          setAddOrderItemsError("Some items were created. Only failed items remain selected for retry.");
        }
      }

      if (summary.failed === 0) {
        showToast(`Created ${summary.succeeded} order item${summary.succeeded !== 1 ? "s" : ""}`, "success");
        setShowAddOrderModal(false);
        setAddOrderForm(EMPTY_ADD_FORM);
        setAddOrderQuantities({});
        setAddOrderItemsError("");
        return;
      }
      reportPartialOrderCreation(summary, showToast);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to create order", "error");
    } finally {
      setAddingOrder(false);
    }
  }

  async function handleAddRandomOrder(e: React.FormEvent) {
    e.preventDefault();

    const selectedLines = linesFromQuantities(randomOrderPickerItems, randomOrderQuantities);
    const validationError = validateRandomOrderLines(selectedLines, randomOrderPrices)
      ?? validateRandomOrderForm(randomOrderForm);
    if (validationError) return setRandomOrderItemsError(validationError);

    setAddingOrder(true);
    try {
      const token = await getAdminToken();
      if (!token) return;

      const groupId = randomOrderGroupId ?? crypto.randomUUID();
      if (!randomOrderGroupId) {
        setRandomOrderGroupId(groupId);
      }

      const results = await createAdminOrderLines(selectedLines, token, (line) => ({
        ...randomOrderForm,
        mode: "random",
        group_id: groupId,
        item_id: line.item.id,
        quantity: line.qty,
        unit_price: getRandomOrderUnitPrice(line, randomOrderPrices),
      }));
      const summary = summarizeOrderCreation(selectedLines, results);

      if (summary.succeeded > 0) {
        await fetchOrders();
        if (summary.failed > 0) {
          setRandomOrderQuantities(summary.failedQuantities);
          setRandomOrderItemsError("Some items were created. Only failed items remain selected for retry.");
        }
      }

      if (summary.failed === 0) {
        showToast(`Created ${summary.succeeded} random request item${summary.succeeded !== 1 ? "s" : ""}`, "success");
        resetRandomOrderModalState();
        return;
      }
      reportPartialOrderCreation(summary, showToast);
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
    return dataLines.map((line, index) => parseBulkRow(line, index + rowNumberOffset, eventConfig));
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
  const { addOrderTimeSlots, addOrderPickerItems, randomOrderPickerItems, randomLocationSuggestions, randomTimeSlotSuggestions } = useOrderPickerData(addModalEventConfig, addOrderForm, catalogItems, catalogLocations);

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

  const { filteredAddModalEvents, randomEventLabel } = useAddOrderEventOptions(addModalEventSearch, events);

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

  return {
    toast, reminderMenuRef, setShowReminderMenu, showReminderMenu,
    openRemindModal, openPaymentRemindModal, setShowAddOrderChoiceModal, setBulkImportRows,
    setShowBulkImportModal, filter, setFilter, paymentFilter,
    setPaymentFilter, locationFilter, setLocationFilter, locationFilterOptions,
    eventOptions, eventFilter, setEventFilter, search,
    setSearch, fetchOrders, loading, filtered,
    totalPages, page, selectedIds, bulkConfirmableOrders,
    setShowBulkConfirmModal, bulkConfirming, bulkPickedUpOrders, setShowBulkPickedUpModal,
    bulkMarkingPickedUp, bulkCancelableOrders, setShowBulkCancelModal, bulkCancelling,
    setShowBulkDeleteModal, bulkDeleting, setSelectedIds, paginated,
    selectAllRef, allPageSelected, toggleSelectAll, thBase,
    toggleSort, sort, getOrderActionId, confirming,
    sendingReminder, updatingStatus, updatingPayment, deleting,
    openActionMenuId, fetchBundleDetails, toggleSelectOne, eventLabelById,
    formatMoney, setUnpayTarget, openMarkPaidModal, formatDate,
    actionMenuRef, setConfirmTarget, setStatusActionTarget, setOpenActionMenuId,
    setReminderConfirmTarget, setDeleteTarget, setPage, showBundleDetailsModal,
    selectedBundle, closeBundleDetailsModal, loadingBundleDetails, bundleLines,
    loadingBundleInvoices, bundleInvoiceCount, router, setShowEditBundleModal,
    showEditBundleModal, refreshSelectedBundleDetails, showToast, deleteTarget,
    executeDelete, confirmTarget, handleConfirm, statusActionTarget,
    handleStatusAction, showBulkDeleteModal, executeBulkDelete, showBulkConfirmModal,
    executeBulkConfirm, showBulkPickedUpModal, executeBulkStatusAction, showBulkCancelModal,
    paymentTarget, setPaymentTarget, openPaymentReminderConfirmFromPaymentModal, paymentReminderLoading,
    paymentMethodOther, paymentMethod, handlePaymentUpdate, setPaymentMethod,
    setPaymentMethodOther, inputStyle, unpayTarget, reminderConfirmTarget,
    handleSendSingleReminder, paymentReminderConfirmTarget, closePaymentReminderConfirm, setPaymentReminderConfirmTarget,
    setShowPaymentRemindModal, handleSendSinglePaymentReminder, showAddOrderChoiceModal, openEventAddOrderModal,
    openRandomAddOrderModal, randomEventLabel, showAddOrderModal, resetAddOrderModalState,
    handleAddOrder, addModalEventSearch, setAddModalEventSearch, setShowAddEventDropdown,
    addModalEventId, events, setAddModalEventId, setAddModalEventConfig,
    setAddOrderForm, setAddOrderQuantities, setAddOrderItemsError, showAddEventDropdown,
    filteredAddModalEvents, addOrderForm, addOrderPickerItems, addOrderQuantities,
    addModalEventConfig, addOrderItemsError, configUsesFallback, addOrderTimeSlots,
    addingOrder, showRandomOrderModal, resetRandomOrderModalState, handleAddRandomOrder,
    randomOrderForm, setRandomOrderForm, randomOrderPickerItems, randomOrderQuantities,
    setRandomOrderQuantities, setRandomOrderItemsError, randomOrderPrices, setRandomOrderPrices,
    randomOrderItemsError, catalogItems, randomLocationSuggestions, randomTimeSlotSuggestions,
    showBulkImportModal, configEventLabel, eventConfig, handleCsvFile,
    downloadCsvTemplate, bulkImportRows, validBulkRows, invalidBulkRows,
    executeBulkImport, bulkImporting, showPaymentRemindModal, paymentRemindSearch,
    eligiblePaymentReminderRecipients, closePaymentRemindModal, isPaymentReminderProgressMode, ineligiblePaymentReminderCount,
    setPaymentRemindSearch, paymentRemindSelections, setPaymentRemindSelections, paymentReminderRun,
    paymentReminderProgressPercent, failedPaymentReminderItems, handleRetryFailedPaymentReminders, openBulkPaymentReminderConfirm,
    showRemindModal, remindSearch, eligibleReminderOrders, remindLoading,
    closeRemindModal, isReminderProgressMode, ineligibleReminderCount, confirmedOrders,
    setRemindSearch, remindSelections, setRemindSelections, reminderRun,
    reminderProgressPercent, failedReminderItems, handleRetryFailedReminders, openBulkReminderConfirm,
    showBulkReminderConfirm, closeBulkReminderConfirm, setShowBulkReminderConfirm, setShowRemindModal,
    handleSendReminders, showBulkPaymentReminderConfirm, closeBulkPaymentReminderConfirm, setShowBulkPaymentReminderConfirm,
    handleSendPaymentReminders,
  };
}

type AdminOrdersModel = ReturnType<typeof useAdminOrdersModel>;

function AdminOrdersView({ model }: { model: AdminOrdersModel }) {
  return (
    <div className="p-4 sm:p-8">
      <AdminOrdersToolbar model={model} />
      <AdminOrdersTable model={model} />
      <AdminOrdersPagination model={model} />
      <AdminOrdersDialogs model={model} />
    </div>
  );
}

function AdminOrdersToolbar({ model }: { model: AdminOrdersModel }) {
  return (
    <>
      <AdminOrdersToast model={model} />
      <AdminOrdersHeader model={model} />
      <AdminOrdersFilters model={model} />
      <AdminOrdersResultCount model={model} />
      <AdminOrdersBulkActions model={model} />
    </>
  );
}

function AdminOrdersToast({ model }: { model: AdminOrdersModel }) {
  const {
    toast,
  } = model;
  return (
    <>
      {/* Toast */}
      {toast && (
        <div
          className="fixed top-6 right-6 z-50 px-5 py-3 rounded-xl text-sm font-medium shadow-lg"
          style={{
            background: toast.type === "success" ? "var(--color-success-bg)" : "var(--color-error-bg)",
            color: toast.type === "success" ? "var(--color-success-text)" : "var(--color-error-text)",
            border: `1px solid ${toast.type === "success" ? "var(--color-success-border)" : "var(--color-error-border)"}`,
          }}
        >
          {toast.message}
        </div>
      )}
    </>
  );
}

function AdminOrdersHeader({ model }: { model: AdminOrdersModel }) {
  const {
    reminderMenuRef, setShowReminderMenu, showReminderMenu, openRemindModal,
    openPaymentRemindModal, setShowAddOrderChoiceModal, setBulkImportRows, setShowBulkImportModal,
  } = model;
  return (
    <>
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
            style={{ background: "var(--color-accent)", color: "var(--color-text)", border: "1px solid var(--color-accent)" }}
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
    </>
  );
}

function AdminOrdersFilters({ model }: { model: AdminOrdersModel }) {
  const {
    filter, setFilter, paymentFilter, setPaymentFilter,
    locationFilter, setLocationFilter, locationFilterOptions, eventOptions,
    eventFilter, setEventFilter, search, setSearch,
    fetchOrders,
  } = model;
  return (
    <>
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
            style={{ background: "var(--color-error-bg)", color: "var(--color-error-text)", border: "1px solid var(--color-error-border)" }}
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
            background: "var(--color-text)",
            color: "white",
            border: "1px solid var(--color-text)",
            boxShadow: "0 2px 0 rgba(0,0,0,0.45), 0 8px 16px rgba(0,0,0,0.16)",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16" />
          </svg>
          Refresh
        </button>
      </div>
    </>
  );
}

function AdminOrdersResultCount({ model }: { model: AdminOrdersModel }) {
  const {
    loading, search, filtered, totalPages,
    page,
  } = model;
  return (
    <>
      {/* Result count */}
      {!loading && (
        <p className="text-xs mb-3" style={{ color: "var(--color-muted)" }}>
          {search
            ? `${filtered.length} result${filtered.length !== 1 ? "s" : ""} for "${search}"`
            : `${filtered.length} bundle${filtered.length !== 1 ? "s" : ""}`}
          {totalPages > 1 && ` - page ${page} of ${totalPages}`}
        </p>
      )}
    </>
  );
}

function AdminOrdersBulkActions({ model }: { model: AdminOrdersModel }) {
  const {
    selectedIds, bulkConfirmableOrders, setShowBulkConfirmModal, bulkConfirming,
    bulkPickedUpOrders, setShowBulkPickedUpModal, bulkMarkingPickedUp, bulkCancelableOrders,
    setShowBulkCancelModal, bulkCancelling, setShowBulkDeleteModal, bulkDeleting,
    setSelectedIds,
  } = model;
  return (
    <>
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
              style={{ background: "rgba(220,38,38,0.3)", color: "var(--color-error-bg)" }}
            >
              {bulkCancelling ? "Cancelling..." : `Cancel (${bulkCancelableOrders.length})`}
            </button>
          )}
          <button
            onClick={() => setShowBulkDeleteModal(true)}
            disabled={bulkDeleting}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-60"
            style={{ background: "rgba(220,38,38,0.3)", color: "var(--color-error-border)" }}
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
    </>
  );
}


function AdminOrdersTable({ model }: { model: AdminOrdersModel }) {
  const {
    loading, paginated, search, selectAllRef,
    allPageSelected, toggleSelectAll, thBase, toggleSort,
    sort,
  } = model;
  return (
    <>
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
                {paginated.map((order, index) => (
                  <AdminOrderRow key={order.id} order={order} isLast={index === paginated.length - 1} model={model} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
    </>
  );
}
function AdminOrderRow({ order, isLast, model }: { order: Order; isLast: boolean; model: AdminOrdersModel }) {
  const {
    getOrderActionId, confirming, sendingReminder, updatingStatus,
    updatingPayment, deleting, selectedIds, openActionMenuId,
    fetchBundleDetails, eventLabelById, formatMoney, formatDate,
  } = model;

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
                        borderBottom: isLast ? "none" : "1px solid var(--color-border)",
                        background: isSelected ? "rgba(114,145,82,0.06)" : "transparent",
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) (e.currentTarget as HTMLTableRowElement).style.background = "var(--color-cream)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLTableRowElement).style.background = isSelected ? "rgba(114,145,82,0.06)" : "transparent";
                      }}
                    >
                      <AdminOrderIdentityCells order={order} isSelected={isSelected} model={model} />
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
                      <AdminOrderPaymentCell order={order} isUpdatingPayment={isUpdatingPayment} model={model} />
                      <AdminOrderReminderCell order={order} />
                      <td className="hidden md:table-cell px-4 py-3 whitespace-nowrap text-xs align-top" style={{ color: "var(--color-muted)" }}>
                        {formatDate(order.created_at)}
                      </td>
                      <AdminOrderActionCell
                        order={order}
                        actionId={actionId}
                        isConfirming={isConfirming}
                        isSendingReminder={isSendingReminder}
                        isUpdatingStatus={isUpdatingStatus}
                        isDeleting={isDeleting}
                        primaryAction={primaryAction}
                        overflowActions={overflowActions}
                        isActionMenuOpen={isActionMenuOpen}
                        model={model}
                      />
                    </tr>
                  );

}


function AdminOrderIdentityCells({ order, isSelected, model }: { order: Order; isSelected: boolean; model: AdminOrdersModel }) {
  const { toggleSelectOne } = model;
  return (
    <>
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
                              style={{ background: "var(--color-cream-dark)", color: "var(--color-muted)", border: "1px solid var(--color-border)" }}
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
                              style={{ background: "var(--color-cream-dark)", color: "var(--color-muted)", border: "1px solid var(--color-border)" }}
                            >
                              Email Excluded
                            </span>
                          )}
                        </div>
                        {order.phone_number && (
                          <div className="text-xs">{order.phone_number}</div>
                        )}
                      </td>

    </>
  );
}

function AdminOrderPaymentCell({ order, isUpdatingPayment, model }: { order: Order; isUpdatingPayment: boolean; model: AdminOrdersModel }) {
  const { setUnpayTarget, openMarkPaidModal } = model;
  return (
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
  );
}

function AdminOrderReminderCell({ order }: { order: Order }) {
  return (
                      <td className="hidden xl:table-cell px-4 py-3 text-center align-top" title={order.reminded ? "Reminder sent" : "Not reminded"}>
                        {order.reminded ? (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-sage)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                          </svg>
                        ) : (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-border)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                            <line x1="1" y1="1" x2="23" y2="23"/>
                          </svg>
                        )}
                      </td>
  );
}

function AdminOrderActionCell({
  order,
  actionId,
  isConfirming,
  isSendingReminder,
  isUpdatingStatus,
  isDeleting,
  primaryAction,
  overflowActions,
  isActionMenuOpen,
  model,
}: {
  order: Order;
  actionId: string;
  isConfirming: boolean;
  isSendingReminder: boolean;
  isUpdatingStatus: boolean;
  isDeleting: boolean;
  primaryAction: TablePrimaryAction;
  overflowActions: StatusActionSpec[];
  isActionMenuOpen: boolean;
  model: AdminOrdersModel;
}) {
  const { actionMenuRef } = model;
  return (
                      <td className="px-3 md:px-4 py-3 align-top" onClick={(e) => e.stopPropagation()}>
                        <div className="relative flex items-start justify-end" ref={isActionMenuOpen ? actionMenuRef : null}>
                          <AdminOrderPrimaryActions
                            order={order}
                            actionId={actionId}
                            isConfirming={isConfirming}
                            isUpdatingStatus={isUpdatingStatus}
                            primaryAction={primaryAction}
                            model={model}
                          />
                          <AdminOrderOverflowMenu
                            order={order}
                            actionId={actionId}
                            isSendingReminder={isSendingReminder}
                            isUpdatingStatus={isUpdatingStatus}
                            isDeleting={isDeleting}
                            overflowActions={overflowActions}
                            isOpen={isActionMenuOpen}
                            model={model}
                          />
                        </div>
                      </td>
  );
}

function AdminOrderPrimaryActions({ order, actionId, isConfirming, isUpdatingStatus, primaryAction, model }: {
  order: Order;
  actionId: string;
  isConfirming: boolean;
  isUpdatingStatus: boolean;
  primaryAction: TablePrimaryAction;
  model: AdminOrdersModel;
}) {
  const { setConfirmTarget, setStatusActionTarget, setOpenActionMenuId, fetchBundleDetails } = model;
  return (
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
  );
}

function AdminOrderOverflowMenu({ order, actionId, isSendingReminder, isUpdatingStatus, isDeleting, overflowActions, isOpen, model }: {
  order: Order;
  actionId: string;
  isSendingReminder: boolean;
  isUpdatingStatus: boolean;
  isDeleting: boolean;
  overflowActions: StatusActionSpec[];
  isOpen: boolean;
  model: AdminOrdersModel;
}) {
  const { setOpenActionMenuId, fetchBundleDetails, setReminderConfirmTarget, setStatusActionTarget, setDeleteTarget } = model;
  if (!isOpen) return null;
  return (
    <>
                          {(
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
                                        ? "var(--color-error-text)"
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
                                  color: "var(--color-error-text)",
                                  borderTop: overflowActions.length > 0 ? "1px solid var(--color-border)" : "none",
                                  background: "var(--color-error-bg)",
                                }}
                              >
                                {isDeleting ? "Deleting..." : "Delete Bundle"}
                              </button>
                            </div>
                          )}
    </>
  );
}

function AdminOrdersPagination({ model }: { model: AdminOrdersModel }) {
  const {
    loading, totalPages, setPage, page,
  } = model;
  return (
    <>
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
    </>
  );
}

function AdminOrdersDialogs({ model }: { model: AdminOrdersModel }) {
  return (
    <>
      <AdminOrdersBundleDetailsDialog model={model} />
      <AdminOrdersBundleEditDialog model={model} />
      <AdminOrdersDeleteDialog model={model} />
      <AdminOrdersConfirmDialog model={model} />
      <AdminOrdersStatusActionDialog model={model} />
      <AdminOrdersBulkDeleteDialog model={model} />
      <AdminOrdersBulkConfirmDialog model={model} />
      <AdminOrdersBulkPickedUpDialog model={model} />
      <AdminOrdersBulkCancelDialog model={model} />
      <AdminOrdersPaymentDialog model={model} />
      <AdminOrdersUnpayDialog model={model} />
      <AdminOrdersSinglePickupReminderDialog model={model} />
      <AdminOrdersSinglePaymentReminderDialog model={model} />
      <AdminOrdersAddOrderChoiceDialog model={model} />
      <AdminOrdersAddEventOrderDialog model={model} />
      <AdminOrdersAddRandomOrderDialog model={model} />
      <AdminOrdersBulkImportDialog model={model} />
      <AdminOrdersPaymentReminderQueueDialog model={model} />
      <AdminOrdersPickupReminderQueueDialog model={model} />
      <AdminOrdersBulkPickupReminderConfirmDialog model={model} />
      <AdminOrdersBulkPaymentReminderConfirmDialog model={model} />
    </>
  );
}

function BundleDetailsHeader({ model }: { model: AdminOrdersModel }) {
  const { selectedBundle, closeBundleDetailsModal } = model;
  if (!selectedBundle) return null;
  return (
    <div className="flex items-center justify-between gap-3 mb-5">
      <div>
        <h2 className="text-2xl font-bold" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>Order Bundle</h2>
        <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>Bundle: {selectedBundle.bundle_id}</p>
      </div>
      <button onClick={closeBundleDetailsModal} className="w-9 h-9 rounded-lg" style={{ background: "var(--color-cream)", border: "1px solid var(--color-border)", color: "var(--color-muted)" }} aria-label="Close details">X</button>
    </div>
  );
}

function BundleStatusActions({ model }: { model: AdminOrdersModel }) {
  const {
    selectedBundle, setConfirmTarget, confirming, getOrderActionId, setReminderConfirmTarget,
    sendingReminder, setStatusActionTarget, updatingStatus,
  } = model;
  if (!selectedBundle) return null;
  const actionId = getOrderActionId(selectedBundle);
  const reminderUnavailableReason = getReminderUnavailableReason(selectedBundle);
  return (
    <>
      <StatusBadge status={selectedBundle.status} />
      {selectedBundle.status === "pending" && (
        <button onClick={() => setConfirmTarget(selectedBundle)} disabled={confirming === actionId} className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-60" style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}>
          {selectedBundle.exclude_email ? "Confirm (No Email)" : "Confirm and Email"}
        </button>
      )}
      {selectedBundle.status === "confirmed" && (
        <button
          onClick={() => setReminderConfirmTarget(selectedBundle)}
          disabled={sendingReminder === actionId || !!reminderUnavailableReason}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-60"
          style={{ background: reminderUnavailableReason ? "var(--color-cream)" : "rgba(114,145,82,0.12)", color: reminderUnavailableReason ? "var(--color-muted)" : "var(--color-forest)", border: "1px solid var(--color-border)" }}
          title={reminderUnavailableReason ?? "Send pickup reminder"}
        >
          {sendingReminder === actionId ? "Sending..." : selectedBundle.reminded ? "Reminder Sent" : "Send Reminder"}
        </button>
      )}
      {getStatusActionSpecs(selectedBundle, "detail").map((action) => (
        <button
          key={action.key}
          onClick={() => setStatusActionTarget({ order: selectedBundle, action: action.key })}
          disabled={updatingStatus === actionId}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-60"
          style={{ background: action.tone === "danger" ? "var(--color-error-bg)" : "white", color: action.tone === "danger" ? "var(--color-error-text)" : "var(--color-text)", border: `1px solid ${action.tone === "danger" ? "var(--color-error-border)" : "var(--color-border)"}` }}
        >
          {action.label}
        </button>
      ))}
    </>
  );
}

function BundlePaymentAction({ model }: { model: AdminOrdersModel }) {
  const { selectedBundle, setUnpayTarget, openMarkPaidModal } = model;
  if (!selectedBundle) return null;
  return selectedBundle.paid ? (
    <button onClick={() => setUnpayTarget(selectedBundle)} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: "var(--color-error)", color: "white" }}>Mark Unpaid</button>
  ) : (
    <button onClick={() => openMarkPaidModal(selectedBundle)} disabled={selectedBundle.status === "pending"} className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-60" style={{ background: "var(--color-sage)", color: "white" }}>Mark Paid</button>
  );
}

function BundleCustomerActions({ model }: { model: AdminOrdersModel }) {
  const { selectedBundle } = model;
  if (!selectedBundle) return null;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="rounded-2xl p-4" style={{ border: "1px solid var(--color-border)", background: "white" }}>
        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--color-sage)" }}>Customer Details</p>
        <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>{selectedBundle.name}</p>
        <p className="text-sm" style={{ color: "var(--color-muted)" }}>{selectedBundle.email ?? "-"}</p>
        <p className="text-sm" style={{ color: "var(--color-muted)" }}>{selectedBundle.phone_number ?? "-"}</p>
      </div>
      <div className="rounded-2xl p-4" style={{ border: "1px solid var(--color-border)", background: "white" }}>
        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--color-sage)" }}>Order Actions</p>
        <div className="flex items-center gap-2 flex-wrap mb-3"><BundleStatusActions model={model} /><BundlePaymentAction model={model} /></div>
        {selectedBundle.status === "mixed" && <p className="text-xs mb-2" style={{ color: "var(--color-muted)" }}>Mixed bundles do not expose quick actions in the table. Review the bundle here before normalizing it.</p>}
        <p className="text-xs" style={{ color: "var(--color-muted)" }}>
          Payment: {selectedBundle.paid ? "Paid" : "Unpaid"}{selectedBundle.payment_method ? ` (${selectedBundle.payment_method}${selectedBundle.payment_method_other ? `: ${selectedBundle.payment_method_other}` : ""})` : ""}
        </p>
      </div>
    </div>
  );
}

function BundleOrderSummary({ model }: { model: AdminOrdersModel }) {
  const { selectedBundle, eventLabelById, formatMoney, formatDate } = model;
  if (!selectedBundle) return null;
  const details = [
    { label: "Event", value: eventLabelById.get(selectedBundle.event_id) ?? `Event ${selectedBundle.event_id}` },
    { label: "Items", value: selectedBundle.quantity_total },
    { label: "Item Types", value: selectedBundle.line_count },
    { label: "Total", value: formatMoney(selectedBundle.total_price), highlight: true },
    { label: "Location", value: selectedBundle.pickup_location },
    { label: "Time Slot", value: selectedBundle.pickup_time_slot },
    { label: "Address", value: selectedBundle.pickup_address ?? "-" },
    { label: "Date Placed", value: formatDate(selectedBundle.created_at) },
  ];
  return (
    <div className="rounded-2xl p-4" style={{ border: "1px solid var(--color-border)", background: "white" }}>
      <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--color-sage)" }}>Order Details</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        {details.map((detail) => <div key={detail.label}><span style={{ color: "var(--color-muted)" }}>{detail.label}:</span><div style={{ color: detail.highlight ? "var(--color-forest)" : "var(--color-text)", fontWeight: detail.highlight ? 700 : undefined }}>{detail.value}</div></div>)}
      </div>
      {selectedBundle.status === "mixed" && selectedBundle.status_breakdown && (
        <p className="text-xs mt-2" style={{ color: "var(--color-muted)" }}>Mixed status: {Object.entries(selectedBundle.status_breakdown).map(([status, count]) => `${status}: ${count}`).join(", ")}</p>
      )}
    </div>
  );
}

function BundleItemsTable({ model }: { model: AdminOrdersModel }) {
  const { bundleLines, formatMoney } = model;
  return (
    <div className="rounded-2xl p-4" style={{ border: "1px solid var(--color-border)", background: "white" }}>
      <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--color-sage)" }}>Items Ordered</p>
      {bundleLines.length === 0 ? <p className="text-sm" style={{ color: "var(--color-muted)" }}>No items found for this order.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr style={{ borderBottom: "1px solid var(--color-border)" }}><th className="text-left font-semibold py-2" style={{ color: "var(--color-muted)" }}>Item</th><th className="text-left font-semibold py-2" style={{ color: "var(--color-muted)" }}>Qty</th><th className="text-left font-semibold py-2" style={{ color: "var(--color-muted)" }}>Unit Cost</th><th className="text-left font-semibold py-2" style={{ color: "var(--color-muted)" }}>Total</th></tr></thead>
            <tbody>{bundleLines.map((item) => {
              const quantity = Number(item.quantity) || 0;
              const lineTotal = Number(item.total_price) || 0;
              const unitCost = quantity > 0 ? lineTotal / quantity : lineTotal;
              return <tr key={item.id} style={{ borderBottom: "1px solid var(--color-border)" }}><td className="py-2" style={{ color: "var(--color-text)" }}>{item.item_name}</td><td className="py-2" style={{ color: "var(--color-text)" }}>{quantity}</td><td className="py-2" style={{ color: "var(--color-text)" }}>{formatMoney(unitCost)}</td><td className="py-2 font-semibold" style={{ color: "var(--color-forest)" }}>{formatMoney(lineTotal)}</td></tr>;
            })}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function BundleNotes({ model }: { model: AdminOrdersModel }) {
  const { selectedBundle } = model;
  if (!selectedBundle) return null;
  return (
    <div className="rounded-2xl p-4" style={{ border: "1px solid var(--color-border)", background: "white" }}>
      <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--color-sage)" }}>Notes</p>
      <p className="text-sm" style={{ color: "var(--color-text)", whiteSpace: "pre-wrap" }}>{selectedBundle.notes || "-"}</p>
      {selectedBundle.notes_mixed && <p className="text-xs mt-2" style={{ color: "var(--color-muted)" }}>Some item-level notes differ. Editing this bundle will resync shared notes.</p>}
    </div>
  );
}

function BundleDetailsFooter({ model }: { model: AdminOrdersModel }) {
  const { selectedBundle, loadingBundleInvoices, bundleInvoiceCount, router, setShowEditBundleModal, setDeleteTarget, getOrderActionId } = model;
  if (!selectedBundle) return null;
  return (
    <div className="flex items-center justify-end gap-2">
      {(loadingBundleInvoices || bundleInvoiceCount > 0) && <button onClick={() => router.push(`/admin/invoices?bundle_id=${encodeURIComponent(selectedBundle.bundle_id)}`)} disabled={loadingBundleInvoices} className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-60" style={{ background: "white", color: "var(--color-text)", border: "1px solid var(--color-border)" }}>{loadingBundleInvoices ? "Checking Invoices..." : `View Invoices (${bundleInvoiceCount})`}</button>}
      <button onClick={() => router.push(`/admin/invoices/new?bundle_id=${encodeURIComponent(selectedBundle.bundle_id)}`)} className="px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}>Create Invoice</button>
      <button onClick={() => setShowEditBundleModal(true)} className="px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: "white", color: "var(--color-text)", border: "1px solid var(--color-border)" }}>Edit Bundle</button>
      <button onClick={() => setDeleteTarget(getOrderActionId(selectedBundle))} className="px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: "var(--color-error-bg)", color: "var(--color-error-text)", border: "1px solid var(--color-error-border)" }}>Delete Bundle</button>
    </div>
  );
}

function AdminOrdersBundleDetailsDialog({ model }: { model: AdminOrdersModel }) {
  const { showBundleDetailsModal, selectedBundle, closeBundleDetailsModal, loadingBundleDetails } = model;
  if (!showBundleDetailsModal || !selectedBundle) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 110, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }} onMouseDown={(event) => { if (event.target === event.currentTarget) closeBundleDetailsModal(); }}>
      <div style={{ background: "white", borderRadius: "24px", border: "1px solid var(--color-border)", maxWidth: "900px", width: "100%", maxHeight: "90vh", overflowY: "auto", padding: "24px", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }} onMouseDown={(event) => event.stopPropagation()}>
        <BundleDetailsHeader model={model} />
        {loadingBundleDetails ? (
          <div className="flex justify-center py-12"><svg className="animate-spin" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" opacity="0.3" /><path d="M12 2a10 10 0 0 1 10 10" stroke="var(--color-sage)" /></svg></div>
        ) : (
          <div className="space-y-4"><BundleCustomerActions model={model} /><BundleOrderSummary model={model} /><BundleItemsTable model={model} /><BundleNotes model={model} /><BundleDetailsFooter model={model} /></div>
        )}
      </div>
    </div>
  );
}

function AdminOrdersBundleEditDialog({ model }: { model: AdminOrdersModel }) {
  const {
    showEditBundleModal, selectedBundle, bundleLines, setShowEditBundleModal,
    fetchOrders, refreshSelectedBundleDetails, showToast,
  } = model;
  return (
    <>
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
    </>
  );
}

function AdminOrdersDeleteDialog({ model }: { model: AdminOrdersModel }) {
  const {
    deleteTarget, setDeleteTarget, executeDelete,
  } = model;
  return (
    <>
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
              style={{ background: "var(--color-error-text)", color: "white" }}
            >
              Delete
            </button>
          </>
        }
      >
        This order bundle will be permanently deleted. This cannot be undone.
      </Modal>
    </>
  );
}

function AdminOrdersConfirmDialog({ model }: { model: AdminOrdersModel }) {
  const {
    confirmTarget, confirming, getOrderActionId, setConfirmTarget,
    handleConfirm,
  } = model;
  return (
    <>
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
    </>
  );
}

function AdminOrdersStatusActionDialog({ model }: { model: AdminOrdersModel }) {
  const {
    statusActionTarget, updatingStatus, getOrderActionId, setStatusActionTarget,
    handleStatusAction,
  } = model;
  return (
    <>
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
                background: statusActionTarget?.action === "cancel" || statusActionTarget?.action === "mark_no_show" ? "var(--color-error-text)" : "var(--color-forest)",
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
    </>
  );
}

function AdminOrdersBulkDeleteDialog({ model }: { model: AdminOrdersModel }) {
  const {
    showBulkDeleteModal, setShowBulkDeleteModal, selectedIds, executeBulkDelete,
  } = model;
  return (
    <>
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
              style={{ background: "var(--color-error-text)", color: "white" }}
            >
              Delete All
            </button>
          </>
        }
      >
        {selectedIds.size} bundle{selectedIds.size !== 1 ? "s" : ""} will be permanently deleted. This cannot be undone.
      </Modal>
    </>
  );
}

function AdminOrdersBulkConfirmDialog({ model }: { model: AdminOrdersModel }) {
  const {
    showBulkConfirmModal, setShowBulkConfirmModal, bulkConfirmableOrders, executeBulkConfirm,
  } = model;
  return (
    <>
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
    </>
  );
}

function AdminOrdersBulkPickedUpDialog({ model }: { model: AdminOrdersModel }) {
  const {
    showBulkPickedUpModal, setShowBulkPickedUpModal, bulkPickedUpOrders, executeBulkStatusAction,
  } = model;
  return (
    <>
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
    </>
  );
}

function AdminOrdersBulkCancelDialog({ model }: { model: AdminOrdersModel }) {
  const {
    showBulkCancelModal, setShowBulkCancelModal, bulkCancelableOrders, executeBulkStatusAction,
  } = model;
  return (
    <>
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
              style={{ background: "var(--color-error-text)", color: "white" }}
            >
              Cancel bundles
            </button>
          </>
        }
      >
        This will cancel {bulkCancelableOrders.length} selected bundle{bulkCancelableOrders.length !== 1 ? "s" : ""}. Mixed bundles are excluded from this bulk action.
      </Modal>
    </>
  );
}

function AdminOrdersPaymentDialog({ model }: { model: AdminOrdersModel }) {
  const {
    paymentTarget, updatingPayment, getOrderActionId, setPaymentTarget,
    openPaymentReminderConfirmFromPaymentModal, paymentReminderLoading, paymentMethodOther, paymentMethod,
    showToast, handlePaymentUpdate, setPaymentMethod, setPaymentMethodOther,
    inputStyle,
  } = model;
  return (
    <>
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
    </>
  );
}

function AdminOrdersUnpayDialog({ model }: { model: AdminOrdersModel }) {
  const {
    unpayTarget, updatingPayment, getOrderActionId, setUnpayTarget,
    handlePaymentUpdate,
  } = model;
  return (
    <>
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
              style={{ background: "var(--color-error-text)", color: "white" }}
            >
              Mark unpaid
            </button>
          </>
        }
      >
        This will set paid to false and clear the payment method.
      </Modal>
    </>
  );
}

function AdminOrdersSinglePickupReminderDialog({ model }: { model: AdminOrdersModel }) {
  const {
    reminderConfirmTarget, setReminderConfirmTarget, handleSendSingleReminder, sendingReminder,
    getOrderActionId,
  } = model;
  return (
    <>
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
    </>
  );
}

function AdminOrdersSinglePaymentReminderDialog({ model }: { model: AdminOrdersModel }) {
  const {
    paymentReminderConfirmTarget, closePaymentReminderConfirm, setPaymentReminderConfirmTarget, setShowPaymentRemindModal,
    handleSendSinglePaymentReminder, paymentReminderLoading,
  } = model;
  return (
    <>
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
    </>
  );
}

function AdminOrdersAddOrderChoiceDialog({ model }: { model: AdminOrdersModel }) {
  const {
    showAddOrderChoiceModal, setShowAddOrderChoiceModal, openEventAddOrderModal, openRandomAddOrderModal,
    randomEventLabel,
  } = model;
  return (
    <>
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
                style={{ background: "var(--color-success-bg)", border: "1px solid var(--color-sage)" }}
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
    </>
  );
}

function AdminOrdersAddEventOrderDialog({ model }: { model: AdminOrdersModel }) {
  const {
    showAddOrderModal, resetAddOrderModalState, handleAddOrder, addModalEventSearch,
    setAddModalEventSearch, setShowAddEventDropdown, addModalEventId, events,
    setAddModalEventId, setAddModalEventConfig, setAddOrderForm, setAddOrderQuantities,
    setAddOrderItemsError, inputStyle, showAddEventDropdown, filteredAddModalEvents,
    addOrderForm, addOrderPickerItems, addOrderQuantities, addModalEventConfig,
    addOrderItemsError, configUsesFallback, addOrderTimeSlots, addingOrder,
  } = model;
  return (
    <>
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
    </>
  );
}

function AdminOrdersAddRandomOrderDialog({ model }: { model: AdminOrdersModel }) {
  const {
    showRandomOrderModal, resetRandomOrderModalState, handleAddRandomOrder, randomOrderForm,
    setRandomOrderForm, inputStyle, randomOrderPickerItems, randomOrderQuantities,
    setRandomOrderQuantities, setRandomOrderItemsError, randomOrderPrices, setRandomOrderPrices,
    randomOrderItemsError, catalogItems, randomLocationSuggestions, randomTimeSlotSuggestions,
    addingOrder,
  } = model;
  return (
    <>
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
    </>
  );
}

function AdminOrdersBulkImportDialog({ model }: { model: AdminOrdersModel }) {
  const {
    showBulkImportModal, setShowBulkImportModal, configEventLabel, configUsesFallback,
    eventConfig, handleCsvFile, downloadCsvTemplate, bulkImportRows,
    validBulkRows, invalidBulkRows, executeBulkImport, bulkImporting,
  } = model;
  return (
    <>
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
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "var(--color-success-bg)", color: "var(--color-success-text)" }}>
                      {validBulkRows.length} valid
                    </span>
                  )}
                  {invalidBulkRows.length > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "var(--color-error-bg)", color: "var(--color-error-text)" }}>
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
                            background: row._error ? "var(--color-error-bg)" : "white",
                          }}
                        >
                          <td className="px-3 py-2" style={{ color: "var(--color-muted)" }}>{row._rowNum}</td>
                          <td className="px-3 py-2" style={{ color: "var(--color-text)" }}>{row.name || "-"}</td>
                          <td className="px-3 py-2" style={{ color: "var(--color-muted)" }}>{row.email || "-"}</td>
                          <td className="px-3 py-2" style={{ color: "var(--color-text)" }}>{row.item_id} x{row.quantity}</td>
                          <td className="px-3 py-2" style={{ color: "var(--color-text)" }}>{row.pickup_location || "-"}</td>
                          <td className="px-3 py-2">
                            {row._error
                              ? <span style={{ color: "var(--color-error-text)" }} title={row._error}>Error: {row._error}</span>
                              : <span style={{ color: "var(--color-success-text)" }}>OK</span>
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
    </>
  );
}

type ReminderSelectionSetter = (value: SetStateAction<Set<string>>) => void;

interface ReminderCandidate {
  orderId: string;
  name: string;
  email: string;
  pickupLabel: string;
}

interface ReminderQueueDialogProps {
  title: string;
  description: string;
  ineligibleMessage: string | null;
  emptyMessage: string;
  search: string;
  onSearchChange: (value: string) => void;
  candidates: ReminderCandidate[];
  totalCandidateCount: number;
  selections: Set<string>;
  setSelections: ReminderSelectionSetter;
  run: ReminderRunState;
  progressPercent: number;
  failedItems: ReminderQueueItem[];
  isProgressMode: boolean;
  loading: boolean;
  onClose: () => void;
  onRetry: () => void;
  onOpenConfirm: () => void;
  actionLabel: string;
}

function filterReminderCandidates(candidates: ReminderCandidate[], search: string): ReminderCandidate[] {
  const query = search.trim().toLowerCase();
  if (!query) return candidates;
  return candidates.filter((candidate) =>
    candidate.name.toLowerCase().includes(query) || candidate.email.toLowerCase().includes(query)
  );
}

function updateReminderSelections(
  current: Set<string>,
  orderIds: string[],
  shouldSelect: boolean,
): Set<string> {
  const next = new Set(current);
  orderIds.forEach((orderId) => shouldSelect ? next.add(orderId) : next.delete(orderId));
  return next;
}

function ReminderQueueComposer({ props }: { props: ReminderQueueDialogProps }) {
  const { candidates, totalCandidateCount, selections, setSelections, search, onSearchChange } = props;
  const visibleOrderIds = candidates.map((candidate) => candidate.orderId);
  return (
    <>
      <div className="mb-3">
        <input
          type="text"
          placeholder="Search by name or email..."
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          className="w-full px-3 py-2 rounded-xl text-sm"
          style={{ border: "1px solid var(--color-border)", background: "var(--color-cream)", color: "var(--color-text)", outline: "none" }}
        />
      </div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs" style={{ color: "var(--color-muted)" }}>
          {candidates.length} of {totalCandidateCount} shown &middot; {selections.size} selected
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => setSelections((current) => updateReminderSelections(current, visibleOrderIds, true))}
            className="text-xs font-medium px-2 py-1 rounded-lg transition-opacity hover:opacity-70"
            style={{ color: "var(--color-bark)" }}
          >
            Select all shown
          </button>
          <button
            onClick={() => setSelections((current) => updateReminderSelections(current, visibleOrderIds, false))}
            className="text-xs font-medium px-2 py-1 rounded-lg transition-opacity hover:opacity-70"
            style={{ color: "var(--color-muted)" }}
          >
            Unselect all
          </button>
        </div>
      </div>
      <div style={{ overflowY: "auto", maxHeight: "320px", marginBottom: "1.25rem", border: "1px solid var(--color-border)", borderRadius: "0.75rem" }}>
        {candidates.length === 0 ? (
          <p className="text-sm py-6 text-center" style={{ color: "var(--color-muted)" }}>No recipients match your search.</p>
        ) : candidates.map((candidate) => (
          <label
            key={candidate.orderId}
            style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem", padding: "0.875rem 1rem", borderBottom: "1px solid var(--color-border)", cursor: "pointer" }}
          >
            <input
              type="checkbox"
              checked={selections.has(candidate.orderId)}
              onChange={(event) => setSelections((current) => updateReminderSelections(current, [candidate.orderId], event.target.checked))}
              style={{ marginTop: "2px", accentColor: "var(--color-bark)", width: "15px", height: "15px", flexShrink: 0 }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className="text-sm font-semibold" style={{ color: "var(--color-text)", margin: 0 }}>{candidate.name}</p>
              <p className="text-xs" style={{ color: "var(--color-muted)", margin: "2px 0 0" }}>{candidate.email || "-"}</p>
              <p className="text-xs" style={{ color: "var(--color-muted)", margin: "1px 0 0" }}>{candidate.pickupLabel}</p>
            </div>
          </label>
        ))}
      </div>
    </>
  );
}

function ReminderQueueItemRow({ item, isLast, isActive }: { item: ReminderQueueItem; isLast: boolean; isActive: boolean }) {
  const badge = getReminderStatusBadge(item);
  return (
    <article className="grid grid-cols-[1fr_auto] gap-3 p-4" style={{ borderBottom: isLast ? "none" : "1px solid var(--color-border)", background: isActive ? "var(--color-cream)" : "white" }}>
      <section className="min-w-0">
        <h3 className="text-sm font-semibold m-0" style={{ color: "var(--color-text)" }}>{item.name}</h3>
        <div className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>{item.email || "-"}</div>
        <div className="text-xs mt-px" style={{ color: "var(--color-muted)" }}>{item.pickupLabel}</div>
        {item.message ? <div className="text-xs mt-2" style={{ color: "var(--color-text)" }}>{item.message}</div> : null}
        {item.attempts ? <div className="text-[11px] mt-1" style={{ color: "var(--color-muted)" }}>Attempt {item.attempts} of 3</div> : null}
      </section>
      <span className="self-start text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>{badge.label}</span>
    </article>
  );
}

function ReminderQueueProgress({ props }: { props: ReminderQueueDialogProps }) {
  const { run, progressPercent } = props;
  const totals = [
    { label: "Sent", value: run.sent },
    { label: "Failed", value: run.failed },
    { label: "Skipped", value: run.skipped },
    { label: "Remaining", value: Math.max(run.total - run.completed, 0) },
  ];
  return (
    <>
      <div className="rounded-2xl p-4 mb-4" style={{ background: "var(--color-cream)", border: "1px solid var(--color-border)" }}>
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>{run.completed} of {run.total} processed</p>
          <span className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>{progressPercent}% complete</span>
        </div>
        <div style={{ width: "100%", height: "12px", borderRadius: "999px", background: "var(--color-cream)", border: "1px solid var(--color-border)", overflow: "hidden", marginBottom: "0.875rem" }}>
          <div style={{ height: "100%", width: `${progressPercent}%`, background: "var(--color-bark)", transition: "width 200ms ease" }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "0.75rem" }}>
          {totals.map((total) => (
            <div key={total.label}>
              <p className="text-[11px] uppercase font-semibold" style={{ color: "var(--color-muted)", margin: 0 }}>{total.label}</p>
              <p className="text-sm font-semibold" style={{ color: "var(--color-text)", margin: "0.2rem 0 0" }}>{total.value}</p>
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs mb-3" style={{ color: "var(--color-muted)" }}>Please keep this window open until sending finishes.</p>
      <div style={{ overflowY: "auto", maxHeight: "320px", marginBottom: "1.25rem", border: "1px solid var(--color-border)", borderRadius: "0.75rem" }}>
        {run.items.map((item, index) => <ReminderQueueItemRow key={item.orderId} item={item} isLast={index === run.items.length - 1} isActive={item.orderId === run.activeOrderId} />)}
      </div>
    </>
  );
}

function ReminderQueueFooter({ props }: { props: ReminderQueueDialogProps }) {
  const { isProgressMode, failedItems, onRetry, loading, onClose, onOpenConfirm, selections, actionLabel } = props;
  if (isProgressMode) {
    return (
      <div className="flex justify-end gap-3">
        {failedItems.length > 0 && (
          <button onClick={onRetry} disabled={loading} className="px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50" style={{ background: "var(--color-cream)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}>
            Retry Failed ({failedItems.length})
          </button>
        )}
        <button onClick={onClose} disabled={loading} className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50" style={{ background: "var(--color-bark)", color: "var(--color-cream)", border: "1px solid var(--color-bark)" }}>
          {loading ? "Sending..." : "Done"}
        </button>
      </div>
    );
  }
  return (
    <div className="flex justify-end gap-3">
      <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium" style={{ background: "var(--color-cream)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}>Cancel</button>
      <button onClick={onOpenConfirm} disabled={loading || selections.size === 0} className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50" style={{ background: "var(--color-bark)", color: "var(--color-cream)", border: "1px solid var(--color-bark)" }}>
        {loading ? "Sending..." : `${actionLabel}${selections.size !== 1 ? "s" : ""} (${selections.size})`}
      </button>
    </div>
  );
}

function ReminderQueueDialog({ props }: { props: ReminderQueueDialogProps }) {
  const { loading, onClose, title, description, ineligibleMessage, isProgressMode, emptyMessage, totalCandidateCount } = props;
  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
      onMouseDown={(event) => { if (!loading && event.target === event.currentTarget) onClose(); }}
    >
      <div style={{ background: "white", borderRadius: "1.5rem", padding: "2rem", width: "100%", maxWidth: "620px", maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }} onMouseDown={(event) => event.stopPropagation()}>
        <h2 className="text-xl font-bold mb-1" style={{ color: "var(--color-bark)", fontFamily: "var(--font-serif)" }}>{title}</h2>
        <p className="text-sm mb-4" style={{ color: "var(--color-muted)" }}>{description}</p>
        {!isProgressMode && ineligibleMessage && (
          <div className="rounded-xl px-4 py-3 text-xs mb-4" style={{ background: "var(--color-cream)", border: "1px solid var(--color-border)", color: "var(--color-muted)" }}>{ineligibleMessage}</div>
        )}
        {!isProgressMode && totalCandidateCount === 0
          ? <p className="text-sm py-6 text-center" style={{ color: "var(--color-muted)" }}>{emptyMessage}</p>
          : isProgressMode ? <ReminderQueueProgress props={props} /> : <ReminderQueueComposer props={props} />}
        <ReminderQueueFooter props={props} />
      </div>
    </div>
  );
}

function AdminOrdersPaymentReminderQueueDialog({ model }: { model: AdminOrdersModel }) {
  const {
    showPaymentRemindModal, paymentRemindSearch, eligiblePaymentReminderRecipients,
    paymentReminderLoading, closePaymentRemindModal, isPaymentReminderProgressMode, ineligiblePaymentReminderCount,
    setPaymentRemindSearch, paymentRemindSelections, setPaymentRemindSelections, paymentReminderRun,
    paymentReminderProgressPercent, failedPaymentReminderItems, handleRetryFailedPaymentReminders, openBulkPaymentReminderConfirm,
  } = model;
  if (!showPaymentRemindModal) return null;
  const candidates = filterReminderCandidates(eligiblePaymentReminderRecipients.map((recipient) => ({
    orderId: recipient.orderId,
    name: recipient.name,
    email: recipient.email,
    pickupLabel: recipient.pickupLabel,
  })), paymentRemindSearch);
  return <ReminderQueueDialog props={{
    title: "Send Payment Reminders",
    description: isPaymentReminderProgressMode
      ? "Progress updates appear here while payment reminder emails are sent one at a time."
      : "Payment reminder emails will be sent to all selected unpaid customers.",
    ineligibleMessage: ineligiblePaymentReminderCount > 0
      ? `${ineligiblePaymentReminderCount} unpaid order${ineligiblePaymentReminderCount !== 1 ? "s are" : " is"} not eligible because of status, exclusion, or a missing email.`
      : null,
    emptyMessage: "No eligible unpaid recipients are available.",
    search: paymentRemindSearch,
    onSearchChange: setPaymentRemindSearch,
    candidates,
    totalCandidateCount: eligiblePaymentReminderRecipients.length,
    selections: paymentRemindSelections,
    setSelections: setPaymentRemindSelections,
    run: paymentReminderRun,
    progressPercent: paymentReminderProgressPercent,
    failedItems: failedPaymentReminderItems,
    isProgressMode: isPaymentReminderProgressMode,
    loading: paymentReminderLoading,
    onClose: closePaymentRemindModal,
    onRetry: handleRetryFailedPaymentReminders,
    onOpenConfirm: openBulkPaymentReminderConfirm,
    actionLabel: "Send Payment Reminder",
  }} />;
}

function AdminOrdersPickupReminderQueueDialog({ model }: { model: AdminOrdersModel }) {
  const {
    showRemindModal, remindSearch, eligibleReminderOrders, remindLoading, closeRemindModal,
    isReminderProgressMode, ineligibleReminderCount, confirmedOrders, setRemindSearch,
    remindSelections, setRemindSelections, reminderRun, reminderProgressPercent,
    failedReminderItems, handleRetryFailedReminders, openBulkReminderConfirm,
  } = model;
  if (!showRemindModal) return null;
  const candidates = filterReminderCandidates(eligibleReminderOrders.map((order) => ({
    orderId: order.id,
    name: order.name,
    email: order.email ?? "",
    pickupLabel: formatPickupLabel(order),
  })), remindSearch);
  return <ReminderQueueDialog props={{
    title: "Send Pickup Reminders",
    description: isReminderProgressMode
      ? "Progress updates appear here while reminder emails are sent one at a time."
      : "Reminder emails will be sent to selected customers with eligible confirmed orders.",
    ineligibleMessage: ineligibleReminderCount > 0
      ? `${ineligibleReminderCount} confirmed order${ineligibleReminderCount !== 1 ? "s are" : " is"} not eligible because it was already reminded, excluded, or has no email.`
      : null,
    emptyMessage: confirmedOrders.length === 0 ? "No confirmed orders to remind." : "All confirmed orders have already been reminded or are not eligible.",
    search: remindSearch,
    onSearchChange: setRemindSearch,
    candidates,
    totalCandidateCount: eligibleReminderOrders.length,
    selections: remindSelections,
    setSelections: setRemindSelections,
    run: reminderRun,
    progressPercent: reminderProgressPercent,
    failedItems: failedReminderItems,
    isProgressMode: isReminderProgressMode,
    loading: remindLoading,
    onClose: closeRemindModal,
    onRetry: handleRetryFailedReminders,
    onOpenConfirm: openBulkReminderConfirm,
    actionLabel: "Send Reminder",
  }} />;
}

function AdminOrdersBulkPickupReminderConfirmDialog({ model }: { model: AdminOrdersModel }) {
  const {
    showBulkReminderConfirm, closeBulkReminderConfirm, setShowBulkReminderConfirm, setShowRemindModal,
    handleSendReminders, remindLoading, remindSelections,
  } = model;
  return (
    <>
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
    </>
  );
}

function AdminOrdersBulkPaymentReminderConfirmDialog({ model }: { model: AdminOrdersModel }) {
  const {
    showBulkPaymentReminderConfirm, closeBulkPaymentReminderConfirm, setShowBulkPaymentReminderConfirm, setShowPaymentRemindModal,
    handleSendPaymentReminders, paymentReminderLoading, paymentRemindSelections,
  } = model;
  return (
    <>
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
    </>
  );
}



export default function AdminOrdersPage() {
  return <AdminOrdersView model={useAdminOrdersModel()} />;
}
