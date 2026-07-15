"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import {
  API_URL,
  CURRENCY,
  fetchEventConfig,
  type EventConfig,
  type Item,
} from "@/config/event";
import { getAdminToken } from "@/lib/auth";
import { getApiErrorMessage } from "@/lib/apiError";
import CustomSelect from "@/components/ui/CustomSelect";
import ItemQuantityPicker from "@/components/admin/orders/ItemQuantityPicker";
import {
  buildLegacyItemsFromOrders,
  linesFromQuantities,
  type OrderLineItem,
} from "@/lib/orderLineUtils";
import {
  bundleBasePayload,
  bundleEditInitialState,
  bundleLineUnitPrice,
  bundleLineValidationError,
  existingLineUnitPrice,
  planBundleLineChanges,
  type BundleEditForm,
  type BundleLinePlan,
  type EditableOrderLine,
} from "@/lib/bundleEditUtils";

interface BundleSummary {
  bundle_id: string;
  primary_order_id: string;
  event_id: number;
  status: string;
  name: string;
  email: string | null;
  phone_number: string | null;
  pickup_location: string;
  pickup_time_slot: string;
  pickup_address?: string | null;
  pickup_date?: string | null;
  notes?: string | null;
  exclude_email?: boolean;
}

interface AdminEvent {
  id: number;
  kind?: string;
}

interface CatalogLocation {
  id: string;
  name: string;
  timeSlots: string[];
}

interface BundleEditModalProps {
  isOpen: boolean;
  bundle: BundleSummary | null;
  lines: EditableOrderLine[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  notify: (message: string, type: "success" | "error") => void;
}

interface PersistBundleOptions {
  plan: BundleLinePlan;
  token: string;
  basePayload: ReturnType<typeof bundleBasePayload>;
  eventId: number;
  groupId: string | null;
  randomOrder: boolean;
  linePrices: Record<string, number>;
}

interface BundleEditorData {
  events: AdminEvent[];
  items: Item[];
  locations: CatalogLocation[];
  eventConfig: EventConfig | null;
  configUsesFallback: boolean;
}

interface BundleEditorState extends BundleEditorData {
  editForm: BundleEditForm | null;
  editQuantities: Record<string, number>;
  editLinePrices: Record<string, number>;
  editItemsError: string;
  savingEdits: boolean;
}

const EMPTY_EDITOR_STATE: BundleEditorState = {
  events: [],
  items: [],
  locations: [],
  eventConfig: null,
  configUsesFallback: false,
  editForm: null,
  editQuantities: {},
  editLinePrices: {},
  editItemsError: "",
  savingEdits: false,
};

function arrayResponse<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

async function loadBundleEditorData(eventId: number, token: string): Promise<BundleEditorData> {
  const headers = { Authorization: `Bearer ${token}` };
  const [eventsResponse, itemsResponse, locationsResponse, configResponse] = await Promise.all([
    fetch(`${API_URL}/api/admin/events`, { headers }),
    fetch(`${API_URL}/api/admin/items`, { headers }),
    fetch(`${API_URL}/api/admin/locations`, { headers }),
    fetch(`${API_URL}/api/admin/events/${eventId}/config`, { headers }),
  ]);

  const events = eventsResponse.ok
    ? arrayResponse<AdminEvent>(await eventsResponse.json())
    : [];
  const items = itemsResponse.ok
    ? arrayResponse<Item>(await itemsResponse.json())
    : [];
  const rawLocations = locationsResponse.ok
    ? arrayResponse<{ id: string; name: string; time_slots?: string[] }>(await locationsResponse.json())
    : [];
  const locations = rawLocations.map((location) => ({
    id: location.id,
    name: location.name,
    timeSlots: Array.isArray(location.time_slots) ? location.time_slots : [],
  }));
  if (configResponse.ok) {
    return {
      events,
      items,
      locations,
      eventConfig: (await configResponse.json()) as EventConfig,
      configUsesFallback: false,
    };
  }
  return {
    events,
    items,
    locations,
    eventConfig: await fetchEventConfig(),
    configUsesFallback: true,
  };
}

async function sendOrderMutation(
  url: string,
  method: "POST" | "PUT" | "DELETE",
  token: string,
  failureMessage: string,
  body?: Record<string, unknown>,
): Promise<void> {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(await getApiErrorMessage(response, failureMessage));
}

function editableLinePayload(
  basePayload: ReturnType<typeof bundleBasePayload>,
  line: BundleLinePlan["assignments"][number]["line"],
  randomOrder: boolean,
  linePrices: Record<string, number>,
) {
  return {
    ...basePayload,
    item_id: line.item.source_item_id ?? line.item.id,
    quantity: line.qty,
    ...(randomOrder ? {
      mode: "random",
      unit_price: bundleLineUnitPrice(line, linePrices),
    } : {}),
  };
}

async function persistBundlePlan(options: PersistBundleOptions): Promise<{
  updatedCount: number;
  addedCount: number;
  removedCount: number;
}> {
  for (const { row, line } of options.plan.assignments) {
    await sendOrderMutation(
      `${API_URL}/api/admin/orders/${row.id}`,
      "PUT",
      options.token,
      "Failed to update order item",
      editableLinePayload(options.basePayload, line, options.randomOrder, options.linePrices),
    );
  }

  for (const line of options.plan.createLines) {
    await sendOrderMutation(
      `${API_URL}/api/admin/orders`,
      "POST",
      options.token,
      "Failed to create order item",
      {
        ...editableLinePayload(options.basePayload, line, options.randomOrder, options.linePrices),
        event_id: options.eventId,
        group_id: options.groupId,
      },
    );
  }

  for (const row of options.plan.lockedRows) {
    await sendOrderMutation(
      `${API_URL}/api/admin/orders/${row.id}`,
      "PUT",
      options.token,
      "Failed to sync legacy order item",
      {
        ...options.basePayload,
        item_id: row.item_id,
        quantity: row.quantity,
        ...(options.randomOrder ? {
          mode: "random",
          unit_price: existingLineUnitPrice(row),
        } : {}),
      },
    );
  }

  for (const row of options.plan.deleteRows) {
    await sendOrderMutation(
      `${API_URL}/api/admin/orders/${row.id}`,
      "DELETE",
      options.token,
      "Failed to remove obsolete order item",
    );
  }

  return {
    updatedCount: options.plan.assignments.length + options.plan.lockedRows.length,
    addedCount: options.plan.createLines.length,
    removedCount: options.plan.deleteRows.length,
  };
}

export default function BundleEditModal({
  isOpen,
  bundle,
  lines,
  onClose,
  onSaved,
  notify,
}: BundleEditModalProps) {
  const [state, setState] = useState<BundleEditorState>(EMPTY_EDITOR_STATE);
  const {
    eventConfig,
    events,
    configUsesFallback,
    items: catalogItems,
    locations: catalogLocations,
    editForm,
    editQuantities,
    editLinePrices,
    editItemsError,
    savingEdits,
  } = state;

  const updateState = useCallback((patch: Partial<BundleEditorState>) => {
    setState((current) => ({ ...current, ...patch }));
  }, []);

  const updateForm = useCallback((patch: Partial<BundleEditForm>) => {
    setState((current) => current.editForm ? {
      ...current,
      editForm: { ...current.editForm, ...patch },
    } : current);
  }, []);

  const primaryLine = bundle
    ? lines.find((row) => row.id === bundle.primary_order_id) ?? lines[0] ?? null
    : null;

  useEffect(() => {
    if (!isOpen || !bundle) return;
    const activeBundle = bundle;
    let cancelled = false;

    async function loadData() {
      try {
        const token = await getAdminToken();
        if (!token) return;
        const data = await loadBundleEditorData(activeBundle.event_id, token);
        if (cancelled) return;
        updateState({
          events: data.events,
          items: data.items,
          locations: data.locations,
          eventConfig: data.eventConfig,
          configUsesFallback: data.configUsesFallback,
        });
      } catch {
        if (!cancelled) {
          notify("Failed to load editor data", "error");
        }
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [bundle, isOpen, notify, updateState]);

  const currentEvent = events.find((entry) => entry.id === bundle?.event_id) ?? null;
  const isRandomOrder = currentEvent?.kind === "random_requests";

  const sourceItems = isRandomOrder
    ? (catalogItems.length > 0 ? catalogItems : (eventConfig?.items ?? []))
    : (eventConfig?.items ?? []);
  const editEventItems: OrderLineItem[] = sourceItems.map((item) => ({
    ...item,
    is_locked: false,
  }));
  const knownItemIds = new Set(editEventItems.map((item) => item.id));
  const editLegacyItems = buildLegacyItemsFromOrders(lines, knownItemIds);
  const editPickerItems = [...editLegacyItems, ...editEventItems];

  const editLocationOptions = (() => {
    const source = isRandomOrder
      ? (catalogLocations.length > 0
        ? catalogLocations.map((location) => ({ value: location.name, label: location.name }))
        : (eventConfig?.locations ?? []).map((location) => ({ value: location.name, label: location.name })))
      : (eventConfig?.locations ?? []).map((location) => ({ value: location.name, label: location.name }));
    const selected = (editForm?.pickup_location ?? "").trim();
    if (!selected) return source;
    if (source.some((option) => option.value === selected)) return source;
    return [{ value: selected, label: `${selected} (current)` }, ...source];
  })();

  const editTimeSlots = (() => {
    if (!editForm?.pickup_location) return [];
    if (isRandomOrder) {
      const randomLocations = catalogLocations.length > 0
        ? catalogLocations
        : (eventConfig?.locations ?? []).map((location) => ({
          id: location.id,
          name: location.name,
          timeSlots: location.timeSlots ?? [],
        }));
      return randomLocations.find((entry) => entry.name === editForm.pickup_location)?.timeSlots ?? [];
    }
    return eventConfig?.locations.find((entry) => entry.name === editForm.pickup_location)?.timeSlots ?? [];
  })();

  const editTimeSlotOptions = (() => {
    const base = editTimeSlots.map((slot) => ({ value: slot, label: slot }));
    const selected = (editForm?.pickup_time_slot ?? "").trim();
    if (!selected) return base;
    if (base.some((option) => option.value === selected)) return base;
    return [{ value: selected, label: `${selected} (current)` }, ...base];
  })();

  useEffect(() => {
    if (!isOpen || !bundle || !primaryLine) return;
    const initial = bundleEditInitialState(primaryLine, lines);
    updateState({
      editForm: initial.form,
      editQuantities: initial.quantities,
      editLinePrices: initial.linePrices,
      editItemsError: "",
    });
  }, [bundle, isOpen, lines, primaryLine, updateState]);

  async function handleSaveEdits(event: React.FormEvent) {
    event.preventDefault();
    if (!bundle || !primaryLine || !editForm) return;

    const desiredLines = linesFromQuantities(editPickerItems, editQuantities);
    const validationError = bundleLineValidationError(
      desiredLines,
      isRandomOrder,
      editLinePrices,
    );
    if (validationError) return updateState({ editItemsError: validationError });

    const lockedItemIds = new Set(editLegacyItems.map((item) => item.id));
    const plan = planBundleLineChanges(lines, desiredLines, lockedItemIds);
    if (plan.createLines.length > 0 && bundle.status === "mixed") {
      updateState({ editItemsError: "Mixed-status bundles must be normalized before adding new lines" });
      return;
    }

    updateState({ editItemsError: "", savingEdits: true });

    try {
      const token = await getAdminToken();
      if (!token) return;
      const counts = await persistBundlePlan({
        plan,
        token,
        basePayload: bundleBasePayload(editForm, isRandomOrder),
        eventId: bundle.event_id,
        groupId: primaryLine.group_id,
        randomOrder: isRandomOrder,
        linePrices: editLinePrices,
      });

      await onSaved();
      onClose();
      notify(
        `Updated ${counts.updatedCount} lines, added ${counts.addedCount}, removed ${counts.removedCount}`,
        "success",
      );
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to update bundle", "error");
    } finally {
      updateState({ savingEdits: false });
    }
  }

  if (!isOpen || !bundle || !editForm) return null;

  const inputStyle: CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    borderRadius: "12px",
    border: "1px solid var(--color-border)",
    background: "white",
    color: "var(--color-text)",
    fontSize: "14px",
    outline: "none",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        zIndex: 120,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !savingEdits) onClose();
      }}
    >
      <div
        style={{
          background: "white",
          borderRadius: "24px",
          border: "1px solid var(--color-border)",
          maxWidth: "720px",
          width: "100%",
          padding: "32px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 className="text-xl font-bold mb-5" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>
          Edit Bundle
        </h2>

        <form onSubmit={handleSaveEdits} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-muted)" }}>Name</label>
              <input
                required
                type="text"
                value={editForm.name}
                onChange={(event) => updateForm({ name: event.target.value })}
                style={inputStyle}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-muted)" }}>Email</label>
              <input
                required={!editForm.exclude_email}
                type="email"
                value={editForm.email}
                onChange={(event) => updateForm({ email: event.target.value })}
                style={inputStyle}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-muted)" }}>Phone (Optional)</label>
              <input
                type="tel"
                value={editForm.phone_number}
                onChange={(event) => updateForm({ phone_number: event.target.value })}
                style={inputStyle}
              />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--color-text)" }}>
                <input
                  type="checkbox"
                  checked={editForm.exclude_email}
                  onChange={(event) => updateForm({ exclude_email: event.target.checked })}
                  style={{ accentColor: "var(--color-forest)", width: "15px", height: "15px" }}
                />
                Exclude Email (no confirmation or reminder emails)
              </label>
              <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>When enabled, Email is optional.</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-muted)" }}>
              Bundle Items
              <span className="ml-1 text-[11px] font-normal">({lines.length} item{lines.length !== 1 ? "s" : ""} in scope)</span>
            </label>
            <ItemQuantityPicker
              items={editPickerItems}
              quantities={editQuantities}
              onChange={(next) => {
                updateState({ editQuantities: next, editItemsError: "" });
              }}
              linePrices={isRandomOrder ? editLinePrices : undefined}
              onLinePricesChange={isRandomOrder
                ? (next) => updateState({ editLinePrices: next })
                : undefined}
              allowBelowMinimumOrder={isRandomOrder}
              allowPriceEdit={isRandomOrder}
              currency={eventConfig?.currency ?? CURRENCY}
              disabled={editPickerItems.length === 0}
              error={editItemsError}
            />
            {configUsesFallback && !isRandomOrder && (
              <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>Using active event catalog as a fallback.</p>
            )}
          </div>

          {isRandomOrder ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-muted)" }}>Pickup Location</label>
                  <input
                    list="random-edit-location-options"
                    required
                    type="text"
                    value={editForm.pickup_location}
                    onChange={(event) => updateForm({
                      pickup_location: event.target.value,
                      pickup_time_slot: "",
                    })}
                    placeholder="Any pickup location"
                    style={inputStyle}
                  />
                  <datalist id="random-edit-location-options">
                    {catalogLocations.map((location) => (
                      <option key={location.id} value={location.name} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-muted)" }}>Time Slot</label>
                  <input
                    list="random-edit-time-slot-options"
                    required
                    type="text"
                    value={editForm.pickup_time_slot}
                    onChange={(event) => updateForm({ pickup_time_slot: event.target.value })}
                    placeholder="Any pickup time slot"
                    style={inputStyle}
                  />
                  <datalist id="random-edit-time-slot-options">
                    {editTimeSlots.map((slot) => (
                      <option key={slot} value={slot} />
                    ))}
                  </datalist>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-muted)" }}>Pickup Date</label>
                <input
                  type="date"
                  value={editForm.pickup_date}
                  onChange={(event) => updateForm({ pickup_date: event.target.value })}
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-muted)" }}>Pickup Address</label>
                <textarea
                  value={editForm.pickup_address}
                  onChange={(event) => updateForm({ pickup_address: event.target.value })}
                  rows={3}
                  placeholder="Freeform pickup address or special instructions"
                  style={{ ...inputStyle, resize: "vertical", minHeight: "88px" }}
                />
              </div>
            </>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-muted)" }}>Pickup Location</label>
                <CustomSelect
                  options={editLocationOptions}
                  value={editForm.pickup_location}
                  onChange={(value) => updateForm({ pickup_location: value, pickup_time_slot: "" })}
                  disabled={!eventConfig}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-muted)" }}>Time Slot</label>
                <CustomSelect
                  options={editTimeSlotOptions}
                  value={editForm.pickup_time_slot}
                  onChange={(value) => updateForm({ pickup_time_slot: value })}
                  disabled={!eventConfig || !editForm.pickup_location}
                  placeholder={editForm.pickup_location ? "Select a time slot" : "Select a location first"}
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-muted)" }}>Notes (admin only)</label>
            <textarea
              value={editForm.notes}
              onChange={(event) => updateForm({ notes: event.target.value })}
              rows={4}
              style={{ ...inputStyle, resize: "vertical", minHeight: "110px" }}
            />
          </div>

          <p className="text-xs" style={{ color: "var(--color-muted)" }}>
            {isRandomOrder ? "Manual prices are stored on each item." : "Price will be computed server-side."}
          </p>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-medium"
              style={{ background: "var(--color-cream)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
              disabled={savingEdits}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingEdits}
              className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-60"
              style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}
            >
              {savingEdits ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
