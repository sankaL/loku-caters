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

function csvEscape(value: string | number): string {
  const normalized = String(value).replace(/"/g, "\"\"");
  if (/[",\n\r]/.test(normalized)) return `"${normalized}"`;
  return normalized;
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

const BanknoteIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <circle cx="12" cy="12" r="2" />
    <path d="M6 12h.01M18 12h.01" />
  </svg>
);

const CashIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <circle cx="12" cy="12" r="2" />
    <path d="M6 12h.01M18 12h.01" />
  </svg>
);

const EtransferIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <path d="M2 10h20" />
    <path d="M6 15h4" />
    <path d="M14 15h4" />
  </svg>
);

const OtherPayIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
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

  // Payment modals
  const [paymentTarget, setPaymentTarget] = useState<Order | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "etransfer" | "other">("cash");
  const [paymentMethodOther, setPaymentMethodOther] = useState("");
  const [unpayTarget, setUnpayTarget] = useState<Order | null>(null);

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [showBulkConfirmModal, setShowBulkConfirmModal] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkConfirming, setBulkConfirming] = useState(false);

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
  const remindLoading = reminderRun.isRunning;

  // Payment reminder modal
  const [showPaymentRemindModal, setShowPaymentRemindModal] = useState(false);
  const [paymentRemindSelections, setPaymentRemindSelections] = useState<Set<string>>(new Set());
  const [paymentReminderRun, setPaymentReminderRun] = useState<ReminderRunState>(EMPTY_REMINDER_RUN);
  const [paymentRemindSearch, setPaymentRemindSearch] = useState("");
  const [paymentReminderTarget, setPaymentReminderTarget] = useState<Order | null>(null);
  const paymentReminderLoading = paymentReminderRun.isRunning;

  // Reset selection when filter/orders change
  useEffect(() => { setSelectedIds(new Set()); }, [filter, paymentFilter, eventFilter, locationFilter, orders]);
  useEffect(() => { setPage(1); }, [paymentFilter, eventFilter, locationFilter]);

  // Switching event should not keep a stale location selection
  useEffect(() => {
    setLocationFilter("all");
  }, [eventFilter]);

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

  async function handleStatusChange(orderId: string, newStatus: string) {
    setUpdatingStatus(orderId);
    try {
      const token = await getAdminToken();
      if (!token) return;
      const res = await fetch(`${API_URL}/api/admin/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, "Failed to update status"));
      }
      setOrders((prev) => {
        if (filter !== "all" && newStatus !== filter) {
          return prev.filter((o) => o.id !== orderId);
        }
        return prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o));
      });
      setSelectedBundle((prev) => (prev && getOrderActionId(prev) === orderId ? { ...prev, status: newStatus } : prev));
      showToast("Status updated", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to update status", "error");
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
    const ids = Array.from(selectedIds);
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

  function closeRemindModal() {
    if (remindLoading) return;
    setShowRemindModal(false);
    setRemindSearch("");
    setRemindSelections(new Set());
    setReminderRun(EMPTY_REMINDER_RUN);
  }

  function openRemindModal() {
    setRemindSelections(new Set(eligibleReminderOrders.map((o) => o.id)));
    setRemindSearch("");
    setReminderRun(EMPTY_REMINDER_RUN);
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
    setPaymentRemindSelections(new Set(eligiblePaymentReminderRecipients.map((recipient) => recipient.orderId)));
    setPaymentRemindSearch("");
    setPaymentReminderRun(EMPTY_REMINDER_RUN);
    setShowPaymentRemindModal(true);
  }

  function closeBundleDetailsModal() {
    if (loadingBundleDetails) return;
    setShowBundleDetailsModal(false);
    setSelectedBundle(null);
    setBundleLines([]);
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

  async function handleConfirmSinglePaymentReminder() {
    const target = paymentReminderTarget;
    if (!target) return;

    const items = buildPaymentReminderItems([target.id]);
    if (items.length === 0) {
      showToast("Payment reminder is not available for this order", "error");
      setPaymentReminderTarget(null);
      return;
    }

    setPaymentReminderTarget(null);
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

  function handleExportCsv() {
    if (sorted.length === 0) {
      showToast("No bundles to export", "error");
      return;
    }

    const headers = [
      "Bundle ID",
      "Primary Order ID",
      "Name",
      "Email",
      "Phone",
      "Item Types",
      "Items Total",
      "Event",
      "Pickup Location",
      "Pickup Time Slot",
      "Total Price",
      "Status",
      "Paid",
      "Payment Method",
      "Payment Method Other",
      "Created At",
    ];

    const rows = sorted.map((order) => [
      order.bundle_id,
      order.primary_order_id,
      order.name,
      order.email ?? "",
      order.phone_number ?? "",
      order.line_count,
      order.quantity_total,
      eventLabelById.get(order.event_id) ?? `Event ${order.event_id}`,
      order.pickup_location,
      order.pickup_time_slot,
      order.total_price.toFixed(2),
      order.status,
      order.paid ? "TRUE" : "FALSE",
      order.payment_method ?? "",
      order.payment_method_other ?? "",
      order.created_at,
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((value) => csvEscape(value)).join(","))
      .join("\n");

    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

    link.href = url;
    link.download = `order-bundles-${filter}-${timestamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast(`Exported ${sorted.length} bundle${sorted.length === 1 ? "" : "s"}`, "success");
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

  const thBase = "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider";

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
          <button
            onClick={openPaymentRemindModal}
            className="px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2"
            style={{ background: "white", color: "var(--color-bark)", border: "1px solid var(--color-border)" }}
          >
            <BellIcon width={14} height={14} />
            Payment Reminder
          </button>
          <button
            onClick={openRemindModal}
            className="px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2"
            style={{ background: "var(--color-bark)", color: "var(--color-cream)", border: "1px solid var(--color-bark)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            Remind
          </button>
          <button
            onClick={() => setShowAddOrderChoiceModal(true)}
            className="px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2"
            style={{ background: "var(--color-forest)", color: "var(--color-cream)", border: "1px solid var(--color-forest)" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Order
          </button>
          <button
            onClick={() => { setShowBulkImportModal(true); setBulkImportRows([]); }}
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
          style={{ background: "white", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16" />
          </svg>
          Refresh
        </button>

        <button
          onClick={handleExportCsv}
          disabled={loading || sorted.length === 0}
          className="px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 w-full sm:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: "white", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12" />
            <path d="M7 10l5 5 5-5" />
            <path d="M4 21h16" />
          </svg>
          Export CSV
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
          <button
            onClick={() => setShowBulkConfirmModal(true)}
            disabled={bulkConfirming}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-60"
            style={{ background: "rgba(255,255,255,0.15)", color: "var(--color-cream)" }}
          >
            {bulkConfirming ? "Confirming..." : "Confirm Selected"}
          </button>
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
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "var(--color-cream)", borderBottom: "1px solid var(--color-border)" }}>
                  <th className="px-4 py-3 w-10">
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
                  <th className={thBase} style={{ color: "var(--color-muted)" }}>Contact</th>
                  <th className={thBase} style={{ color: "var(--color-muted)" }}>Items</th>
                  <th className={thBase} style={{ color: "var(--color-muted)" }}>Event</th>
                  <th className={thBase} style={{ color: "var(--color-muted)" }}>Location</th>
                  <th className={thBase} style={{ color: "var(--color-muted)" }}>
                    <button
                      onClick={() => toggleSort("timeslot")}
                      className="flex items-center gap-1 uppercase tracking-wider font-semibold hover:opacity-70 transition-opacity"
                    >
                      Time Slot <SortIcon active={sort.col === "timeslot"} dir={sort.dir} />
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
                  <th className={thBase} style={{ color: "var(--color-muted)" }}>Paid</th>
                  <th className={thBase} style={{ color: "var(--color-muted)" }}>Method</th>
                  <th className={thBase} style={{ color: "var(--color-muted)" }}>
                    <span className="flex items-center gap-1 uppercase tracking-wider font-semibold" title="Reminded">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                      </svg>
                    </span>
                  </th>
                  <th className={thBase} style={{ color: "var(--color-muted)" }}>
                    <button
                      onClick={() => toggleSort("date")}
                      className="flex items-center gap-1 uppercase tracking-wider font-semibold hover:opacity-70 transition-opacity"
                    >
                      Date <SortIcon active={sort.col === "date"} dir={sort.dir} />
                    </button>
                  </th>
                  <th className={thBase} style={{ color: "var(--color-muted)" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((order, idx) => {
                  const statusStyle = STATUS_STYLES[order.status] ?? STATUS_STYLES.pending;
                  const actionId = getOrderActionId(order);
                  const isConfirming = confirming === actionId;
                  const isUpdatingStatus = updatingStatus === actionId;
                  const isUpdatingPayment = updatingPayment === actionId;
                  const isDeleting = deleting === actionId;
                  const isSelected = selectedIds.has(order.id);
                  const paymentReminderDisabledReason = getPaymentReminderUnavailableReason(order);
                  const canSendPaymentReminder = !paymentReminderDisabledReason;
                  const paymentReminderTitle = order.paid
                    ? "Payment reminder is only available for unpaid orders"
                    : paymentReminderDisabledReason ?? "Send payment reminder";
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
                      <td className="px-4 py-3 w-10" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectOne(order.id)}
                          className="cursor-pointer"
                          aria-label={`Select order ${order.id}`}
                        />
                      </td>
                      <td className="px-4 py-3 font-medium" style={{ color: "var(--color-text)" }}>
                        {order.name}
                      </td>
                      <td className="px-4 py-3" style={{ color: "var(--color-muted)" }}>
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
                      <td className="px-4 py-3" style={{ color: "var(--color-text)" }}>
                        <div className="text-lg font-semibold" style={{ lineHeight: 1.1 }}>
                          {order.quantity_total}
                        </div>
                      </td>
                      <td className="px-4 py-3" style={{ color: "var(--color-text)" }}>
                        <span className="block" style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {eventLabelById.get(order.event_id) ?? `Event ${order.event_id}`}
                        </span>
                      </td>
                      <td className="px-4 py-3" style={{ color: "var(--color-text)" }}>
                        <div>{order.pickup_location}</div>
                        {order.pickup_address && (
                          <div className="text-xs" style={{ color: "var(--color-muted)" }}>
                            {order.pickup_address}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap" style={{ color: "var(--color-text)" }}>
                        {order.pickup_time_slot}
                      </td>
                      <td className="px-4 py-3 font-semibold" style={{ color: "var(--color-forest)" }}>
                        ${order.total_price.toFixed(2)}
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="relative inline-block">
                          <select
                            value={order.status}
                            disabled={isUpdatingStatus}
                            onChange={(e) => handleStatusChange(actionId, e.target.value)}
                            className="appearance-none pl-2.5 pr-6 py-1 rounded-full text-xs font-semibold border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--color-sage)] disabled:opacity-60 transition-opacity"
                            style={{ background: statusStyle.bg, color: statusStyle.color }}
                          >
                            {(ALLOWED_STATUS_TRANSITIONS[order.status] ?? Object.keys(STATUS_STYLES))
                              .filter((val) => STATUS_STYLES[val])
                              .map((val) => (
                                <option key={val} value={val}>
                                  {STATUS_STYLES[val].label}
                                </option>
                              ))}
                          </select>
                          <span className="pointer-events-none absolute inset-y-0 right-1.5 flex items-center" style={{ color: statusStyle.color }}>
                            <svg width="10" height="10" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <path d="M5 7.5L10 12.5L15 7.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          {!order.paid && (
                            <button
                              onClick={() => setPaymentReminderTarget(order)}
                              disabled={isUpdatingPayment || !canSendPaymentReminder}
                              className="w-8 h-8 flex items-center justify-center rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                              style={{
                                background: canSendPaymentReminder ? "var(--color-cream)" : "#f3f4f6",
                                color: canSendPaymentReminder ? "var(--color-bark)" : "#9ca3af",
                                border: "1px solid var(--color-border)",
                              }}
                              aria-label="Send payment reminder"
                              title={paymentReminderTitle}
                            >
                              <BellIcon width={15} height={15} />
                            </button>
                          )}
                          <span
                            className="text-[10px] py-0.5 rounded-full font-semibold text-center inline-block"
                            style={{
                              width: "3.5rem",
                              background: order.paid ? "var(--color-sage)" : "var(--color-cream)",
                              color: order.paid ? "white" : "var(--color-muted)",
                              border: "1px solid var(--color-border)",
                            }}
                          >
                            {order.paid ? "Paid" : "Unpaid"}
                          </span>

                          {order.paid ? (
                            <button
                              onClick={() => setUnpayTarget(order)}
                              disabled={isUpdatingPayment}
                              className="w-8 h-8 flex items-center justify-center rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                              style={{ background: "#dc2626", color: "white" }}
                              aria-label="Mark order unpaid"
                              title="Mark as unpaid"
                            >
                              <BanknoteIcon />
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setPaymentTarget(order);
                                setPaymentMethod("cash");
                                setPaymentMethodOther("");
                              }}
                              disabled={isUpdatingPayment || order.status === "pending"}
                              className="w-8 h-8 flex items-center justify-center rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                              style={{ background: "var(--color-sage)", color: "white" }}
                              aria-label="Mark order paid"
                              title={order.status === "pending" ? "Confirm order first" : "Mark as paid"}
                            >
                              <BanknoteIcon />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3" style={{ color: "var(--color-text)" }}>
                        {!order.paid ? (
                          <span style={{ color: "var(--color-muted)" }}>-</span>
                        ) : order.payment_method === "cash" ? (
                          "Cash"
                        ) : order.payment_method === "etransfer" ? (
                          "E-transfer"
                        ) : order.payment_method === "other" ? (
                          <div className="leading-tight">
                            <div>Other</div>
                            {order.payment_method_other && (
                              <div className="text-xs" style={{ color: "var(--color-muted)" }}>
                                {order.payment_method_other}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: "var(--color-muted)" }}>{order.payment_method ?? "-"}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center" title={order.reminded ? "Reminder sent" : "Not reminded"}>
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
                      <td className="px-4 py-3 whitespace-nowrap text-xs" style={{ color: "var(--color-muted)" }}>
                        {formatDate(order.created_at)}
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          {order.status === "pending" && (
                            <button
                              onClick={() => handleConfirm(actionId)}
                              disabled={isConfirming}
                              className="p-1.5 rounded-lg transition-all disabled:opacity-60"
                              style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}
                              aria-label={order.exclude_email ? "Confirm order without email" : "Send confirmation"}
                              title={order.exclude_email ? "Confirm order without email" : "Send confirmation"}
                            >
                              {isConfirming
                                ? (
                                  <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10" opacity="0.3" />
                                    <path d="M12 2a10 10 0 0 1 10 10" />
                                  </svg>
                                ) : order.exclude_email ? (
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M20 6L9 17l-5-5" />
                                  </svg>
                                ) : (
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M4 6h16v12H4z" />
                                    <path d="m4 7 8 6 8-6" />
                                  </svg>
                                )
                              }
                            </button>
                          )}
                          <button
                            onClick={() => setDeleteTarget(actionId)}
                            disabled={isDeleting}
                            className="p-1.5 rounded-lg transition-all disabled:opacity-60"
                            style={{ color: "#991b1b", background: "#fee2e2", border: "1px solid #fca5a5" }}
                            aria-label="Delete bundle"
                            title="Delete bundle"
                          >
                            {isDeleting ? (
                              <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" opacity="0.3" />
                                <path d="M12 2a10 10 0 0 1 10 10" />
                              </svg>
                            ) : (
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6l-1 14H6L5 6" />
                                <path d="M10 11v6M14 11v6" />
                                <path d="M9 6V4h6v2" />
                              </svg>
                            )}
                          </button>
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
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <select
                        value={selectedBundle.status}
                        disabled={updatingStatus === getOrderActionId(selectedBundle)}
                        onChange={(event) => {
                          void handleStatusChange(getOrderActionId(selectedBundle), event.target.value);
                        }}
                        className="appearance-none px-2.5 py-1.5 rounded-full text-xs font-semibold border-0"
                        style={{
                          background: (STATUS_STYLES[selectedBundle.status] ?? STATUS_STYLES.pending).bg,
                          color: (STATUS_STYLES[selectedBundle.status] ?? STATUS_STYLES.pending).color,
                        }}
                      >
                        {(ALLOWED_STATUS_TRANSITIONS[selectedBundle.status] ?? Object.keys(STATUS_STYLES))
                          .filter((value) => value in STATUS_STYLES && value !== "mixed")
                          .map((value) => (
                            <option key={value} value={value}>{STATUS_STYLES[value].label}</option>
                          ))}
                      </select>
                      <button
                        onClick={() => { void handleConfirm(getOrderActionId(selectedBundle)); }}
                        disabled={selectedBundle.status !== "pending" || confirming === getOrderActionId(selectedBundle)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-60"
                        style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}
                      >
                        {selectedBundle.exclude_email ? "Confirm (No Email)" : "Send Confirmation"}
                      </button>
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
                          onClick={() => {
                            setPaymentTarget(selectedBundle);
                            setPaymentMethod("cash");
                            setPaymentMethodOther("");
                          }}
                          disabled={selectedBundle.status === "pending"}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-60"
                          style={{ background: "var(--color-sage)", color: "white" }}
                        >
                          Mark Paid
                        </button>
                      )}
                    </div>
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
        title={`Confirm ${selectedIds.size} Bundle${selectedIds.size !== 1 ? "s" : ""}?`}
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
        Confirmation emails will be sent to {selectedIds.size} customer{selectedIds.size !== 1 ? "s" : ""} and their orders will be marked as confirmed (orders with Email Excluded will be confirmed without email).
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
            <button
              onClick={async () => {
                const target = paymentTarget;
                if (!target) return;
                if (target.status === "pending") {
                  showToast("Confirm the order before marking it paid", "error");
                  return;
                }
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
              disabled={!!paymentTarget && updatingPayment === getOrderActionId(paymentTarget)}
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

      <Modal
        isOpen={!!paymentReminderTarget}
        onClose={() => {
          if (paymentReminderLoading) return;
          setPaymentReminderTarget(null);
        }}
        title="Send Payment Reminder"
        actions={
          <>
            <button
              onClick={() => setPaymentReminderTarget(null)}
              disabled={paymentReminderLoading}
              className="px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-60"
              style={{ background: "var(--color-cream)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
            >
              Cancel
            </button>
            <button
              onClick={() => { void handleConfirmSinglePaymentReminder(); }}
              disabled={paymentReminderLoading}
              className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-60"
              style={{ background: "var(--color-bark)", color: "var(--color-cream)" }}
            >
              Send reminder
            </button>
          </>
        }
      >
        This will send an automated payment reminder email to {paymentReminderTarget?.name ?? "this customer"} for the selected unpaid order bundle. If payment has already been resolved, the email copy will instruct them to ignore it.
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
                      onClick={() => { void handleSendPaymentReminders(); }}
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
                      onClick={handleSendReminders}
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
    </div>
  );
}
