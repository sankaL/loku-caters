"use client";

import { useState, useEffect, useCallback } from "react";
import { API_URL, CURRENCY } from "@/config/event";
import { getAdminToken } from "@/lib/auth";

interface EventItem {
  id: number;
  name: string;
  event_date: string;
  hero_header: string;
  hero_subheader: string;
  promo_details: string | null;
  is_active: boolean;
  item_ids: string[];
  location_ids: string[];
  updated_at: string | null;
}

interface AdminItem {
  id: string;
  name: string;
  price: number;
  discounted_price: number | null;
}

interface AdminLocation {
  id: string;
  name: string;
}

interface EventForm {
  name: string;
  event_date: string;
  hero_header: string;
  hero_subheader: string;
  promo_details: string;
  item_ids: string[];
  location_ids: string[];
}

const EMPTY_FORM: EventForm = {
  name: "",
  event_date: "",
  hero_header: "",
  hero_subheader: "",
  promo_details: "",
  item_ids: [],
  location_ids: [],
};

function Spinner() {
  return (
    <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" opacity="0.3" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="var(--color-sage)" />
    </svg>
  );
}

export default function AdminEventsPage() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [allItems, setAllItems] = useState<AdminItem[]>([]);
  const [allLocations, setAllLocations] = useState<AdminLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventItem | null>(null);
  const [form, setForm] = useState<EventForm>(EMPTY_FORM);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadData = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    const [eventsRes, itemsRes, locsRes] = await Promise.all([
      fetch(`${API_URL}/api/admin/events`, { headers }),
      fetch(`${API_URL}/api/admin/items`, { headers }),
      fetch(`${API_URL}/api/admin/locations`, { headers }),
    ]);
    if (!eventsRes.ok || !itemsRes.ok || !locsRes.ok) throw new Error("Failed to load data");
    const [eventsData, itemsData, locsData] = await Promise.all([
      eventsRes.json(),
      itemsRes.json(),
      locsRes.json(),
    ]);
    setEvents(eventsData);
    setAllItems(itemsData);
    setAllLocations(locsData);
  }, []);

  useEffect(() => {
    setLoading(true);
    loadData()
      .catch(() => showToast("Failed to load events", "error"))
      .finally(() => setLoading(false));
  }, [loadData]);

  function openAdd() {
    setEditingEvent(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(event: EventItem) {
    setEditingEvent(event);
    setForm({
      name: event.name,
      event_date: event.event_date,
      hero_header: event.hero_header,
      hero_subheader: event.hero_subheader,
      promo_details: event.promo_details ?? "",
      item_ids: event.item_ids,
      location_ids: event.location_ids,
    });
    setModalOpen(true);
  }

  function toggleCheckbox(field: "item_ids" | "location_ids", id: string) {
    setForm((prev) => {
      const current = prev[field];
      return {
        ...prev,
        [field]: current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
      };
    });
  }

  async function handleSave() {
    if (!form.name.trim() || !form.event_date.trim()) {
      showToast("Name and Event Date are required", "error");
      return;
    }
    setSaving(true);
    try {
      const token = await getAdminToken();
      if (!token) return;
      const body = {
        name: form.name.trim(),
        event_date: form.event_date.trim(),
        hero_header: form.hero_header.trim(),
        hero_subheader: form.hero_subheader.trim(),
        promo_details: form.promo_details.trim() || null,
        item_ids: form.item_ids,
        location_ids: form.location_ids,
      };
      const url = editingEvent
        ? `${API_URL}/api/admin/events/${editingEvent.id}`
        : `${API_URL}/api/admin/events`;
      const method = editingEvent ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Save failed");
      setModalOpen(false);
      await loadData();
      showToast(editingEvent ? "Event updated." : "Event created.", "success");
    } catch {
      showToast("Failed to save event", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleActivate(eventId: number) {
    setActivating(eventId);
    try {
      const token = await getAdminToken();
      if (!token) return;
      const res = await fetch(`${API_URL}/api/admin/events/${eventId}/activate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Activate failed");
      await loadData();
      showToast("Event set as active.", "success");
    } catch {
      showToast("Failed to activate event", "error");
    } finally {
      setActivating(null);
    }
  }

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
      if (!res.ok) throw new Error("Delete failed");
      await loadData();
      showToast("Event deleted.", "success");
    } catch {
      showToast("Failed to delete event", "error");
    } finally {
      setDeleting(null);
    }
  }

  const labelClass = "block text-sm font-medium mb-1.5";
  const inputClass =
    "w-full px-4 py-3 rounded-xl text-sm border bg-white focus:outline-none focus:ring-2 transition-all border-[var(--color-border)] focus:ring-[var(--color-sage)] focus:border-[var(--color-sage)]";

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl">
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
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1
            className="text-2xl font-bold mb-1"
            style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}
          >
            Events
          </h1>
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            Manage events and set which one is live on the order page.
          </p>
        </div>
        <button
          onClick={openAdd}
          className="px-5 py-2.5 rounded-2xl text-sm font-semibold transition-all active:scale-[0.98] shrink-0"
          style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#1e3d18"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--color-forest)"; }}
        >
          + Add Event
        </button>
      </div>

      {/* Event list */}
      {events.length === 0 ? (
        <div
          className="rounded-2xl p-12 text-center"
          style={{ background: "white", border: "1px solid var(--color-border)" }}
        >
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            No events yet. Create one to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {events.map((event) => {
            const eventItems = allItems.filter((i) => event.item_ids.includes(i.id));
            const eventLocations = allLocations.filter((l) => event.location_ids.includes(l.id));
            return (
              <div
                key={event.id}
                className="rounded-2xl p-6"
                style={{ background: "white", border: "1px solid var(--color-border)" }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h2
                        className="text-base font-semibold truncate"
                        style={{ color: "var(--color-forest)" }}
                      >
                        {event.name}
                      </h2>
                      <span
                        className="shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold"
                        style={
                          event.is_active
                            ? { background: "#d1fae5", color: "#065f46" }
                            : { background: "#f3f4f6", color: "#6b7280" }
                        }
                      >
                        {event.is_active ? "ACTIVE" : "INACTIVE"}
                      </span>
                    </div>
                    <p className="text-sm mb-3" style={{ color: "var(--color-muted)" }}>
                      {event.event_date}
                    </p>
                    {/* Item pills */}
                    {eventItems.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {eventItems.map((item) => (
                          <span
                            key={item.id}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium"
                            style={{ background: "var(--color-cream)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
                          >
                            {item.name}
                          </span>
                        ))}
                      </div>
                    )}
                    {/* Location pills */}
                    {eventLocations.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {eventLocations.map((loc) => (
                          <span
                            key={loc.id}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium"
                            style={{ background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0" }}
                          >
                            {loc.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => openEdit(event)}
                      className="px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
                      style={{ border: "1px solid var(--color-border)", color: "var(--color-text)", background: "white" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--color-cream)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "white"; }}
                    >
                      Edit
                    </button>
                    {!event.is_active && (
                      <button
                        onClick={() => handleActivate(event.id)}
                        disabled={activating === event.id}
                        className="px-3 py-1.5 rounded-xl text-xs font-medium transition-all disabled:opacity-60"
                        style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}
                        onMouseEnter={(e) => { if (activating !== event.id) (e.currentTarget as HTMLButtonElement).style.background = "#1e3d18"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--color-forest)"; }}
                      >
                        {activating === event.id ? "..." : "Set Active"}
                      </button>
                    )}
                    {!event.is_active && (
                      <button
                        onClick={() => handleDelete(event)}
                        disabled={deleting === event.id}
                        className="px-3 py-1.5 rounded-xl text-xs font-medium transition-all disabled:opacity-60"
                        style={{ background: "#fee2e2", color: "#991b1b" }}
                        onMouseEnter={(e) => { if (deleting !== event.id) (e.currentTarget as HTMLButtonElement).style.background = "#fecaca"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#fee2e2"; }}
                      >
                        {deleting === event.id ? "..." : "Delete"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}
        >
          <div
            className="w-full max-w-2xl rounded-3xl shadow-2xl overflow-y-auto"
            style={{ background: "white", maxHeight: "90vh" }}
          >
            <div className="px-8 py-6 border-b" style={{ borderColor: "var(--color-border)" }}>
              <h2
                className="text-lg font-semibold"
                style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}
              >
                {editingEvent ? "Edit Event" : "New Event"}
              </h2>
            </div>

            <div className="px-8 py-6 space-y-5">
              {/* Name */}
              <div>
                <label className={labelClass} style={{ color: "var(--color-text)" }}>
                  Event Name <span style={{ color: "#dc2626" }}>*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. February 2026 Batch"
                  className={inputClass}
                  style={{ color: "var(--color-text)" }}
                />
              </div>

              {/* Event Date */}
              <div>
                <label className={labelClass} style={{ color: "var(--color-text)" }}>
                  Event Date <span style={{ color: "#dc2626" }}>*</span>
                </label>
                <input
                  type="text"
                  value={form.event_date}
                  onChange={(e) => setForm((p) => ({ ...p, event_date: e.target.value }))}
                  placeholder="e.g. February 28th, 2026"
                  className={inputClass}
                  style={{ color: "var(--color-text)" }}
                />
              </div>

              {/* Hero Header */}
              <div>
                <label className={labelClass} style={{ color: "var(--color-text)" }}>
                  Hero Header
                </label>
                <input
                  type="text"
                  value={form.hero_header}
                  onChange={(e) => setForm((p) => ({ ...p, hero_header: e.target.value }))}
                  placeholder="e.g. We're Making Lamprais"
                  className={inputClass}
                  style={{ color: "var(--color-text)" }}
                />
              </div>

              {/* Hero Subheader */}
              <div>
                <label className={labelClass} style={{ color: "var(--color-text)" }}>
                  Hero Subheader
                </label>
                <input
                  type="text"
                  value={form.hero_subheader}
                  onChange={(e) => setForm((p) => ({ ...p, hero_subheader: e.target.value }))}
                  placeholder="e.g. A fresh batch, made with love."
                  className={inputClass}
                  style={{ color: "var(--color-text)" }}
                />
              </div>

              {/* Promo Details */}
              <div>
                <label className={labelClass} style={{ color: "var(--color-text)" }}>
                  Promo Details <span className="font-normal text-xs" style={{ color: "var(--color-muted)" }}>(optional)</span>
                </label>
                <textarea
                  value={form.promo_details}
                  onChange={(e) => setForm((p) => ({ ...p, promo_details: e.target.value }))}
                  placeholder="e.g. Special welcome-back price for this batch only!"
                  rows={2}
                  className={inputClass}
                  style={{ color: "var(--color-text)", resize: "vertical" }}
                />
              </div>

              {/* Items */}
              <div>
                <label className={labelClass} style={{ color: "var(--color-text)" }}>
                  Items
                </label>
                {allItems.length === 0 ? (
                  <p className="text-sm" style={{ color: "var(--color-muted)" }}>No items found. Add items first.</p>
                ) : (
                  <div className="space-y-2">
                    {allItems.map((item) => (
                      <label
                        key={item.id}
                        className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all"
                        style={{
                          border: `1px solid ${form.item_ids.includes(item.id) ? "var(--color-sage)" : "var(--color-border)"}`,
                          background: form.item_ids.includes(item.id) ? "#f0fdf4" : "white",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={form.item_ids.includes(item.id)}
                          onChange={() => toggleCheckbox("item_ids", item.id)}
                          className="rounded"
                          style={{ accentColor: "var(--color-sage)" }}
                        />
                        <span className="flex-1 text-sm font-medium" style={{ color: "var(--color-text)" }}>
                          {item.name}
                        </span>
                        <span className="text-sm" style={{ color: "var(--color-muted)" }}>
                          {CURRENCY} ${item.discounted_price != null ? item.discounted_price.toFixed(2) : item.price.toFixed(2)}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Locations */}
              <div>
                <label className={labelClass} style={{ color: "var(--color-text)" }}>
                  Locations
                </label>
                {allLocations.length === 0 ? (
                  <p className="text-sm" style={{ color: "var(--color-muted)" }}>No locations found. Add locations first.</p>
                ) : (
                  <div className="space-y-2">
                    {allLocations.map((loc) => (
                      <label
                        key={loc.id}
                        className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all"
                        style={{
                          border: `1px solid ${form.location_ids.includes(loc.id) ? "var(--color-sage)" : "var(--color-border)"}`,
                          background: form.location_ids.includes(loc.id) ? "#f0fdf4" : "white",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={form.location_ids.includes(loc.id)}
                          onChange={() => toggleCheckbox("location_ids", loc.id)}
                          className="rounded"
                          style={{ accentColor: "var(--color-sage)" }}
                        />
                        <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                          {loc.name}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="px-8 py-5 border-t flex justify-end gap-3" style={{ borderColor: "var(--color-border)" }}>
              <button
                onClick={() => setModalOpen(false)}
                className="px-5 py-2.5 rounded-2xl text-sm font-medium transition-all"
                style={{ border: "1px solid var(--color-border)", color: "var(--color-text)", background: "white" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--color-cream)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "white"; }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2.5 rounded-2xl text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}
                onMouseEnter={(e) => { if (!saving) (e.currentTarget as HTMLButtonElement).style.background = "#1e3d18"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--color-forest)"; }}
              >
                {saving ? "Saving..." : (editingEvent ? "Save Changes" : "Create Event")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
