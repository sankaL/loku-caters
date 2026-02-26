"use client";
/* eslint-disable @next/next/no-img-element */

import { useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { API_URL, CURRENCY } from "@/config/event";
import { getAdminToken } from "@/lib/auth";
import { getApiErrorMessage } from "@/lib/apiError";

type EventImageType = "tooltip" | "hero_side";

interface EventItem {
  id: number;
  name: string;
  event_date: string;
  hero_header: string;
  hero_header_sage: string;
  hero_subheader: string;
  promo_details: string | null;
  tooltip_enabled: boolean;
  tooltip_header: string | null;
  tooltip_body: string | null;
  tooltip_image_key: string | null;
  hero_side_image_key: string | null;
  etransfer_enabled: boolean;
  etransfer_email: string | null;
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

interface EventImage {
  key: string;
  type: EventImageType;
  label: string;
  path: string;
  alt: string;
}

interface EventImageCatalog {
  helper: {
    tooltip_target_dir: string;
    hero_side_target_dir: string;
  };
  images: EventImage[];
}

interface EventForm {
  name: string;
  event_date: string;
  hero_header: string;
  hero_header_sage: string;
  hero_subheader: string;
  promo_details: string;
  tooltip_enabled: boolean;
  tooltip_header: string;
  tooltip_body: string;
  tooltip_image_key: string | null;
  hero_side_image_key: string | null;
  etransfer_enabled: boolean;
  etransfer_email: string;
  item_ids: string[];
  location_ids: string[];
}

const EMPTY_FORM: EventForm = {
  name: "",
  event_date: "",
  hero_header: "",
  hero_header_sage: "",
  hero_subheader: "",
  promo_details: "",
  tooltip_enabled: false,
  tooltip_header: "",
  tooltip_body: "",
  tooltip_image_key: null,
  hero_side_image_key: null,
  etransfer_enabled: false,
  etransfer_email: "",
  item_ids: [],
  location_ids: [],
};

const EMPTY_IMAGE_CATALOG: EventImageCatalog = {
  helper: {
    tooltip_target_dir: "frontend/public/assets/img/tooltip",
    hero_side_target_dir: "frontend/public/assets/img/hero-side",
  },
  images: [],
};

function normalizeImageCatalog(data: unknown): EventImageCatalog {
  if (!data || typeof data !== "object") return EMPTY_IMAGE_CATALOG;
  const raw = data as { helper?: Record<string, unknown>; images?: unknown[] };
  const helper = raw.helper ?? {};
  const images = Array.isArray(raw.images) ? raw.images : [];
  const normalizedImages: EventImage[] = images
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    .map((entry) => {
      const type: EventImageType = entry.type === "hero_side" ? "hero_side" : "tooltip";
      return {
        key: typeof entry.key === "string" ? entry.key : "",
        type,
        label: typeof entry.label === "string" ? entry.label : "",
        path: typeof entry.path === "string" ? entry.path : "",
        alt: typeof entry.alt === "string" ? entry.alt : "",
      };
    })
    .filter((entry) => Boolean(entry.key) && Boolean(entry.path) && Boolean(entry.label));

  return {
    helper: {
      tooltip_target_dir:
        typeof helper.tooltip_target_dir === "string"
          ? helper.tooltip_target_dir
          : EMPTY_IMAGE_CATALOG.helper.tooltip_target_dir,
      hero_side_target_dir:
        typeof helper.hero_side_target_dir === "string"
          ? helper.hero_side_target_dir
          : EMPTY_IMAGE_CATALOG.helper.hero_side_target_dir,
    },
    images: normalizedImages,
  };
}

function Spinner() {
  return (
    <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" opacity="0.3" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="var(--color-sage)" />
    </svg>
  );
}

interface SelectorSectionProps {
  title: string;
  open: boolean;
  selectedCount: number;
  totalCount: number;
  onToggle: () => void;
  children: ReactNode;
}

function SelectorSection({
  title,
  open,
  selectedCount,
  totalCount,
  onToggle,
  children,
}: SelectorSectionProps) {
  return (
    <div className="rounded-2xl border" style={{ borderColor: "var(--color-border)", background: "white" }}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>{title}</p>
          <p className="text-xs" style={{ color: "var(--color-muted)" }}>
            {selectedCount} selected of {totalCount}
          </p>
        </div>
        <span className="text-sm" style={{ color: "var(--color-muted)" }}>{open ? "Hide" : "Show"}</span>
      </button>
      {open && <div className="px-4 pb-4 border-t" style={{ borderColor: "var(--color-border)" }}>{children}</div>}
    </div>
  );
}

export default function AdminEventsPage() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [allItems, setAllItems] = useState<AdminItem[]>([]);
  const [allLocations, setAllLocations] = useState<AdminLocation[]>([]);
  const [imageCatalog, setImageCatalog] = useState<EventImageCatalog>(EMPTY_IMAGE_CATALOG);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventItem | null>(null);
  const [form, setForm] = useState<EventForm>({ ...EMPTY_FORM });

  const [itemsOpen, setItemsOpen] = useState(false);
  const [locationsOpen, setLocationsOpen] = useState(false);
  const [itemsSearch, setItemsSearch] = useState("");
  const [locationsSearch, setLocationsSearch] = useState("");
  const [itemsSelectedOnly, setItemsSelectedOnly] = useState(false);
  const [locationsSelectedOnly, setLocationsSelectedOnly] = useState(false);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const tooltipImageOptions = useMemo(
    () => imageCatalog.images.filter((image) => image.type === "tooltip"),
    [imageCatalog.images]
  );
  const heroSideImageOptions = useMemo(
    () => imageCatalog.images.filter((image) => image.type === "hero_side"),
    [imageCatalog.images]
  );

  const filteredItems = useMemo(() => {
    const query = itemsSearch.trim().toLowerCase();
    return allItems.filter((item) => {
      if (itemsSelectedOnly && !form.item_ids.includes(item.id)) return false;
      if (!query) return true;
      return item.name.toLowerCase().includes(query) || item.id.toLowerCase().includes(query);
    });
  }, [allItems, form.item_ids, itemsSearch, itemsSelectedOnly]);

  const filteredLocations = useMemo(() => {
    const query = locationsSearch.trim().toLowerCase();
    return allLocations.filter((location) => {
      if (locationsSelectedOnly && !form.location_ids.includes(location.id)) return false;
      if (!query) return true;
      return location.name.toLowerCase().includes(query) || location.id.toLowerCase().includes(query);
    });
  }, [allLocations, form.location_ids, locationsSearch, locationsSelectedOnly]);

  const selectedTooltipImage = useMemo(
    () => tooltipImageOptions.find((image) => image.key === form.tooltip_image_key) ?? null,
    [tooltipImageOptions, form.tooltip_image_key]
  );
  const selectedHeroSideImage = useMemo(
    () => heroSideImageOptions.find((image) => image.key === form.hero_side_image_key) ?? null,
    [heroSideImageOptions, form.hero_side_image_key]
  );

  const imageLabelForKey = useCallback(
    (key: string | null, type: EventImageType) => {
      if (!key) return "None";
      const image = imageCatalog.images.find((entry) => entry.key === key && entry.type === type);
      return image ? image.label : key;
    },
    [imageCatalog.images]
  );

  const resetSelectorState = () => {
    setItemsOpen(false);
    setLocationsOpen(false);
    setItemsSearch("");
    setLocationsSearch("");
    setItemsSelectedOnly(false);
    setLocationsSelectedOnly(false);
  };

  const loadData = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    const [eventsRes, itemsRes, locsRes, imagesRes] = await Promise.all([
      fetch(`${API_URL}/api/admin/events`, { headers }),
      fetch(`${API_URL}/api/admin/items`, { headers }),
      fetch(`${API_URL}/api/admin/locations`, { headers }),
      fetch(`${API_URL}/api/admin/event-images`, { headers }),
    ]);
    if (!eventsRes.ok || !itemsRes.ok || !locsRes.ok || !imagesRes.ok) {
      throw new Error("Failed to load data");
    }

    const [eventsData, itemsData, locationsData, imageCatalogData] = await Promise.all([
      eventsRes.json() as Promise<EventItem[]>,
      itemsRes.json() as Promise<AdminItem[]>,
      locsRes.json() as Promise<AdminLocation[]>,
      imagesRes.json() as Promise<unknown>,
    ]);

    setEvents(eventsData);
    setAllItems(itemsData);
    setAllLocations(locationsData);
    setImageCatalog(normalizeImageCatalog(imageCatalogData));
  }, []);

  useEffect(() => {
    setLoading(true);
    loadData()
      .catch(() => showToast("Failed to load events", "error"))
      .finally(() => setLoading(false));
  }, [loadData]);

  function openAdd() {
    setEditingEvent(null);
    setForm({ ...EMPTY_FORM });
    resetSelectorState();
    setModalOpen(true);
  }

  function openEdit(event: EventItem) {
    setEditingEvent(event);
    setForm({
      name: event.name,
      event_date: event.event_date,
      hero_header: event.hero_header,
      hero_header_sage: event.hero_header_sage ?? "",
      hero_subheader: event.hero_subheader,
      promo_details: event.promo_details ?? "",
      tooltip_enabled: event.tooltip_enabled,
      tooltip_header: event.tooltip_header ?? "",
      tooltip_body: event.tooltip_body ?? "",
      tooltip_image_key: event.tooltip_image_key,
      hero_side_image_key: event.hero_side_image_key,
      etransfer_enabled: event.etransfer_enabled,
      etransfer_email: event.etransfer_email ?? "",
      item_ids: [...event.item_ids],
      location_ids: [...event.location_ids],
    });
    resetSelectorState();
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
    if (!form.name.trim() || !form.event_date.trim() || !form.hero_header.trim()) {
      showToast("Event Name, Event Date, and Hero Header (White) are required", "error");
      return;
    }
    if (form.tooltip_enabled && (!form.tooltip_header.trim() || !form.tooltip_body.trim())) {
      showToast("Tooltip Header and Tooltip Body are required when tooltip is enabled", "error");
      return;
    }
    if (form.etransfer_enabled && !form.etransfer_email.trim()) {
      showToast("E-transfer email is required when e-transfer is enabled", "error");
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
        hero_header_sage: form.hero_header_sage.trim(),
        hero_subheader: form.hero_subheader.trim(),
        promo_details: form.promo_details.trim() || null,
        tooltip_enabled: form.tooltip_enabled,
        tooltip_header: form.tooltip_enabled ? form.tooltip_header.trim() : null,
        tooltip_body: form.tooltip_enabled ? form.tooltip_body.trim() : null,
        tooltip_image_key: form.tooltip_enabled ? (form.tooltip_image_key || null) : null,
        hero_side_image_key: form.hero_side_image_key || null,
        etransfer_enabled: form.etransfer_enabled,
        etransfer_email: form.etransfer_enabled ? form.etransfer_email.trim() : null,
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

      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, "Failed to save event"));
      }

      setModalOpen(false);
      await loadData();
      showToast(editingEvent ? "Event updated." : "Event created.", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save event";
      showToast(message, "error");
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
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "#1e3d18";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "var(--color-forest)";
          }}
        >
          + Add Event
        </button>
      </div>

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
                      <h2 className="text-base font-semibold truncate" style={{ color: "var(--color-forest)" }}>
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
                    <p className="text-sm mb-3" style={{ color: "var(--color-muted)" }}>{event.event_date}</p>
                    <p className="text-xs mb-1" style={{ color: "var(--color-muted)" }}>
                      Hero: {event.hero_header}
                      {event.hero_header_sage ? ` / ${event.hero_header_sage}` : ""}
                    </p>
                    <p className="text-xs mb-2" style={{ color: "var(--color-muted)" }}>
                      Tooltip: {event.tooltip_enabled ? "Enabled" : "Disabled"} | Tooltip image: {imageLabelForKey(event.tooltip_image_key, "tooltip")} | Side image: {imageLabelForKey(event.hero_side_image_key, "hero_side")} | E-transfer: {event.etransfer_enabled ? event.etransfer_email || "Enabled" : "Disabled"}
                    </p>

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
                    {eventLocations.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {eventLocations.map((location) => (
                          <span
                            key={location.id}
                            className="px-2.5 py-1 rounded-lg text-xs font-medium"
                            style={{ background: "#f0fdf4", color: "#166534", border: "1px solid #bbf7d0" }}
                          >
                            {location.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => openEdit(event)}
                      className="px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
                      style={{ border: "1px solid var(--color-border)", color: "var(--color-text)", background: "white" }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = "var(--color-cream)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.background = "white";
                      }}
                    >
                      Edit
                    </button>
                    {!event.is_active && (
                      <button
                        onClick={() => handleActivate(event.id)}
                        disabled={activating === event.id}
                        className="px-3 py-1.5 rounded-xl text-xs font-medium transition-all disabled:opacity-60"
                        style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}
                        onMouseEnter={(e) => {
                          if (activating !== event.id) (e.currentTarget as HTMLButtonElement).style.background = "#1e3d18";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.background = "var(--color-forest)";
                        }}
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
                        onMouseEnter={(e) => {
                          if (deleting !== event.id) (e.currentTarget as HTMLButtonElement).style.background = "#fecaca";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.background = "#fee2e2";
                        }}
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

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false);
          }}
        >
          <div
            className="w-full max-w-3xl rounded-3xl shadow-2xl overflow-y-auto"
            style={{ background: "white", maxHeight: "90vh" }}
          >
            <div className="px-8 py-6 border-b" style={{ borderColor: "var(--color-border)" }}>
              <h2 className="text-lg font-semibold" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>
                {editingEvent ? "Edit Event" : "New Event"}
              </h2>
            </div>

            <div className="px-8 py-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              </div>

              <div>
                <label className={labelClass} style={{ color: "var(--color-text)" }}>
                  Hero Header (White) <span style={{ color: "#dc2626" }}>*</span>
                </label>
                <input
                  type="text"
                  value={form.hero_header}
                  onChange={(e) => setForm((p) => ({ ...p, hero_header: e.target.value }))}
                  placeholder="e.g. We're Making"
                  className={inputClass}
                  style={{ color: "var(--color-text)" }}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass} style={{ color: "var(--color-text)" }}>
                    Hero Header (Sage) <span className="font-normal text-xs" style={{ color: "var(--color-muted)" }}>(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={form.hero_header_sage}
                    onChange={(e) => setForm((p) => ({ ...p, hero_header_sage: e.target.value }))}
                    placeholder="e.g. Lamprais"
                    className={inputClass}
                    style={{ color: "var(--color-text)" }}
                  />
                </div>

                <div>
                  <label className={labelClass} style={{ color: "var(--color-text)" }}>
                    Hero Subheader <span className="font-normal text-xs" style={{ color: "var(--color-muted)" }}>(optional)</span>
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
              </div>

              <div>
                <label className={labelClass} style={{ color: "var(--color-text)" }}>
                  Promo Details <span className="font-normal text-xs" style={{ color: "var(--color-muted)" }}>(optional)</span>
                </label>
                <textarea
                  value={form.promo_details}
                  onChange={(e) => setForm((p) => ({ ...p, promo_details: e.target.value }))}
                  placeholder="e.g. Special launch price for this batch."
                  rows={2}
                  className={inputClass}
                  style={{ color: "var(--color-text)", resize: "vertical" }}
                />
              </div>

              <div className="rounded-2xl border p-4" style={{ borderColor: "var(--color-border)", background: "var(--color-cream)" }}>
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>Tooltip</p>
                    <p className="text-xs" style={{ color: "var(--color-muted)" }}>
                      Enable this only when the event needs additional contextual info.
                    </p>
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm" style={{ color: "var(--color-text)" }}>
                    <input
                      type="checkbox"
                      checked={form.tooltip_enabled}
                      onChange={(e) => setForm((p) => ({
                        ...p,
                        tooltip_enabled: e.target.checked,
                        tooltip_header: e.target.checked ? p.tooltip_header : "",
                        tooltip_body: e.target.checked ? p.tooltip_body : "",
                        tooltip_image_key: e.target.checked ? p.tooltip_image_key : null,
                      }))}
                      style={{ accentColor: "var(--color-sage)" }}
                    />
                    Enable Tooltip
                  </label>
                </div>

                {form.tooltip_enabled ? (
                  <div className="space-y-4 mt-3">
                    <div>
                      <label className={labelClass} style={{ color: "var(--color-text)" }}>
                        Tooltip Header <span style={{ color: "#dc2626" }}>*</span>
                      </label>
                      <input
                        type="text"
                        value={form.tooltip_header}
                        onChange={(e) => setForm((p) => ({ ...p, tooltip_header: e.target.value }))}
                        placeholder="e.g. What is Lamprais?"
                        className={inputClass}
                        style={{ color: "var(--color-text)", background: "white" }}
                      />
                    </div>
                    <div>
                      <label className={labelClass} style={{ color: "var(--color-text)" }}>
                        Tooltip Body <span style={{ color: "#dc2626" }}>*</span>
                      </label>
                      <textarea
                        value={form.tooltip_body}
                        onChange={(e) => setForm((p) => ({ ...p, tooltip_body: e.target.value }))}
                        placeholder="Describe what customers should know for this event."
                        rows={3}
                        className={inputClass}
                        style={{ color: "var(--color-text)", background: "white", resize: "vertical" }}
                      />
                    </div>
                    <div>
                      <label className={labelClass} style={{ color: "var(--color-text)" }}>
                        Tooltip Image <span className="font-normal text-xs" style={{ color: "var(--color-muted)" }}>(optional)</span>
                      </label>
                      <select
                        value={form.tooltip_image_key ?? ""}
                        onChange={(e) => setForm((p) => ({ ...p, tooltip_image_key: e.target.value || null }))}
                        className={inputClass}
                        style={{ color: "var(--color-text)", background: "white" }}
                      >
                        <option value="">None</option>
                        {tooltipImageOptions.map((image) => (
                          <option key={image.key} value={image.key}>
                            {image.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {selectedTooltipImage && (
                      <div className="rounded-xl overflow-hidden border" style={{ borderColor: "var(--color-border)", background: "white" }}>
                        <img src={selectedTooltipImage.path} alt={selectedTooltipImage.alt} className="w-full h-auto" />
                        <p className="px-3 py-2 text-xs" style={{ color: "var(--color-muted)" }}>
                          {selectedTooltipImage.path}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs mt-3" style={{ color: "var(--color-muted)" }}>
                    Tooltip fields stay hidden until this toggle is enabled.
                  </p>
                )}
              </div>

              <div className="rounded-2xl border p-4" style={{ borderColor: "var(--color-border)", background: "white" }}>
                <label className={labelClass} style={{ color: "var(--color-text)" }}>
                  Hero Side Image <span className="font-normal text-xs" style={{ color: "var(--color-muted)" }}>(optional)</span>
                </label>
                <select
                  value={form.hero_side_image_key ?? ""}
                  onChange={(e) => setForm((p) => ({ ...p, hero_side_image_key: e.target.value || null }))}
                  className={inputClass}
                  style={{ color: "var(--color-text)" }}
                >
                  <option value="">None</option>
                  {heroSideImageOptions.map((image) => (
                    <option key={image.key} value={image.key}>
                      {image.label}
                    </option>
                  ))}
                </select>
                {selectedHeroSideImage && (
                  <div className="mt-3 rounded-xl overflow-hidden border" style={{ borderColor: "var(--color-border)" }}>
                    <img src={selectedHeroSideImage.path} alt={selectedHeroSideImage.alt} className="w-full h-auto" />
                    <p className="px-3 py-2 text-xs" style={{ color: "var(--color-muted)" }}>
                      {selectedHeroSideImage.path}
                    </p>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border p-4" style={{ borderColor: "var(--color-border)", background: "var(--color-cream)" }}>
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>E-transfer</p>
                    <p className="text-xs" style={{ color: "var(--color-muted)" }}>
                      When enabled, this payment section appears after submit and in confirmation emails.
                    </p>
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm" style={{ color: "var(--color-text)" }}>
                    <input
                      type="checkbox"
                      checked={form.etransfer_enabled}
                      onChange={(e) => setForm((p) => ({
                        ...p,
                        etransfer_enabled: e.target.checked,
                        etransfer_email: e.target.checked ? p.etransfer_email : "",
                      }))}
                      style={{ accentColor: "var(--color-sage)" }}
                    />
                    Enable E-transfer
                  </label>
                </div>
                {form.etransfer_enabled ? (
                  <div className="mt-3">
                    <label className={labelClass} style={{ color: "var(--color-text)" }}>
                      E-transfer Email <span style={{ color: "#dc2626" }}>*</span>
                    </label>
                    <input
                      type="email"
                      value={form.etransfer_email}
                      onChange={(e) => setForm((p) => ({ ...p, etransfer_email: e.target.value }))}
                      placeholder="payments@example.com"
                      className={inputClass}
                      style={{ color: "var(--color-text)", background: "white" }}
                    />
                  </div>
                ) : (
                  <p className="text-xs mt-3" style={{ color: "var(--color-muted)" }}>
                    E-transfer fields stay hidden until this toggle is enabled.
                  </p>
                )}
              </div>

              <div className="rounded-2xl border p-4" style={{ borderColor: "var(--color-border)", background: "white" }}>
                <p className="text-sm font-semibold mb-1" style={{ color: "var(--color-text)" }}>Image Helper</p>
                <p className="text-xs mb-2" style={{ color: "var(--color-muted)" }}>
                  Place files in these folders, then add an entry to <code>config/event-images.json</code> and run <code>make sync-config</code>.
                </p>
                <p className="text-xs" style={{ color: "var(--color-muted)" }}>
                  Tooltip images folder: <code>{imageCatalog.helper.tooltip_target_dir}</code>
                </p>
                <p className="text-xs" style={{ color: "var(--color-muted)" }}>
                  Hero side images folder: <code>{imageCatalog.helper.hero_side_target_dir}</code>
                </p>
              </div>

              <SelectorSection
                title="Items"
                open={itemsOpen}
                selectedCount={form.item_ids.length}
                totalCount={allItems.length}
                onToggle={() => setItemsOpen((v) => !v)}
              >
                {allItems.length === 0 ? (
                  <p className="text-sm py-3" style={{ color: "var(--color-muted)" }}>
                    No items found. Add items first.
                  </p>
                ) : (
                  <div className="space-y-3 pt-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <input
                        type="text"
                        value={itemsSearch}
                        onChange={(e) => setItemsSearch(e.target.value)}
                        placeholder="Search items by name..."
                        className={inputClass}
                        style={{ color: "var(--color-text)" }}
                      />
                      <label className="inline-flex items-center gap-2 text-sm" style={{ color: "var(--color-text)" }}>
                        <input
                          type="checkbox"
                          checked={itemsSelectedOnly}
                          onChange={(e) => setItemsSelectedOnly(e.target.checked)}
                          style={{ accentColor: "var(--color-sage)" }}
                        />
                        Show selected only
                      </label>
                    </div>
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {filteredItems.map((item) => (
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
                      {filteredItems.length === 0 && (
                        <p className="text-sm py-3" style={{ color: "var(--color-muted)" }}>
                          No matching items.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </SelectorSection>

              <SelectorSection
                title="Locations"
                open={locationsOpen}
                selectedCount={form.location_ids.length}
                totalCount={allLocations.length}
                onToggle={() => setLocationsOpen((v) => !v)}
              >
                {allLocations.length === 0 ? (
                  <p className="text-sm py-3" style={{ color: "var(--color-muted)" }}>
                    No locations found. Add locations first.
                  </p>
                ) : (
                  <div className="space-y-3 pt-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <input
                        type="text"
                        value={locationsSearch}
                        onChange={(e) => setLocationsSearch(e.target.value)}
                        placeholder="Search locations by name..."
                        className={inputClass}
                        style={{ color: "var(--color-text)" }}
                      />
                      <label className="inline-flex items-center gap-2 text-sm" style={{ color: "var(--color-text)" }}>
                        <input
                          type="checkbox"
                          checked={locationsSelectedOnly}
                          onChange={(e) => setLocationsSelectedOnly(e.target.checked)}
                          style={{ accentColor: "var(--color-sage)" }}
                        />
                        Show selected only
                      </label>
                    </div>
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {filteredLocations.map((location) => (
                        <label
                          key={location.id}
                          className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all"
                          style={{
                            border: `1px solid ${form.location_ids.includes(location.id) ? "var(--color-sage)" : "var(--color-border)"}`,
                            background: form.location_ids.includes(location.id) ? "#f0fdf4" : "white",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={form.location_ids.includes(location.id)}
                            onChange={() => toggleCheckbox("location_ids", location.id)}
                            className="rounded"
                            style={{ accentColor: "var(--color-sage)" }}
                          />
                          <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                            {location.name}
                          </span>
                        </label>
                      ))}
                      {filteredLocations.length === 0 && (
                        <p className="text-sm py-3" style={{ color: "var(--color-muted)" }}>
                          No matching locations.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </SelectorSection>
            </div>

            <div className="px-8 py-5 border-t flex justify-end gap-3" style={{ borderColor: "var(--color-border)" }}>
              <button
                onClick={() => setModalOpen(false)}
                className="px-5 py-2.5 rounded-2xl text-sm font-medium transition-all"
                style={{ border: "1px solid var(--color-border)", color: "var(--color-text)", background: "white" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "var(--color-cream)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "white";
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2.5 rounded-2xl text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}
                onMouseEnter={(e) => {
                  if (!saving) (e.currentTarget as HTMLButtonElement).style.background = "#1e3d18";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "var(--color-forest)";
                }}
              >
                {saving ? "Saving..." : editingEvent ? "Save Changes" : "Create Event"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
