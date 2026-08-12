"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import { Check, FunnelSimple, PencilSimple, Trash } from "@phosphor-icons/react";
import { API_URL, CURRENCY } from "@/config/event";
import { getAdminToken } from "@/lib/auth";
import Modal from "@/components/ui/Modal";
import AdminToast from "@/components/admin/AdminToast";
import { useAdminToast } from "@/hooks/useAdminToast";
import { loadAdminResource } from "@/lib/adminCrud";
import { getApiErrorMessage } from "@/lib/apiError";

interface ComboDeal {
  id: string;
  name: string;
}

interface EventItem {
  id: number;
  name: string;
  event_date: string;
  kind?: string;
  is_active: boolean;
  item_ids: string[];
  location_ids: string[];
  combo_deals: ComboDeal[];
  updated_at: string | null;
  total_revenue?: number;
  order_count?: number;
  etransfer_enabled: boolean;
  etransfer_email: string | null;
}

interface PendingToggle {
  eventId: number;
  eventName: string;
  willActivate: boolean;
}

interface RandomConfigForm {
  etransfer_enabled: boolean;
  etransfer_email: string;
}

interface DuplicateEventForm {
  name: string;
  event_date: string;
}

const PAGE_SIZE = 10;

function Spinner() {
  return (
    <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" opacity="0.3" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="var(--color-sage)" />
    </svg>
  );
}

function EventToggle({ event, activating, onToggle }: { event: EventItem; activating: boolean; onToggle: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={event.is_active}
      aria-label={event.is_active ? "Deactivate event" : "Activate event"}
      onClick={onToggle}
      disabled={activating}
      title={event.is_active ? "Deactivate event" : "Activate event"}
      className="relative h-9 w-[76px] shrink-0 rounded-xl transition-[background-color,border-color,opacity] active:scale-[0.97] disabled:cursor-not-allowed"
      style={{
        background: event.is_active ? "var(--color-forest)" : "var(--color-cream-dark)",
        border: `1px solid ${event.is_active ? "var(--color-forest)" : "var(--color-border)"}`,
        opacity: activating ? 0.55 : 1,
      }}
    >
      <span
        className="absolute top-1 h-7 w-7 rounded-lg transition-[left] duration-200"
        style={{
          left: event.is_active ? "43px" : "4px",
          background: "white",
          boxShadow: "0 1px 3px rgba(0,0,0,0.18)",
        }}
      />
      <span
        className="absolute top-1/2 -translate-y-1/2 text-[11px] font-bold leading-none"
        style={{
          left: event.is_active ? "10px" : undefined,
          right: event.is_active ? undefined : "11px",
          color: event.is_active ? "var(--color-cream)" : "var(--color-muted)",
        }}
      >
        {activating ? "..." : event.is_active ? "Live" : "Off"}
      </span>
    </button>
  );
}

function EventControls({
  event,
  deleting,
  activating,
  onEdit,
  onDuplicate,
  onConfigure,
  onDelete,
  onToggle,
}: {
  event: EventItem;
  deleting: boolean;
  activating: boolean;
  onEdit: () => void;
  onDuplicate: () => void;
  onConfigure: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const systemEvent = event.kind === "random_requests";
  const deleteUnavailableReason = systemEvent
    ? "System events cannot be deleted"
    : "Deactivate this event before deleting it";
  return (
    <div className="grid w-full grid-cols-[40px_88px_40px_76px] items-center justify-end gap-2 self-stretch sm:w-[268px] sm:shrink-0 sm:self-auto" onClick={(clickEvent) => clickEvent.stopPropagation()}>
      <button
        type="button"
        onClick={systemEvent ? onConfigure : onEdit}
        className="interactive-secondary flex h-9 w-10 items-center justify-center rounded-xl"
        style={{ border: "1px solid var(--color-border)", color: "var(--color-text)", background: "white" }}
        aria-label={systemEvent ? "Edit system settings" : `Edit ${event.name}`}
        title={systemEvent ? "Edit system settings" : "Edit event"}
      >
        <PencilSimple size={16} weight="bold" />
      </button>
      {systemEvent ? (
        <button type="button" disabled aria-label="Duplicate unavailable for system events" title="System events cannot be duplicated" className="flex h-9 w-full items-center justify-center rounded-xl text-xs font-medium" style={{ color: "var(--color-muted)", background: "var(--color-cream)", opacity: 0.48 }}>
          Duplicate
        </button>
      ) : (
        <button type="button" onClick={onDuplicate} className="interactive-secondary flex h-9 w-full items-center justify-center rounded-xl text-xs font-medium" style={{ color: "var(--color-forest)", background: "var(--color-cream)" }}>
          Duplicate
        </button>
      )}
      {!event.is_active && !systemEvent ? (
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          className="interactive-danger flex h-9 w-10 items-center justify-center rounded-xl disabled:opacity-60"
          style={{ background: "var(--color-error-bg)", color: "var(--color-error-text)" }}
          aria-label={`Delete ${event.name}`}
          title="Delete event"
        >
          {deleting ? "..." : <Trash size={16} weight="bold" />}
        </button>
      ) : (
        <button type="button" disabled aria-label={deleteUnavailableReason} title={deleteUnavailableReason} className="flex h-9 w-10 items-center justify-center rounded-xl" style={{ color: "var(--color-muted)", background: "var(--color-cream)", opacity: 0.48 }}>
          <Trash size={16} weight="bold" />
        </button>
      )}
      {systemEvent ? (
        <button type="button" disabled aria-label="Live status unavailable for system events" title="System events are always available" className="h-9 w-[76px] rounded-xl text-[11px] font-semibold" style={{ color: "var(--color-muted)", background: "var(--color-cream-dark)", border: "1px solid var(--color-border)", opacity: 0.62 }}>
          System
        </button>
      ) : <EventToggle event={event} activating={activating} onToggle={onToggle} />}
    </div>
  );
}

function EventRow({
  event,
  deleting,
  activating,
  onOpen,
  onEdit,
  onDuplicate,
  onConfigure,
  onDelete,
  onToggle,
}: {
  event: EventItem;
  deleting: boolean;
  activating: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onConfigure: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const systemEvent = event.kind === "random_requests";
  const revenue = new Intl.NumberFormat("en-CA", { style: "currency", currency: CURRENCY, maximumFractionDigits: 0 }).format(event.total_revenue ?? 0);
  return (
    <div className="rounded-2xl cursor-pointer transition-all hover:shadow-sm" style={{ background: "white", border: "1px solid var(--color-border)" }} onClick={onOpen}>
      <div className="grid gap-4 px-5 py-4 md:grid-cols-[minmax(0,1fr)_96px_72px_268px] md:items-center">
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold truncate" style={{ color: "var(--color-forest)" }}>{event.name}</h2>
            <span className="shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold" style={event.is_active ? { background: "var(--color-success-bg)", color: "var(--color-success-text)" } : { background: "var(--color-cream)", color: "var(--color-muted)" }}>
              {event.is_active ? "ACTIVE" : "INACTIVE"}
            </span>
            {systemEvent && <span className="shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: "var(--color-success-bg)", color: "var(--color-forest)" }}>SYSTEM</span>}
          </div>
          <span className="text-xs" style={{ color: "var(--color-muted)" }}>{event.event_date}</span>
          <span className="text-xs" style={{ color: "var(--color-muted)" }}>{event.combo_deals.length} combo{event.combo_deals.length === 1 ? "" : "s"} configured</span>
        </div>
        <div className="hidden md:block"><p className="text-sm font-bold leading-tight tabular-nums" style={{ color: "var(--color-forest)" }}>{revenue}</p><p className="text-xs leading-tight" style={{ color: "var(--color-muted)" }}>revenue</p></div>
        <div className="hidden md:block"><p className="text-sm font-bold leading-tight tabular-nums" style={{ color: "var(--color-forest)" }}>{event.order_count ?? 0}</p><p className="text-xs leading-tight" style={{ color: "var(--color-muted)" }}>orders</p></div>
        <EventControls event={event} deleting={deleting} activating={activating} onEdit={onEdit} onDuplicate={onDuplicate} onConfigure={onConfigure} onDelete={onDelete} onToggle={onToggle} />
      </div>
    </div>
  );
}

function EventList({
  events,
  filteredEvents,
  pagedEvents,
  deleting,
  activating,
  onOpen,
  onEdit,
  onDuplicate,
  onConfigure,
  onDelete,
  onToggle,
}: {
  events: EventItem[];
  filteredEvents: EventItem[];
  pagedEvents: EventItem[];
  deleting: number | null;
  activating: number | null;
  onOpen: (event: EventItem) => void;
  onEdit: (event: EventItem) => void;
  onDuplicate: (event: EventItem) => void;
  onConfigure: (event: EventItem) => void;
  onDelete: (event: EventItem) => void;
  onToggle: (event: EventItem) => void;
}) {
  if (filteredEvents.length === 0) {
    return (
      <div className="rounded-2xl p-12 text-center" style={{ background: "white", border: "1px solid var(--color-border)" }}>
        <p className="text-sm" style={{ color: "var(--color-muted)" }}>
          {events.length === 0 ? "No events yet. Create one to get started." : "No events match your search."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {pagedEvents.map((event) => (
        <EventRow
          key={event.id}
          event={event}
          deleting={deleting === event.id}
          activating={activating === event.id}
          onOpen={() => onOpen(event)}
          onEdit={() => onEdit(event)}
          onDuplicate={() => onDuplicate(event)}
          onConfigure={() => onConfigure(event)}
          onDelete={() => onDelete(event)}
          onToggle={() => onToggle(event)}
        />
      ))}
    </div>
  );
}

function EventPagination({
  currentPage,
  totalPages,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-center gap-3">
      <button
        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        disabled={currentPage === 1}
        className="px-4 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-40"
        style={{ border: "1px solid var(--color-border)", color: "var(--color-text)", background: "white" }}
      >
        Prev
      </button>
      <span className="text-sm" style={{ color: "var(--color-muted)" }}>
        Page {currentPage} of {totalPages}
      </span>
      <button
        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        disabled={currentPage === totalPages}
        className="px-4 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-40"
        style={{ border: "1px solid var(--color-border)", color: "var(--color-text)", background: "white" }}
      >
        Next
      </button>
    </div>
  );
}

function EventToggleConfirmation({
  pendingToggle,
  activating,
  onCancel,
  onConfirm,
}: {
  pendingToggle: PendingToggle | null;
  activating: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!pendingToggle) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="w-full max-w-sm rounded-3xl shadow-2xl p-8" style={{ background: "white" }}>
        <h3 style={{ fontFamily: "var(--font-serif)", color: "var(--color-forest)", fontSize: "1.15rem", fontWeight: 700, marginBottom: "12px" }}>
          {pendingToggle.willActivate ? "Activate event?" : "Deactivate event?"}
        </h3>
        <p style={{ color: "var(--color-muted)", fontSize: "14px", lineHeight: 1.65, marginBottom: "28px" }}>
          {pendingToggle.willActivate ? (
            <><strong style={{ color: "var(--color-text)" }}>{pendingToggle.eventName}</strong> will go live immediately and replace the current active event.</>
          ) : (
            <><strong style={{ color: "var(--color-text)" }}>{pendingToggle.eventName}</strong> will be taken offline immediately.</>
          )}
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", alignItems: "center" }}>
          <button type="button" onClick={onCancel} style={{ color: "var(--color-muted)", fontSize: "14px", fontWeight: 500, cursor: "pointer", border: "none", background: "none" }}>
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={activating}
            style={{
              background: pendingToggle.willActivate ? "var(--color-forest)" : "var(--color-error-text)",
              color: "white",
              padding: "10px 22px",
              borderRadius: "12px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: activating ? "not-allowed" : "pointer",
              border: "none",
              opacity: activating ? 0.6 : 1,
            }}
          >
            {pendingToggle.willActivate ? "Activate" : "Deactivate"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DuplicateEventModal({
  event,
  form,
  duplicating,
  onClose,
  onChange,
  onSubmit,
}: {
  event: EventItem | null;
  form: DuplicateEventForm;
  duplicating: boolean;
  onClose: () => void;
  onChange: (patch: Partial<DuplicateEventForm>) => void;
  onSubmit: () => void;
}) {
  const formIsValid = Boolean(form.name.trim() && form.event_date.trim());

  return (
    <Modal
      isOpen={Boolean(event)}
      onClose={onClose}
      title="Duplicate event"
      actions={(
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={duplicating}
            className="rounded-xl px-4 py-2.5 text-sm font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
            style={{ color: "var(--color-muted)" }}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="duplicate-event-form"
            disabled={duplicating || !formIsValid}
            className="rounded-xl px-5 py-2.5 text-sm font-semibold transition-transform active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}
          >
            {duplicating ? "Duplicating..." : "Duplicate Event"}
          </button>
        </>
      )}
    >
      <form
        id="duplicate-event-form"
        className="space-y-5"
        onSubmit={(submitEvent) => {
          submitEvent.preventDefault();
          if (formIsValid && !duplicating) onSubmit();
        }}
        onKeyDown={(keyEvent) => {
          if (keyEvent.key !== "Enter") return;
          keyEvent.preventDefault();
          if (formIsValid && !duplicating) onSubmit();
        }}
      >
        <div className="rounded-2xl p-4" style={{ background: "var(--color-cream)", border: "1px solid var(--color-border)" }}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--color-sage)" }}>
            Copying from
          </p>
          <p className="mt-1 text-sm font-semibold" style={{ color: "var(--color-forest)" }}>
            {event?.name}
          </p>
          <p className="mt-0.5 text-xs" style={{ color: "var(--color-muted)" }}>
            {event?.event_date}
          </p>
        </div>

        <p className="text-sm leading-relaxed" style={{ color: "var(--color-muted)" }}>
          Menu items, pickup locations, combo deals, storefront content, images, and payment settings will be copied. The new event will remain inactive.
        </p>

        <div className="space-y-2">
          <label htmlFor="duplicate-event-name" className="block text-sm font-medium" style={{ color: "var(--color-text)" }}>
            Event Name
          </label>
          <input
            id="duplicate-event-name"
            type="text"
            value={form.name}
            onChange={(changeEvent) => onChange({ name: changeEvent.target.value })}
            autoFocus
            required
            disabled={duplicating}
            placeholder="May 2026 Batch"
            className="w-full rounded-xl border bg-white px-4 py-3 text-sm transition-shadow focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="duplicate-event-date" className="block text-sm font-medium" style={{ color: "var(--color-text)" }}>
            Event Date
          </label>
          <input
            id="duplicate-event-date"
            type="text"
            value={form.event_date}
            onChange={(changeEvent) => onChange({ event_date: changeEvent.target.value })}
            required
            disabled={duplicating}
            placeholder="May 31st, 2026"
            className="w-full rounded-xl border bg-white px-4 py-3 text-sm transition-shadow focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
          />
        </div>
      </form>
    </Modal>
  );
}

function RandomSettingsModal({
  isOpen,
  form,
  saving,
  onClose,
  onChange,
  onSave,
}: {
  isOpen: boolean;
  form: RandomConfigForm;
  saving: boolean;
  onClose: () => void;
  onChange: (patch: Partial<RandomConfigForm>) => void;
  onSave: () => void;
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Random Requests Settings"
      actions={(
        <>
          <button onClick={onClose} style={{ color: "var(--color-muted)", fontSize: "14px", fontWeight: 500 }}>
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            style={{ background: "var(--color-forest)", color: "white", padding: "8px 20px", borderRadius: "12px", fontSize: "14px", fontWeight: 600, opacity: saving ? 0.6 : 1 }}
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </>
      )}
    >
      <div className="space-y-6">
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-muted)" }}>
          Configure default settings for &quot;Random Requests&quot; (orders not tied to a specific pre-order batch).
        </p>
        <div className="p-4 rounded-2xl flex items-center justify-between" style={{ border: "1px solid var(--color-border)", background: "var(--color-cream)" }}>
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--color-forest)" }}>E-Transfer Payment</p>
            <p className="text-xs" style={{ color: "var(--color-muted)" }}>Allow customers to choose e-Transfer</p>
          </div>
          <button
            role="switch"
            aria-checked={form.etransfer_enabled}
            onClick={() => onChange({ etransfer_enabled: !form.etransfer_enabled })}
            style={{ width: "44px", height: "24px", borderRadius: "12px", background: form.etransfer_enabled ? "var(--color-forest)" : "var(--color-border)", border: "none", cursor: "pointer", position: "relative", padding: 0 }}
          >
            <span style={{ position: "absolute", top: "2px", left: form.etransfer_enabled ? "22px" : "2px", width: "20px", height: "20px", borderRadius: "50%", background: "white", transition: "left 0.2s" }} />
          </button>
        </div>
        {form.etransfer_enabled && (
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--color-muted)" }}>
              E-Transfer Email
            </label>
            <input
              type="email"
              value={form.etransfer_email}
              onChange={(event) => onChange({ etransfer_email: event.target.value })}
              placeholder="payment@lokucaters.local"
              className="w-full px-4 py-2.5 rounded-xl border bg-white focus:outline-none focus:ring-2 transition-all text-sm"
              style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}

interface EventsPageState {
  events: EventItem[];
  loading: boolean;
  searchQuery: string;
  eventFilters: string[];
  currentPage: number;
  activating: number | null;
  deleting: number | null;
  pendingToggle: PendingToggle | null;
  duplicateEvent: EventItem | null;
  duplicateForm: DuplicateEventForm;
  duplicating: boolean;
  randomConfigModal: { isOpen: boolean; event: EventItem | null };
  randomConfigForm: RandomConfigForm;
  savingRandom: boolean;
}

const INITIAL_STATE: EventsPageState = {
  events: [],
  loading: true,
  searchQuery: "",
  eventFilters: [],
  currentPage: 1,
  activating: null,
  deleting: null,
  pendingToggle: null,
  duplicateEvent: null,
  duplicateForm: { name: "", event_date: "" },
  duplicating: false,
  randomConfigModal: { isOpen: false, event: null },
  randomConfigForm: { etransfer_enabled: false, etransfer_email: "" },
  savingRandom: false,
};

export default function AdminEventsPage() {
  const router = useRouter();
  const [state, setState] = useState<EventsPageState>(INITIAL_STATE);
  const {
    events,
    loading,
    searchQuery,
    eventFilters,
    currentPage,
    activating,
    deleting,
    pendingToggle,
    duplicateEvent,
    duplicateForm,
    duplicating,
    randomConfigModal,
    randomConfigForm,
    savingRandom,
  } = state;
  const { toast, showToast } = useAdminToast(4000);
  const updateState = useCallback((patch: Partial<EventsPageState>) => {
    setState((current) => ({ ...current, ...patch }));
  }, []);
  const updateRandomForm = useCallback((patch: Partial<EventsPageState["randomConfigForm"]>) => {
    setState((current) => ({
      ...current,
      randomConfigForm: { ...current.randomConfigForm, ...patch },
    }));
  }, []);
  const updateDuplicateForm = useCallback((patch: Partial<EventsPageState["duplicateForm"]>) => {
    setState((current) => ({
      ...current,
      duplicateForm: { ...current.duplicateForm, ...patch },
    }));
  }, []);
  const loadEvents = useCallback(async () => {
    await loadAdminResource<EventItem[]>("/api/admin/events", "Failed to load events", (events) => updateState({ events }));
  }, [updateState]);

  useEffect(() => {
    updateState({ loading: true });
    loadEvents()
      .catch(() => showToast("Failed to load events", "error"))
      .finally(() => updateState({ loading: false }));
  }, [loadEvents, showToast, updateState]);

  const filteredEvents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const statusFilters = eventFilters.filter((filter) => filter === "active" || filter === "inactive");
    const typeFilters = eventFilters.filter((filter) => filter === "standard" || filter === "system");
    return events.filter((event) => {
      const matchesQuery = !query || event.name.toLowerCase().includes(query);
      const status = event.is_active ? "active" : "inactive";
      const type = event.kind === "random_requests" ? "system" : "standard";
      return matchesQuery
        && (statusFilters.length === 0 || statusFilters.includes(status))
        && (typeFilters.length === 0 || typeFilters.includes(type));
    });
  }, [eventFilters, events, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / PAGE_SIZE));
  const pagedEvents = filteredEvents.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => {
    updateState({ currentPage: 1 });
  }, [eventFilters, searchQuery, updateState]);

  useEffect(() => {
    updateState({ currentPage: Math.min(currentPage, totalPages) });
  }, [currentPage, totalPages, updateState]);

  async function handleDelete(event: EventItem) {
    if (!confirm(`Delete "${event.name}"? This cannot be undone.`)) return;
    updateState({ deleting: event.id });
    try {
      const token = await getAdminToken();
      if (!token) return;
      const res = await fetch(`${API_URL}/api/admin/events/${event.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error("Delete failed");
      }
      await loadEvents();
      showToast("Event deleted.", "success");
    } catch {
      showToast("Failed to delete event", "error");
    } finally {
      updateState({ deleting: null });
    }
  }

  async function handleToggleConfirm() {
    if (!pendingToggle) return;
    const { eventId, willActivate } = pendingToggle;
    updateState({ activating: eventId, pendingToggle: null });
    try {
      const token = await getAdminToken();
      if (!token) return;
      const action = willActivate ? "activate" : "deactivate";
      const res = await fetch(`${API_URL}/api/admin/events/${eventId}/${action}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error("Toggle failed");
      }
      await loadEvents();
      showToast(willActivate ? "Event is now live." : "Event deactivated.", "success");
    } catch {
      showToast(`Failed to ${willActivate ? "activate" : "deactivate"} event`, "error");
    } finally {
      updateState({ activating: null });
    }
  }

  function openDuplicateModal(event: EventItem) {
    updateState({
      duplicateEvent: event,
      duplicateForm: { name: `Copy of ${event.name}`, event_date: "" },
    });
  }

  function closeDuplicateModal() {
    if (duplicating) return;
    updateState({
      duplicateEvent: null,
      duplicateForm: { name: "", event_date: "" },
    });
  }

  async function handleDuplicateEvent() {
    if (!duplicateEvent || duplicating) return;
    const name = duplicateForm.name.trim();
    const eventDate = duplicateForm.event_date.trim();
    if (!name || !eventDate) return;

    updateState({ duplicating: true });
    try {
      const token = await getAdminToken();
      if (!token) return;
      const response = await fetch(`${API_URL}/api/admin/events/${duplicateEvent.id}/duplicate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, event_date: eventDate }),
      });
      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, "Failed to duplicate event"));
      }
      const createdEvent = await response.json() as EventItem;
      updateState({
        duplicateEvent: null,
        duplicateForm: { name: "", event_date: "" },
      });
      router.push(`/admin/events/${createdEvent.id}/edit`);
    } catch (duplicateError) {
      showToast(duplicateError instanceof Error ? duplicateError.message : "Failed to duplicate event", "error");
    } finally {
      updateState({ duplicating: false });
    }
  }

  async function handleSaveRandomConfig() {
    if (!randomConfigModal.event) return;
    updateState({ savingRandom: true });
    try {
      const token = await getAdminToken();
      if (!token) return;
      const res = await fetch(`${API_URL}/api/admin/random-requests/config`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          etransfer_enabled: randomConfigForm.etransfer_enabled,
          etransfer_email: randomConfigForm.etransfer_email.trim() || null,
        }),
      });
      if (!res.ok) {
        throw new Error("Failed to save config");
      }
      await loadEvents();
      showToast("System settings updated.", "success");
      updateState({ randomConfigModal: { isOpen: false, event: null } });
    } catch {
      showToast("Failed to update system settings", "error");
    } finally {
      updateState({ savingRandom: false });
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
      <AdminToast toast={toast} />

      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>
            Events
          </h1>
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            Manage events and open dedicated event editors for setup.
          </p>
        </div>
        <button
          onClick={() => router.push("/admin/events/new")}
          className="px-5 py-2.5 rounded-2xl text-sm font-semibold transition-all active:scale-[0.98] shrink-0"
          style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}
        >
          + Add Event
        </button>
      </div>

      <div className="mb-4 flex w-full items-center gap-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(event) => updateState({ searchQuery: event.target.value })}
          placeholder="Search events by name..."
          className="min-w-0 flex-1 px-4 py-2.5 rounded-xl text-sm border bg-white focus:outline-none focus:ring-2 transition-all"
          style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
        />
        <Popover className="relative shrink-0">
          <PopoverButton
            className="flex items-center gap-2 rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2"
            style={{ borderColor: "var(--color-border)", color: "var(--color-forest)" }}
          >
            <FunnelSimple size={16} weight="bold" />
            Filters{eventFilters.length > 0 ? ` (${eventFilters.length})` : ""}
          </PopoverButton>
          <PopoverPanel
            anchor="bottom end"
            className="z-[70] mt-2 w-64 rounded-2xl border bg-white p-3 shadow-lg"
            style={{ borderColor: "var(--color-border)" }}
          >
            {[
              { label: "Status", options: [["active", "Active"], ["inactive", "Inactive"]] },
              { label: "Event type", options: [["standard", "Standard"], ["system", "System"]] },
            ].map((group) => (
              <div key={group.label} className="mb-3 last:mb-0">
                <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-muted)" }}>{group.label}</p>
                {group.options.map(([value, label]) => {
                  const selected = eventFilters.includes(value);
                  return (
                    <button
                      key={value}
                      type="button"
                      role="checkbox"
                      aria-checked={selected}
                      onClick={() => updateState({ eventFilters: selected ? eventFilters.filter((item) => item !== value) : [...eventFilters, value] })}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-[var(--color-cream)]"
                      style={{ color: "var(--color-text)" }}
                    >
                      <span className="flex h-4 w-4 items-center justify-center rounded border" style={{ borderColor: "var(--color-border)" }}>
                        {selected && <Check size={12} weight="bold" style={{ color: "var(--color-forest)" }} />}
                      </span>
                      {label}
                    </button>
                  );
                })}
              </div>
            ))}
            {eventFilters.length > 0 && (
              <button type="button" onClick={() => updateState({ eventFilters: [] })} className="mt-1 w-full rounded-lg px-2 py-2 text-left text-xs font-semibold" style={{ color: "var(--color-error-text)" }}>
                Clear filters
              </button>
            )}
          </PopoverPanel>
        </Popover>
      </div>

      <EventList
        events={events}
        filteredEvents={filteredEvents}
        pagedEvents={pagedEvents}
        deleting={deleting}
        activating={activating}
        onOpen={(event) => router.push(`/admin/events/${event.id}`)}
        onEdit={(event) => router.push(`/admin/events/${event.id}/edit`)}
        onDuplicate={openDuplicateModal}
        onConfigure={(event) => updateState({
          randomConfigForm: {
            etransfer_enabled: event.etransfer_enabled,
            etransfer_email: event.etransfer_email ?? "",
          },
          randomConfigModal: { isOpen: true, event },
        })}
        onDelete={handleDelete}
        onToggle={(event) => updateState({ pendingToggle: { eventId: event.id, eventName: event.name, willActivate: !event.is_active } })}
      />
      <EventPagination currentPage={currentPage} totalPages={totalPages} onPageChange={(page) => updateState({ currentPage: page })} />
      <EventToggleConfirmation
        pendingToggle={pendingToggle}
        activating={activating !== null}
        onCancel={() => updateState({ pendingToggle: null })}
        onConfirm={handleToggleConfirm}
      />
      <DuplicateEventModal
        event={duplicateEvent}
        form={duplicateForm}
        duplicating={duplicating}
        onClose={closeDuplicateModal}
        onChange={updateDuplicateForm}
        onSubmit={handleDuplicateEvent}
      />
      <RandomSettingsModal
        isOpen={randomConfigModal.isOpen}
        form={randomConfigForm}
        saving={savingRandom}
        onClose={() => updateState({ randomConfigModal: { isOpen: false, event: null } })}
        onChange={updateRandomForm}
        onSave={handleSaveRandomConfig}
      />
    </div>
  );
}
