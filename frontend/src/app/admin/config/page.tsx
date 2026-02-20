"use client";

import { useState, useEffect } from "react";
import { API_URL, type Item, type Location } from "@/config/event";
import { getAdminToken } from "@/lib/auth";

interface ConfigState {
  event_date: string;
  currency: string;
  items: Item[];
  locations: Location[];
}

const CURRENCY_OPTIONS = ["CAD", "AUD", "USD", "GBP", "NZD", "EUR"];

const EMPTY_ITEM: Item = {
  id: "",
  name: "",
  description: "",
  price: 0,
  discounted_price: null,
};

const EMPTY_LOCATION: Location = {
  id: "",
  name: "",
  address: "",
  timeSlots: [],
};

export default function AdminConfigPage() {
  const [config, setConfig] = useState<ConfigState>({
    event_date: "",
    currency: "CAD",
    items: [],
    locations: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [newSlots, setNewSlots] = useState<Record<number, string>>({});

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    async function loadConfig() {
      try {
        const token = await getAdminToken();
        if (!token) return;
        const res = await fetch(`${API_URL}/api/admin/config`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Failed to load config");
        const data = await res.json();
        setConfig({
          event_date: data.event?.date ?? "",
          currency: data.currency ?? "CAD",
          items: data.items ?? [],
          locations: data.locations ?? [],
        });
      } catch {
        showToast("Failed to load configuration", "error");
      } finally {
        setLoading(false);
      }
    }
    loadConfig();
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      const res = await fetch(`${API_URL}/api/admin/config`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(config),
      });

      if (!res.ok) throw new Error("Save failed");
      showToast("Configuration saved! Changes are now live.", "success");
    } catch {
      showToast("Failed to save configuration", "error");
    } finally {
      setSaving(false);
    }
  }

  // -------- Item helpers --------
  function updateItem(index: number, field: keyof Item, value: string | number | null) {
    setConfig((prev) => {
      const items = [...prev.items];
      items[index] = { ...items[index], [field]: value };
      return { ...prev, items };
    });
  }

  function addItem() {
    setConfig((prev) => ({ ...prev, items: [...prev.items, { ...EMPTY_ITEM, id: `item-${Date.now()}` }] }));
  }

  function removeItem(index: number) {
    setConfig((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));
  }

  // -------- Location helpers --------
  function updateLocation(index: number, field: keyof Location, value: string | string[]) {
    setConfig((prev) => {
      const locations = [...prev.locations];
      locations[index] = { ...locations[index], [field]: value };
      return { ...prev, locations };
    });
  }

  function addLocation() {
    setConfig((prev) => ({
      ...prev,
      locations: [...prev.locations, { ...EMPTY_LOCATION, id: `loc-${Date.now()}` }],
    }));
  }

  function removeLocation(index: number) {
    setConfig((prev) => ({ ...prev, locations: prev.locations.filter((_, i) => i !== index) }));
  }

  function addTimeSlot(locIndex: number) {
    const slot = newSlots[locIndex]?.trim();
    if (!slot) return;
    setConfig((prev) => {
      const locations = [...prev.locations];
      locations[locIndex] = {
        ...locations[locIndex],
        timeSlots: [...locations[locIndex].timeSlots, slot],
      };
      return { ...prev, locations };
    });
    setNewSlots((prev) => ({ ...prev, [locIndex]: "" }));
  }

  function removeTimeSlot(locIndex: number, slotIndex: number) {
    setConfig((prev) => {
      const locations = [...prev.locations];
      locations[locIndex] = {
        ...locations[locIndex],
        timeSlots: locations[locIndex].timeSlots.filter((_, i) => i !== slotIndex),
      };
      return { ...prev, locations };
    });
  }

  const labelClass = "block text-sm font-medium mb-1.5";
  const inputClass =
    "w-full px-4 py-3 rounded-xl text-sm border bg-white focus:outline-none focus:ring-2 transition-all border-[var(--color-border)] focus:ring-[var(--color-sage)] focus:border-[var(--color-sage)]";

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <svg className="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" opacity="0.3" />
          <path d="M12 2a10 10 0 0 1 10 10" stroke="var(--color-sage)" />
        </svg>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl">
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
      <div className="mb-8">
        <h1
          className="text-2xl font-bold mb-1"
          style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}
        >
          Event Configuration
        </h1>
        <p className="text-sm" style={{ color: "var(--color-muted)" }}>
          Changes save to the database and appear on the order page immediately.
        </p>
      </div>

      <div className="space-y-6">
        {/* Event Details */}
        <div
          className="rounded-2xl p-6"
          style={{ background: "white", border: "1px solid var(--color-border)" }}
        >
          <h2 className="text-base font-semibold mb-4" style={{ color: "var(--color-forest)" }}>
            Event Details
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass} style={{ color: "var(--color-text)" }}>
                Event Date
              </label>
              <input
                type="text"
                value={config.event_date}
                onChange={(e) => setConfig((prev) => ({ ...prev, event_date: e.target.value }))}
                placeholder="e.g. February 28th, 2026"
                className={inputClass}
                style={{ color: "var(--color-text)" }}
              />
            </div>
            <div>
              <label className={labelClass} style={{ color: "var(--color-text)" }}>
                Currency
              </label>
              <select
                value={config.currency}
                onChange={(e) => setConfig((prev) => ({ ...prev, currency: e.target.value }))}
                className={inputClass}
                style={{ color: "var(--color-text)" }}
              >
                {CURRENCY_OPTIONS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Items */}
        <div
          className="rounded-2xl p-6"
          style={{ background: "white", border: "1px solid var(--color-border)" }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold" style={{ color: "var(--color-forest)" }}>
              Menu Items
            </h2>
            <button
              onClick={addItem}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all"
              style={{ background: "var(--color-cream)", color: "var(--color-forest)", border: "1px solid var(--color-border)" }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              Add Item
            </button>
          </div>

          <div className="space-y-4">
            {config.items.map((item, idx) => (
              <div
                key={idx}
                className="rounded-xl p-4 space-y-3"
                style={{ background: "var(--color-cream)", border: "1px solid var(--color-border)" }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-sage)" }}>
                    Item {idx + 1}
                  </span>
                  <button
                    onClick={() => removeItem(idx)}
                    className="text-xs text-red-500 hover:text-red-700 transition-colors"
                  >
                    Remove
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass} style={{ color: "var(--color-text)" }}>Name</label>
                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) => updateItem(idx, "name", e.target.value)}
                      className={inputClass}
                      style={{ color: "var(--color-text)" }}
                    />
                  </div>
                  <div>
                    <label className={labelClass} style={{ color: "var(--color-text)" }}>Item ID</label>
                    <input
                      type="text"
                      value={item.id}
                      onChange={(e) => updateItem(idx, "id", e.target.value)}
                      className={inputClass}
                      style={{ color: "var(--color-text)" }}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClass} style={{ color: "var(--color-text)" }}>Description</label>
                  <input
                    type="text"
                    value={item.description ?? ""}
                    onChange={(e) => updateItem(idx, "description", e.target.value)}
                    className={inputClass}
                    style={{ color: "var(--color-text)" }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass} style={{ color: "var(--color-text)" }}>Regular Price ({config.currency})</label>
                    <input
                      type="number"
                      step="0.01"
                      value={item.price}
                      onChange={(e) => updateItem(idx, "price", parseFloat(e.target.value) || 0)}
                      className={inputClass}
                      style={{ color: "var(--color-text)" }}
                    />
                  </div>
                  <div>
                    <label className={labelClass} style={{ color: "var(--color-text)" }}>Discounted Price (optional)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={item.discounted_price ?? ""}
                      placeholder="Leave blank for no discount"
                      onChange={(e) => {
                        const val = e.target.value;
                        updateItem(idx, "discounted_price", val === "" ? null : parseFloat(val) || 0);
                      }}
                      className={inputClass}
                      style={{ color: "var(--color-text)" }}
                    />
                  </div>
                </div>
              </div>
            ))}
            {config.items.length === 0 && (
              <p className="text-sm text-center py-4" style={{ color: "var(--color-muted)" }}>
                No items. Add one above.
              </p>
            )}
          </div>
        </div>

        {/* Locations */}
        <div
          className="rounded-2xl p-6"
          style={{ background: "white", border: "1px solid var(--color-border)" }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold" style={{ color: "var(--color-forest)" }}>
              Pickup Locations
            </h2>
            <button
              onClick={addLocation}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all"
              style={{ background: "var(--color-cream)", color: "var(--color-forest)", border: "1px solid var(--color-border)" }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              Add Location
            </button>
          </div>

          <div className="space-y-5">
            {config.locations.map((loc, locIdx) => (
              <div
                key={locIdx}
                className="rounded-xl p-4 space-y-3"
                style={{ background: "var(--color-cream)", border: "1px solid var(--color-border)" }}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-sage)" }}>
                    Location {locIdx + 1}
                  </span>
                  <button
                    onClick={() => removeLocation(locIdx)}
                    className="text-xs text-red-500 hover:text-red-700 transition-colors"
                  >
                    Remove
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass} style={{ color: "var(--color-text)" }}>Location Name</label>
                    <input
                      type="text"
                      value={loc.name}
                      onChange={(e) => updateLocation(locIdx, "name", e.target.value)}
                      placeholder="e.g. Woodbridge"
                      className={inputClass}
                      style={{ color: "var(--color-text)" }}
                    />
                  </div>
                  <div>
                    <label className={labelClass} style={{ color: "var(--color-text)" }}>Location ID</label>
                    <input
                      type="text"
                      value={loc.id}
                      onChange={(e) => updateLocation(locIdx, "id", e.target.value)}
                      placeholder="e.g. woodbridge"
                      className={inputClass}
                      style={{ color: "var(--color-text)" }}
                    />
                  </div>
                </div>

                <div>
                  <label className={labelClass} style={{ color: "var(--color-text)" }}>
                    Pickup Address
                    <span className="ml-1 font-normal" style={{ color: "var(--color-muted)" }}>(included in confirmation email)</span>
                  </label>
                  <input
                    type="text"
                    value={loc.address ?? ""}
                    onChange={(e) => updateLocation(locIdx, "address", e.target.value)}
                    placeholder="e.g. 123 Main St, Woodbridge, ON L4H 1A1"
                    className={inputClass}
                    style={{ color: "var(--color-text)" }}
                  />
                </div>

                <div>
                  <label className={labelClass} style={{ color: "var(--color-text)" }}>Time Slots</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {loc.timeSlots.map((slot, slotIdx) => (
                      <span
                        key={slotIdx}
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium"
                        style={{ background: "white", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
                      >
                        {slot}
                        <button
                          onClick={() => removeTimeSlot(locIdx, slotIdx)}
                          className="text-red-400 hover:text-red-600 transition-colors leading-none"
                          aria-label="Remove time slot"
                        >
                          x
                        </button>
                      </span>
                    ))}
                    {loc.timeSlots.length === 0 && (
                      <p className="text-xs" style={{ color: "var(--color-muted)" }}>No time slots yet.</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newSlots[locIdx] ?? ""}
                      onChange={(e) => setNewSlots((prev) => ({ ...prev, [locIdx]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTimeSlot(locIdx); } }}
                      placeholder="e.g. 12:00 PM - 1:00 PM"
                      className="flex-1 px-3 py-2 rounded-xl text-sm border bg-white focus:outline-none focus:ring-2 transition-all border-[var(--color-border)] focus:ring-[var(--color-sage)] focus:border-[var(--color-sage)]"
                      style={{ color: "var(--color-text)" }}
                    />
                    <button
                      onClick={() => addTimeSlot(locIdx)}
                      className="px-3 py-2 rounded-xl text-sm font-medium transition-all"
                      style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {config.locations.length === 0 && (
              <p className="text-sm text-center py-4" style={{ color: "var(--color-muted)" }}>
                No locations. Add one above.
              </p>
            )}
          </div>
        </div>

        {/* Save */}
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-8 py-3.5 rounded-2xl text-sm font-semibold tracking-wide transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}
            onMouseEnter={(e) => {
              if (!saving) (e.currentTarget as HTMLButtonElement).style.background = "#1e3d18";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "var(--color-forest)";
            }}
          >
            {saving ? "Saving..." : "Save Configuration"}
          </button>
        </div>
      </div>
    </div>
  );
}
