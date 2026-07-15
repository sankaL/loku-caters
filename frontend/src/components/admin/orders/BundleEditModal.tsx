"use client";

import { useCallback, useEffect, useState } from "react";
import {
  API_URL,
  fetchEventConfig,
  type EventConfig,
  type Item,
} from "@/config/event";
import { getAdminToken } from "@/lib/auth";
import { getApiErrorMessage } from "@/lib/apiError";
import BundleEditFormView from "@/components/admin/orders/BundleEditFormView";
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

function editorItems(
  randomOrder: boolean,
  catalogItems: Item[],
  eventConfig: EventConfig | null,
): OrderLineItem[] {
  const items = randomOrder && catalogItems.length > 0
    ? catalogItems
    : (eventConfig?.items ?? []);
  return items.map((item) => ({ ...item, is_locked: false }));
}

function includeCurrentOption(
  options: Array<{ value: string; label: string }>,
  selectedValue: string | undefined,
) {
  const selected = (selectedValue ?? "").trim();
  if (!selected || options.some((option) => option.value === selected)) return options;
  return [{ value: selected, label: `${selected} (current)` }, ...options];
}

function editorLocationOptions(
  randomOrder: boolean,
  catalogLocations: CatalogLocation[],
  eventConfig: EventConfig | null,
  selectedValue: string | undefined,
) {
  const locations = randomOrder && catalogLocations.length > 0
    ? catalogLocations
    : (eventConfig?.locations ?? []);
  return includeCurrentOption(
    locations.map((location) => ({ value: location.name, label: location.name })),
    selectedValue,
  );
}

function editorTimeSlots(
  randomOrder: boolean,
  catalogLocations: CatalogLocation[],
  eventConfig: EventConfig | null,
  pickupLocation: string | undefined,
): string[] {
  if (!pickupLocation) return [];
  const locations = randomOrder && catalogLocations.length > 0
    ? catalogLocations
    : (eventConfig?.locations ?? []);
  return locations.find((location) => location.name === pickupLocation)?.timeSlots ?? [];
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
  const editEventItems = editorItems(isRandomOrder, catalogItems, eventConfig);
  const knownItemIds = new Set(editEventItems.map((item) => item.id));
  const editLegacyItems = buildLegacyItemsFromOrders(lines, knownItemIds);
  const editPickerItems = [...editLegacyItems, ...editEventItems];
  const editLocationOptions = editorLocationOptions(
    isRandomOrder,
    catalogLocations,
    eventConfig,
    editForm?.pickup_location,
  );
  const editTimeSlots = editorTimeSlots(
    isRandomOrder,
    catalogLocations,
    eventConfig,
    editForm?.pickup_location,
  );
  const editTimeSlotOptions = includeCurrentOption(
    editTimeSlots.map((slot) => ({ value: slot, label: slot })),
    editForm?.pickup_time_slot,
  );

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
  return (
    <BundleEditFormView
      form={editForm}
      lineCount={lines.length}
      pickerItems={editPickerItems}
      quantities={editQuantities}
      linePrices={editLinePrices}
      isRandomOrder={isRandomOrder}
      eventConfig={eventConfig}
      configUsesFallback={configUsesFallback}
      catalogLocations={catalogLocations}
      locationOptions={editLocationOptions}
      timeSlots={editTimeSlots}
      timeSlotOptions={editTimeSlotOptions}
      itemsError={editItemsError}
      saving={savingEdits}
      onFormChange={updateForm}
      onQuantitiesChange={(next) => updateState({ editQuantities: next, editItemsError: "" })}
      onLinePricesChange={(next) => updateState({ editLinePrices: next })}
      onClose={onClose}
      onSubmit={handleSaveEdits}
    />
  );
}
