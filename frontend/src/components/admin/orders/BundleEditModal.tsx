"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
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
  getMinimumOrderQuantity,
  linesFromQuantities,
  type OrderLineItem,
} from "@/lib/orderLineUtils";

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

interface OrderLine {
  id: string;
  event_id: number;
  group_id: string | null;
  name: string;
  email: string | null;
  phone_number: string | null;
  item_id: string;
  item_name: string;
  quantity: number;
  pickup_location: string;
  pickup_time_slot: string;
  pickup_address?: string | null;
  pickup_date?: string | null;
  total_price: number;
  status: string;
  notes?: string | null;
  exclude_email?: boolean;
}

interface AdminEvent {
  id: number;
  kind?: string;
}

interface EditOrderForm {
  name: string;
  email: string;
  phone_number: string;
  pickup_location: string;
  pickup_time_slot: string;
  pickup_address: string;
  pickup_date: string;
  notes: string;
  exclude_email: boolean;
}

interface CatalogLocation {
  id: string;
  name: string;
  timeSlots: string[];
}

interface BundleEditModalProps {
  isOpen: boolean;
  bundle: BundleSummary | null;
  lines: OrderLine[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  notify: (message: string, type: "success" | "error") => void;
}

function statusPatchSteps(targetStatus: string): string[] {
  if (targetStatus === "pending") return [];
  if (targetStatus === "confirmed") return ["confirmed"];
  if (targetStatus === "picked_up") return ["confirmed", "picked_up"];
  if (targetStatus === "no_show") return ["confirmed", "no_show"];
  if (targetStatus === "cancelled") return ["cancelled"];
  return [];
}

export default function BundleEditModal({
  isOpen,
  bundle,
  lines,
  onClose,
  onSaved,
  notify,
}: BundleEditModalProps) {
  const [eventConfig, setEventConfig] = useState<EventConfig | null>(null);
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [configUsesFallback, setConfigUsesFallback] = useState(false);
  const [catalogItems, setCatalogItems] = useState<Item[]>([]);
  const [catalogLocations, setCatalogLocations] = useState<CatalogLocation[]>([]);

  const [editForm, setEditForm] = useState<EditOrderForm | null>(null);
  const [editQuantities, setEditQuantities] = useState<Record<string, number>>({});
  const [editLinePrices, setEditLinePrices] = useState<Record<string, number>>({});
  const [editItemsError, setEditItemsError] = useState("");
  const [savingEdits, setSavingEdits] = useState(false);

  const primaryLine = useMemo(() => {
    if (!bundle) return null;
    return lines.find((row) => row.id === bundle.primary_order_id) ?? lines[0] ?? null;
  }, [bundle, lines]);

  useEffect(() => {
    if (!isOpen || !bundle) return;
    const activeBundle = bundle;
    let cancelled = false;

    async function loadData() {
      try {
        const token = await getAdminToken();
        if (!token) return;
        const headers = { Authorization: `Bearer ${token}` };

        const [eventsRes, itemsRes, locationsRes, configRes] = await Promise.all([
          fetch(`${API_URL}/api/admin/events`, { headers }),
          fetch(`${API_URL}/api/admin/items`, { headers }),
          fetch(`${API_URL}/api/admin/locations`, { headers }),
          fetch(`${API_URL}/api/admin/events/${activeBundle.event_id}/config`, { headers }),
        ]);

        if (!cancelled && eventsRes.ok) {
          const eventsData = (await eventsRes.json()) as AdminEvent[];
          setEvents(Array.isArray(eventsData) ? eventsData : []);
        }

        if (!cancelled && itemsRes.ok) {
          const itemsData = (await itemsRes.json()) as Item[];
          setCatalogItems(Array.isArray(itemsData) ? itemsData : []);
        }

        if (!cancelled && locationsRes.ok) {
          const locationsData = (await locationsRes.json()) as Array<{ id: string; name: string; time_slots?: string[] }>;
          setCatalogLocations(
            Array.isArray(locationsData)
              ? locationsData.map((location) => ({
                id: location.id,
                name: location.name,
                timeSlots: Array.isArray(location.time_slots) ? location.time_slots : [],
              }))
              : []
          );
        }

        if (!cancelled && configRes.ok) {
          setEventConfig((await configRes.json()) as EventConfig);
          setConfigUsesFallback(false);
          return;
        }

        const fallback = await fetchEventConfig();
        if (!cancelled) {
          setEventConfig(fallback);
          setConfigUsesFallback(true);
        }
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
  }, [bundle, isOpen, notify]);

  const currentEvent = useMemo(
    () => events.find((entry) => entry.id === bundle?.event_id) ?? null,
    [events, bundle?.event_id]
  );
  const isRandomOrder = currentEvent?.kind === "random_requests";

  const editEventItems = useMemo<OrderLineItem[]>(() => {
    const sourceItems = isRandomOrder
      ? (catalogItems.length > 0 ? catalogItems : (eventConfig?.items ?? []))
      : (eventConfig?.items ?? []);
    return sourceItems.map((item) => ({ ...item, is_locked: false }));
  }, [catalogItems, eventConfig?.items, isRandomOrder]);

  const editLegacyItems = useMemo<OrderLineItem[]>(() => {
    const knownItemIds = new Set(editEventItems.map((item) => item.id));
    return buildLegacyItemsFromOrders(lines, knownItemIds);
  }, [editEventItems, lines]);

  const editPickerItems = useMemo<OrderLineItem[]>(() => {
    return [...editLegacyItems, ...editEventItems];
  }, [editEventItems, editLegacyItems]);

  const editLocationOptions = useMemo(() => {
    const source = isRandomOrder
      ? (catalogLocations.length > 0
        ? catalogLocations.map((location) => ({ value: location.name, label: location.name }))
        : (eventConfig?.locations ?? []).map((location) => ({ value: location.name, label: location.name })))
      : (eventConfig?.locations ?? []).map((location) => ({ value: location.name, label: location.name }));
    const selected = (editForm?.pickup_location ?? "").trim();
    if (!selected) return source;
    if (source.some((option) => option.value === selected)) return source;
    return [{ value: selected, label: `${selected} (current)` }, ...source];
  }, [catalogLocations, editForm?.pickup_location, eventConfig?.locations, isRandomOrder]);

  const editTimeSlots = useMemo(() => {
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
  }, [catalogLocations, editForm?.pickup_location, eventConfig?.locations, isRandomOrder]);

  const editTimeSlotOptions = useMemo(() => {
    const base = editTimeSlots.map((slot) => ({ value: slot, label: slot }));
    const selected = (editForm?.pickup_time_slot ?? "").trim();
    if (!selected) return base;
    if (base.some((option) => option.value === selected)) return base;
    return [{ value: selected, label: `${selected} (current)` }, ...base];
  }, [editForm?.pickup_time_slot, editTimeSlots]);

  useEffect(() => {
    if (!isOpen || !bundle || !primaryLine) return;

    setEditForm({
      name: primaryLine.name ?? "",
      email: primaryLine.email ?? "",
      phone_number: primaryLine.phone_number ?? "",
      pickup_location: primaryLine.pickup_location ?? "",
      pickup_time_slot: primaryLine.pickup_time_slot ?? "",
      pickup_address: primaryLine.pickup_address ?? "",
      pickup_date: primaryLine.pickup_date ?? "",
      notes: primaryLine.notes ?? "",
      exclude_email: !!primaryLine.exclude_email,
    });

    const nextQuantities: Record<string, number> = {};
    const nextLinePrices: Record<string, number> = {};
    for (const row of lines) {
      const qty = Number(row.quantity);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      nextQuantities[row.item_id] = (nextQuantities[row.item_id] ?? 0) + qty;
      const unitPrice = qty > 0 ? Number((Number(row.total_price) / qty).toFixed(2)) : 0;
      if (nextLinePrices[row.item_id] === undefined) {
        nextLinePrices[row.item_id] = Math.max(0, unitPrice);
      }
    }
    setEditQuantities(nextQuantities);
    setEditLinePrices(nextLinePrices);
    setEditItemsError("");
  }, [bundle, isOpen, lines, primaryLine]);

  async function handleSaveEdits(event: React.FormEvent) {
    event.preventDefault();
    if (!bundle || !primaryLine || !editForm) return;

    const desiredLines = linesFromQuantities(editPickerItems, editQuantities);
    if (desiredLines.length === 0) {
      setEditItemsError("Please add at least one item.");
      return;
    }

    if (!isRandomOrder) {
      for (const { item, qty } of desiredLines) {
        const minimumOrderQuantity = getMinimumOrderQuantity(item);
        if (qty < minimumOrderQuantity) {
          setEditItemsError(`${item.name} requires a minimum order of ${minimumOrderQuantity}.`);
          return;
        }
      }
    } else {
      for (const { item } of desiredLines) {
        const linePrice = editLinePrices[item.id] ?? item.price;
        if (!Number.isFinite(linePrice) || linePrice < 0) {
          setEditItemsError(`Set a valid unit price for ${item.name}.`);
          return;
        }
      }
    }

    setEditItemsError("");
    setSavingEdits(true);

    try {
      const token = await getAdminToken();
      if (!token) return;

      const basePayload = {
        name: editForm.name,
        email: editForm.email,
        phone_number: editForm.phone_number,
        pickup_location: editForm.pickup_location,
        pickup_time_slot: editForm.pickup_time_slot,
        pickup_address: isRandomOrder ? editForm.pickup_address : undefined,
        pickup_date: isRandomOrder ? editForm.pickup_date : undefined,
        notes: editForm.notes,
        exclude_email: editForm.exclude_email,
      };

      const existingRows = [...lines];
      const targetStatus = primaryLine.status;
      const lockedItemIds = new Set(editLegacyItems.map((item) => item.id));
      const lockedExistingRows = existingRows.filter((row) => lockedItemIds.has(row.item_id));
      const desiredEditableLines = desiredLines.filter((line) => !line.item.is_locked);
      const editableExistingRows = existingRows.filter((row) => !lockedItemIds.has(row.item_id));

      const assignments: Array<{ row: OrderLine; line: (typeof desiredEditableLines)[number] }> = [];
      const createLines: typeof desiredEditableLines = [];
      const unusedRows = [...editableExistingRows];

      for (const line of desiredEditableLines) {
        const sameItemIndex = unusedRows.findIndex((row) => row.item_id === line.item.id);
        if (sameItemIndex >= 0) {
          assignments.push({ row: unusedRows.splice(sameItemIndex, 1)[0], line });
          continue;
        }
        const reusable = unusedRows.shift();
        if (reusable) {
          assignments.push({ row: reusable, line });
        } else {
          createLines.push(line);
        }
      }

      const deleteRows = [...unusedRows];
      let updatedCount = 0;
      let addedCount = 0;
      let removedCount = 0;

      for (const assignment of assignments) {
        const unitPrice = isRandomOrder ? (editLinePrices[assignment.line.item.id] ?? assignment.line.item.price) : undefined;
        const response = await fetch(`${API_URL}/api/admin/orders/${assignment.row.id}`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            ...basePayload,
            item_id: assignment.line.item.source_item_id ?? assignment.line.item.id,
            quantity: assignment.line.qty,
            ...(isRandomOrder ? { mode: "random", unit_price: unitPrice } : {}),
          }),
        });
        if (!response.ok) {
          throw new Error(await getApiErrorMessage(response, "Failed to update order item"));
        }
        updatedCount += 1;
      }

      for (const line of createLines) {
        const unitPrice = isRandomOrder ? (editLinePrices[line.item.id] ?? line.item.price) : undefined;
        const response = await fetch(`${API_URL}/api/admin/orders`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            ...basePayload,
            event_id: bundle.event_id,
            group_id: primaryLine.group_id,
            item_id: line.item.source_item_id ?? line.item.id,
            quantity: line.qty,
            ...(isRandomOrder ? { mode: "random", unit_price: unitPrice } : {}),
          }),
        });
        if (!response.ok) {
          throw new Error(await getApiErrorMessage(response, "Failed to create order item"));
        }
        const createdRow = (await response.json()) as { id: string };

        for (const status of statusPatchSteps(targetStatus)) {
          const statusRes = await fetch(`${API_URL}/api/admin/orders/${createdRow.id}/status`, {
            method: "PATCH",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
          });
          if (!statusRes.ok) {
            throw new Error(await getApiErrorMessage(statusRes, "Failed to inherit order status"));
          }
        }

        addedCount += 1;
      }

      for (const row of lockedExistingRows) {
        const response = await fetch(`${API_URL}/api/admin/orders/${row.id}`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            ...basePayload,
            item_id: row.item_id,
            quantity: row.quantity,
            ...(isRandomOrder ? {
              mode: "random",
              unit_price: row.quantity > 0 ? Number((Number(row.total_price) / row.quantity).toFixed(2)) : 0,
            } : {}),
          }),
        });
        if (!response.ok) {
          throw new Error(await getApiErrorMessage(response, "Failed to sync legacy order item"));
        }
        updatedCount += 1;
      }

      for (const row of deleteRows) {
        const response = await fetch(`${API_URL}/api/admin/orders/${row.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          throw new Error(await getApiErrorMessage(response, "Failed to remove obsolete order item"));
        }
        removedCount += 1;
      }

      await onSaved();
      onClose();
      notify(`Updated ${updatedCount} lines, added ${addedCount}, removed ${removedCount}`, "success");
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to update bundle", "error");
    } finally {
      setSavingEdits(false);
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
                onChange={(event) => setEditForm((prev) => prev ? ({ ...prev, name: event.target.value }) : prev)}
                style={inputStyle}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-muted)" }}>Email</label>
              <input
                required={!editForm.exclude_email}
                type="email"
                value={editForm.email}
                onChange={(event) => setEditForm((prev) => prev ? ({ ...prev, email: event.target.value }) : prev)}
                style={inputStyle}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-muted)" }}>Phone (Optional)</label>
              <input
                type="tel"
                value={editForm.phone_number}
                onChange={(event) => setEditForm((prev) => prev ? ({ ...prev, phone_number: event.target.value }) : prev)}
                style={inputStyle}
              />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--color-text)" }}>
                <input
                  type="checkbox"
                  checked={editForm.exclude_email}
                  onChange={(event) => setEditForm((prev) => prev ? ({ ...prev, exclude_email: event.target.checked }) : prev)}
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
                setEditQuantities(next);
                setEditItemsError("");
              }}
              linePrices={isRandomOrder ? editLinePrices : undefined}
              onLinePricesChange={isRandomOrder ? setEditLinePrices : undefined}
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
                    onChange={(event) => setEditForm((prev) => prev ? ({ ...prev, pickup_location: event.target.value, pickup_time_slot: "" }) : prev)}
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
                    onChange={(event) => setEditForm((prev) => prev ? ({ ...prev, pickup_time_slot: event.target.value }) : prev)}
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
                  onChange={(event) => setEditForm((prev) => prev ? ({ ...prev, pickup_date: event.target.value }) : prev)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-muted)" }}>Pickup Address</label>
                <textarea
                  value={editForm.pickup_address}
                  onChange={(event) => setEditForm((prev) => prev ? ({ ...prev, pickup_address: event.target.value }) : prev)}
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
                  onChange={(value) => setEditForm((prev) => prev ? ({ ...prev, pickup_location: value, pickup_time_slot: "" }) : prev)}
                  disabled={!eventConfig}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1" style={{ color: "var(--color-muted)" }}>Time Slot</label>
                <CustomSelect
                  options={editTimeSlotOptions}
                  value={editForm.pickup_time_slot}
                  onChange={(value) => setEditForm((prev) => prev ? ({ ...prev, pickup_time_slot: value }) : prev)}
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
              onChange={(event) => setEditForm((prev) => prev ? ({ ...prev, notes: event.target.value }) : prev)}
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
