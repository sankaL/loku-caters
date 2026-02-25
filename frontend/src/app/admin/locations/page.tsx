"use client";

import { useCallback, useEffect, useState } from "react";
import { API_URL } from "@/config/event";
import { getAdminToken } from "@/lib/auth";

interface Location {
  id: string;
  name: string;
  address: string;
  time_slots: string[];
  sort_order: number;
}

const EMPTY_FORM = {
  name: "",
  address: "",
  time_slots: [] as string[],
};

export default function AdminLocationsPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [newSlot, setNewSlot] = useState("");
  const [saving, setSaving] = useState(false);

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const loadLocations = useCallback(async () => {
    try {
      const token = await getAdminToken();
      if (!token) return;
      const res = await fetch(`${API_URL}/api/admin/locations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load locations");
      setLocations(await res.json());
    } catch {
      showToast("Failed to load locations", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadLocations(); }, [loadLocations]);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setNewSlot("");
    setShowModal(true);
  }

  function openEdit(loc: Location) {
    setEditingId(loc.id);
    setForm({ name: loc.name, address: loc.address, time_slots: [...loc.time_slots] });
    setNewSlot("");
    setShowModal(true);
  }

  function addSlot() {
    const slot = newSlot.trim();
    if (!slot) return;
    setForm((p) => ({ ...p, time_slots: [...p.time_slots, slot] }));
    setNewSlot("");
  }

  function removeSlot(idx: number) {
    setForm((p) => ({ ...p, time_slots: p.time_slots.filter((_, i) => i !== idx) }));
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const token = await getAdminToken();
      if (!token) return;

      const body: Record<string, unknown> = {
        name: form.name.trim(),
        address: form.address.trim(),
        time_slots: form.time_slots,
      };

      let res: Response;
      if (editingId) {
        res = await fetch(`${API_URL}/api/admin/locations/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch(`${API_URL}/api/admin/locations`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        });
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.detail || "Save failed");
      }

      setShowModal(false);
      showToast(editingId ? "Location updated." : "Location created.", "success");
      await loadLocations();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(`Delete location "${id}"?`)) return;
    try {
      const token = await getAdminToken();
      if (!token) return;
      const res = await fetch(`${API_URL}/api/admin/locations/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Delete failed");
      showToast("Location deleted.", "success");
      await loadLocations();
    } catch {
      showToast("Failed to delete location", "error");
    }
  }

  const inputClass =
    "w-full px-4 py-3 rounded-xl text-sm border bg-white focus:outline-none focus:ring-2 transition-all border-[var(--color-border)] focus:ring-[var(--color-sage)] focus:border-[var(--color-sage)]";
  const labelClass = "block text-sm font-medium mb-1.5";

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

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1
            className="text-2xl font-bold mb-1"
            style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}
          >
            Pickup Locations
          </h1>
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            Manage pickup locations and their available time slots.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all"
          style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#1e3d18"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--color-forest)"; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          Add Location
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <svg className="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" opacity="0.3" />
            <path d="M12 2a10 10 0 0 1 10 10" stroke="var(--color-sage)" />
          </svg>
        </div>
      ) : locations.length === 0 ? (
        <div
          className="rounded-2xl p-10 text-center"
          style={{ background: "white", border: "1px solid var(--color-border)" }}
        >
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            No locations yet. Add one above.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {locations.map((loc) => (
            <div
              key={loc.id}
              className="rounded-2xl p-5"
              style={{ background: "white", border: "1px solid var(--color-border)" }}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-semibold" style={{ color: "var(--color-forest)" }}>{loc.name}</p>
                  <p className="text-xs font-mono mt-0.5" style={{ color: "var(--color-muted)" }}>{loc.id}</p>
                  {loc.address && (
                    <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>{loc.address}</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => openEdit(loc)}
                    className="text-xs font-medium transition-colors"
                    style={{ color: "var(--color-sage)" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--color-forest)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--color-sage)"; }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(loc.id)}
                    className="text-xs font-medium text-red-400 hover:text-red-600 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {loc.time_slots.length === 0 ? (
                  <span className="text-xs" style={{ color: "var(--color-muted)" }}>No time slots</span>
                ) : loc.time_slots.map((slot, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium"
                    style={{ background: "var(--color-cream)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
                  >
                    {slot}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.4)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div
            className="w-full max-w-md rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
            style={{ background: "white" }}
          >
            <h2 className="text-lg font-semibold" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>
              {editingId ? "Edit Location" : "Add Location"}
            </h2>

            <div>
              <label className={labelClass} style={{ color: "var(--color-text)" }}>Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Woodbridge"
                className={inputClass}
                style={{ color: "var(--color-text)" }}
              />
            </div>

            <div>
              <label className={labelClass} style={{ color: "var(--color-text)" }}>
                Address <span className="font-normal" style={{ color: "var(--color-muted)" }}>(shown in confirmation email)</span>
              </label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                placeholder="e.g. 123 Main St, Woodbridge, ON"
                className={inputClass}
                style={{ color: "var(--color-text)" }}
              />
            </div>

            <div>
              <label className={labelClass} style={{ color: "var(--color-text)" }}>Time Slots</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {form.time_slots.map((slot, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium"
                    style={{ background: "var(--color-cream)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
                  >
                    {slot}
                    <button
                      onClick={() => removeSlot(i)}
                      className="text-red-400 hover:text-red-600 transition-colors leading-none"
                      aria-label="Remove time slot"
                    >
                      x
                    </button>
                  </span>
                ))}
                {form.time_slots.length === 0 && (
                  <p className="text-xs" style={{ color: "var(--color-muted)" }}>No time slots yet.</p>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newSlot}
                  onChange={(e) => setNewSlot(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSlot(); } }}
                  placeholder="e.g. 12:00 PM - 1:00 PM"
                  className="flex-1 px-3 py-2 rounded-xl text-sm border bg-white focus:outline-none focus:ring-2 transition-all border-[var(--color-border)] focus:ring-[var(--color-sage)] focus:border-[var(--color-sage)]"
                  style={{ color: "var(--color-text)" }}
                />
                <button
                  onClick={addSlot}
                  className="px-3 py-2 rounded-xl text-sm font-medium transition-all"
                  style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}
                >
                  Add
                </button>
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2.5 rounded-xl text-sm font-medium"
                style={{ background: "var(--color-cream)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-60"
                style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
