"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { API_URL, fetchEventConfig, EventConfig } from "@/config/event";
import { getAdminToken } from "@/lib/auth";
import { getApiErrorMessage } from "@/lib/apiError";
import Modal from "@/components/ui/Modal";
import SearchableSelect from "@/components/ui/SearchableSelect";

interface Order {
  id: string;
  event_id: number;
  name: string;
  email: string | null;
  phone_number: string | null;
  item_name: string;
  item_id: string;
  quantity: number;
  pickup_location: string;
  pickup_time_slot: string;
  total_price: number;
  status: string;
  notes?: string | null;
  exclude_email?: boolean;
  created_at: string;
}

interface AdminEvent {
  id: number;
  name: string;
  event_date: string;
  is_active: boolean;
}

type SortCol = "status" | "total" | "date" | "timeslot";

const PAGE_SIZE = 15;

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  pending:   { bg: "#fef3c7", color: "#92400e", label: "Pending" },
  confirmed: { bg: "#d1fae5", color: "#065f46", label: "Confirmed" },
  reminded:  { bg: "#fdf0e8", color: "#7a3f1e", label: "Reminded" },
  paid:      { bg: "#dbeafe", color: "#1e40af", label: "Paid" },
  picked_up: { bg: "#e0e7ff", color: "#3730a3", label: "Picked Up" },
  no_show:   { bg: "#fee2e2", color: "#991b1b", label: "No Show" },
  cancelled: { bg: "#f3f4f6", color: "#374151", label: "Cancelled" },
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

interface AddOrderForm {
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

const EMPTY_ADD_FORM: AddOrderForm = {
  name: "", email: "", phone_number: "",
  item_id: "", quantity: 1,
  pickup_location: "", pickup_time_slot: "",
  notes: "",
  exclude_email: false,
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
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [sort, setSort] = useState<{ col: SortCol | null; dir: "asc" | "desc" }>({ col: null, dir: "asc" });
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [eventConfig, setEventConfig] = useState<EventConfig | null>(null);
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [configUsesFallback, setConfigUsesFallback] = useState(false);

  // Single delete modal
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [showBulkConfirmModal, setShowBulkConfirmModal] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkConfirming, setBulkConfirming] = useState(false);

  // Add order modal
  const [showAddOrderModal, setShowAddOrderModal] = useState(false);
  const [addOrderForm, setAddOrderForm] = useState<AddOrderForm>(EMPTY_ADD_FORM);
  const [addingOrder, setAddingOrder] = useState(false);

  // Bulk import modal
  const [showBulkImportModal, setShowBulkImportModal] = useState(false);
  const [bulkImportRows, setBulkImportRows] = useState<BulkRow[]>([]);
  const [bulkImporting, setBulkImporting] = useState(false);

  // Remind modal
  const [showRemindModal, setShowRemindModal] = useState(false);
  const [remindSelections, setRemindSelections] = useState<Set<string>>(new Set());
  const [remindLoading, setRemindLoading] = useState(false);

  // Reset selection when filter/orders change
  useEffect(() => { setSelectedIds(new Set()); }, [filter, eventFilter, locationFilter, orders]);
  useEffect(() => { setPage(1); }, [eventFilter, locationFilter]);

  // Switching event should not keep a stale location selection
  useEffect(() => {
    setLocationFilter("all");
  }, [eventFilter]);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

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
  }, []);

  const activeEventId = useMemo(() => {
    const active = events.find((e) => e.is_active);
    return active ? active.id : null;
  }, [events]);

  const configEventId = useMemo(() => {
    if (eventFilter !== "all") {
      const parsed = parseInt(eventFilter, 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }
    return activeEventId;
  }, [eventFilter, activeEventId]);

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

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getAdminToken();
      if (!token) return;
      const qs = new URLSearchParams();
      if (filter !== "all") qs.set("status", filter);
      if (eventFilter !== "all") qs.set("event_id", eventFilter);
      const query = qs.toString();
      const res = await fetch(`${API_URL}/api/admin/orders${query ? `?${query}` : ""}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch orders");
      setOrders(await res.json());
      setPage(1);
    } catch {
      showToast("Failed to load orders", "error");
    } finally {
      setLoading(false);
    }
  }, [filter, eventFilter]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);
  useEffect(() => { setPage(1); }, [search]);

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
    () => confirmedOrders.filter((o) => !o.exclude_email && (o.email ?? "").trim().length > 0),
    [confirmedOrders]
  );
  const excludedReminderCount = confirmedOrders.length - eligibleReminderOrders.length;

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
      showToast("Status updated", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to update status", "error");
    } finally {
      setUpdatingStatus(null);
    }
  }

  async function executeDelete(orderId: string) {
    setDeleting(orderId);
    try {
      const token = await getAdminToken();
      if (!token) return;
      const res = await fetch(`${API_URL}/api/admin/orders/${orderId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, "Failed to delete order"));
      }
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
      showToast("Order deleted", "success");
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
      const results = await Promise.allSettled(
        ids.map(async (id) => {
          const res = await fetch(`${API_URL}/api/admin/orders/${id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          });
          return { id, ok: res.ok };
        })
      );
      const succeededIds = results.flatMap((result) =>
        result.status === "fulfilled" && result.value.ok ? [result.value.id] : []
      );
      const succeededSet = new Set(succeededIds);
      setOrders((prev) => prev.filter((o) => !succeededSet.has(o.id)));
      setSelectedIds(new Set());
      const failed = ids.length - succeededIds.length;
      if (failed > 0) {
        showToast(`Deleted ${succeededIds.length}, failed ${failed}`, "error");
      } else {
        showToast(`Deleted ${succeededIds.length} order${succeededIds.length !== 1 ? "s" : ""}`, "success");
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

  async function handleSendReminders() {
    const ids = Array.from(remindSelections);
    if (ids.length === 0) return;
    setRemindLoading(true);
    try {
      const token = await getAdminToken();
      if (!token) return;
      const res = await fetch(`${API_URL}/api/admin/orders/remind`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ order_ids: ids }),
      });
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, "Failed to send reminders"));
      }
      const data = await res.json();
      const skipped = (data.skipped_excluded ?? 0) + (data.skipped_missing_email ?? 0);
      if (data.failed_emails > 0) {
        showToast(
          `Sent ${data.reminded} reminder${data.reminded !== 1 ? "s" : ""}, skipped ${skipped}, failed ${data.failed_emails}`,
          "error"
        );
      } else {
        showToast(
          `Sent ${data.reminded} reminder${data.reminded !== 1 ? "s" : ""}${skipped > 0 ? `, skipped ${skipped}` : ""}`,
          "success"
        );
      }
      setShowRemindModal(false);
      await fetchOrders();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to send reminders", "error");
    } finally {
      setRemindLoading(false);
    }
  }

  async function handleAddOrder(e: React.FormEvent) {
    e.preventDefault();
    setAddingOrder(true);
    try {
      const token = await getAdminToken();
      if (!token) return;
      const res = await fetch(`${API_URL}/api/admin/orders`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          ...addOrderForm,
          event_id: configEventId,
        }),
      });
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, "Failed to create order"));
      }
      showToast("Order created successfully", "success");
      setShowAddOrderModal(false);
      setAddOrderForm(EMPTY_ADD_FORM);
      await fetchOrders();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to create order", "error");
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
      if (!row.phone_number) errors.push("phone is required");
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

  function handleExportCsv() {
    if (sorted.length === 0) {
      showToast("No orders to export", "error");
      return;
    }

    const headers = [
      "Order ID",
      "Name",
      "Email",
      "Phone",
      "Item",
      "Event",
      "Quantity",
      "Pickup Location",
      "Pickup Time Slot",
      "Total Price",
      "Status",
      "Created At",
    ];

    const rows = sorted.map((order) => [
      order.id,
      order.name,
      order.email ?? "",
      order.phone_number ?? "",
      order.item_name,
      eventLabelById.get(order.event_id) ?? `Event ${order.event_id}`,
      order.quantity,
      order.pickup_location,
      order.pickup_time_slot,
      order.total_price.toFixed(2),
      order.status,
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
    link.download = `orders-${filter}-${timestamp}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast(`Exported ${sorted.length} order${sorted.length === 1 ? "" : "s"}`, "success");
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
    if (!eventConfig || !addOrderForm.pickup_location) return [];
    const loc = eventConfig.locations.find((l) => l.name === addOrderForm.pickup_location);
    return loc?.timeSlots ?? [];
  }, [eventConfig, addOrderForm.pickup_location]);

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
            onClick={() => {
              setRemindSelections(new Set(eligibleReminderOrders.map((o) => o.id)));
              setShowRemindModal(true);
            }}
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
            onClick={() => { setShowAddOrderModal(true); setAddOrderForm(EMPTY_ADD_FORM); }}
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
        {(filter !== "all" || eventFilter !== "all" || locationFilter !== "all" || search) && (
          <button
            onClick={() => { setFilter("all"); setEventFilter("all"); setLocationFilter("all"); setSearch(""); }}
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
          onClick={fetchOrders}
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
            : `${filtered.length} order${filtered.length !== 1 ? "s" : ""}`}
          {totalPages > 1 && ` - page ${page} of ${totalPages}`}
        </p>
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-xl mb-3 text-sm font-medium"
          style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}
        >
          <span className="flex-1">{selectedIds.size} order{selectedIds.size !== 1 ? "s" : ""} selected</span>
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
              {search ? `No orders match "${search}".` : "No orders found."}
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
                  <th className={thBase} style={{ color: "var(--color-muted)" }}>Item</th>
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
                  const isConfirming = confirming === order.id;
                  const isUpdatingStatus = updatingStatus === order.id;
                  const isDeleting = deleting === order.id;
                  const isSelected = selectedIds.has(order.id);
                  return (
                    <tr
                      key={order.id}
                      onClick={() => router.push(`/admin/orders/${order.id}`)}
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
                          <span>{order.email ?? "-"}</span>
                          {order.exclude_email && (
                            <span
                              className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                              style={{ background: "#f3f4f6", color: "#374151", border: "1px solid var(--color-border)" }}
                            >
                              Email Excluded
                            </span>
                          )}
                        </div>
                        <div className="text-xs">{order.phone_number ?? "-"}</div>
                      </td>
                      <td className="px-4 py-3" style={{ color: "var(--color-text)" }}>
                        {order.item_name} x{order.quantity}
                      </td>
                      <td className="px-4 py-3" style={{ color: "var(--color-text)" }}>
                        <span className="block" style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {eventLabelById.get(order.event_id) ?? `Event ${order.event_id}`}
                        </span>
                      </td>
                      <td className="px-4 py-3" style={{ color: "var(--color-text)" }}>
                        {order.pickup_location}
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
                            onChange={(e) => handleStatusChange(order.id, e.target.value)}
                            className="appearance-none pl-2.5 pr-6 py-1 rounded-full text-xs font-semibold border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--color-sage)] disabled:opacity-60 transition-opacity"
                            style={{ background: statusStyle.bg, color: statusStyle.color }}
                          >
                            {Object.entries(STATUS_STYLES).map(([val, s]) => (
                              <option key={val} value={val}>{s.label}</option>
                            ))}
                          </select>
                          <span className="pointer-events-none absolute inset-y-0 right-1.5 flex items-center" style={{ color: statusStyle.color }}>
                            <svg width="10" height="10" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <path d="M5 7.5L10 12.5L15 7.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs" style={{ color: "var(--color-muted)" }}>
                        {formatDate(order.created_at)}
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          {order.status === "pending" && (
                            <button
                              onClick={() => handleConfirm(order.id)}
                              disabled={isConfirming}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-60 whitespace-nowrap"
                              style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}
                            >
                              {isConfirming
                                ? "Confirming..."
                                : (order.exclude_email ? "Confirm (No Email)" : "Send Confirmation")
                              }
                            </button>
                          )}
                          {order.status === "confirmed" && (
                            <button
                              onClick={() => handleStatusChange(order.id, "paid")}
                              disabled={isUpdatingStatus}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-60 whitespace-nowrap hover:opacity-90"
                              style={{ background: "var(--color-sage)", color: "white" }}
                              aria-label="Mark order paid"
                              title="Mark as paid"
                            >
                              {isUpdatingStatus ? "Paid..." : "Paid"}
                            </button>
                          )}
                          <button
                            onClick={() => setDeleteTarget(order.id)}
                            disabled={isDeleting}
                            className="p-1.5 rounded-lg transition-all disabled:opacity-60"
                            style={{ color: "#991b1b", background: "#fee2e2", border: "1px solid #fca5a5" }}
                            aria-label="Delete order"
                            title="Delete order"
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

      {/* Single delete modal */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Order"
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
        This order will be permanently deleted. This cannot be undone.
      </Modal>

      {/* Bulk delete modal */}
      <Modal
        isOpen={showBulkDeleteModal}
        onClose={() => setShowBulkDeleteModal(false)}
        title={`Delete ${selectedIds.size} Order${selectedIds.size !== 1 ? "s" : ""}?`}
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
        {selectedIds.size} order{selectedIds.size !== 1 ? "s" : ""} will be permanently deleted. This cannot be undone.
      </Modal>

      {/* Bulk confirm modal */}
      <Modal
        isOpen={showBulkConfirmModal}
        onClose={() => setShowBulkConfirmModal(false)}
        title={`Confirm ${selectedIds.size} Order${selectedIds.size !== 1 ? "s" : ""}?`}
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

      {/* Add Order Modal */}
        {showAddOrderModal && (
          <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setShowAddOrderModal(false); }}
        >
          <div
            style={{ background: "white", borderRadius: "24px", border: "1px solid var(--color-border)", maxWidth: "580px", width: "100%", padding: "32px", boxShadow: "0 20px 60px rgba(0,0,0,0.15)", maxHeight: "90vh", overflowY: "auto" }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold mb-5" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>
              Add Order
            </h2>
            {configEventLabel && (
              <p className="text-xs mb-4" style={{ color: "var(--color-muted)" }}>
                Creating for: {configEventLabel}{configUsesFallback ? " (using active config fallback)" : ""}
              </p>
            )}
            <form onSubmit={handleAddOrder} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
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
                  <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-muted)" }}>Phone</label>
                  <input
                    required={!addOrderForm.exclude_email}
                    type="tel"
                    value={addOrderForm.phone_number}
                    onChange={(e) => setAddOrderForm((f) => ({ ...f, phone_number: e.target.value }))}
                    placeholder="905-555-0123"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-muted)" }}>Quantity</label>
                  <input
                    required
                    type="number"
                    min={1}
                    value={addOrderForm.quantity}
                    onChange={(e) => setAddOrderForm((f) => ({ ...f, quantity: parseInt(e.target.value, 10) || 1 }))}
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
                <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-muted)" }}>Item</label>
                <div className="relative">
                  <select
                    required
                    value={addOrderForm.item_id}
                    onChange={(e) => setAddOrderForm((f) => ({ ...f, item_id: e.target.value }))}
                    style={{ ...inputStyle, paddingRight: "2rem" }}
                  >
                    <option value="">Select item...</option>
                    {eventConfig?.items.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                  <SelectChevron />
                </div>
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
                      {eventConfig?.locations.map((loc) => (
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
                  onClick={() => setShowAddOrderModal(false)}
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

      {/* Remind Modal */}
      {showRemindModal && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setShowRemindModal(false); }}
        >
          <div
            style={{ background: "white", borderRadius: "1.5rem", padding: "2rem", width: "100%", maxWidth: "540px", maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}
          >
            <h2 className="text-xl font-bold mb-1" style={{ color: "var(--color-bark)", fontFamily: "var(--font-serif)" }}>
              Send Pickup Reminders
            </h2>
            <p className="text-sm mb-5" style={{ color: "var(--color-muted)" }}>
              Reminder emails will be sent to all selected customers and their orders will be marked as Reminded. Orders with Email Excluded or missing email will be skipped.
            </p>

            {excludedReminderCount > 0 && (
              <div
                className="rounded-xl px-4 py-3 text-xs mb-4"
                style={{ background: "var(--color-cream)", border: "1px solid var(--color-border)", color: "var(--color-muted)" }}
              >
                {excludedReminderCount} confirmed order{excludedReminderCount !== 1 ? "s are" : " is"} not eligible for reminder emails and will be skipped.
              </div>
            )}

            {eligibleReminderOrders.length === 0 ? (
              <p className="text-sm py-6 text-center" style={{ color: "var(--color-muted)" }}>
                {confirmedOrders.length === 0
                  ? "No confirmed orders to remind."
                  : "No eligible confirmed orders to remind."}
              </p>
            ) : (
              <div style={{ overflowY: "auto", flex: 1, marginBottom: "1.25rem", border: "1px solid var(--color-border)", borderRadius: "0.75rem" }}>
                {eligibleReminderOrders.map((order) => (
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
                      <p className="text-xs" style={{ color: "var(--color-muted)", margin: "1px 0 0" }}>{order.pickup_location} - {order.pickup_time_slot}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
              <button
                onClick={() => setShowRemindModal(false)}
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
