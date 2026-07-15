"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/ui/Modal";
import { API_URL, fetchEventConfig, type EventConfig } from "@/config/event";
import { getAdminToken } from "@/lib/auth";
import { getApiErrorMessage } from "@/lib/apiError";
import { postAdminBulkBatches, removeSelectedIds, toggleSelectedId } from "@/lib/adminBulk";
import type { Customer } from "@/lib/customers";

const EVENT_REMINDER_SEND_INTERVAL_MS = 500;
const EVENT_REMINDER_RETRY_BACKOFF_MS = [1000, 2000];
const PAGE_SIZE = 10;

type QueueItemStatus = "queued" | "sending" | "retrying" | "sent" | "skipped" | "failed";
type QueueOutcome = "sent" | "skipped" | "retryable_failed" | "failed" | "unauthorized";

interface EventReminderResponse {
  status: string;
  message?: string;
}

interface EventReminderQueueItem {
  customerId: string;
  name: string;
  email: string;
  pickupLabel: string;
  status: QueueItemStatus;
  attempts: number;
  message: string;
  lastResultCode: string | null;
}

interface EventReminderRunState {
  items: EventReminderQueueItem[];
  total: number;
  completed: number;
  sent: number;
  skipped: number;
  failed: number;
  isRunning: boolean;
  isComplete: boolean;
  activeCustomerId: string | null;
}

const EMPTY_EVENT_REMINDER_RUN: EventReminderRunState = {
  items: [],
  total: 0,
  completed: 0,
  sent: 0,
  skipped: 0,
  failed: 0,
  isRunning: false,
  isComplete: false,
  activeCustomerId: null,
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function buildRunState(
  items: EventReminderQueueItem[],
  overrides: Partial<Pick<EventReminderRunState, "isRunning" | "isComplete" | "activeCustomerId">> = {}
): EventReminderRunState {
  const sent = items.filter((item) => item.status === "sent").length;
  const skipped = items.filter((item) => item.status === "skipped").length;
  const failed = items.filter((item) => item.status === "failed").length;
  const completed = sent + skipped + failed;

  return {
    items,
    total: items.length,
    completed,
    sent,
    skipped,
    failed,
    isRunning: overrides.isRunning ?? false,
    isComplete: overrides.isComplete ?? false,
    activeCustomerId: overrides.activeCustomerId ?? null,
  };
}

function getStatusBadge(item: EventReminderQueueItem): { label: string; bg: string; color: string; border: string } {
  switch (item.status) {
    case "sending":
      return { label: "Sending", bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" };
    case "retrying":
      return { label: "Retrying", bg: "#fffbeb", color: "#92400e", border: "#fcd34d" };
    case "sent":
      return { label: "Sent", bg: "#f0fdf4", color: "#166534", border: "#bbf7d0" };
    case "skipped":
      return { label: "Skipped", bg: "var(--color-cream)", color: "var(--color-muted)", border: "var(--color-border)" };
    case "failed":
      return { label: "Failed", bg: "#fff1f2", color: "#be123c", border: "#fecdd3" };
    default:
      return { label: "Queued", bg: "#f3f4f6", color: "#374151", border: "#d1d5db" };
  }
}

function EditIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

export default function AdminCustomersPage() {
  const router = useRouter();
  const headerCheckboxRef = useRef<HTMLInputElement | null>(null);
  const modalHeaderCheckboxRef = useRef<HTMLInputElement | null>(null);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeEventConfig, setActiveEventConfig] = useState<EventConfig | null>(null);
  const [activeEventLoading, setActiveEventLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [pickupLocation, setPickupLocation] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhoneNumber, setEditPhoneNumber] = useState("");
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [showEventReminderModal, setShowEventReminderModal] = useState(false);
  const [showEventReminderConfirm, setShowEventReminderConfirm] = useState(false);
  const [eventReminderSearch, setEventReminderSearch] = useState("");
  const [eventReminderPickupLocation, setEventReminderPickupLocation] = useState("all");
  const [eventReminderSelectedIds, setEventReminderSelectedIds] = useState<Set<string>>(new Set());
  const [eventReminderLocationIds, setEventReminderLocationIds] = useState<Set<string>>(new Set());
  const [eventReminderItemIds, setEventReminderItemIds] = useState<Set<string>>(new Set());
  const [eventReminderRun, setEventReminderRun] = useState<EventReminderRunState>(EMPTY_EVENT_REMINDER_RUN);

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const loadCustomers = useCallback(async () => {
    try {
      const token = await getAdminToken();
      if (!token) {
        router.push("/admin/login");
        return;
      }

      const res = await fetch(`${API_URL}/api/admin/customers`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) {
        router.push("/admin/login");
        return;
      }
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, "Failed to load customers"));
      }

      setCustomers(await res.json());
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed to load customers", "error");
    } finally {
      setLoading(false);
    }
  }, [router, showToast]);

  const loadActiveEventConfig = useCallback(async () => {
    try {
      const config = await fetchEventConfig();
      setActiveEventConfig(config);
    } catch (err: unknown) {
      setActiveEventConfig(null);
      showToast(err instanceof Error ? err.message : "Failed to load active event", "error");
    } finally {
      setActiveEventLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadCustomers();
    loadActiveEventConfig();
  }, [loadCustomers, loadActiveEventConfig]);

  const pickupLocationOptions = useMemo(() => {
    const values = new Set<string>();
    for (const customer of customers) {
      for (const location of customer.pickup_locations || []) {
        if (location?.trim()) values.add(location.trim());
      }
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [customers]);

  const filteredCustomers = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return customers.filter((customer) => {
      const matchesSearch = !normalizedSearch || [
        customer.name,
        customer.email,
        customer.phone_number ?? "",
        ...(customer.pickup_locations || []),
      ].some((value) => value.toLowerCase().includes(normalizedSearch));

      const matchesPickupLocation = pickupLocation === "all"
        || (customer.pickup_locations || []).includes(pickupLocation);

      return matchesSearch && matchesPickupLocation;
    });
  }, [customers, pickupLocation, search]);

  useEffect(() => {
    setPage(1);
  }, [pickupLocation, search]);

  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = filteredCustomers.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const pageEnd = filteredCustomers.length === 0 ? 0 : Math.min(currentPage * PAGE_SIZE, filteredCustomers.length);

  useEffect(() => {
    setPage((current) => {
      const next = Math.min(Math.max(current, 1), totalPages);
      return next;
    });
  }, [totalPages]);

  const visibleCustomers = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredCustomers.slice(start, start + PAGE_SIZE);
  }, [currentPage, filteredCustomers]);

  useEffect(() => {
    setSelectedIds((prev) => {
      const next = new Set<string>();
      const visibleIds = new Set(filteredCustomers.map((customer) => customer.id));
      for (const id of prev) {
        if (visibleIds.has(id)) next.add(id);
      }
      return next;
    });
  }, [filteredCustomers]);

  const allVisibleSelected = visibleCustomers.length > 0 && visibleCustomers.every((customer) => selectedIds.has(customer.id));
  const someVisibleSelected = visibleCustomers.some((customer) => selectedIds.has(customer.id));

  useEffect(() => {
    if (!headerCheckboxRef.current) return;
    headerCheckboxRef.current.indeterminate = !allVisibleSelected && someVisibleSelected;
  }, [allVisibleSelected, someVisibleSelected]);

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const customer of visibleCustomers) next.delete(customer.id);
      } else {
        for (const customer of visibleCustomers) next.add(customer.id);
      }
      return next;
    });
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => toggleSelectedId(prev, id));
  }

  async function handleBulkDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    setBulkDeleting(true);
    let deleted = 0;
    try {
      const token = await getAdminToken();
      if (!token) {
        router.push("/admin/login");
        return;
      }

      const result = await postAdminBulkBatches({
        ids,
        url: `${API_URL}/api/admin/customers/bulk-delete`,
        headers: { Authorization: `Bearer ${token}` },
        onUnauthorized: () => router.push("/admin/login"),
        getErrorMessage: (response) => getApiErrorMessage(response, "Failed to delete customers"),
      });
      const deletedSet = new Set(result.completedIds);
      setCustomers((prev) => prev.filter((customer) => !deletedSet.has(customer.id)));
      setSelectedIds((prev) => removeSelectedIds(prev, result.completedIds));
      deleted = result.completedIds.length;
      if (result.error) throw result.error;

      setShowBulkDeleteModal(false);
      showToast(`${ids.length} customer${ids.length === 1 ? "" : "s"} deleted`, "success");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to delete customers";
      showToast(deleted > 0 ? `Deleted ${deleted}; ${ids.length - deleted} failed. ${message}` : message, "error");
    } finally {
      setBulkDeleting(false);
    }
  }

  function openEditModal(customer: Customer) {
    setEditingCustomer(customer);
    setEditName(customer.name);
    setEditEmail(customer.email);
    setEditPhoneNumber(customer.phone_number ?? "");
    setEditError(null);
    setShowEditModal(true);
  }

  function resetEditModal() {
    setShowEditModal(false);
    setEditingCustomer(null);
    setEditName("");
    setEditEmail("");
    setEditPhoneNumber("");
    setEditError(null);
  }

  function closeEditModal() {
    if (savingCustomer) return;
    resetEditModal();
  }

  async function handleSaveCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingCustomer) return;

    const trimmedPhone = editPhoneNumber.trim();
    setSavingCustomer(true);
    setEditError(null);
    try {
      const token = await getAdminToken();
      if (!token) {
        router.push("/admin/login");
        return;
      }

      const res = await fetch(`${API_URL}/api/admin/customers/${editingCustomer.id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: editName,
          email: editEmail,
          phone_number: trimmedPhone ? trimmedPhone : null,
        }),
      });

      if (res.status === 401) {
        router.push("/admin/login");
        return;
      }
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, "Failed to update customer"));
      }

      const updatedCustomer = await res.json() as Customer;
      setCustomers((prev) => prev.map((customer) => (
        customer.id === updatedCustomer.id ? updatedCustomer : customer
      )));
      setSavingCustomer(false);
      resetEditModal();
      showToast("Customer updated", "success");
      void loadCustomers();
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : "Failed to update customer");
    } finally {
      setSavingCustomer(false);
    }
  }

  const activeEventLocations = activeEventConfig?.locations ?? [];
  const activeEventItems = activeEventConfig?.items ?? [];
  const activeEventDate = activeEventConfig?.event.date ?? "";
  const eventReminderLoading = eventReminderRun.isRunning;
  const eventReminderProgressPercent = eventReminderRun.total > 0
    ? Math.round((eventReminderRun.completed / eventReminderRun.total) * 100)
    : 0;

  const eventReminderDisabledReason = useMemo(() => {
    if (activeEventLoading) return "Loading the active event...";
    if (!activeEventConfig) return "No active event is live right now, so reminder emails are unavailable.";
    if (activeEventLocations.length === 0) return "The active event has no pickup locations configured.";
    if (activeEventItems.length === 0) return "The active event has no items configured.";
    return null;
  }, [activeEventConfig, activeEventItems.length, activeEventLoading, activeEventLocations.length]);

  const filteredEventReminderCustomers = useMemo(() => {
    const normalizedSearch = eventReminderSearch.trim().toLowerCase();

    return customers.filter((customer) => {
      const matchesSearch = !normalizedSearch || [
        customer.name,
        customer.email,
        customer.phone_number ?? "",
        ...(customer.pickup_locations || []),
      ].some((value) => value.toLowerCase().includes(normalizedSearch));

      const matchesPickupLocation = eventReminderPickupLocation === "all"
        || (customer.pickup_locations || []).includes(eventReminderPickupLocation);

      return matchesSearch && matchesPickupLocation;
    });
  }, [customers, eventReminderPickupLocation, eventReminderSearch]);

  const allVisibleEventReminderSelected = filteredEventReminderCustomers.length > 0
    && filteredEventReminderCustomers.every((customer) => eventReminderSelectedIds.has(customer.id));
  const someVisibleEventReminderSelected = filteredEventReminderCustomers.some((customer) => eventReminderSelectedIds.has(customer.id));

  useEffect(() => {
    if (!modalHeaderCheckboxRef.current) return;
    modalHeaderCheckboxRef.current.indeterminate = !allVisibleEventReminderSelected && someVisibleEventReminderSelected;
  }, [allVisibleEventReminderSelected, someVisibleEventReminderSelected]);

  function toggleEventReminderCustomer(id: string) {
    setEventReminderSelectedIds((prev) => toggleSelectedId(prev, id));
  }

  function selectAllVisibleEventReminderCustomers() {
    setEventReminderSelectedIds((prev) => {
      const next = new Set(prev);
      for (const customer of filteredEventReminderCustomers) next.add(customer.id);
      return next;
    });
  }

  function unselectAllVisibleEventReminderCustomers() {
    setEventReminderSelectedIds((prev) => {
      const next = new Set(prev);
      for (const customer of filteredEventReminderCustomers) next.delete(customer.id);
      return next;
    });
  }

  function closeEventReminderModal() {
    if (eventReminderLoading) return;
    setShowEventReminderModal(false);
    setEventReminderSearch("");
    setEventReminderPickupLocation("all");
    setEventReminderSelectedIds(new Set());
    setEventReminderLocationIds(new Set());
    setEventReminderItemIds(new Set());
    setEventReminderRun(EMPTY_EVENT_REMINDER_RUN);
  }

  function openEventReminderModal() {
    setEventReminderSearch("");
    setEventReminderPickupLocation("all");
    setEventReminderSelectedIds(selectedIds.size > 0 ? new Set(selectedIds) : new Set());
    setEventReminderLocationIds(new Set(activeEventLocations.map((location) => location.id)));
    setEventReminderItemIds(new Set(activeEventItems.map((item) => item.id)));
    setEventReminderRun(EMPTY_EVENT_REMINDER_RUN);
    setShowEventReminderModal(true);
  }

  function openEventReminderConfirm() {
    setShowEventReminderModal(false);
    setShowEventReminderConfirm(true);
  }

  function closeEventReminderConfirm() {
    if (eventReminderLoading) return;
    setShowEventReminderConfirm(false);
    setShowEventReminderModal(true);
  }

  function toggleLocationSelection(id: string) {
    setEventReminderLocationIds((prev) => toggleSelectedId(prev, id));
  }

  function toggleItemSelection(id: string) {
    setEventReminderItemIds((prev) => toggleSelectedId(prev, id));
  }

  function buildQueueItems(customerIds: string[]): EventReminderQueueItem[] {
    const customersById = new Map(customers.map((customer) => [customer.id, customer]));

    return customerIds.flatMap((customerId) => {
      const customer = customersById.get(customerId);
      if (!customer) return [];

      return [{
        customerId,
        name: customer.name,
        email: (customer.email ?? "").trim(),
        pickupLabel: (customer.pickup_locations || []).join(", ") || "No saved pickup locations",
        status: "queued",
        attempts: 0,
        message: "",
        lastResultCode: null,
      }];
    });
  }

  async function sendEventReminderAttempt(
    customerId: string,
    token: string
  ): Promise<{ outcome: QueueOutcome; message: string; resultCode: string | null }> {
    try {
      const res = await fetch(`${API_URL}/api/admin/customers/${customerId}/event-reminder`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          location_ids: Array.from(eventReminderLocationIds),
          item_ids: Array.from(eventReminderItemIds),
        }),
      });

      if (res.status === 401) {
        router.push("/admin/login");
        return {
          outcome: "unauthorized",
          message: "Admin session expired",
          resultCode: null,
        };
      }

      if (res.status === 404) {
        return {
          outcome: "failed",
          message: await getApiErrorMessage(res, "Customer not found"),
          resultCode: null,
        };
      }

      if (!res.ok) {
        const message = await getApiErrorMessage(res, "Failed to send event reminder");
        const retryable = res.status >= 500 || res.status === 429;
        return {
          outcome: retryable ? "retryable_failed" : "failed",
          message,
          resultCode: null,
        };
      }

      const data = await res.json() as EventReminderResponse;
      if (data.status === "sent") {
        return {
          outcome: "sent",
          message: data.message || "Event reminder sent",
          resultCode: data.status,
        };
      }
      if (data.status === "skipped_missing_email") {
        return {
          outcome: "skipped",
          message: data.message || "Customer is missing an email address",
          resultCode: data.status,
        };
      }
      if (data.status === "failed") {
        return {
          outcome: "retryable_failed",
          message: data.message || "Failed to send event reminder",
          resultCode: data.status,
        };
      }
      return {
        outcome: "skipped",
        message: data.message || "Event reminder skipped",
        resultCode: data.status,
      };
    } catch (err) {
      return {
        outcome: "retryable_failed",
        message: err instanceof Error ? err.message : "Failed to send event reminder",
        resultCode: null,
      };
    }
  }

  function buildSummary(runState: EventReminderRunState): { message: string; type: "success" | "error" } {
    let message = `Sent ${runState.sent} reminder${runState.sent !== 1 ? "s" : ""}`;
    if (runState.skipped > 0) message += `, skipped ${runState.skipped}`;
    if (runState.failed > 0) message += `, failed ${runState.failed}`;
    return {
      message,
      type: runState.failed > 0 ? "error" : "success",
    };
  }

  async function executeEventReminderQueue(itemsToTrack: EventReminderQueueItem[], customerIdsToProcess: string[]) {
    if (customerIdsToProcess.length === 0) return;

    const token = await getAdminToken();
    if (!token) {
      router.push("/admin/login");
      return;
    }

    let items = itemsToTrack.map((item) => ({ ...item }));
    setEventReminderRun(buildRunState(items, { isRunning: true, isComplete: false, activeCustomerId: null }));

    for (let customerIndex = 0; customerIndex < customerIdsToProcess.length; customerIndex += 1) {
      const customerId = customerIdsToProcess[customerIndex];
      const itemIndex = items.findIndex((item) => item.customerId === customerId);
      if (itemIndex < 0) continue;

      let itemCompleted = false;

      for (let attempt = 1; attempt <= 3; attempt += 1) {
        items = items.map((item, idx) => (idx === itemIndex
          ? { ...item, status: "sending", attempts: attempt, message: "" }
          : item
        ));
        setEventReminderRun(buildRunState(items, { isRunning: true, isComplete: false, activeCustomerId: customerId }));

        const result = await sendEventReminderAttempt(customerId, token);

        if (result.outcome === "sent") {
          items = items.map((item, idx) => (idx === itemIndex
            ? { ...item, status: "sent", message: result.message, lastResultCode: result.resultCode }
            : item
          ));
          setEventReminderRun(buildRunState(items, { isRunning: true, isComplete: false, activeCustomerId: null }));
          itemCompleted = true;
          break;
        }

        if (result.outcome === "skipped") {
          items = items.map((item, idx) => (idx === itemIndex
            ? { ...item, status: "skipped", message: result.message, lastResultCode: result.resultCode }
            : item
          ));
          setEventReminderRun(buildRunState(items, { isRunning: true, isComplete: false, activeCustomerId: null }));
          itemCompleted = true;
          break;
        }

        if (result.outcome === "failed") {
          items = items.map((item, idx) => (idx === itemIndex
            ? { ...item, status: "failed", message: result.message, lastResultCode: result.resultCode }
            : item
          ));
          setEventReminderRun(buildRunState(items, { isRunning: true, isComplete: false, activeCustomerId: null }));
          itemCompleted = true;
          break;
        }

        if (result.outcome === "unauthorized") {
          items = items.map((item, idx) => (idx === itemIndex
            ? { ...item, status: "failed", message: result.message, lastResultCode: result.resultCode }
            : item
          ));
          const stoppedRun = buildRunState(items, { isRunning: false, isComplete: true, activeCustomerId: null });
          setEventReminderRun(stoppedRun);
          showToast("Admin session expired. Reminder queue stopped.", "error");
          return;
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
          setEventReminderRun(buildRunState(items, { isRunning: true, isComplete: false, activeCustomerId: customerId }));
          await wait(Math.max(EVENT_REMINDER_SEND_INTERVAL_MS, EVENT_REMINDER_RETRY_BACKOFF_MS[attempt - 1]));
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
        setEventReminderRun(buildRunState(items, { isRunning: true, isComplete: false, activeCustomerId: null }));
        itemCompleted = true;
      }

      if (!itemCompleted) {
        items = items.map((item, idx) => (idx === itemIndex
          ? { ...item, status: "failed", message: "Send failed after 3 attempts" }
          : item
        ));
        setEventReminderRun(buildRunState(items, { isRunning: true, isComplete: false, activeCustomerId: null }));
      }

      if (customerIndex < customerIdsToProcess.length - 1) {
        await wait(EVENT_REMINDER_SEND_INTERVAL_MS);
      }
    }

    const completedRun = buildRunState(items, { isRunning: false, isComplete: true, activeCustomerId: null });
    setEventReminderRun(completedRun);
    const summary = buildSummary(completedRun);
    showToast(summary.message, summary.type);
  }

  async function handleSendEventReminders() {
    if (eventReminderLocationIds.size === 0 || eventReminderItemIds.size === 0) return;

    const customerIds = Array.from(eventReminderSelectedIds);
    if (customerIds.length === 0) return;

    const items = buildQueueItems(customerIds);
    if (items.length === 0) {
      showToast("No reminder recipients available", "error");
      return;
    }

    await executeEventReminderQueue(items, items.map((item) => item.customerId));
  }

  async function handleRetryFailedEventReminders() {
    if (eventReminderLoading) return;

    const retryCustomerIds = eventReminderRun.items
      .filter((item) => item.status === "failed")
      .map((item) => item.customerId);
    if (retryCustomerIds.length === 0) return;

    const nextItems = eventReminderRun.items.map((item) => (
      item.status === "failed"
        ? { ...item, status: "queued" as const, attempts: 0, message: "", lastResultCode: null }
        : { ...item }
    ));

    await executeEventReminderQueue(nextItems, retryCustomerIds);
  }

  const btnBase: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "9px 14px",
    borderRadius: 10,
    border: "1px solid var(--color-border)",
    background: "white",
    color: "var(--color-text)",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
  };

  const btnDanger: CSSProperties = {
    ...btnBase,
    background: "#fff1f2",
    border: "1px solid #fecdd3",
    color: "#be123c",
  };

  const btnPrimary: CSSProperties = {
    ...btnBase,
    background: "var(--color-forest)",
    color: "var(--color-cream)",
    border: "1px solid var(--color-forest)",
  };

  const btnIcon: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 34,
    height: 34,
    borderRadius: "999px",
    border: "1px solid #d8e7cc",
    background: "#f6faf2",
    color: "var(--color-forest)",
    cursor: "pointer",
  };

  const eventReminderActionDisabled = Boolean(
    eventReminderDisabledReason
    || eventReminderSelectedIds.size === 0
    || eventReminderLocationIds.size === 0
    || eventReminderItemIds.size === 0
  );

  const failedEventReminderItems = eventReminderRun.items.filter((item) => item.status === "failed");

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
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

      <div className="mb-8 flex flex-col gap-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1
              className="text-2xl font-bold mb-1"
              style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}
            >
              Customers
            </h1>
            <p className="text-sm" style={{ color: "var(--color-muted)" }}>
              Manage the saved customer contact list built from orders.
            </p>
            {eventReminderDisabledReason && (
              <p className="text-xs mt-2" style={{ color: "var(--color-muted)" }}>
                {eventReminderDisabledReason}
              </p>
            )}
          </div>

          <button
            onClick={openEventReminderModal}
            disabled={Boolean(eventReminderDisabledReason)}
            style={{ ...btnPrimary, opacity: eventReminderDisabledReason ? 0.6 : 1, cursor: eventReminderDisabledReason ? "not-allowed" : "pointer" }}
          >
            Event Reminder
          </button>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, phone, or pickup location"
            className="w-full lg:flex-1 px-4 py-3 rounded-xl text-sm border bg-white focus:outline-none focus:ring-2 transition-all border-[var(--color-border)] focus:ring-[var(--color-sage)] focus:border-[var(--color-sage)]"
          />

          <select
            value={pickupLocation}
            onChange={(e) => setPickupLocation(e.target.value)}
            className="w-full lg:w-64 px-4 py-3 rounded-xl text-sm border bg-white focus:outline-none focus:ring-2 transition-all border-[var(--color-border)] focus:ring-[var(--color-sage)] focus:border-[var(--color-sage)]"
          >
            <option value="all">All pickup locations</option>
            {pickupLocationOptions.map((location) => (
              <option key={location} value={location}>
                {location}
              </option>
            ))}
          </select>
        </div>
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
          <button onClick={openEventReminderModal} style={btnBase} disabled={Boolean(eventReminderDisabledReason)}>
            Event Reminder
          </button>
          <button onClick={() => setShowBulkDeleteModal(true)} style={btnDanger}>
            Delete selected
          </button>
          <button onClick={() => setSelectedIds(new Set())} style={{ ...btnBase, marginLeft: "auto" }}>
            Clear
          </button>
        </div>
      )}

      <p className="mb-3 text-xs" style={{ color: "var(--color-muted)" }}>
        Use the edit icon in the Actions column to update a customer&apos;s email or phone number.
      </p>

      <div
        style={{
          background: "white",
          border: "1px solid var(--color-border)",
          borderRadius: 20,
          overflow: "hidden",
        }}
      >
        {loading ? (
          <div className="flex justify-center py-16">
            <svg className="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" opacity="0.3" />
              <path d="M12 2a10 10 0 0 1 10 10" stroke="var(--color-sage)" />
            </svg>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center" }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: "var(--color-forest)", marginBottom: 4 }}>
              No customers found
            </p>
            <p style={{ fontSize: 13, color: "var(--color-muted)" }}>
              {search.trim() || pickupLocation !== "all"
                ? "No customers match the current filters."
                : "Customers will appear here as orders are placed and backfilled."}
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
                      checked={allVisibleSelected}
                      onChange={toggleSelectAll}
                      style={{ cursor: "pointer" }}
                    />
                  </th>
                  {["Name", "Email", "Phone", "Pickup Locations", "Created", "Updated"].map((label) => (
                    <th
                      key={label}
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
                        {label}
                      </th>
                  ))}
                  <th
                    style={{
                      textAlign: "center",
                      padding: "11px 16px",
                      fontSize: 11,
                      fontWeight: 600,
                      color: "var(--color-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.07em",
                      whiteSpace: "nowrap",
                      width: 92,
                    }}
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleCustomers.map((customer, idx) => (
                  <tr
                    key={customer.id}
                    style={{
                      borderBottom: idx < visibleCustomers.length - 1 ? "1px solid var(--color-border)" : "none",
                      background: "white",
                    }}
                  >
                    <td style={{ padding: "13px 12px 13px 16px", verticalAlign: "top" }}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(customer.id)}
                        onChange={() => toggleSelect(customer.id)}
                        style={{ cursor: "pointer" }}
                      />
                    </td>
                    <td style={{ padding: "13px 16px", verticalAlign: "top", color: "var(--color-text)" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <span style={{ fontWeight: 600 }}>{customer.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: "13px 16px", verticalAlign: "top", color: "var(--color-text)", whiteSpace: "nowrap" }}>
                      {customer.email}
                    </td>
                    <td style={{ padding: "13px 16px", verticalAlign: "top", color: "var(--color-text)", whiteSpace: "nowrap" }}>
                      {customer.phone_number || <span style={{ color: "var(--color-border)" }}>-</span>}
                    </td>
                    <td style={{ padding: "13px 16px", verticalAlign: "top" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {(customer.pickup_locations || []).length > 0 ? (
                          customer.pickup_locations.map((location) => (
                            <span
                              key={location}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                padding: "4px 9px",
                                borderRadius: 999,
                                fontSize: 12,
                                fontWeight: 600,
                                background: "#edf5e7",
                                color: "var(--color-forest)",
                                border: "1px solid #d8e7cc",
                              }}
                            >
                              {location}
                            </span>
                          ))
                        ) : (
                          <span style={{ color: "var(--color-border)" }}>-</span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: "13px 16px", verticalAlign: "top", color: "var(--color-muted)", whiteSpace: "nowrap" }}>
                      {formatDateTime(customer.created_at)}
                    </td>
                    <td style={{ padding: "13px 16px", verticalAlign: "top", color: "var(--color-muted)", whiteSpace: "nowrap" }}>
                      {formatDateTime(customer.updated_at)}
                    </td>
                    <td style={{ padding: "13px 16px", verticalAlign: "top", textAlign: "center" }}>
                      <button
                        type="button"
                        onClick={() => openEditModal(customer)}
                        aria-label={`Edit ${customer.name}`}
                        title={`Edit ${customer.name}`}
                        style={btnIcon}
                      >
                        <EditIcon />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {filteredCustomers.length > 0 && (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            Showing {pageStart}-{pageEnd} of {filteredCustomers.length}
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(current - 1, 1))}
              disabled={currentPage === 1}
              style={{
                ...btnBase,
                opacity: currentPage === 1 ? 0.55 : 1,
                cursor: currentPage === 1 ? "not-allowed" : "pointer",
              }}
            >
              Previous
            </button>
            <span className="text-sm font-medium" style={{ color: "var(--color-muted)" }}>
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(current + 1, totalPages))}
              disabled={currentPage === totalPages}
              style={{
                ...btnBase,
                opacity: currentPage === totalPages ? 0.55 : 1,
                cursor: currentPage === totalPages ? "not-allowed" : "pointer",
              }}
            >
              Next
            </button>
          </div>
        </div>
      )}

      <Modal
        isOpen={showBulkDeleteModal}
        onClose={() => !bulkDeleting && setShowBulkDeleteModal(false)}
        title={`Delete ${selectedIds.size} customer${selectedIds.size === 1 ? "" : "s"}`}
        variant="danger"
        actions={
          <>
            <button onClick={() => setShowBulkDeleteModal(false)} style={btnBase} disabled={bulkDeleting}>
              Cancel
            </button>
            <button onClick={handleBulkDelete} style={btnDanger} disabled={bulkDeleting}>
              {bulkDeleting ? "Deleting..." : "Delete all"}
            </button>
          </>
        }
      >
        {selectedIds.size} customer record{selectedIds.size === 1 ? "" : "s"} will be permanently deleted from the customer list. Orders will not be changed.
      </Modal>

      <Modal
        isOpen={showEditModal}
        onClose={closeEditModal}
        title={editingCustomer ? `Edit ${editingCustomer.name}` : "Edit customer"}
        size="lg"
        actions={
          <>
            <button onClick={closeEditModal} style={btnBase} disabled={savingCustomer}>
              Cancel
            </button>
            <button
              type="submit"
              form="admin-customer-edit-form"
              style={savingCustomer ? { ...btnPrimary, opacity: 0.6, cursor: "not-allowed" } : btnPrimary}
              disabled={savingCustomer}
            >
              {savingCustomer ? "Saving..." : "Save changes"}
            </button>
          </>
        }
      >
        <form id="admin-customer-edit-form" onSubmit={handleSaveCustomer}>
          <div className="grid gap-4">
            {editError && (
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: 12,
                  background: "#fff1f2",
                  border: "1px solid #fecdd3",
                  color: "#9f1239",
                  fontSize: 13,
                }}
              >
                {editError}
              </div>
            )}

            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--color-muted)" }}>
                Name
              </span>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-sm border bg-white focus:outline-none focus:ring-2 transition-all border-[var(--color-border)] focus:ring-[var(--color-sage)] focus:border-[var(--color-sage)]"
                placeholder="Customer name"
                disabled={savingCustomer}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--color-muted)" }}>
                Email
              </span>
              <input
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-sm border bg-white focus:outline-none focus:ring-2 transition-all border-[var(--color-border)] focus:ring-[var(--color-sage)] focus:border-[var(--color-sage)]"
                placeholder="customer@example.com"
                disabled={savingCustomer}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--color-muted)" }}>
                Phone number
              </span>
              <input
                type="tel"
                value={editPhoneNumber}
                onChange={(e) => setEditPhoneNumber(e.target.value)}
                className="w-full px-4 py-3 rounded-xl text-sm border bg-white focus:outline-none focus:ring-2 transition-all border-[var(--color-border)] focus:ring-[var(--color-sage)] focus:border-[var(--color-sage)]"
                placeholder="Optional"
                disabled={savingCustomer}
              />
            </label>

            <div className="grid gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--color-muted)" }}>
                Pickup locations
              </span>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "1px solid var(--color-border)",
                  background: "var(--color-cream)",
                }}
              >
                {editingCustomer && (editingCustomer.pickup_locations || []).length > 0 ? (
                  editingCustomer.pickup_locations.map((location) => (
                    <span
                      key={location}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "4px 10px",
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 600,
                        background: "#edf5e7",
                        color: "var(--color-forest)",
                        border: "1px solid #d8e7cc",
                      }}
                    >
                      {location}
                    </span>
                  ))
                ) : (
                  <span style={{ color: "var(--color-muted)", fontSize: 13 }}>No saved pickup locations</span>
                )}
              </div>
            </div>

            <p className="text-xs" style={{ color: "var(--color-muted)" }}>
              Pickup locations come from orders and are read-only here.
            </p>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={showEventReminderModal}
        onClose={closeEventReminderModal}
        title="Event Reminder"
        size="xl"
        actions={
          eventReminderRun.total > 0 ? (
            <>
              {failedEventReminderItems.length > 0 && (
                <button
                  onClick={handleRetryFailedEventReminders}
                  disabled={eventReminderLoading}
                  style={btnBase}
                >
                  Retry Failed ({failedEventReminderItems.length})
                </button>
              )}
              <button
                onClick={closeEventReminderModal}
                disabled={eventReminderLoading}
                style={eventReminderLoading ? { ...btnPrimary, opacity: 0.6, cursor: "not-allowed" } : btnPrimary}
              >
                {eventReminderLoading ? "Sending..." : "Done"}
              </button>
            </>
          ) : (
            <>
              <button onClick={closeEventReminderModal} style={btnBase}>
                Cancel
              </button>
              <button
                onClick={openEventReminderConfirm}
                disabled={eventReminderActionDisabled || eventReminderLoading}
                style={eventReminderActionDisabled || eventReminderLoading
                  ? { ...btnPrimary, opacity: 0.6, cursor: "not-allowed" }
                  : btnPrimary}
              >
                {eventReminderLoading
                  ? "Sending..."
                  : `Send Reminder${eventReminderSelectedIds.size !== 1 ? "s" : ""} (${eventReminderSelectedIds.size})`}
              </button>
            </>
          )
        }
      >
        {eventReminderRun.total > 0 ? (
          <div>
            <p className="text-sm mb-4" style={{ color: "var(--color-muted)" }}>
              Progress updates appear here while reminder emails are sent one at a time through Resend at a maximum rate of two emails per second.
            </p>

            <div
              className="rounded-2xl p-4 mb-4"
              style={{ background: "var(--color-cream)", border: "1px solid var(--color-border)" }}
            >
              <div className="flex items-center justify-between gap-3 mb-3">
                <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                  {eventReminderRun.completed} of {eventReminderRun.total} processed
                </p>
                <span className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>
                  {eventReminderProgressPercent}% complete
                </span>
              </div>
              <div
                style={{
                  width: "100%",
                  height: "12px",
                  borderRadius: "999px",
                  background: "white",
                  border: "1px solid var(--color-border)",
                  overflow: "hidden",
                  marginBottom: "0.875rem",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${eventReminderProgressPercent}%`,
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
                  <p className="text-sm font-semibold" style={{ color: "var(--color-text)", margin: "0.2rem 0 0" }}>{eventReminderRun.sent}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase font-semibold" style={{ color: "var(--color-muted)", margin: 0 }}>Failed</p>
                  <p className="text-sm font-semibold" style={{ color: "var(--color-text)", margin: "0.2rem 0 0" }}>{eventReminderRun.failed}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase font-semibold" style={{ color: "var(--color-muted)", margin: 0 }}>Skipped</p>
                  <p className="text-sm font-semibold" style={{ color: "var(--color-text)", margin: "0.2rem 0 0" }}>{eventReminderRun.skipped}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase font-semibold" style={{ color: "var(--color-muted)", margin: 0 }}>Remaining</p>
                  <p className="text-sm font-semibold" style={{ color: "var(--color-text)", margin: "0.2rem 0 0" }}>{Math.max(eventReminderRun.total - eventReminderRun.completed, 0)}</p>
                </div>
              </div>
            </div>

            <p className="text-xs mb-3" style={{ color: "var(--color-muted)" }}>
              Please keep this window open until sending finishes.
            </p>

            <div
              style={{
                overflowY: "auto",
                maxHeight: "340px",
                border: "1px solid var(--color-border)",
                borderRadius: "0.75rem",
              }}
            >
              {eventReminderRun.items.map((item, idx) => {
                const badge = getStatusBadge(item);
                return (
                  <div
                    key={item.customerId}
                    style={{
                      padding: "0.875rem 1rem",
                      borderBottom: idx === eventReminderRun.items.length - 1 ? "none" : "1px solid var(--color-border)",
                      background: item.customerId === eventReminderRun.activeCustomerId ? "var(--color-cream)" : "white",
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
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.9fr)]">
            <div style={{ minWidth: 0 }}>
              <p className="text-sm mb-4" style={{ color: "var(--color-muted)" }}>
                Select customers, filter by pickup location, and send a friendly reminder about the current live event. Emails are sent one at a time through Resend, with a 500ms minimum delay between send attempts.
              </p>

              <div className="relative mb-3">
                <svg
                  width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  style={{ position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
                <input
                  type="text"
                  placeholder="Search customers by name, email, phone, or pickup location..."
                  value={eventReminderSearch}
                  onChange={(e) => setEventReminderSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl text-sm"
                  style={{ border: "1px solid var(--color-border)", background: "var(--color-cream)", color: "var(--color-text)", outline: "none" }}
                />
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3">
                <select
                  value={eventReminderPickupLocation}
                  onChange={(e) => setEventReminderPickupLocation(e.target.value)}
                  className="w-full sm:w-64 px-3 py-2 rounded-xl text-sm border bg-white focus:outline-none focus:ring-2 transition-all border-[var(--color-border)] focus:ring-[var(--color-sage)] focus:border-[var(--color-sage)]"
                >
                  <option value="all">All pickup locations</option>
                  {pickupLocationOptions.map((location) => (
                    <option key={location} value={location}>
                      {location}
                    </option>
                  ))}
                </select>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                    {filteredEventReminderCustomers.length} shown · {eventReminderSelectedIds.size} selected
                  </span>
                  <button onClick={selectAllVisibleEventReminderCustomers} style={btnBase}>
                    Select all shown
                  </button>
                  <button onClick={unselectAllVisibleEventReminderCustomers} style={btnBase}>
                    Unselect all shown
                  </button>
                </div>
              </div>

              <div style={{ overflowY: "auto", maxHeight: "340px", border: "1px solid var(--color-border)", borderRadius: "0.75rem" }}>
                {filteredEventReminderCustomers.length === 0 ? (
                  <p className="text-sm py-8 text-center" style={{ color: "var(--color-muted)" }}>
                    No customers match the current filters.
                  </p>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-cream)" }}>
                        <th style={{ padding: "11px 12px 11px 16px", width: 36 }}>
                          <input
                            ref={modalHeaderCheckboxRef}
                            type="checkbox"
                            checked={allVisibleEventReminderSelected}
                            onChange={() => {
                              if (allVisibleEventReminderSelected) unselectAllVisibleEventReminderCustomers();
                              else selectAllVisibleEventReminderCustomers();
                            }}
                            style={{ cursor: "pointer" }}
                          />
                        </th>
                        <th style={{ textAlign: "left", padding: "11px 16px", fontSize: 11, fontWeight: 600, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                          Customer
                        </th>
                        <th style={{ textAlign: "left", padding: "11px 16px", fontSize: 11, fontWeight: 600, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                          Pickup Locations
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEventReminderCustomers.map((customer, idx) => (
                        <tr key={customer.id} style={{ borderBottom: idx < filteredEventReminderCustomers.length - 1 ? "1px solid var(--color-border)" : "none" }}>
                          <td style={{ padding: "13px 12px 13px 16px", verticalAlign: "top" }}>
                            <input
                              type="checkbox"
                              checked={eventReminderSelectedIds.has(customer.id)}
                              onChange={() => toggleEventReminderCustomer(customer.id)}
                              style={{ cursor: "pointer" }}
                            />
                          </td>
                          <td style={{ padding: "13px 16px", verticalAlign: "top" }}>
                            <p style={{ margin: 0, fontWeight: 600, color: "var(--color-text)" }}>{customer.name}</p>
                            <p style={{ margin: "3px 0 0", color: "var(--color-muted)", fontSize: 12 }}>{customer.email}</p>
                            {customer.phone_number && (
                              <p style={{ margin: "2px 0 0", color: "var(--color-muted)", fontSize: 12 }}>{customer.phone_number}</p>
                            )}
                          </td>
                          <td style={{ padding: "13px 16px", verticalAlign: "top" }}>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                              {(customer.pickup_locations || []).length > 0 ? (
                                customer.pickup_locations.map((location) => (
                                  <span
                                    key={`${customer.id}-${location}`}
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      padding: "4px 9px",
                                      borderRadius: 999,
                                      fontSize: 12,
                                      fontWeight: 600,
                                      background: "#edf5e7",
                                      color: "var(--color-forest)",
                                      border: "1px solid #d8e7cc",
                                    }}
                                  >
                                    {location}
                                  </span>
                                ))
                              ) : (
                                <span style={{ color: "var(--color-border)" }}>-</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div style={{ minWidth: 0 }}>
              <div
                className="rounded-2xl p-4 mb-4"
                style={{ background: "var(--color-cream)", border: "1px solid var(--color-border)" }}
              >
                <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--color-muted)" }}>
                  Campaign Details
                </p>
                {eventReminderDisabledReason ? (
                  <p className="text-sm" style={{ color: "var(--color-muted)" }}>
                    {eventReminderDisabledReason}
                  </p>
                ) : (
                  <>
                    <div style={{ marginBottom: 14 }}>
                      <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--color-muted)" }}>
                        Event Date
                      </p>
                      <p className="text-sm font-semibold" style={{ color: "var(--color-text)", margin: 0 }}>{activeEventDate}</p>
                    </div>

                    <div style={{ marginBottom: 14 }}>
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-muted)", margin: 0 }}>
                          Pickup Locations
                        </p>
                        <span className="text-xs" style={{ color: "var(--color-muted)" }}>{eventReminderLocationIds.size} selected</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 150, overflowY: "auto" }}>
                        {activeEventLocations.map((location) => (
                          <label
                            key={location.id}
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              gap: 10,
                              padding: "10px 12px",
                              borderRadius: 12,
                              background: "white",
                              border: "1px solid var(--color-border)",
                              cursor: "pointer",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={eventReminderLocationIds.has(location.id)}
                              onChange={() => toggleLocationSelection(location.id)}
                              style={{ marginTop: 2 }}
                            />
                            <div>
                              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--color-text)" }}>{location.name}</p>
                              {location.address && (
                                <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--color-muted)" }}>{location.address}</p>
                              )}
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-muted)", margin: 0 }}>
                          Featured Items
                        </p>
                        <span className="text-xs" style={{ color: "var(--color-muted)" }}>{eventReminderItemIds.size} selected</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 180, overflowY: "auto" }}>
                        {activeEventItems.map((item) => (
                          <label
                            key={item.id}
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              gap: 10,
                              padding: "10px 12px",
                              borderRadius: 12,
                              background: "white",
                              border: "1px solid var(--color-border)",
                              cursor: "pointer",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={eventReminderItemIds.has(item.id)}
                              onChange={() => toggleItemSelection(item.id)}
                              style={{ marginTop: 2 }}
                            />
                            <div>
                              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--color-text)" }}>{item.name}</p>
                              {item.description && (
                                <p style={{ margin: "3px 0 0", fontSize: 12, color: "var(--color-muted)" }}>{item.description}</p>
                              )}
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div
                className="rounded-2xl p-4"
                style={{ background: "white", border: "1px solid var(--color-border)" }}
              >
                <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--color-muted)" }}>
                  Email Summary
                </p>
                <p className="text-sm" style={{ color: "var(--color-muted)", marginBottom: 10 }}>
                  Customers will receive a friendly reminder about the live event, a direct link to order, and a feedback button for customers who cannot make this batch.
                </p>
                <ul style={{ margin: 0, paddingLeft: 18, color: "var(--color-muted)", fontSize: 13, lineHeight: 1.7 }}>
                  <li>Event date: {activeEventDate || "Not available"}</li>
                  <li>Selected customers: {eventReminderSelectedIds.size}</li>
                  <li>Selected pickup locations: {eventReminderLocationIds.size}</li>
                  <li>Selected items: {eventReminderItemIds.size}</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Event Reminder Confirmation Modal */}
      <Modal
        isOpen={showEventReminderConfirm}
        onClose={closeEventReminderConfirm}
        title="Send Event Reminders"
        actions={
          <>
            <button
              onClick={closeEventReminderConfirm}
              style={btnBase}
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                setShowEventReminderConfirm(false);
                setShowEventReminderModal(true);
                await handleSendEventReminders();
              }}
              disabled={eventReminderLoading}
              style={eventReminderLoading ? { ...btnPrimary, opacity: 0.6, cursor: "not-allowed" } : btnPrimary}
            >
              Send {eventReminderSelectedIds.size} Reminder{eventReminderSelectedIds.size !== 1 ? "s" : ""}
            </button>
          </>
        }
      >
        <p style={{ color: "var(--color-muted)" }}>
          Send event reminder emails to <span className="font-semibold" style={{ color: "var(--color-text)" }}>{eventReminderSelectedIds.size} customer{eventReminderSelectedIds.size !== 1 ? "s" : ""}</span>?
        </p>
      </Modal>
    </div>
  );
}
