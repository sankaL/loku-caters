"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { API_URL, CURRENCY } from "@/config/event";
import { getAdminToken } from "@/lib/auth";

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
}

function Spinner() {
  return (
    <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" opacity="0.3" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="var(--color-sage)" />
    </svg>
  );
}

export default function AdminEventsPage() {
  const router = useRouter();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [activating, setActivating] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [pendingToggle, setPendingToggle] = useState<{ eventId: number; eventName: string; willActivate: boolean } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const PAGE_SIZE = 10;

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 4000);
  }, []);

  const loadEvents = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) return;
    const res = await fetch(`${API_URL}/api/admin/events`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error("Failed to load events");
    }
    const data = (await res.json()) as EventItem[];
    setEvents(data);
  }, []);

  useEffect(() => {
    setLoading(true);
    loadEvents()
      .catch(() => showToast("Failed to load events", "error"))
      .finally(() => setLoading(false));
  }, [loadEvents, showToast]);

  const filteredEvents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return query ? events.filter((event) => event.name.toLowerCase().includes(query)) : events;
  }, [events, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredEvents.length / PAGE_SIZE));
  const pagedEvents = filteredEvents.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  async function handleDelete(event: EventItem) {
    if (!confirm(`Delete "${event.name}"? This cannot be undone.`)) return;
    setDeleting(event.id);
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
      setDeleting(null);
    }
  }

  async function handleToggleConfirm() {
    if (!pendingToggle) return;
    const { eventId, willActivate } = pendingToggle;
    setActivating(eventId);
    setPendingToggle(null);
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
      setActivating(null);
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
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search events by name..."
          className="w-full sm:w-80 px-4 py-2.5 rounded-xl text-sm border bg-white focus:outline-none focus:ring-2 transition-all"
          style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
        />
      </div>

      {filteredEvents.length === 0 ? (
        <div className="rounded-2xl p-12 text-center" style={{ background: "white", border: "1px solid var(--color-border)" }}>
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            {events.length === 0 ? "No events yet. Create one to get started." : "No events match your search."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {pagedEvents.map((event) => {
            const isRandomRequests = event.kind === "random_requests";
            const revenue = new Intl.NumberFormat("en-CA", {
              style: "currency",
              currency: CURRENCY,
              maximumFractionDigits: 0,
            }).format(event.total_revenue ?? 0);

            return (
              <div
                key={event.id}
                className="rounded-2xl cursor-pointer transition-all hover:shadow-sm"
                style={{ background: "white", border: "1px solid var(--color-border)" }}
                onClick={() => router.push(`/admin/events/${event.id}`)}
              >
                <div className="px-5 py-4 flex items-center gap-4">
                  <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-semibold truncate" style={{ color: "var(--color-forest)" }}>
                        {event.name}
                      </h2>
                      <span
                        className="shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold"
                        style={event.is_active ? { background: "#d1fae5", color: "#065f46" } : { background: "#f3f4f6", color: "#6b7280" }}
                      >
                        {event.is_active ? "ACTIVE" : "INACTIVE"}
                      </span>
                      {isRandomRequests && (
                        <span
                          className="shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold"
                          style={{ background: "#f0f7ea", color: "var(--color-forest)" }}
                        >
                          SYSTEM
                        </span>
                      )}
                    </div>
                    <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                      {event.event_date}
                    </span>
                    <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                      {event.combo_deals.length} combo{event.combo_deals.length === 1 ? "" : "s"} configured
                    </span>
                  </div>

                  <div className="hidden md:flex items-center gap-5 shrink-0">
                    <div>
                      <p className="text-sm font-bold leading-tight" style={{ color: "var(--color-forest)" }}>{revenue}</p>
                      <p className="text-xs leading-tight" style={{ color: "var(--color-muted)" }}>revenue</p>
                    </div>
                    <div>
                      <p className="text-sm font-bold leading-tight" style={{ color: "var(--color-forest)" }}>{event.order_count ?? 0}</p>
                      <p className="text-xs leading-tight" style={{ color: "var(--color-muted)" }}>orders</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0" onClick={(eventValue) => eventValue.stopPropagation()}>
                    {isRandomRequests ? (
                      <span
                        className="px-3 py-1.5 rounded-xl text-xs font-medium"
                        style={{ border: "1px solid var(--color-border)", color: "var(--color-muted)", background: "var(--color-cream)" }}
                      >
                        Reserved bucket
                      </span>
                    ) : (
                      <button
                        onClick={() => router.push(`/admin/events/${event.id}/edit`)}
                        className="px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
                        style={{ border: "1px solid var(--color-border)", color: "var(--color-text)", background: "white" }}
                      >
                        Edit
                      </button>
                    )}
                    {!event.is_active && !isRandomRequests && (
                      <button
                        onClick={() => handleDelete(event)}
                        disabled={deleting === event.id}
                        className="px-3 py-1.5 rounded-xl text-xs font-medium transition-all disabled:opacity-60"
                        style={{ background: "#fee2e2", color: "#991b1b" }}
                      >
                        {deleting === event.id ? "..." : "Delete"}
                      </button>
                    )}
                    {isRandomRequests ? (
                      <span style={{ fontSize: "10px", color: "var(--color-muted)", fontWeight: 600 }}>
                        System only
                      </span>
                    ) : (
                      <div className="flex flex-col items-center gap-1">
                        <button
                          role="switch"
                          aria-checked={event.is_active}
                          onClick={() => setPendingToggle({ eventId: event.id, eventName: event.name, willActivate: !event.is_active })}
                          disabled={activating === event.id}
                          title={event.is_active ? "Deactivate event" : "Activate event"}
                          style={{
                            width: "44px",
                            height: "24px",
                            borderRadius: "12px",
                            background: event.is_active ? "var(--color-forest)" : "var(--color-border)",
                            border: "none",
                            cursor: activating === event.id ? "not-allowed" : "pointer",
                            position: "relative",
                            opacity: activating === event.id ? 0.5 : 1,
                            padding: 0,
                          }}
                        >
                          <span
                            style={{
                              position: "absolute",
                              top: "2px",
                              left: event.is_active ? "22px" : "2px",
                              width: "20px",
                              height: "20px",
                              borderRadius: "50%",
                              background: "var(--color-cream)",
                              transition: "left 0.2s",
                              boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
                            }}
                          />
                        </button>
                        <span style={{ fontSize: "10px", color: event.is_active ? "var(--color-forest)" : "var(--color-muted)", fontWeight: 600 }}>
                          {activating === event.id ? "..." : event.is_active ? "Live" : "Off"}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {filteredEvents.length > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-center gap-3">
          <button
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
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
            onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
            disabled={currentPage === totalPages}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-40"
            style={{ border: "1px solid var(--color-border)", color: "var(--color-text)", background: "white" }}
          >
            Next
          </button>
        </div>
      )}

      {pendingToggle && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
          <div className="w-full max-w-sm rounded-3xl shadow-2xl p-8" style={{ background: "white" }}>
            <h3
              style={{
                fontFamily: "var(--font-serif)",
                color: "var(--color-forest)",
                fontSize: "1.15rem",
                fontWeight: 700,
                marginBottom: "12px",
              }}
            >
              {pendingToggle.willActivate ? "Activate event?" : "Deactivate event?"}
            </h3>
            <p style={{ color: "var(--color-muted)", fontSize: "14px", lineHeight: 1.65, marginBottom: "28px" }}>
              {pendingToggle.willActivate
                ? <><strong style={{ color: "var(--color-text)" }}>{pendingToggle.eventName}</strong> will go live immediately and replace the current active event.</>
                : <><strong style={{ color: "var(--color-text)" }}>{pendingToggle.eventName}</strong> will be taken offline immediately.</>}
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", alignItems: "center" }}>
              <button
                type="button"
                onClick={() => setPendingToggle(null)}
                style={{ color: "var(--color-muted)", fontSize: "14px", fontWeight: 500, cursor: "pointer", border: "none", background: "none" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleToggleConfirm}
                disabled={!!activating}
                style={{
                  background: pendingToggle.willActivate ? "var(--color-forest)" : "#dc2626",
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
      )}
    </div>
  );
}
