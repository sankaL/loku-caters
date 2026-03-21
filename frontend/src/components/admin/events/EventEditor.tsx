"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { API_URL, CURRENCY } from "@/config/event";
import { getAdminToken } from "@/lib/auth";
import { getApiErrorMessage } from "@/lib/apiError";

type EventImageType = "tooltip" | "hero_side";

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
  };
  images: EventImage[];
}

interface ComboRequirementGroup {
  id: string;
  name: string;
  item_ids: string[];
  min_quantity: number;
}

interface ComboDiscount {
  type: "fixed_amount" | "percentage";
  amount: number;
  applies_to: "combo_total" | "group";
  target_group_id: string | null;
}

interface ComboDeal {
  id: string;
  name: string;
  enabled: boolean;
  sort_order: number;
  requirement_groups: ComboRequirementGroup[];
  discount: ComboDiscount;
}

interface EventRecord {
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
    },
    images: images
      .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
      .map((entry): EventImage => ({
        key: typeof entry.key === "string" ? entry.key : "",
        type: entry.type === "hero_side" ? "hero_side" : "tooltip",
        label: typeof entry.label === "string" ? entry.label : "",
        path: typeof entry.path === "string" ? entry.path : "",
        alt: typeof entry.alt === "string" ? entry.alt : "",
      }))
      .filter((entry) => Boolean(entry.key) && Boolean(entry.path) && Boolean(entry.label)),
  };
}

function createEmptyRequirementGroup(index: number): ComboRequirementGroup {
  return {
    id: crypto.randomUUID(),
    name: index === 0 ? "Base group" : `Group ${index + 1}`,
    item_ids: [],
    min_quantity: 1,
  };
}

function defaultGroupName(index: number): string {
  return index === 0 ? "Base group" : `Group ${index + 1}`;
}

function createEmptyComboDeal(sortOrder: number): ComboDeal {
  return {
    id: crypto.randomUUID(),
    name: "",
    enabled: true,
    sort_order: sortOrder,
    requirement_groups: [createEmptyRequirementGroup(0)],
    discount: {
      type: "fixed_amount",
      amount: 5,
      applies_to: "combo_total",
      target_group_id: null,
    },
  };
}

function normalizeComboDeals(comboDeals: ComboDeal[]): ComboDeal[] {
  return comboDeals.map((combo, comboIndex) => ({
    id: combo.id || crypto.randomUUID(),
    name: combo.name ?? "",
    enabled: combo.enabled ?? true,
    sort_order: comboIndex,
    requirement_groups: (combo.requirement_groups ?? []).map((group) => ({
      id: group.id || crypto.randomUUID(),
      name: group.name ?? "",
      item_ids: Array.from(new Set(group.item_ids.filter(Boolean))),
      min_quantity: Math.max(1, Number(group.min_quantity || 1)),
    })),
    discount: {
      type: combo.discount.type,
      amount: Number(combo.discount.amount || 0),
      applies_to: combo.discount.applies_to,
      target_group_id: combo.discount.applies_to === "group" ? combo.discount.target_group_id ?? null : null,
    },
  }));
}

function normalizeIncomingComboDeal(raw: unknown, index: number): ComboDeal {
  const fallback = createEmptyComboDeal(index);
  if (!raw || typeof raw !== "object") return fallback;
  const entry = raw as {
    id?: string;
    name?: string;
    enabled?: boolean;
    sort_order?: number;
    requirement_groups?: Array<Partial<ComboRequirementGroup>>;
    requirements?: Array<{ item_id?: string; min_quantity?: number }>;
    discount?: Partial<ComboDiscount> & { applies_to?: "combo_total" | "group" | "item"; target_item_id?: string | null };
  };

  const requirementGroups = Array.isArray(entry.requirement_groups) && entry.requirement_groups.length > 0
    ? entry.requirement_groups.map((group) => ({
      id: group.id || crypto.randomUUID(),
      name: group.name ?? "",
      item_ids: Array.from(new Set((group.item_ids ?? []).filter(Boolean))),
      min_quantity: Math.max(1, Number(group.min_quantity || 1)),
    }))
    : (entry.requirements ?? []).map((requirement, requirementIndex) => ({
      id: crypto.randomUUID(),
      name: requirement.item_id || (requirementIndex === 0 ? "Base group" : `Group ${requirementIndex + 1}`),
      item_ids: requirement.item_id ? [requirement.item_id] : [],
      min_quantity: Math.max(1, Number(requirement.min_quantity || 1)),
    }));

  let targetGroupId: string | null = null;
  const rawAppliesTo = entry.discount?.applies_to as string | undefined;
  const appliesTo = rawAppliesTo === "item" || rawAppliesTo === "group"
    ? "group"
    : "combo_total";

  if (appliesTo === "group") {
    if (entry.discount?.target_group_id) {
      targetGroupId = entry.discount.target_group_id;
    } else if (entry.discount?.target_item_id) {
      targetGroupId = requirementGroups.find((group) => group.item_ids.includes(entry.discount?.target_item_id || ""))?.id ?? null;
    }
  }

  return {
    id: entry.id || crypto.randomUUID(),
    name: entry.name ?? "",
    enabled: entry.enabled ?? true,
    sort_order: Number(entry.sort_order ?? index),
    requirement_groups: requirementGroups.length > 0 ? requirementGroups : [createEmptyRequirementGroup(0)],
    discount: {
      type: entry.discount?.type === "percentage" ? "percentage" : "fixed_amount",
      amount: Number(entry.discount?.amount || 0),
      applies_to: appliesTo,
      target_group_id: targetGroupId,
    },
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
                background: active ? "#f0f7ea" : "white",
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

export default function EventEditor({ mode }: { mode: "create" | "edit" }) {
  const router = useRouter();
  const params = useParams();
  const eventId = mode === "edit" ? Number(params?.id) : null;

  const [form, setForm] = useState<EventForm>(EMPTY_FORM);
  const [allItems, setAllItems] = useState<AdminItem[]>([]);
  const [allLocations, setAllLocations] = useState<AdminLocation[]>([]);
  const [imageCatalog, setImageCatalog] = useState<EventImageCatalog>(EMPTY_IMAGE_CATALOG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const itemsById = useMemo(() => new Map(allItems.map((item) => [item.id, item] as const)), [allItems]);
  const tooltipImageOptions = useMemo(() => imageCatalog.images.filter((image) => image.type === "tooltip"), [imageCatalog.images]);
  const heroSideImageOptions = useMemo(() => imageCatalog.images.filter((image) => image.type === "hero_side"), [imageCatalog.images]);
  const selectedTooltipImage = useMemo(
    () => tooltipImageOptions.find((image) => image.key === form.tooltip_image_key) ?? null,
    [tooltipImageOptions, form.tooltip_image_key]
  );
  const selectedHeroSideImage = useMemo(
    () => heroSideImageOptions.find((image) => image.key === form.hero_side_image_key) ?? null,
    [heroSideImageOptions, form.hero_side_image_key]
  );

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 4000);
  }, []);

  const loadEditorData = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };

    const requests: Promise<Response>[] = [
      fetch(`${API_URL}/api/admin/items`, { headers }),
      fetch(`${API_URL}/api/admin/locations`, { headers }),
      fetch(`${API_URL}/api/admin/event-images`, { headers }),
    ];

    if (mode === "edit" && eventId) {
      requests.push(fetch(`${API_URL}/api/admin/events/${eventId}`, { headers }));
    }

    const responses = await Promise.all(requests);
    if (responses.some((response) => !response.ok)) {
      throw new Error("Failed to load event editor data");
    }

    const [itemsRes, locationsRes, imagesRes, eventRes] = responses;
    const [itemsData, locationsData, imageData] = await Promise.all([
      itemsRes.json() as Promise<AdminItem[]>,
      locationsRes.json() as Promise<AdminLocation[]>,
      imagesRes.json() as Promise<unknown>,
    ]);

    setAllItems(itemsData);
    setAllLocations(locationsData);
    setImageCatalog(normalizeImageCatalog(imageData));

    if (mode === "edit" && eventRes) {
      const eventData = (await eventRes.json()) as EventRecord;
      setForm({
        name: eventData.name,
        event_date: eventData.event_date,
        hero_header: eventData.hero_header,
        hero_header_sage: eventData.hero_header_sage ?? "",
        hero_subheader: eventData.hero_subheader ?? "",
        promo_details: eventData.promo_details ?? "",
        tooltip_enabled: eventData.tooltip_enabled,
        tooltip_header: eventData.tooltip_header ?? "",
        tooltip_body: eventData.tooltip_body ?? "",
        tooltip_image_key: eventData.tooltip_image_key,
        hero_side_image_key: eventData.hero_side_image_key,
        etransfer_enabled: eventData.etransfer_enabled,
        etransfer_email: eventData.etransfer_email ?? "",
        item_ids: [...eventData.item_ids],
        location_ids: [...eventData.location_ids],
        combo_deals: normalizeComboDeals((eventData.combo_deals ?? []).map((combo, index) => normalizeIncomingComboDeal(combo, index))),
      });
      return;
    }

    setForm(EMPTY_FORM);
  }, [eventId, mode]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    loadEditorData()
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : "Failed to load event editor");
      })
      .finally(() => setLoading(false));
  }, [loadEditorData]);

  const toggleSelection = useCallback((field: "item_ids" | "location_ids", id: string) => {
    setForm((previous) => {
      const selectedSet = new Set(previous[field]);
      if (selectedSet.has(id)) {
        selectedSet.delete(id);
      } else {
        selectedSet.add(id);
      }

      const nextItemIds = field === "item_ids" ? Array.from(selectedSet) : previous.item_ids;
      const nextComboDeals = field === "item_ids"
        ? normalizeComboDeals(previous.combo_deals.map((combo) => {
          const nextGroups = combo.requirement_groups
            .map((group) => ({
              ...group,
              item_ids: group.item_ids.filter((itemId) => nextItemIds.includes(itemId)),
            }))
            .filter((group) => group.item_ids.length > 0);

          const nextTargetGroupId = combo.discount.target_group_id && nextGroups.some((group) => group.id === combo.discount.target_group_id)
            ? combo.discount.target_group_id
            : null;

          return {
            ...combo,
            requirement_groups: nextGroups.length > 0 ? nextGroups : [createEmptyRequirementGroup(0)],
            discount: {
              ...combo.discount,
              applies_to: nextTargetGroupId ? combo.discount.applies_to : "combo_total",
              target_group_id: nextTargetGroupId,
            },
          };
        }))
        : previous.combo_deals;

      return {
        ...previous,
        [field]: Array.from(selectedSet),
        combo_deals: nextComboDeals,
      };
    });
  }, []);

  function updateComboDeal(comboId: string, updater: (current: ComboDeal) => ComboDeal) {
    setForm((previous) => ({
      ...previous,
      combo_deals: normalizeComboDeals(previous.combo_deals.map((combo) => combo.id === comboId ? updater(combo) : combo)),
    }));
  }

  function moveComboDeal(comboId: string, direction: -1 | 1) {
    setForm((previous) => {
      const currentIndex = previous.combo_deals.findIndex((combo) => combo.id === comboId);
      const nextIndex = currentIndex + direction;
      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= previous.combo_deals.length) {
        return previous;
      }
      const nextCombos = [...previous.combo_deals];
      const [moved] = nextCombos.splice(currentIndex, 1);
      nextCombos.splice(nextIndex, 0, moved);
      return {
        ...previous,
        combo_deals: normalizeComboDeals(nextCombos),
      };
    });
  }

  function validateForm() {
    if (!form.name.trim() || !form.event_date.trim() || !form.hero_header.trim()) {
      throw new Error("Event name, event date, and hero header are required");
    }
    if (form.tooltip_enabled && (!form.tooltip_header.trim() || !form.tooltip_body.trim())) {
      throw new Error("Tooltip header and body are required when tooltip is enabled");
    }
    if (form.etransfer_enabled && !form.etransfer_email.trim()) {
      throw new Error("E-transfer email is required when e-transfer is enabled");
    }

    const selectedItemIds = new Set(form.item_ids);
    for (const combo of form.combo_deals) {
      if (!combo.name.trim()) {
        throw new Error("Each combo needs a name");
      }
      if (combo.requirement_groups.length === 0) {
        throw new Error(`Combo "${combo.name}" needs at least one requirement group`);
      }
      const itemIdsSeen = new Set<string>();
      for (const group of combo.requirement_groups) {
        if (group.item_ids.length === 0) {
          throw new Error(`Combo "${combo.name}" has a group without any items`);
        }
        if (group.min_quantity < 1) {
          throw new Error(`Combo "${combo.name}" has an invalid minimum quantity`);
        }
        for (const itemId of group.item_ids) {
          if (!selectedItemIds.has(itemId)) {
            throw new Error(`Combo "${combo.name}" references an item that is not selected for the event`);
          }
          if (itemIdsSeen.has(itemId)) {
            throw new Error(`Combo "${combo.name}" repeats an item across multiple groups`);
          }
          itemIdsSeen.add(itemId);
        }
      }
      if (combo.discount.amount <= 0) {
        throw new Error(`Combo "${combo.name}" needs a discount greater than 0`);
      }
      if (combo.discount.type === "percentage" && combo.discount.amount > 100) {
        throw new Error(`Combo "${combo.name}" percentage discounts cannot exceed 100`);
      }
      if (combo.discount.applies_to === "group" && !combo.discount.target_group_id) {
        throw new Error(`Combo "${combo.name}" needs a target group`);
      }
    }
  }

  async function handleSave() {
    try {
      validateForm();
      setSaving(true);
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

      const isEdit = mode === "edit" && eventId;
      const url = isEdit ? `${API_URL}/api/admin/events/${eventId}` : `${API_URL}/api/admin/events`;
      const method = isEdit ? "PUT" : "POST";
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(await getApiErrorMessage(response, "Failed to save event"));
      }

      if (isEdit) {
        await response.json();
        showToast("Event updated.", "success");
        setForm((previous) => ({
          ...previous,
          combo_deals: normalizeComboDeals(previous.combo_deals),
        }));
        return;
      }

      await response.json();
      router.push("/admin/config");
    } catch (saveError) {
      showToast(saveError instanceof Error ? saveError.message : "Failed to save event", "error");
    } finally {
      setSaving(false);
    }
  }

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

      <div
        className="sticky top-0 z-30 mb-6 rounded-[28px] px-6 py-5"
        style={{
          background: "rgba(247,245,240,0.95)",
          border: "1px solid var(--color-border)",
          backdropFilter: "blur(10px)",
        }}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <button
              type="button"
              onClick={() => router.push(mode === "edit" && eventId ? `/admin/events/${eventId}` : "/admin/config")}
              className="text-xs font-semibold uppercase tracking-[0.18em] mb-2"
              style={{ color: "var(--color-sage)" }}
            >
              Back
            </button>
            <h1 className="text-2xl font-bold" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>
              {mode === "edit" ? "Edit Event" : "Create Event"}
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--color-muted)" }}>
              Dedicated event setup with grouped combo rules, pricing controls, and event-level content.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => router.push(mode === "edit" && eventId ? `/admin/events/${eventId}` : "/admin/config")}
              className="px-5 py-3 rounded-2xl text-sm font-medium"
              style={{ border: "1px solid var(--color-border)", color: "var(--color-text)", background: "white" }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-3 rounded-2xl text-sm font-semibold disabled:opacity-60"
              style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}
            >
              {saving ? "Saving..." : mode === "edit" ? "Save Changes" : "Create Event"}
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="rounded-[28px] p-6" style={{ background: "white", border: "1px solid var(--color-border)" }}>
          {sectionTitle("Basics", "Name, date, and primary event copy shown throughout the storefront.")}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-text)" }}>Event Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))}
                className="w-full px-4 py-3 rounded-2xl text-sm border bg-white focus:outline-none focus:ring-2"
                style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
                placeholder="April 2026 Batch"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-text)" }}>Event Date</label>
              <input
                type="text"
                value={form.event_date}
                onChange={(event) => setForm((previous) => ({ ...previous, event_date: event.target.value }))}
                className="w-full px-4 py-3 rounded-2xl text-sm border bg-white focus:outline-none focus:ring-2"
                style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
                placeholder="April 26th, 2026"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-text)" }}>Hero Header</label>
              <input
                type="text"
                value={form.hero_header}
                onChange={(event) => setForm((previous) => ({ ...previous, hero_header: event.target.value }))}
                className="w-full px-4 py-3 rounded-2xl text-sm border bg-white focus:outline-none focus:ring-2"
                style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
                placeholder="We're Making"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-text)" }}>Hero Header (Sage)</label>
              <input
                type="text"
                value={form.hero_header_sage}
                onChange={(event) => setForm((previous) => ({ ...previous, hero_header_sage: event.target.value }))}
                className="w-full px-4 py-3 rounded-2xl text-sm border bg-white focus:outline-none focus:ring-2"
                style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
                placeholder="Lamprais"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-text)" }}>Hero Subheader</label>
              <input
                type="text"
                value={form.hero_subheader}
                onChange={(event) => setForm((previous) => ({ ...previous, hero_subheader: event.target.value }))}
                className="w-full px-4 py-3 rounded-2xl text-sm border bg-white focus:outline-none focus:ring-2"
                style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
                placeholder="Fresh batches, made with care."
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-text)" }}>Promo Details</label>
              <textarea
                value={form.promo_details}
                onChange={(event) => setForm((previous) => ({ ...previous, promo_details: event.target.value }))}
                className="w-full px-4 py-3 rounded-2xl text-sm border bg-white focus:outline-none focus:ring-2"
                style={{ borderColor: "var(--color-border)", color: "var(--color-text)", minHeight: 108 }}
                placeholder="Short offer copy or launch note."
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.25fr_0.75fr] gap-6">
          <div className="rounded-[28px] p-6" style={{ background: "white", border: "1px solid var(--color-border)" }}>
            {sectionTitle("Hero + Tooltip", "Control supporting content, tooltip messaging, and storefront imagery.")}
            <div className="space-y-5">
              <div className="rounded-3xl p-5" style={{ background: "var(--color-cream)" }}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>Tooltip</p>
                    <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
                      Show a learn-more panel on the public event page.
                    </p>
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm" style={{ color: "var(--color-text)" }}>
                    <input
                      type="checkbox"
                      checked={form.tooltip_enabled}
                      onChange={(event) => setForm((previous) => ({
                        ...previous,
                        tooltip_enabled: event.target.checked,
                        tooltip_header: event.target.checked ? previous.tooltip_header : "",
                        tooltip_body: event.target.checked ? previous.tooltip_body : "",
                        tooltip_image_key: event.target.checked ? previous.tooltip_image_key : null,
                      }))}
                      style={{ accentColor: "var(--color-sage)" }}
                    />
                    Enabled
                  </label>
                </div>
                {form.tooltip_enabled && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-text)" }}>Tooltip Header</label>
                      <input
                        type="text"
                        value={form.tooltip_header}
                        onChange={(event) => setForm((previous) => ({ ...previous, tooltip_header: event.target.value }))}
                        className="w-full px-4 py-3 rounded-2xl text-sm border bg-white focus:outline-none focus:ring-2"
                        style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-text)" }}>Tooltip Image</label>
                      <select
                        value={form.tooltip_image_key ?? ""}
                        onChange={(event) => setForm((previous) => ({ ...previous, tooltip_image_key: event.target.value || null }))}
                        className="w-full px-4 py-3 rounded-2xl text-sm border bg-white focus:outline-none focus:ring-2"
                        style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
                      >
                        <option value="">None</option>
                        {tooltipImageOptions.map((image) => (
                          <option key={image.key} value={image.key}>{image.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="lg:col-span-2">
                      <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-text)" }}>Tooltip Body</label>
                      <textarea
                        value={form.tooltip_body}
                        onChange={(event) => setForm((previous) => ({ ...previous, tooltip_body: event.target.value }))}
                        className="w-full px-4 py-3 rounded-2xl text-sm border bg-white focus:outline-none focus:ring-2"
                        style={{ borderColor: "var(--color-border)", color: "var(--color-text)", minHeight: 110 }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-3xl p-5" style={{ background: "var(--color-cream)" }}>
                <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-text)" }}>Hero Side Image</label>
                <select
                  value={form.hero_side_image_key ?? ""}
                  onChange={(event) => setForm((previous) => ({ ...previous, hero_side_image_key: event.target.value || null }))}
                  className="w-full px-4 py-3 rounded-2xl text-sm border bg-white focus:outline-none focus:ring-2"
                  style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
                >
                  <option value="">None</option>
                  {heroSideImageOptions.map((image) => (
                    <option key={image.key} value={image.key}>{image.label}</option>
                  ))}
                </select>
              </div>

              <div className="text-xs" style={{ color: "var(--color-muted)" }}>
                Tooltip images folder: <code>{imageCatalog.helper.tooltip_target_dir}</code><br />
                Hero side images folder: <code>{imageCatalog.helper.hero_side_target_dir}</code>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-[28px] p-6" style={{ background: "white", border: "1px solid var(--color-border)" }}>
              {sectionTitle("Preview", "Quick reference while editing.")}
              <div className="space-y-4">
                <div className="rounded-3xl p-4" style={{ background: "var(--color-cream)" }}>
                  <p className="text-xs uppercase tracking-[0.18em]" style={{ color: "var(--color-sage)" }}>Hero</p>
                  <p className="text-lg font-semibold mt-2" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>
                    {form.hero_header || "Hero header"}
                    {form.hero_header_sage ? ` ${form.hero_header_sage}` : ""}
                  </p>
                  <p className="text-sm mt-2" style={{ color: "var(--color-muted)" }}>{form.hero_subheader || "Subheader preview"}</p>
                </div>
                {selectedTooltipImage && (
                  <div className="rounded-3xl overflow-hidden" style={{ border: "1px solid var(--color-border)" }}>
                    <img src={selectedTooltipImage.path} alt={selectedTooltipImage.alt} className="w-full h-auto" />
                  </div>
                )}
                {selectedHeroSideImage && (
                  <div className="rounded-3xl overflow-hidden" style={{ border: "1px solid var(--color-border)" }}>
                    <img src={selectedHeroSideImage.path} alt={selectedHeroSideImage.alt} className="w-full h-auto" />
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[28px] p-6" style={{ background: "white", border: "1px solid var(--color-border)" }}>
              {sectionTitle("Payment", "Optional e-transfer instructions shown after checkout and in order confirmation.")}
              <label className="inline-flex items-center gap-2 text-sm mb-4" style={{ color: "var(--color-text)" }}>
                <input
                  type="checkbox"
                  checked={form.etransfer_enabled}
                  onChange={(event) => setForm((previous) => ({
                    ...previous,
                    etransfer_enabled: event.target.checked,
                    etransfer_email: event.target.checked ? previous.etransfer_email : "",
                  }))}
                  style={{ accentColor: "var(--color-sage)" }}
                />
                Enable e-transfer
              </label>
              <input
                type="email"
                value={form.etransfer_email}
                onChange={(event) => setForm((previous) => ({ ...previous, etransfer_email: event.target.value }))}
                disabled={!form.etransfer_enabled}
                className="w-full px-4 py-3 rounded-2xl text-sm border bg-white focus:outline-none focus:ring-2 disabled:opacity-50"
                style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
                placeholder="payments@example.com"
              />
            </div>
          </div>
        </div>

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

        <div className="rounded-[28px] p-6" style={{ background: "white", border: "1px solid var(--color-border)" }}>
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-6">
            <div>
              {sectionTitle("Combo Deals", "Build bundles with grouped OR logic, counters, and discount targeting.")}
            </div>
            <button
              type="button"
              onClick={() => setForm((previous) => ({
                ...previous,
                combo_deals: [...previous.combo_deals, createEmptyComboDeal(previous.combo_deals.length)],
              }))}
              className="px-4 py-3 rounded-2xl text-sm font-semibold shrink-0"
              style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}
            >
              + Add Combo
            </button>
          </div>

          {form.combo_deals.length === 0 ? (
            <div className="rounded-3xl p-6 text-sm" style={{ background: "var(--color-cream)", color: "var(--color-muted)" }}>
              No combos yet. Add one to configure grouped bundle discounts.
            </div>
          ) : (
            <div className="space-y-5">
              {form.combo_deals.map((combo, comboIndex) => {
                const availableEventItems = form.item_ids
                  .map((itemId) => itemsById.get(itemId))
                  .filter((item): item is AdminItem => Boolean(item));

                return (
                  <div key={combo.id} className="rounded-[28px] p-5" style={{ background: "var(--color-cream)", border: "1px solid var(--color-border)" }}>
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex-1">
                        <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-text)" }}>Combo Name</label>
                        <input
                          type="text"
                          value={combo.name}
                          onChange={(event) => updateComboDeal(combo.id, (current) => ({ ...current, name: event.target.value }))}
                          className="w-full px-4 py-3 rounded-2xl text-sm border bg-white focus:outline-none focus:ring-2"
                          style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
                          placeholder="Lamprais + Roll Bundle"
                        />
                      </div>
                      <div className="flex flex-wrap gap-2 lg:justify-end">
                        <button
                          type="button"
                          onClick={() => moveComboDeal(combo.id, -1)}
                          disabled={comboIndex === 0}
                          className="px-3 py-2 rounded-2xl text-xs font-semibold disabled:opacity-40"
                          style={{ border: "1px solid var(--color-border)", color: "var(--color-text)", background: "white" }}
                        >
                          Up
                        </button>
                        <button
                          type="button"
                          onClick={() => moveComboDeal(combo.id, 1)}
                          disabled={comboIndex === form.combo_deals.length - 1}
                          className="px-3 py-2 rounded-2xl text-xs font-semibold disabled:opacity-40"
                          style={{ border: "1px solid var(--color-border)", color: "var(--color-text)", background: "white" }}
                        >
                          Down
                        </button>
                        <button
                          type="button"
                          onClick={() => setForm((previous) => ({
                            ...previous,
                            combo_deals: normalizeComboDeals(previous.combo_deals.filter((entry) => entry.id !== combo.id)),
                          }))}
                          className="px-3 py-2 rounded-2xl text-xs font-semibold"
                          style={{ background: "#fee2e2", color: "#991b1b" }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_0.8fr] gap-5 mt-5">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>Requirement Groups</p>
                            <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
                              Each group can match one or many items. Items can only appear in one group per combo.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => updateComboDeal(combo.id, (current) => ({
                              ...current,
                              requirement_groups: [...current.requirement_groups, createEmptyRequirementGroup(current.requirement_groups.length)],
                            }))}
                            className="px-3 py-2 rounded-2xl text-xs font-semibold"
                            style={{ background: "white", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
                          >
                            + Add Group
                          </button>
                        </div>

                        <div className="space-y-4">
                          {combo.requirement_groups.map((group) => {
                            const unavailableItemIds = new Set(
                              combo.requirement_groups
                                .filter((entry) => entry.id !== group.id)
                                .flatMap((entry) => entry.item_ids)
                            );

                            return (
                              <div key={group.id} className="rounded-3xl p-4" style={{ background: "white", border: "1px solid var(--color-border)" }}>
                                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                                  <div className="flex-1">
                                    <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-text)" }}>Group Name</label>
                                    <input
                                      type="text"
                                      value={group.name}
                                      onChange={(event) => updateComboDeal(combo.id, (current) => ({
                                        ...current,
                                        requirement_groups: current.requirement_groups.map((entry) =>
                                          entry.id === group.id ? { ...entry, name: event.target.value } : entry
                                        ),
                                      }))}
                                      className="w-full px-4 py-3 rounded-2xl text-sm border bg-white focus:outline-none focus:ring-2"
                                      style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
                                    />
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium mb-2" style={{ color: "var(--color-text)" }}>Minimum Qty</p>
                                    <CounterControl
                                      value={group.min_quantity}
                                      onChange={(next) => updateComboDeal(combo.id, (current) => ({
                                        ...current,
                                        requirement_groups: current.requirement_groups.map((entry) =>
                                          entry.id === group.id ? { ...entry, min_quantity: next } : entry
                                        ),
                                      }))}
                                    />
                                  </div>
                                  <div className="flex items-end">
                                    <button
                                      type="button"
                                      onClick={() => updateComboDeal(combo.id, (current) => {
                                        const nextGroups = current.requirement_groups.filter((entry) => entry.id !== group.id);
                                        const targetStillExists = current.discount.target_group_id && nextGroups.some((entry) => entry.id === current.discount.target_group_id);
                                        return {
                                          ...current,
                                          requirement_groups: nextGroups.length > 0 ? nextGroups : [createEmptyRequirementGroup(0)],
                                          discount: {
                                            ...current.discount,
                                            applies_to: targetStillExists ? current.discount.applies_to : "combo_total",
                                            target_group_id: targetStillExists ? current.discount.target_group_id : null,
                                          },
                                        };
                                      })}
                                      disabled={combo.requirement_groups.length === 1}
                                      className="px-3 py-3 rounded-2xl text-xs font-semibold disabled:opacity-40"
                                      style={{ background: "#fee2e2", color: "#991b1b" }}
                                    >
                                      Remove Group
                                    </button>
                                  </div>
                                </div>

                                <div className="mt-4">
                                  <p className="text-sm font-medium mb-3" style={{ color: "var(--color-text)" }}>
                                    Eligible Items
                                  </p>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {availableEventItems.map((item) => {
                                      const selected = group.item_ids.includes(item.id);
                                      const disabled = !selected && unavailableItemIds.has(item.id);
                                      return (
                                        <button
                                          key={item.id}
                                          type="button"
                                          disabled={disabled}
                                          onClick={() => updateComboDeal(combo.id, (current) => ({
                                            ...current,
                                            requirement_groups: current.requirement_groups.map((entry) => {
                                              if (entry.id !== group.id) return entry;
                                              const nextIds = entry.item_ids.includes(item.id)
                                                ? entry.item_ids.filter((itemId) => itemId !== item.id)
                                                : [...entry.item_ids, item.id];
                                              return { ...entry, item_ids: nextIds };
                                            }),
                                          }))}
                                          className="rounded-2xl p-4 text-left disabled:opacity-40"
                                          style={{
                                            border: `1px solid ${selected ? "var(--color-sage)" : "var(--color-border)"}`,
                                            background: selected ? "#f0f7ea" : "white",
                                          }}
                                        >
                                          <div className="flex items-start justify-between gap-3">
                                            <div>
                                              <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>{item.name}</p>
                                              <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
                                                {CURRENCY} ${(item.discounted_price ?? item.price).toFixed(2)}
                                              </p>
                                            </div>
                                            <span
                                              className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold"
                                              style={{
                                                background: selected ? "var(--color-forest)" : "var(--color-cream)",
                                                color: selected ? "var(--color-cream)" : "var(--color-muted)",
                                              }}
                                            >
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
                          })}
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="rounded-3xl p-4" style={{ background: "white", border: "1px solid var(--color-border)" }}>
                          <p className="text-sm font-semibold mb-4" style={{ color: "var(--color-text)" }}>Discount Setup</p>

                          <div className="space-y-4">
                            <div>
                              <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-text)" }}>Discount Type</label>
                              <div className="grid grid-cols-2 gap-2">
                                {[
                                  { value: "fixed_amount", label: "Dollar amount" },
                                  { value: "percentage", label: "Percentage" },
                                ].map((option) => {
                                  const active = combo.discount.type === option.value;
                                  return (
                                    <button
                                      key={option.value}
                                      type="button"
                                      onClick={() => updateComboDeal(combo.id, (current) => ({
                                        ...current,
                                        discount: {
                                          ...current.discount,
                                          type: option.value as ComboDiscount["type"],
                                          amount: option.value === "percentage"
                                            ? Math.min(100, Math.max(1, Number(current.discount.amount || 10)))
                                            : Math.max(1, Number(current.discount.amount || 5)),
                                        },
                                      }))}
                                      className="rounded-2xl px-4 py-3 text-sm font-semibold"
                                      style={{
                                        border: `1px solid ${active ? "var(--color-sage)" : "var(--color-border)"}`,
                                        background: active ? "#f0f7ea" : "white",
                                        color: "var(--color-text)",
                                      }}
                                    >
                                      {option.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {combo.discount.type === "percentage" ? (
                              <div>
                                <div className="flex items-center justify-between mb-2">
                                  <label className="block text-sm font-medium" style={{ color: "var(--color-text)" }}>Discount Percentage</label>
                                  <span className="text-sm font-semibold" style={{ color: "var(--color-forest)" }}>
                                    {combo.discount.amount.toFixed(1).replace(/\.0$/, "")}%
                                  </span>
                                </div>
                                <input
                                  type="range"
                                  min={1}
                                  max={100}
                                  step={0.5}
                                  value={combo.discount.amount}
                                  onChange={(event) => updateComboDeal(combo.id, (current) => ({
                                    ...current,
                                    discount: { ...current.discount, amount: Number(event.target.value) },
                                  }))}
                                  className="w-full"
                                  style={{ accentColor: "var(--color-sage)" }}
                                />
                              </div>
                            ) : (
                              <div>
                                <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-text)" }}>
                                  Discount Amount
                                </label>
                                <div className="relative">
                                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm" style={{ color: "var(--color-muted)" }}>
                                    {CURRENCY} $
                                  </span>
                                  <input
                                    type="number"
                                    min={0}
                                    step={0.01}
                                    value={combo.discount.amount}
                                    onChange={(event) => updateComboDeal(combo.id, (current) => ({
                                      ...current,
                                      discount: { ...current.discount, amount: Number(event.target.value || 0) },
                                    }))}
                                    className="w-full pl-16 pr-4 py-3 rounded-2xl text-sm border bg-white focus:outline-none focus:ring-2"
                                    style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
                                  />
                                </div>
                              </div>
                            )}

                            <div>
                              <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-text)" }}>Discount Applies To</label>
                              <div className="grid grid-cols-2 gap-2">
                                {[
                                  { value: "combo_total", label: "Whole combo" },
                                  { value: "group", label: "Specific group" },
                                ].map((option) => {
                                  const active = combo.discount.applies_to === option.value;
                                  return (
                                    <button
                                      key={option.value}
                                      type="button"
                                      onClick={() => updateComboDeal(combo.id, (current) => ({
                                        ...current,
                                        discount: {
                                          ...current.discount,
                                          applies_to: option.value as ComboDiscount["applies_to"],
                                          target_group_id: option.value === "group"
                                            ? (current.discount.target_group_id ?? current.requirement_groups[0]?.id ?? null)
                                            : null,
                                        },
                                      }))}
                                      className="rounded-2xl px-4 py-3 text-sm font-semibold"
                                      style={{
                                        border: `1px solid ${active ? "var(--color-sage)" : "var(--color-border)"}`,
                                        background: active ? "#f0f7ea" : "white",
                                        color: "var(--color-text)",
                                      }}
                                    >
                                      {option.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {combo.discount.applies_to === "group" && (
                              <div>
                                <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-text)" }}>Target Group</label>
                                <select
                                  value={combo.discount.target_group_id ?? ""}
                                  onChange={(event) => updateComboDeal(combo.id, (current) => ({
                                    ...current,
                                    discount: {
                                      ...current.discount,
                                      target_group_id: event.target.value || null,
                                    },
                                  }))}
                                  className="w-full px-4 py-3 rounded-2xl text-sm border bg-white focus:outline-none focus:ring-2"
                                  style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
                                >
                                  <option value="">Select a target group</option>
                                  {combo.requirement_groups.map((group) => (
                                    <option key={group.id} value={group.id}>
                                      {group.name.trim() || defaultGroupName(combo.requirement_groups.findIndex((entry) => entry.id === group.id))}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="rounded-3xl p-4" style={{ background: "#12270F", color: "white" }}>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-xs uppercase tracking-[0.18em]" style={{ color: "rgba(247,245,240,0.6)" }}>
                                Live Preview
                              </p>
                              <p className="text-base font-semibold mt-2">{combo.name || "Untitled combo"}</p>
                              <p className="text-sm mt-2" style={{ color: "rgba(247,245,240,0.78)" }}>
                                {comboPreviewText(combo, itemsById, CURRENCY)}
                              </p>
                            </div>
                            <label className="inline-flex items-center gap-2 text-sm shrink-0">
                              <input
                                type="checkbox"
                                checked={combo.enabled}
                                onChange={(event) => updateComboDeal(combo.id, (current) => ({ ...current, enabled: event.target.checked }))}
                                style={{ accentColor: "var(--color-sage)" }}
                              />
                              Enabled
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
