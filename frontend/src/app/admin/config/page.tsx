"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { API_URL, CURRENCY } from "@/config/event";
import { getAdminToken } from "@/lib/auth";
import Modal from "@/components/ui/Modal";
import AdminToast from "@/components/admin/AdminToast";
import { useAdminToast } from "@/hooks/useAdminToast";
import { loadAdminResource } from "@/lib/adminCrud";

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
    <div className="flex flex-col items-center gap-1">
      <button
        role="switch"
        aria-checked={event.is_active}
        onClick={onToggle}
        disabled={activating}
        title={event.is_active ? "Deactivate event" : "Activate event"}
        style={{
          width: "44px",
          height: "24px",
          borderRadius: "12px",
          background: event.is_active ? "var(--color-forest)" : "var(--color-border)",
          border: "none",
          cursor: activating ? "not-allowed" : "pointer",
          position: "relative",
          opacity: activating ? 0.5 : 1,
          padding: 0,
        }}
      >
        <span style={{ position: "absolute", top: "2px", left: event.is_active ? "22px" : "2px", width: "20px", height: "20px", borderRadius: "50%", background: "var(--color-cream)", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.25)" }} />
      </button>
      <span style={{ fontSize: "10px", color: event.is_active ? "var(--color-forest)" : "var(--color-muted)", fontWeight: 600 }}>
        {activating ? "..." : event.is_active ? "Live" : "Off"}
      </span>
    </div>
  );
}

function EventControls({
  event,
  deleting,
  activating,
  onEdit,
  onConfigure,
  onDelete,
  onToggle,
}: {
  event: EventItem;
  deleting: boolean;
  activating: boolean;
  onEdit: () => void;
  onConfigure: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const systemEvent = event.kind === "random_requests";
  return (
    <div className="flex items-center gap-2 shrink-0" onClick={(clickEvent) => clickEvent.stopPropagation()}>
      <button onClick={systemEvent ? onConfigure : onEdit} className="px-3 py-1.5 rounded-xl text-xs font-medium transition-all" style={{ border: "1px solid var(--color-border)", color: "var(--color-text)", background: "white" }}>
        {systemEvent ? "Edit Settings" : "Edit"}
      </button>
      {!event.is_active && !systemEvent && (
        <button onClick={onDelete} disabled={deleting} className="px-3 py-1.5 rounded-xl text-xs font-medium transition-all disabled:opacity-60" style={{ background: "var(--color-error-bg)", color: "var(--color-error-text)" }}>
          {deleting ? "..." : "Delete"}
        </button>
      )}
      {systemEvent ? <span style={{ fontSize: "10px", color: "var(--color-muted)", fontWeight: 600 }}>System only</span> : <EventToggle event={event} activating={activating} onToggle={onToggle} />}
    </div>
  );
}

function EventRow({
  event,
  deleting,
  activating,
  onOpen,
  onEdit,
  onConfigure,
  onDelete,
  onToggle,
}: {
  event: EventItem;
  deleting: boolean;
  activating: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onConfigure: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const systemEvent = event.kind === "random_requests";
  const revenue = new Intl.NumberFormat("en-CA", { style: "currency", currency: CURRENCY, maximumFractionDigits: 0 }).format(event.total_revenue ?? 0);
  return (
    <div className="rounded-2xl cursor-pointer transition-all hover:shadow-sm" style={{ background: "white", border: "1px solid var(--color-border)" }} onClick={onOpen}>
      <div className="px-5 py-4 flex items-center gap-4">
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold truncate" style={{ color: "var(--color-forest)" }}>{event.name}</h2>
            <span className="shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold" style={event.is_active ? { background: "var(--color-success-bg)", color: "var(--color-success-text)" } : { background: "var(--color-cream)", color: "var(--color-muted)" }}>
              {event.is_active ? "ACTIVE" : "INACTIVE"}
            </span>
            {systemEvent && <span className="shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: "var(--color-success-bg)", color: "var(--color-forest)" }}>SYSTEM</span>}
          </div>
          <span className="text-xs" style={{ color: "var(--color-muted)" }}>{event.event_date}</span>
          <span className="text-xs" style={{ color: "var(--color-muted)" }}>{event.combo_deals.length} combo{event.combo_deals.length === 1 ? "" : "s"} configured</span>
        </div>
        <div className="hidden md:flex items-center gap-5 shrink-0">
          <div><p className="text-sm font-bold leading-tight" style={{ color: "var(--color-forest)" }}>{revenue}</p><p className="text-xs leading-tight" style={{ color: "var(--color-muted)" }}>revenue</p></div>
          <div><p className="text-sm font-bold leading-tight" style={{ color: "var(--color-forest)" }}>{event.order_count ?? 0}</p><p className="text-xs leading-tight" style={{ color: "var(--color-muted)" }}>orders</p></div>
        </div>
        <EventControls event={event} deleting={deleting} activating={activating} onEdit={onEdit} onConfigure={onConfigure} onDelete={onDelete} onToggle={onToggle} />
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
  currentPage: number;
  activating: number | null;
  deleting: number | null;
  pendingToggle: PendingToggle | null;
  randomConfigModal: { isOpen: boolean; event: EventItem | null };
  randomConfigForm: RandomConfigForm;
  savingRandom: boolean;
}

const INITIAL_STATE: EventsPageState = {
  events: [],
  loading: true,
  searchQuery: "",
  currentPage: 1,
  activating: null,
  deleting: null,
  pendingToggle: null,
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
    currentPage,
    activating,
    deleting,
    pendingToggle,
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
    return query ? events.filter((event) => event.name.toLowerCase().includes(query)) : events;
  }, [events, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / PAGE_SIZE));
  const pagedEvents = filteredEvents.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => {
    updateState({ currentPage: 1 });
  }, [searchQuery, updateState]);

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

      <div className="mb-4">
        <input
          type="text"
          value={searchQuery}
          onChange={(event) => updateState({ searchQuery: event.target.value })}
          placeholder="Search events by name..."
          className="w-full sm:w-80 px-4 py-2.5 rounded-xl text-sm border bg-white focus:outline-none focus:ring-2 transition-all"
          style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
        />
      </div>

      <EventList
        events={events}
        filteredEvents={filteredEvents}
        pagedEvents={pagedEvents}
        deleting={deleting}
        activating={activating}
        onOpen={(event) => router.push(`/admin/events/${event.id}`)}
        onEdit={(event) => router.push(`/admin/events/${event.id}/edit`)}
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
