"use client";
/* eslint-disable @next/next/no-img-element */

import { type SetStateAction, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { closestCenter, DndContext, DragEndEvent, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { API_URL, CURRENCY } from "@/config/event";
import { getAdminToken } from "@/lib/auth";
import { getApiErrorMessage } from "@/lib/apiError";
import AdminToast from "@/components/admin/AdminToast";
import { useAdminToast } from "@/hooks/useAdminToast";
import {
  createEmptyComboDeal,
  createEmptyRequirementGroup,
  defaultGroupName,
  normalizeComboDeals,
  normalizeIncomingComboDeal,
  validateEventForm,
  type ComboDeal,
  type ComboDiscount,
} from "@/lib/eventComboDeals";

type EventImageType = "tooltip" | "hero_side" | "menu_item";

interface AdminItem {
  id: string;
  name: string;
  price: number;
  discounted_price: number | null;
  minimum_order_quantity?: number;
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
    menu_item_target_dir?: string;
  };
  images: EventImage[];
}

interface EventRecord {
  id: number;
  name: string;
  event_date: string;
  kind?: string;
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
  item_ids: string[];
  location_ids: string[];
  combo_deals: ComboDeal[];
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
  combo_deals: ComboDeal[];
}

const EMPTY_IMAGE_CATALOG: EventImageCatalog = {
  helper: {
    tooltip_target_dir: "frontend/public/assets/img/tooltip",
    hero_side_target_dir: "frontend/public/assets/img/hero-side",
    menu_item_target_dir: "frontend/public/assets/food/client-menu",
  },
  images: [],
};

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
  combo_deals: [],
};

interface EventEditorState {
  form: EventForm;
  allItems: AdminItem[];
  allLocations: AdminLocation[];
  imageCatalog: EventImageCatalog;
  loading: boolean;
  saving: boolean;
  error: string | null;
}

const INITIAL_EDITOR_STATE: EventEditorState = {
  form: EMPTY_FORM,
  allItems: [],
  allLocations: [],
  imageCatalog: EMPTY_IMAGE_CATALOG,
  loading: true,
  saving: false,
  error: null,
};

function normalizeImageCatalog(data: unknown): EventImageCatalog {
  if (!data || typeof data !== "object") return EMPTY_IMAGE_CATALOG;
  const raw = data as { helper?: Record<string, unknown>; images?: unknown[] };
  const helper = raw.helper ?? {};
  const images = Array.isArray(raw.images) ? raw.images : [];

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
      menu_item_target_dir:
        typeof helper.menu_item_target_dir === "string"
          ? helper.menu_item_target_dir
          : EMPTY_IMAGE_CATALOG.helper.menu_item_target_dir,
    },
    images: images
      .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
      .map((entry): EventImage => ({
        key: typeof entry.key === "string" ? entry.key : "",
        type: entry.type === "hero_side" || entry.type === "menu_item" ? entry.type : "tooltip",
        label: typeof entry.label === "string" ? entry.label : "",
        path: typeof entry.path === "string" ? entry.path : "",
        alt: typeof entry.alt === "string" ? entry.alt : "",
      }))
      .filter((entry) => Boolean(entry.key) && Boolean(entry.path) && Boolean(entry.label)),
  };
}

function comboItemLabel(itemIds: string[], itemsById: Map<string, AdminItem>): string {
  const labels = itemIds
    .map((itemId) => itemsById.get(itemId)?.name ?? itemId)
    .filter(Boolean);
  if (labels.length === 0) return "items";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} or ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, or ${labels[labels.length - 1]}`;
}

function comboPreviewText(combo: ComboDeal, itemsById: Map<string, AdminItem>, currency: string): string {
  const requirementCopy = combo.requirement_groups
    .map((group) => `${group.min_quantity} x ${comboItemLabel(group.item_ids, itemsById)}`)
    .join(", ");
  const amountCopy = combo.discount.type === "percentage"
    ? `${combo.discount.amount.toFixed(2).replace(/\.00$/, "")}%`
    : `${currency} $${combo.discount.amount.toFixed(2)}`;
  if (combo.discount.applies_to === "combo_total") {
    return `Buy ${requirementCopy} and save ${amountCopy} on the combo.`;
  }
  const targetGroup = combo.requirement_groups.find((group) => group.id === combo.discount.target_group_id);
  return `Buy ${requirementCopy} and save ${amountCopy} on ${comboItemLabel(targetGroup?.item_ids ?? [], itemsById)}.`;
}

function sectionTitle(title: string, subtitle: string) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-semibold" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>
        {title}
      </h2>
      <p className="text-sm mt-1" style={{ color: "var(--color-muted)" }}>{subtitle}</p>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" opacity="0.3" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="var(--color-sage)" />
    </svg>
  );
}

function CounterControl({
  value,
  onChange,
  min = 1,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
}) {
  return (
    <div className="inline-flex items-center rounded-2xl overflow-hidden" style={{ border: "1px solid var(--color-border)", background: "white" }}>
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="px-3 py-2 text-sm font-semibold"
        style={{ color: "var(--color-text)" }}
      >
        -
      </button>
      <div className="px-4 py-2 min-w-[56px] text-center text-sm font-semibold" style={{ color: "var(--color-text)", borderLeft: "1px solid var(--color-border)", borderRight: "1px solid var(--color-border)" }}>
        {value}
      </div>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className="px-3 py-2 text-sm font-semibold"
        style={{ color: "var(--color-text)" }}
      >
        +
      </button>
    </div>
  );
}

function SelectionGrid({
  title,
  subtitle,
  items,
  selectedIds,
  onToggle,
  searchable = true,
}: {
  title: string;
  subtitle: string;
  items: Array<{ id: string; label: string; detail?: string }>;
  selectedIds: string[];
  onToggle: (id: string) => void;
  searchable?: boolean;
}) {
  const [query, setQuery] = useState("");
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return normalizedQuery
      ? items.filter((item) => item.label.toLowerCase().includes(normalizedQuery))
      : items;
  }, [items, query]);

  return (
    <div className="rounded-[28px] p-6" style={{ background: "white", border: "1px solid var(--color-border)" }}>
      {sectionTitle(title, subtitle)}
      {searchable && (
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Search ${title.toLowerCase()}...`}
          className="w-full px-4 py-3 rounded-2xl text-sm border bg-white focus:outline-none focus:ring-2 transition-all mb-4"
          style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
        />
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filteredItems.map((item) => {
          const active = selectedSet.has(item.id);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onToggle(item.id)}
              className="rounded-2xl p-4 text-left transition-all"
              style={{
                border: `1px solid ${active ? "var(--color-sage)" : "var(--color-border)"}`,
                background: active ? "var(--color-success-bg)" : "white",
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>{item.label}</p>
                  {item.detail && (
                    <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>{item.detail}</p>
                  )}
                </div>
                <span
                  className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold"
                  style={{
                    background: active ? "var(--color-forest)" : "var(--color-cream)",
                    color: active ? "var(--color-cream)" : "var(--color-muted)",
                  }}
                >
                  {active ? "✓" : "+"}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SortableOrderedItem({
  item,
  index,
  total,
  onMove,
}: {
  item: AdminItem;
  index: number;
  total: number;
  onMove: (itemId: string, direction: -1 | 1) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  return (
    <div
      ref={setNodeRef}
      className="flex items-center gap-3 rounded-2xl border p-3 transition-all"
      style={{
        background: isDragging ? "var(--color-cream)" : "white",
        borderColor: isDragging ? "var(--color-sage)" : "var(--color-border)",
        boxShadow: isDragging ? "0 12px 28px rgba(18, 39, 15, 0.14)" : "none",
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <button
        type="button"
        className="flex h-10 w-10 shrink-0 cursor-grab items-center justify-center rounded-xl border text-lg leading-none active:cursor-grabbing"
        style={{ borderColor: "var(--color-border)", color: "var(--color-muted)", background: "var(--color-cream)" }}
        aria-label={`Drag ${item.name}`}
        {...attributes}
        {...listeners}
      >
        ::
      </button>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums"
          style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}
        >
          {index + 1}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold" style={{ color: "var(--color-text)" }}>{item.name}</p>
          <p className="text-xs" style={{ color: "var(--color-muted)" }}>
            {CURRENCY} {(item.discounted_price ?? item.price).toFixed(2)}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={() => onMove(item.id, -1)}
          disabled={index === 0}
          className="rounded-xl border px-3 py-2 text-xs font-semibold disabled:opacity-40"
          style={{ borderColor: "var(--color-border)", background: "white", color: "var(--color-text)" }}
        >
          Up
        </button>
        <button
          type="button"
          onClick={() => onMove(item.id, 1)}
          disabled={index === total - 1}
          className="rounded-xl border px-3 py-2 text-xs font-semibold disabled:opacity-40"
          style={{ borderColor: "var(--color-border)", background: "white", color: "var(--color-text)" }}
        >
          Down
        </button>
      </div>
    </div>
  );
}

function ItemOrderList({
  items,
  onReorder,
  onMove,
}: {
  items: AdminItem[];
  onReorder: (activeId: string, overId: string) => void;
  onMove: (itemId: string, direction: -1 | 1) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    onReorder(String(active.id), String(over.id));
  }

  return (
    <div className="rounded-[28px] p-6" style={{ background: "white", border: "1px solid var(--color-border)" }}>
      {sectionTitle("Item Display Order", "Drag selected items into the order customers should see on the event order page.")}
      {items.length === 0 ? (
        <div className="rounded-3xl p-6 text-sm" style={{ background: "var(--color-cream)", color: "var(--color-muted)" }}>
          Select items above to arrange their display order.
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {items.map((item, index) => (
                <SortableOrderedItem
                  key={item.id}
                  item={item}
                  index={index}
                  total={items.length}
                  onMove={onMove}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

type EditorMode = "create" | "edit";

function eventRecordToForm(event: EventRecord): EventForm {
  return {
    name: event.name,
    event_date: event.event_date,
    hero_header: event.hero_header,
    hero_header_sage: event.hero_header_sage ?? "",
    hero_subheader: event.hero_subheader ?? "",
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
    combo_deals: normalizeComboDeals((event.combo_deals ?? []).map((combo, index) => normalizeIncomingComboDeal(combo, index))),
  };
}

async function fetchEventEditorData(mode: EditorMode, eventId: number | null): Promise<Partial<EventEditorState> | null> {
  const token = await getAdminToken();
  if (!token) return null;
  const headers = { Authorization: `Bearer ${token}` };
  const requests: Promise<Response>[] = [
    fetch(`${API_URL}/api/admin/items`, { headers }),
    fetch(`${API_URL}/api/admin/locations`, { headers }),
    fetch(`${API_URL}/api/admin/event-images`, { headers }),
  ];
  if (mode === "edit" && eventId) requests.push(fetch(`${API_URL}/api/admin/events/${eventId}`, { headers }));
  const responses = await Promise.all(requests);
  if (responses.some((response) => !response.ok)) throw new Error("Failed to load event editor data");
  const [itemsRes, locationsRes, imagesRes, eventRes] = responses;
  const [allItems, allLocations, imageData] = await Promise.all([
    itemsRes.json() as Promise<AdminItem[]>,
    locationsRes.json() as Promise<AdminLocation[]>,
    imagesRes.json() as Promise<unknown>,
  ]);
  let form = EMPTY_FORM;
  if (mode === "edit" && eventRes) {
    const event = (await eventRes.json()) as EventRecord;
    if (event.kind === "random_requests") throw new Error("Random Requests is a system event and cannot be edited");
    form = eventRecordToForm(event);
  }
  return { allItems, allLocations, imageCatalog: normalizeImageCatalog(imageData), form };
}

function toggleFormSelection(previous: EventForm, field: "item_ids" | "location_ids", id: string): EventForm {
  const selectedSet = new Set(previous[field]);
  if (selectedSet.has(id)) selectedSet.delete(id);
  else selectedSet.add(id);
  const nextItemIds = field === "item_ids" ? Array.from(selectedSet) : previous.item_ids;
  const comboDeals = field === "item_ids"
    ? normalizeComboDeals(previous.combo_deals.map((combo) => {
      const groups = combo.requirement_groups
        .map((group) => ({ ...group, item_ids: group.item_ids.filter((itemId) => nextItemIds.includes(itemId)) }))
        .filter((group) => group.item_ids.length > 0);
      const targetGroupId = groups.some((group) => group.id === combo.discount.target_group_id)
        ? combo.discount.target_group_id
        : null;
      return {
        ...combo,
        requirement_groups: groups.length > 0 ? groups : [createEmptyRequirementGroup(0)],
        discount: {
          ...combo.discount,
          applies_to: targetGroupId ? combo.discount.applies_to : "combo_total",
          target_group_id: targetGroupId,
        },
      };
    }))
    : previous.combo_deals;
  return { ...previous, [field]: Array.from(selectedSet), combo_deals: comboDeals };
}

function reorderFormItems(previous: EventForm, activeId: string, overId: string): EventForm {
  const oldIndex = previous.item_ids.indexOf(activeId);
  const newIndex = previous.item_ids.indexOf(overId);
  if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return previous;
  return { ...previous, item_ids: arrayMove(previous.item_ids, oldIndex, newIndex) };
}

function moveFormItem(previous: EventForm, itemId: string, direction: -1 | 1): EventForm {
  const currentIndex = previous.item_ids.indexOf(itemId);
  const nextIndex = currentIndex + direction;
  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= previous.item_ids.length) return previous;
  return { ...previous, item_ids: arrayMove(previous.item_ids, currentIndex, nextIndex) };
}

function moveFormCombo(previous: EventForm, comboId: string, direction: -1 | 1): EventForm {
  const currentIndex = previous.combo_deals.findIndex((combo) => combo.id === comboId);
  const nextIndex = currentIndex + direction;
  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= previous.combo_deals.length) return previous;
  const comboDeals = [...previous.combo_deals];
  const [moved] = comboDeals.splice(currentIndex, 1);
  comboDeals.splice(nextIndex, 0, moved);
  return { ...previous, combo_deals: normalizeComboDeals(comboDeals) };
}

function eventRequestBody(form: EventForm) {
  return {
    name: form.name.trim(),
    event_date: form.event_date.trim(),
    hero_header: form.hero_header.trim(),
    hero_header_sage: form.hero_header_sage.trim(),
    hero_subheader: form.hero_subheader.trim(),
    promo_details: form.promo_details.trim() || null,
    tooltip_enabled: form.tooltip_enabled,
    tooltip_header: form.tooltip_enabled ? form.tooltip_header.trim() : null,
    tooltip_body: form.tooltip_enabled ? form.tooltip_body.trim() : null,
    tooltip_image_key: form.tooltip_enabled ? form.tooltip_image_key : null,
    hero_side_image_key: form.hero_side_image_key,
    etransfer_enabled: form.etransfer_enabled,
    etransfer_email: form.etransfer_enabled ? form.etransfer_email.trim() : null,
    item_ids: form.item_ids,
    location_ids: form.location_ids,
    combo_deals: normalizeComboDeals(form.combo_deals).map((combo, comboIndex) => ({
      id: combo.id,
      name: combo.name.trim(),
      enabled: combo.enabled,
      sort_order: comboIndex,
      requirement_groups: combo.requirement_groups.map((group, groupIndex) => ({
        id: group.id,
        name: group.name.trim() || defaultGroupName(groupIndex),
        item_ids: group.item_ids,
        min_quantity: Math.max(1, Number(group.min_quantity || 1)),
      })),
      discount: {
        type: combo.discount.type,
        amount: Number(combo.discount.amount || 0),
        applies_to: combo.discount.applies_to,
        target_group_id: combo.discount.applies_to === "group" ? combo.discount.target_group_id : null,
      },
    })),
  };
}

async function saveEventForm(mode: EditorMode, eventId: number | null, form: EventForm): Promise<"created" | "updated" | null> {
  validateEventForm(form);
  const token = await getAdminToken();
  if (!token) return null;
  const isEdit = mode === "edit" && Boolean(eventId);
  const response = await fetch(isEdit ? `${API_URL}/api/admin/events/${eventId}` : `${API_URL}/api/admin/events`, {
    method: isEdit ? "PUT" : "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(eventRequestBody(form)),
  });
  if (!response.ok) throw new Error(await getApiErrorMessage(response, "Failed to save event"));
  await response.json();
  return isEdit ? "updated" : "created";
}

async function runEventEditorSave(options: {
  mode: EditorMode;
  eventId: number | null;
  form: EventForm;
  setForm: (action: SetStateAction<EventForm>) => void;
  setSaving: (saving: boolean) => void;
  notify: (message: string, type: "success" | "error") => void;
  onCreated: () => void;
}): Promise<void> {
  options.setSaving(true);
  try {
    const result = await saveEventForm(options.mode, options.eventId, options.form);
    if (result === "updated") {
      options.notify("Event updated.", "success");
      options.setForm((previous) => ({ ...previous, combo_deals: normalizeComboDeals(previous.combo_deals) }));
    }
    if (result === "created") options.onCreated();
  } catch (saveError) {
    options.notify(saveError instanceof Error ? saveError.message : "Failed to save event", "error");
  } finally {
    options.setSaving(false);
  }
}

type RequirementGroup = ComboDeal["requirement_groups"][number];
type ComboUpdater = (updater: (current: ComboDeal) => ComboDeal) => void;

function updateRequirementGroup(
  combo: ComboDeal,
  groupId: string,
  updater: (group: RequirementGroup) => RequirementGroup,
): ComboDeal {
  return {
    ...combo,
    requirement_groups: combo.requirement_groups.map((group) => group.id === groupId ? updater(group) : group),
  };
}

function RequirementGroupEditor({
  combo,
  group,
  availableItems,
  onChange,
}: {
  combo: ComboDeal;
  group: RequirementGroup;
  availableItems: AdminItem[];
  onChange: ComboUpdater;
}) {
  const unavailableItemIds = new Set(
    combo.requirement_groups.filter((entry) => entry.id !== group.id).flatMap((entry) => entry.item_ids),
  );

  function removeGroup() {
    onChange((current) => {
      const nextGroups = current.requirement_groups.filter((entry) => entry.id !== group.id);
      const targetStillExists = nextGroups.some((entry) => entry.id === current.discount.target_group_id);
      return {
        ...current,
        requirement_groups: nextGroups.length > 0 ? nextGroups : [createEmptyRequirementGroup(0)],
        discount: {
          ...current.discount,
          applies_to: targetStillExists ? current.discount.applies_to : "combo_total",
          target_group_id: targetStillExists ? current.discount.target_group_id : null,
        },
      };
    });
  }

  return (
    <div className="rounded-3xl p-4" style={{ background: "white", border: "1px solid var(--color-border)" }}>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex-1">
          <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-text)" }}>Group Name</label>
          <input
            type="text"
            value={group.name}
            onChange={(event) => onChange((current) => updateRequirementGroup(current, group.id, (entry) => ({ ...entry, name: event.target.value })))}
            className="w-full px-4 py-3 rounded-2xl text-sm border bg-white focus:outline-none focus:ring-2"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
          />
        </div>
        <div>
          <p className="text-sm font-medium mb-2" style={{ color: "var(--color-text)" }}>Minimum Qty</p>
          <CounterControl
            value={group.min_quantity}
            onChange={(next) => onChange((current) => updateRequirementGroup(current, group.id, (entry) => ({ ...entry, min_quantity: next })))}
          />
        </div>
        <div className="flex items-end">
          <button
            type="button"
            onClick={removeGroup}
            disabled={combo.requirement_groups.length === 1}
            className="px-3 py-3 rounded-2xl text-xs font-semibold disabled:opacity-40"
            style={{ background: "var(--color-error-bg)", color: "var(--color-error-text)" }}
          >
            Remove Group
          </button>
        </div>
      </div>
      <div className="mt-4">
        <p className="text-sm font-medium mb-3" style={{ color: "var(--color-text)" }}>Eligible Items</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {availableItems.map((item) => {
            const selected = group.item_ids.includes(item.id);
            const disabled = !selected && unavailableItemIds.has(item.id);
            return (
              <button
                key={item.id}
                type="button"
                disabled={disabled}
                onClick={() => onChange((current) => updateRequirementGroup(current, group.id, (entry) => ({
                  ...entry,
                  item_ids: entry.item_ids.includes(item.id)
                    ? entry.item_ids.filter((itemId) => itemId !== item.id)
                    : [...entry.item_ids, item.id],
                })))}
                className="rounded-2xl p-4 text-left disabled:opacity-40"
                style={{ border: `1px solid ${selected ? "var(--color-sage)" : "var(--color-border)"}`, background: selected ? "var(--color-success-bg)" : "white" }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>{item.name}</p>
                    <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>{CURRENCY} ${(item.discounted_price ?? item.price).toFixed(2)}</p>
                  </div>
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold" style={{ background: selected ? "var(--color-forest)" : "var(--color-cream)", color: selected ? "var(--color-cream)" : "var(--color-muted)" }}>
                    {selected ? "✓" : "+"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ComboDiscountEditor({ combo, onChange }: { combo: ComboDeal; onChange: ComboUpdater }) {
  const setDiscountType = (type: ComboDiscount["type"]) => onChange((current) => ({
    ...current,
    discount: {
      ...current.discount,
      type,
      amount: type === "percentage"
        ? Math.min(100, Math.max(1, Number(current.discount.amount || 10)))
        : Math.max(1, Number(current.discount.amount || 5)),
    },
  }));
  const setAppliesTo = (appliesTo: ComboDiscount["applies_to"]) => onChange((current) => ({
    ...current,
    discount: {
      ...current.discount,
      applies_to: appliesTo,
      target_group_id: appliesTo === "group" ? (current.discount.target_group_id ?? current.requirement_groups[0]?.id ?? null) : null,
    },
  }));
  return (
    <div className="rounded-3xl p-4" style={{ background: "white", border: "1px solid var(--color-border)" }}>
      <p className="text-sm font-semibold mb-4" style={{ color: "var(--color-text)" }}>Discount Setup</p>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-text)" }}>Discount Type</label>
          <div className="grid grid-cols-2 gap-2">
            {(["fixed_amount", "percentage"] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setDiscountType(type)}
                className="rounded-2xl px-4 py-3 text-sm font-semibold"
                style={{ border: `1px solid ${combo.discount.type === type ? "var(--color-sage)" : "var(--color-border)"}`, background: combo.discount.type === type ? "var(--color-success-bg)" : "white", color: "var(--color-text)" }}
              >
                {type === "percentage" ? "Percentage" : "Dollar amount"}
              </button>
            ))}
          </div>
        </div>
        {combo.discount.type === "percentage" ? (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium" style={{ color: "var(--color-text)" }}>Discount Percentage</label>
              <span className="text-sm font-semibold" style={{ color: "var(--color-forest)" }}>{combo.discount.amount.toFixed(1).replace(/\.0$/, "")}%</span>
            </div>
            <input type="range" min={1} max={100} step={0.5} value={combo.discount.amount} onChange={(event) => onChange((current) => ({ ...current, discount: { ...current.discount, amount: Number(event.target.value) } }))} className="w-full" style={{ accentColor: "var(--color-sage)" }} />
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-text)" }}>Discount Amount</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm" style={{ color: "var(--color-muted)" }}>{CURRENCY} $</span>
              <input type="number" min={0} step={0.01} value={combo.discount.amount} onChange={(event) => onChange((current) => ({ ...current, discount: { ...current.discount, amount: Number(event.target.value || 0) } }))} className="w-full pl-16 pr-4 py-3 rounded-2xl text-sm border bg-white focus:outline-none focus:ring-2" style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }} />
            </div>
          </div>
        )}
        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-text)" }}>Discount Applies To</label>
          <div className="grid grid-cols-2 gap-2">
            {(["combo_total", "group"] as const).map((appliesTo) => (
              <button
                key={appliesTo}
                type="button"
                onClick={() => setAppliesTo(appliesTo)}
                className="rounded-2xl px-4 py-3 text-sm font-semibold"
                style={{ border: `1px solid ${combo.discount.applies_to === appliesTo ? "var(--color-sage)" : "var(--color-border)"}`, background: combo.discount.applies_to === appliesTo ? "var(--color-success-bg)" : "white", color: "var(--color-text)" }}
              >
                {appliesTo === "group" ? "Specific group" : "Whole combo"}
              </button>
            ))}
          </div>
        </div>
        {combo.discount.applies_to === "group" && (
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-text)" }}>Target Group</label>
            <select value={combo.discount.target_group_id ?? ""} onChange={(event) => onChange((current) => ({ ...current, discount: { ...current.discount, target_group_id: event.target.value || null } }))} className="w-full px-4 py-3 rounded-2xl text-sm border bg-white focus:outline-none focus:ring-2" style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}>
              <option value="">Select a target group</option>
              {combo.requirement_groups.map((group, index) => <option key={group.id} value={group.id}>{group.name.trim() || defaultGroupName(index)}</option>)}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}

function ComboDealCard({
  combo,
  index,
  total,
  availableItems,
  itemsById,
  onChange,
  onMove,
  onDelete,
}: {
  combo: ComboDeal;
  index: number;
  total: number;
  availableItems: AdminItem[];
  itemsById: Map<string, AdminItem>;
  onChange: ComboUpdater;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-[28px] p-5" style={{ background: "var(--color-cream)", border: "1px solid var(--color-border)" }}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex-1">
          <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-text)" }}>Combo Name</label>
          <input type="text" value={combo.name} onChange={(event) => onChange((current) => ({ ...current, name: event.target.value }))} className="w-full px-4 py-3 rounded-2xl text-sm border bg-white focus:outline-none focus:ring-2" style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }} placeholder="Lamprais + Roll Bundle" />
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0} className="px-3 py-2 rounded-2xl text-xs font-semibold disabled:opacity-40" style={{ border: "1px solid var(--color-border)", color: "var(--color-text)", background: "white" }}>Up</button>
          <button type="button" onClick={() => onMove(1)} disabled={index === total - 1} className="px-3 py-2 rounded-2xl text-xs font-semibold disabled:opacity-40" style={{ border: "1px solid var(--color-border)", color: "var(--color-text)", background: "white" }}>Down</button>
          <button type="button" onClick={onDelete} className="px-3 py-2 rounded-2xl text-xs font-semibold" style={{ background: "var(--color-error-bg)", color: "var(--color-error-text)" }}>Delete</button>
        </div>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_0.8fr] gap-5 mt-5">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>Requirement Groups</p>
              <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>Each group can match one or many items. Items can only appear in one group per combo.</p>
            </div>
            <button type="button" onClick={() => onChange((current) => ({ ...current, requirement_groups: [...current.requirement_groups, createEmptyRequirementGroup(current.requirement_groups.length)] }))} className="px-3 py-2 rounded-2xl text-xs font-semibold" style={{ background: "white", color: "var(--color-text)", border: "1px solid var(--color-border)" }}>+ Add Group</button>
          </div>
          <div className="space-y-4">
            {combo.requirement_groups.map((group) => <RequirementGroupEditor key={group.id} combo={combo} group={group} availableItems={availableItems} onChange={onChange} />)}
          </div>
        </div>
        <div className="space-y-4">
          <ComboDiscountEditor combo={combo} onChange={onChange} />
          <div className="rounded-3xl p-4" style={{ background: "var(--color-forest)", color: "white" }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em]" style={{ color: "rgba(247,245,240,0.6)" }}>Live Preview</p>
                <p className="text-base font-semibold mt-2">{combo.name || "Untitled combo"}</p>
                <p className="text-sm mt-2" style={{ color: "rgba(247,245,240,0.78)" }}>{comboPreviewText(combo, itemsById, CURRENCY)}</p>
              </div>
              <label className="inline-flex items-center gap-2 text-sm shrink-0">
                <input type="checkbox" checked={combo.enabled} onChange={(event) => onChange((current) => ({ ...current, enabled: event.target.checked }))} style={{ accentColor: "var(--color-sage)" }} />
                Enabled
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ComboDealsEditor({ form, itemsById, setForm, onUpdate, onMove }: {
  form: EventForm;
  itemsById: Map<string, AdminItem>;
  setForm: (action: SetStateAction<EventForm>) => void;
  onUpdate: (comboId: string, updater: (current: ComboDeal) => ComboDeal) => void;
  onMove: (comboId: string, direction: -1 | 1) => void;
}) {
  const availableItems = form.item_ids.map((itemId) => itemsById.get(itemId)).filter((item): item is AdminItem => Boolean(item));
  return (
    <div className="rounded-[28px] p-6" style={{ background: "white", border: "1px solid var(--color-border)" }}>
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-6">
        <div>{sectionTitle("Combo Deals", "Build bundles with grouped OR logic, counters, and discount targeting.")}</div>
        <button type="button" onClick={() => setForm((previous) => ({ ...previous, combo_deals: [...previous.combo_deals, createEmptyComboDeal(previous.combo_deals.length)] }))} className="px-4 py-3 rounded-2xl text-sm font-semibold shrink-0" style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}>+ Add Combo</button>
      </div>
      {form.combo_deals.length === 0 ? (
        <div className="rounded-3xl p-6 text-sm" style={{ background: "var(--color-cream)", color: "var(--color-muted)" }}>No combos yet. Add one to configure grouped bundle discounts.</div>
      ) : (
        <div className="space-y-5">
          {form.combo_deals.map((combo, index) => (
            <ComboDealCard
              key={combo.id}
              combo={combo}
              index={index}
              total={form.combo_deals.length}
              availableItems={availableItems}
              itemsById={itemsById}
              onChange={(updater) => onUpdate(combo.id, updater)}
              onMove={(direction) => onMove(combo.id, direction)}
              onDelete={() => setForm((previous) => ({ ...previous, combo_deals: normalizeComboDeals(previous.combo_deals.filter((entry) => entry.id !== combo.id)) }))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EventEditorToolbar({ mode, saving, onBack, onSave }: { mode: EditorMode; saving: boolean; onBack: () => void; onSave: () => void }) {
  return (
    <div className="sticky top-0 z-30 mb-6 rounded-[28px] px-6 py-5" style={{ background: "rgba(247,245,240,0.95)", border: "1px solid var(--color-border)", backdropFilter: "blur(10px)" }}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <button type="button" onClick={onBack} className="text-xs font-semibold uppercase tracking-[0.18em] mb-2" style={{ color: "var(--color-sage)" }}>Back</button>
          <h1 className="text-2xl font-bold" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>{mode === "edit" ? "Edit Event" : "Create Event"}</h1>
          <p className="text-sm mt-1" style={{ color: "var(--color-muted)" }}>Dedicated event setup with grouped combo rules, pricing controls, and event-level content.</p>
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={onBack} className="px-5 py-3 rounded-2xl text-sm font-medium" style={{ border: "1px solid var(--color-border)", color: "var(--color-text)", background: "white" }}>Cancel</button>
          <button type="button" onClick={onSave} disabled={saving} className="px-6 py-3 rounded-2xl text-sm font-semibold disabled:opacity-60" style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}>
            {saving ? "Saving..." : mode === "edit" ? "Save Changes" : "Create Event"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EventBasics({ form, setForm }: { form: EventForm; setForm: (action: SetStateAction<EventForm>) => void }) {
  return (
    <div className="rounded-[28px] p-6" style={{ background: "white", border: "1px solid var(--color-border)" }}>
      {sectionTitle("Basics", "Name, date, and primary event copy shown throughout the storefront.")}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-text)" }}>Event Name</label>
          <input type="text" value={form.name} onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))} className="w-full px-4 py-3 rounded-2xl text-sm border bg-white focus:outline-none focus:ring-2" style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }} placeholder="April 2026 Batch" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-text)" }}>Event Date</label>
          <input type="text" value={form.event_date} onChange={(event) => setForm((previous) => ({ ...previous, event_date: event.target.value }))} className="w-full px-4 py-3 rounded-2xl text-sm border bg-white focus:outline-none focus:ring-2" style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }} placeholder="April 26th, 2026" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-text)" }}>Hero Header</label>
          <input type="text" value={form.hero_header} onChange={(event) => setForm((previous) => ({ ...previous, hero_header: event.target.value }))} className="w-full px-4 py-3 rounded-2xl text-sm border bg-white focus:outline-none focus:ring-2" style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }} placeholder="We're Making" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-text)" }}>Hero Header (Sage)</label>
          <input type="text" value={form.hero_header_sage} onChange={(event) => setForm((previous) => ({ ...previous, hero_header_sage: event.target.value }))} className="w-full px-4 py-3 rounded-2xl text-sm border bg-white focus:outline-none focus:ring-2" style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }} placeholder="Lamprais" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-text)" }}>Hero Subheader</label>
          <input type="text" value={form.hero_subheader} onChange={(event) => setForm((previous) => ({ ...previous, hero_subheader: event.target.value }))} className="w-full px-4 py-3 rounded-2xl text-sm border bg-white focus:outline-none focus:ring-2" style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }} placeholder="Fresh batches, made with care." />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-text)" }}>Promo Details</label>
          <textarea value={form.promo_details} onChange={(event) => setForm((previous) => ({ ...previous, promo_details: event.target.value }))} className="w-full px-4 py-3 rounded-2xl text-sm border bg-white focus:outline-none focus:ring-2" style={{ borderColor: "var(--color-border)", color: "var(--color-text)", minHeight: 108 }} placeholder="Short offer copy or launch note." />
        </div>
      </div>
    </div>
  );
}

function EventMediaAndPayment({
  form,
  setForm,
  imageCatalog,
  tooltipImages,
  heroImages,
}: {
  form: EventForm;
  setForm: (action: SetStateAction<EventForm>) => void;
  imageCatalog: EventImageCatalog;
  tooltipImages: EventImage[];
  heroImages: EventImage[];
}) {
  const selectedTooltipImage = tooltipImages.find((image) => image.key === form.tooltip_image_key) ?? null;
  const selectedHeroImage = heroImages.find((image) => image.key === form.hero_side_image_key) ?? null;
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1.25fr_0.75fr] gap-6">
      <div className="rounded-[28px] p-6" style={{ background: "white", border: "1px solid var(--color-border)" }}>
        {sectionTitle("Hero + Tooltip", "Control supporting content, tooltip messaging, and storefront imagery.")}
        <div className="space-y-5">
          <div className="rounded-3xl p-5" style={{ background: "var(--color-cream)" }}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>Tooltip</p>
                <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>Show a learn-more panel on the public event page.</p>
              </div>
              <label className="inline-flex items-center gap-2 text-sm" style={{ color: "var(--color-text)" }}>
                <input type="checkbox" checked={form.tooltip_enabled} onChange={(event) => setForm((previous) => ({ ...previous, tooltip_enabled: event.target.checked, tooltip_header: event.target.checked ? previous.tooltip_header : "", tooltip_body: event.target.checked ? previous.tooltip_body : "", tooltip_image_key: event.target.checked ? previous.tooltip_image_key : null }))} style={{ accentColor: "var(--color-sage)" }} />
                Enabled
              </label>
            </div>
            {form.tooltip_enabled && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-text)" }}>Tooltip Header</label>
                  <input type="text" value={form.tooltip_header} onChange={(event) => setForm((previous) => ({ ...previous, tooltip_header: event.target.value }))} className="w-full px-4 py-3 rounded-2xl text-sm border bg-white focus:outline-none focus:ring-2" style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-text)" }}>Tooltip Image</label>
                  <select value={form.tooltip_image_key ?? ""} onChange={(event) => setForm((previous) => ({ ...previous, tooltip_image_key: event.target.value || null }))} className="w-full px-4 py-3 rounded-2xl text-sm border bg-white focus:outline-none focus:ring-2" style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}>
                    <option value="">None</option>
                    {tooltipImages.map((image) => <option key={image.key} value={image.key}>{image.label}</option>)}
                  </select>
                </div>
                <div className="lg:col-span-2">
                  <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-text)" }}>Tooltip Body</label>
                  <textarea value={form.tooltip_body} onChange={(event) => setForm((previous) => ({ ...previous, tooltip_body: event.target.value }))} className="w-full px-4 py-3 rounded-2xl text-sm border bg-white focus:outline-none focus:ring-2" style={{ borderColor: "var(--color-border)", color: "var(--color-text)", minHeight: 110 }} />
                </div>
              </div>
            )}
          </div>
          <div className="rounded-3xl p-5" style={{ background: "var(--color-cream)" }}>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-text)" }}>Hero Side Image</label>
            <select value={form.hero_side_image_key ?? ""} onChange={(event) => setForm((previous) => ({ ...previous, hero_side_image_key: event.target.value || null }))} className="w-full px-4 py-3 rounded-2xl text-sm border bg-white focus:outline-none focus:ring-2" style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}>
              <option value="">None</option>
              {heroImages.map((image) => <option key={image.key} value={image.key}>{image.label}</option>)}
            </select>
          </div>
          <div className="text-xs" style={{ color: "var(--color-muted)" }}>Tooltip images folder: <code>{imageCatalog.helper.tooltip_target_dir}</code><br />Hero side images folder: <code>{imageCatalog.helper.hero_side_target_dir}</code></div>
        </div>
      </div>
      <div className="space-y-6">
        <div className="rounded-[28px] p-6" style={{ background: "white", border: "1px solid var(--color-border)" }}>
          {sectionTitle("Preview", "Quick reference while editing.")}
          <div className="space-y-4">
            <div className="rounded-3xl p-4" style={{ background: "var(--color-cream)" }}>
              <p className="text-xs uppercase tracking-[0.18em]" style={{ color: "var(--color-sage)" }}>Hero</p>
              <p className="text-lg font-semibold mt-2" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>{form.hero_header || "Hero header"}{form.hero_header_sage ? ` ${form.hero_header_sage}` : ""}</p>
              <p className="text-sm mt-2" style={{ color: "var(--color-muted)" }}>{form.hero_subheader || "Subheader preview"}</p>
            </div>
            {selectedTooltipImage && <div className="rounded-3xl overflow-hidden" style={{ border: "1px solid var(--color-border)" }}><img src={selectedTooltipImage.path} alt={selectedTooltipImage.alt} className="w-full h-auto" /></div>}
            {selectedHeroImage && <div className="rounded-3xl overflow-hidden" style={{ border: "1px solid var(--color-border)" }}><img src={selectedHeroImage.path} alt={selectedHeroImage.alt} className="w-full h-auto" /></div>}
          </div>
        </div>
        <div className="rounded-[28px] p-6" style={{ background: "white", border: "1px solid var(--color-border)" }}>
          {sectionTitle("Payment", "Optional e-transfer instructions shown after checkout and in order confirmation.")}
          <label className="inline-flex items-center gap-2 text-sm mb-4" style={{ color: "var(--color-text)" }}>
            <input type="checkbox" checked={form.etransfer_enabled} onChange={(event) => setForm((previous) => ({ ...previous, etransfer_enabled: event.target.checked, etransfer_email: event.target.checked ? previous.etransfer_email : "" }))} style={{ accentColor: "var(--color-sage)" }} />
            Enable e-transfer
          </label>
          <input type="email" value={form.etransfer_email} onChange={(event) => setForm((previous) => ({ ...previous, etransfer_email: event.target.value }))} disabled={!form.etransfer_enabled} className="w-full px-4 py-3 rounded-2xl text-sm border bg-white focus:outline-none focus:ring-2 disabled:opacity-50" style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }} placeholder="payments@example.com" />
        </div>
      </div>
    </div>
  );
}

export default function EventEditor({ mode }: { mode: "create" | "edit" }) {
  const router = useRouter();
  const params = useParams();
  const eventId = mode === "edit" ? Number(params?.id) : null;

  const [state, setState] = useState<EventEditorState>(INITIAL_EDITOR_STATE);
  const { form, allItems, allLocations, imageCatalog, loading, saving, error } = state;
  const { toast, showToast } = useAdminToast(4000);
  const updateState = useCallback((patch: Partial<EventEditorState>) => {
    setState((current) => ({ ...current, ...patch }));
  }, []);
  const setForm = useCallback((action: SetStateAction<EventForm>) => {
    setState((current) => ({
      ...current,
      form: typeof action === "function" ? action(current.form) : action,
    }));
  }, []);

  const { itemsById, tooltipImageOptions, heroSideImageOptions, orderedSelectedItems } = useMemo(() => {
    const itemMap = new Map(allItems.map((item) => [item.id, item] as const));
    return {
      itemsById: itemMap,
      tooltipImageOptions: imageCatalog.images.filter((image) => image.type === "tooltip"),
      heroSideImageOptions: imageCatalog.images.filter((image) => image.type === "hero_side"),
      orderedSelectedItems: form.item_ids.map((itemId) => itemMap.get(itemId)).filter((item): item is AdminItem => Boolean(item)),
    };
  }, [allItems, form.item_ids, imageCatalog.images]);

  useEffect(() => {
    updateState({ loading: true, error: null });
    fetchEventEditorData(mode, eventId)
      .then((data) => {
        if (data) updateState(data);
      })
      .catch((loadError) => {
        updateState({ error: loadError instanceof Error ? loadError.message : "Failed to load event editor" });
      })
      .finally(() => updateState({ loading: false }));
  }, [eventId, mode, updateState]);

  const toggleSelection = useCallback((field: "item_ids" | "location_ids", id: string) => {
    setForm((previous) => toggleFormSelection(previous, field, id));
  }, [setForm]);

  const reorderSelectedItem = useCallback((activeId: string, overId: string) => {
    setForm((previous) => reorderFormItems(previous, activeId, overId));
  }, [setForm]);

  const moveSelectedItem = useCallback((itemId: string, direction: -1 | 1) => {
    setForm((previous) => moveFormItem(previous, itemId, direction));
  }, [setForm]);

  function updateComboDeal(comboId: string, updater: (current: ComboDeal) => ComboDeal) {
    setForm((previous) => ({
      ...previous,
      combo_deals: normalizeComboDeals(previous.combo_deals.map((combo) => combo.id === comboId ? updater(combo) : combo)),
    }));
  }

  function moveComboDeal(comboId: string, direction: -1 | 1) {
    setForm((previous) => moveFormCombo(previous, comboId, direction));
  }

  const handleSave = () => runEventEditorSave({
    mode,
    eventId,
    form,
    setForm,
    setSaving: (nextSaving) => updateState({ saving: nextSaving }),
    notify: showToast,
    onCreated: () => router.push("/admin/config"),
  });

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
        <div className="rounded-[28px] p-8" style={{ background: "white", border: "1px solid var(--color-border)" }}>
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
      <AdminToast toast={toast} />

      <EventEditorToolbar
        mode={mode}
        saving={saving}
        onBack={() => router.push(mode === "edit" && eventId ? `/admin/events/${eventId}` : "/admin/config")}
        onSave={handleSave}
      />

      <div className="space-y-6">
        <EventBasics form={form} setForm={setForm} />
        <EventMediaAndPayment
          form={form}
          setForm={setForm}
          imageCatalog={imageCatalog}
          tooltipImages={tooltipImageOptions}
          heroImages={heroSideImageOptions}
        />

        <SelectionGrid
          title="Items"
          subtitle="Choose which menu items belong to this event. Combo groups can only use items selected here."
          items={allItems.map((item) => ({
            id: item.id,
            label: item.name,
            detail: `${CURRENCY} $${(item.discounted_price ?? item.price).toFixed(2)}`,
          }))}
          selectedIds={form.item_ids}
          onToggle={(id) => toggleSelection("item_ids", id)}
        />

        <ItemOrderList
          items={orderedSelectedItems}
          onReorder={reorderSelectedItem}
          onMove={moveSelectedItem}
        />

        <SelectionGrid
          title="Locations"
          subtitle="Choose the pickup locations available for this event."
          items={allLocations.map((location) => ({
            id: location.id,
            label: location.name,
          }))}
          selectedIds={form.location_ids}
          onToggle={(id) => toggleSelection("location_ids", id)}
        />

        <ComboDealsEditor
          form={form}
          itemsById={itemsById}
          setForm={setForm}
          onUpdate={updateComboDeal}
          onMove={moveComboDeal}
        />
      </div>
    </div>
  );
}
