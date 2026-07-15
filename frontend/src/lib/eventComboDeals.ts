export interface ComboRequirementGroup {
  id: string;
  name: string;
  item_ids: string[];
  min_quantity: number;
}

export interface ComboDiscount {
  type: "fixed_amount" | "percentage";
  amount: number;
  applies_to: "combo_total" | "group";
  target_group_id: string | null;
}

export interface ComboDeal {
  id: string;
  name: string;
  enabled: boolean;
  sort_order: number;
  requirement_groups: ComboRequirementGroup[];
  discount: ComboDiscount;
}

export interface EventFormValidationData {
  name: string;
  event_date: string;
  hero_header: string;
  tooltip_enabled: boolean;
  tooltip_header: string;
  tooltip_body: string;
  etransfer_enabled: boolean;
  etransfer_email: string;
  item_ids: string[];
  combo_deals: ComboDeal[];
}

interface LegacyRequirement {
  item_id?: string;
  min_quantity?: number;
}

type IncomingDiscount = Omit<Partial<ComboDiscount>, "applies_to"> & {
  applies_to?: "combo_total" | "group" | "item";
  target_item_id?: string | null;
};

interface IncomingComboDeal {
  id?: string;
  name?: string;
  enabled?: boolean;
  sort_order?: number;
  requirement_groups?: Array<Partial<ComboRequirementGroup>>;
  requirements?: LegacyRequirement[];
  discount?: IncomingDiscount;
}

export function createEmptyRequirementGroup(index: number): ComboRequirementGroup {
  return {
    id: crypto.randomUUID(),
    name: defaultGroupName(index),
    item_ids: [],
    min_quantity: 1,
  };
}

export function defaultGroupName(index: number): string {
  return index === 0 ? "Base group" : `Group ${index + 1}`;
}

export function createEmptyComboDeal(sortOrder: number): ComboDeal {
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

function normalizeRequirementGroup(
  group: Partial<ComboRequirementGroup>,
): ComboRequirementGroup {
  return {
    id: group.id || crypto.randomUUID(),
    name: group.name ?? "",
    item_ids: Array.from(new Set((group.item_ids ?? []).filter(Boolean))),
    min_quantity: Math.max(1, Number(group.min_quantity || 1)),
  };
}

export function normalizeComboDeals(comboDeals: ComboDeal[]): ComboDeal[] {
  return comboDeals.map((combo, comboIndex) => ({
    id: combo.id || crypto.randomUUID(),
    name: combo.name ?? "",
    enabled: combo.enabled ?? true,
    sort_order: comboIndex,
    requirement_groups: (combo.requirement_groups ?? []).map(normalizeRequirementGroup),
    discount: {
      type: combo.discount.type,
      amount: Number(combo.discount.amount || 0),
      applies_to: combo.discount.applies_to,
      target_group_id: combo.discount.applies_to === "group"
        ? combo.discount.target_group_id ?? null
        : null,
    },
  }));
}

function legacyRequirementGroup(
  requirement: LegacyRequirement,
  index: number,
): ComboRequirementGroup {
  return {
    id: crypto.randomUUID(),
    name: requirement.item_id || defaultGroupName(index),
    item_ids: requirement.item_id ? [requirement.item_id] : [],
    min_quantity: Math.max(1, Number(requirement.min_quantity || 1)),
  };
}

function incomingRequirementGroups(entry: IncomingComboDeal): ComboRequirementGroup[] {
  if (entry.requirement_groups?.length) {
    return entry.requirement_groups.map(normalizeRequirementGroup);
  }
  return (entry.requirements ?? []).map(legacyRequirementGroup);
}

function discountScope(discount?: IncomingDiscount): ComboDiscount["applies_to"] {
  return discount?.applies_to === "item" || discount?.applies_to === "group"
    ? "group"
    : "combo_total";
}

function targetGroupId(
  discount: IncomingDiscount | undefined,
  groups: ComboRequirementGroup[],
): string | null {
  if (discountScope(discount) !== "group") return null;
  if (discount?.target_group_id) return discount.target_group_id;
  if (!discount?.target_item_id) return null;
  return groups.find((group) => group.item_ids.includes(discount.target_item_id ?? ""))?.id ?? null;
}

export function normalizeIncomingComboDeal(raw: unknown, index: number): ComboDeal {
  if (!raw || typeof raw !== "object") return createEmptyComboDeal(index);
  const entry = raw as IncomingComboDeal;
  const requirementGroups = incomingRequirementGroups(entry);
  const appliesTo = discountScope(entry.discount);

  return {
    id: entry.id || crypto.randomUUID(),
    name: entry.name ?? "",
    enabled: entry.enabled ?? true,
    sort_order: Number(entry.sort_order ?? index),
    requirement_groups: requirementGroups.length
      ? requirementGroups
      : [createEmptyRequirementGroup(0)],
    discount: {
      type: entry.discount?.type === "percentage" ? "percentage" : "fixed_amount",
      amount: Number(entry.discount?.amount || 0),
      applies_to: appliesTo,
      target_group_id: targetGroupId(entry.discount, requirementGroups),
    },
  };
}

function validateRequirementGroup(
  comboName: string,
  group: ComboRequirementGroup,
  selectedItemIds: Set<string>,
  itemIdsSeen: Set<string>,
): void {
  if (group.item_ids.length === 0) {
    throw new Error(`Combo "${comboName}" has a group without any items`);
  }
  if (group.min_quantity < 1) {
    throw new Error(`Combo "${comboName}" has an invalid minimum quantity`);
  }
  for (const itemId of group.item_ids) {
    if (!selectedItemIds.has(itemId)) {
      throw new Error(`Combo "${comboName}" references an item that is not selected for the event`);
    }
    if (itemIdsSeen.has(itemId)) {
      throw new Error(`Combo "${comboName}" repeats an item across multiple groups`);
    }
    itemIdsSeen.add(itemId);
  }
}

function validateDiscount(combo: ComboDeal): void {
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

function validateComboDeal(combo: ComboDeal, selectedItemIds: Set<string>): void {
  if (!combo.name.trim()) throw new Error("Each combo needs a name");
  if (combo.requirement_groups.length === 0) {
    throw new Error(`Combo "${combo.name}" needs at least one requirement group`);
  }
  const itemIdsSeen = new Set<string>();
  for (const group of combo.requirement_groups) {
    validateRequirementGroup(combo.name, group, selectedItemIds, itemIdsSeen);
  }
  validateDiscount(combo);
}

export function validateEventForm(form: EventFormValidationData): void {
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
  for (const combo of form.combo_deals) validateComboDeal(combo, selectedItemIds);
}
