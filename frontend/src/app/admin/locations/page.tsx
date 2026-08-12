"use client";

import { useCallback, useEffect, useState } from "react";
import { API_URL } from "@/config/event";
import { getAdminToken } from "@/lib/auth";
import AdminToast from "@/components/admin/AdminToast";
import { useAdminToast } from "@/hooks/useAdminToast";
import { runAdminDeleteAction, runAdminSaveAction } from "@/lib/adminCrud";
import MultiSelectDropdown from "@/components/ui/MultiSelectDropdown";
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

const TIME_SLOT_OPTIONS = Array.from({ length: 12 }, (_, index) => {
  const startHour = 8 + index;
  const endHour = startHour + 1;
  const formatHour = (hour: number) => `${hour > 12 ? hour - 12 : hour}:00 ${hour >= 12 ? "PM" : "AM"}`;
  const label = `${formatHour(startHour)} - ${formatHour(endHour)}`;
  return { value: label, label };
});

type LocationForm = typeof EMPTY_FORM;

interface LocationsPageState {
  locations: Location[];
  loading: boolean;
  showModal: boolean;
  editingId: string | null;
  form: LocationForm;
  saving: boolean;
}

const INITIAL_STATE: LocationsPageState = {
  locations: [],
  loading: true,
  showModal: false,
  editingId: null,
  form: EMPTY_FORM,
  saving: false,
};

export default function AdminLocationsPage() {
  const [state, setState] = useState<LocationsPageState>(INITIAL_STATE);
  const { locations, loading, showModal, editingId, form, saving } = state;
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
    updateState({ editingId: null, form: EMPTY_FORM, showModal: true });
  }

  function openEdit(loc: Location) {
    updateState({
      editingId: loc.id,
      form: { name: loc.name, address: loc.address, time_slots: [...loc.time_slots] },
      showModal: true,
    });
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
              <MultiSelectDropdown
                options={TIME_SLOT_OPTIONS}
                value={form.time_slots}
                onChange={(timeSlots) => updateForm({ time_slots: timeSlots })}
                placeholder="Select hourly time slots"
                selectedLabel={(count) => `${count} time slot${count === 1 ? "" : "s"} selected`}
              />
              <p className="mt-2 text-xs" style={{ color: "var(--color-muted)" }}>
                Choose one or more one-hour pickup windows from 8:00 AM to 8:00 PM.
              </p>
            </div>

            <AdminModalActions saving={saving} onCancel={() => updateState({ showModal: false })} onSave={handleSave} />
          </div>
        </div>
      )}
    </div>
  );
}
