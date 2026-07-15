"use client";

import { useCallback, useEffect, useState } from "react";
import { API_URL } from "@/config/event";
import { getAdminToken } from "@/lib/auth";
import AdminToast from "@/components/admin/AdminToast";
import { useAdminToast } from "@/components/admin/useAdminToast";
import { runAdminDeleteAction, runAdminSaveAction } from "@/lib/adminCrud";
import {
  ADMIN_FORM_INPUT_CLASS,
  ADMIN_FORM_LABEL_CLASS,
  AdminCrudContent,
  AdminCrudPageHeader,
  AdminCrudRowActions,
  AdminModalActions,
} from "@/components/admin/AdminCrudParts";

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

type LocationForm = typeof EMPTY_FORM;

interface LocationsPageState {
  locations: Location[];
  loading: boolean;
  showModal: boolean;
  editingId: string | null;
  form: LocationForm;
  newSlot: string;
  saving: boolean;
}

const INITIAL_STATE: LocationsPageState = {
  locations: [],
  loading: true,
  showModal: false,
  editingId: null,
  form: EMPTY_FORM,
  newSlot: "",
  saving: false,
};

export default function AdminLocationsPage() {
  const [state, setState] = useState<LocationsPageState>(INITIAL_STATE);
  const { locations, loading, showModal, editingId, form, newSlot, saving } = state;
  const { toast, showToast } = useAdminToast(4000);
  const updateState = useCallback((patch: Partial<LocationsPageState>) => {
    setState((current) => ({ ...current, ...patch }));
  }, []);
  const updateForm = useCallback((patch: Partial<LocationForm>) => {
    setState((current) => ({ ...current, form: { ...current.form, ...patch } }));
  }, []);

  const loadLocations = useCallback(async () => {
    try {
      const token = await getAdminToken();
      if (!token) return;
      const res = await fetch(`${API_URL}/api/admin/locations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load locations");
      updateState({ locations: await res.json() });
    } catch {
      showToast("Failed to load locations", "error");
    } finally {
      updateState({ loading: false });
    }
  }, [showToast, updateState]);

  useEffect(() => { loadLocations(); }, [loadLocations]);

  function openCreate() {
    updateState({ editingId: null, form: EMPTY_FORM, newSlot: "", showModal: true });
  }

  function openEdit(loc: Location) {
    updateState({
      editingId: loc.id,
      form: { name: loc.name, address: loc.address, time_slots: [...loc.time_slots] },
      newSlot: "",
      showModal: true,
    });
  }

  function addSlot() {
    const slot = newSlot.trim();
    if (!slot) return;
    updateState({ form: { ...form, time_slots: [...form.time_slots, slot] }, newSlot: "" });
  }

  function removeSlot(idx: number) {
    updateForm({ time_slots: form.time_slots.filter((_, index) => index !== idx) });
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    await runAdminSaveAction({
      resourcePath: "/api/admin/locations",
      id: editingId,
      body: { name: form.name.trim(), address: form.address.trim(), time_slots: form.time_slots },
      successMessage: editingId ? "Location updated." : "Location created.",
      onSaved: async () => {
        updateState({ showModal: false });
        await loadLocations();
      },
      setSaving: (next) => updateState({ saving: next }),
      notify: showToast,
    });
  }

  async function handleDelete(id: string) {
    await runAdminDeleteAction({ resourcePath: "/api/admin/locations", id, entityLabel: "location", successMessage: "Location deleted.", onDeleted: loadLocations, notify: showToast });
  }

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
      <AdminToast toast={toast} />

      <AdminCrudPageHeader title="Pickup Locations" description="Manage pickup locations and their available time slots." actionLabel="Add Location" onAction={openCreate} />

      <AdminCrudContent loading={loading} empty={locations.length === 0} emptyMessage="No locations yet. Add one above.">
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
                <AdminCrudRowActions onEdit={() => openEdit(loc)} onDelete={() => handleDelete(loc.id)} />
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
      </AdminCrudContent>

      {/* Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.4)" }}
          onClick={(event) => { if (event.target === event.currentTarget) updateState({ showModal: false }); }}
        >
          <div
            className="w-full max-w-md rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
            style={{ background: "white" }}
          >
            <h2 className="text-lg font-semibold" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>
              {editingId ? "Edit Location" : "Add Location"}
            </h2>

            <div>
              <label className={ADMIN_FORM_LABEL_CLASS} style={{ color: "var(--color-text)" }}>Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(event) => updateForm({ name: event.target.value })}
                placeholder="e.g. Woodbridge"
                className={ADMIN_FORM_INPUT_CLASS}
                style={{ color: "var(--color-text)" }}
              />
            </div>

            <div>
              <label className={ADMIN_FORM_LABEL_CLASS} style={{ color: "var(--color-text)" }}>
                Address <span className="font-normal" style={{ color: "var(--color-muted)" }}>(shown in confirmation email)</span>
              </label>
              <input
                type="text"
                value={form.address}
                onChange={(event) => updateForm({ address: event.target.value })}
                placeholder="e.g. 123 Main St, Woodbridge, ON"
                className={ADMIN_FORM_INPUT_CLASS}
                style={{ color: "var(--color-text)" }}
              />
            </div>

            <div>
              <label className={ADMIN_FORM_LABEL_CLASS} style={{ color: "var(--color-text)" }}>Time Slots</label>
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
                  onChange={(event) => updateState({ newSlot: event.target.value })}
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

            <AdminModalActions saving={saving} onCancel={() => updateState({ showModal: false })} onSave={handleSave} />
          </div>
        </div>
      )}
    </div>
  );
}
