// Cart pricing with combo deals. Ported from the retired FastAPI backend
// (backend/services/pricing.py on main) so quotes and checkout totals stay
// identical. The checkout route re-runs this on the server, so the client is
// never trusted for the final total.

import type { ComboDeal as RawComboDeal, EventConfig, Item } from "@/config/event";
import { effectiveMinimumOrderQuantityForItem } from "@/lib/comboDealUtils";

export const MAX_CART_TOTAL_QUANTITY = 250;
export const MAX_CART_LINES = 50;

export class PricingError extends Error {}

export interface PricingLineInput {
  line_id: string;
  item_id: string;
  quantity: number;
}

export interface CartLineInput {
  item_id: string;
  quantity: number;
}

export interface QuoteLineResult {
  line_id: string;
  item_id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  base_total: number;
  discount_total: number;
  total_price: number;
  applied_combo_ids: string[];
}

export interface AppliedComboResult {
  combo_id: string;
  name: string;
  application_count: number;
  savings_total: number;
  preview_text: string;
  discount_type: "fixed_amount" | "percentage";
  discount_amount: number;
  discount_scope_label: string;
}

export interface UpsellOptionResult {
  item_id: string;
  item_name: string;
  missing_quantity: number;
  group_min_quantity: number;
}

export interface UpsellMissingRequirementResult extends UpsellOptionResult {
  group_id: string;
  group_name: string;
  options: UpsellOptionResult[];
}

export interface UpsellOpportunityResult {
  combo_id: string;
  name: string;
  preview_text: string;
  message: string;
  potential_savings: number;
  missing_requirements: UpsellMissingRequirementResult[];
}

export interface CartQuote {
  currency: string;
  lines: QuoteLineResult[];
  subtotal: number;
  discount_total: number;
  grand_total: number;
  applied_combos: AppliedComboResult[];
  upsell_opportunities: UpsellOpportunityResult[];
}

interface Group {
  id: string;
  name: string;
  item_ids: string[];
  min_quantity: number;
}

interface Combo {
  id: string;
  name: string;
  enabled: boolean;
  sort_order: number;
  requirement_groups: Group[];
  discount: {
    type: "fixed_amount" | "percentage";
    amount_value: number;
    applies_to: "combo_total" | "group";
    target_group_id: string | null;
  };
}

type Consumption = [string, number][];
type SortKey = number | string | SortKey[];

interface ComboApplication {
  combo_id: string;
  name: string;
  consumed_quantities: Consumption;
  savings_cents: number;
  discount_allocations: Consumption;
  discount_type: "fixed_amount" | "percentage";
  discount_amount: number;
  discount_scope_label: string;
  preview_text: string;
  tie_key: SortKey[];
}

// Python's round() uses banker's rounding on ties; match it so totals agree.
function pyRound(value: number): number {
  if (Math.abs(value % 1) === 0.5) return 2 * Math.round(value / 2);
  return Math.round(value);
}

function toCents(value: unknown): number {
  return pyRound(Number(value || 0) * 100);
}

function centsToAmount(cents: number): number {
  return Math.round(cents) / 100;
}

function effectiveItemPriceCents(item: Item): number {
  if (item.discounted_price !== null && item.discounted_price !== undefined) {
    return toCents(item.discounted_price);
  }
  return toCents(item.price);
}

// Lexicographic comparison with Python tuple semantics.
function compareKeys(a: SortKey, b: SortKey): number {
  if (Array.isArray(a) && Array.isArray(b)) {
    const length = Math.min(a.length, b.length);
    for (let index = 0; index < length; index += 1) {
      const result = compareKeys(a[index], b[index]);
      if (result !== 0) return result;
    }
    return a.length - b.length;
  }
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function sortedConsumption(consumption: Consumption): Consumption {
  return [...consumption].sort((a, b) => compareKeys(a, b));
}

function consumptionKey(consumption: Consumption): string {
  return JSON.stringify(consumption);
}

function formatNameList(names: string[]): string {
  if (names.length === 0) return "selected items";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} or ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, or ${names[names.length - 1]}`;
}

function formatCurrency(amount: number, currency: string): string {
  return `${currency} $${amount.toFixed(2)}`;
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function toInt(value: unknown): number {
  return Math.trunc(Number(value || 0)) || 0;
}

function groupItemLabel(group: Group, itemNames: Record<string, string>): string {
  return formatNameList(group.item_ids.map((itemId) => itemNames[itemId] ?? itemId));
}

function normalizeComboDeals(rawDeals: RawComboDeal[] | undefined, allowedItemIds: Set<string>): Combo[] {
  const normalized: Combo[] = [];
  const seenIds = new Set<string>();

  (rawDeals ?? []).forEach((raw, index) => {
    const comboId = text(raw.id);
    if (!comboId) throw new PricingError("Combo deal id is required");
    if (seenIds.has(comboId)) throw new PricingError(`Duplicate combo deal id: ${comboId}`);
    seenIds.add(comboId);

    const name = text(raw.name);
    if (!name) throw new PricingError("Combo deal name is required");

    let groups: Group[];
    if (Array.isArray(raw.requirement_groups) && raw.requirement_groups.length > 0) {
      groups = raw.requirement_groups.map((entry, groupIndex) => {
        const groupId = text(entry.id);
        if (!groupId) throw new PricingError("Combo requirement group id is required");
        const groupName = text(entry.name) || `Group ${groupIndex + 1}`;
        const itemIds = (entry.item_ids ?? []).map(text).filter(Boolean);
        if (itemIds.length === 0 || itemIds.length !== (entry.item_ids ?? []).length) {
          throw new PricingError(`Combo requirement group '${groupName}' must include valid items`);
        }
        if (new Set(itemIds).size !== itemIds.length) {
          throw new PricingError(`Combo requirement group '${groupName}' cannot repeat items`);
        }
        const minQuantity = toInt(entry.min_quantity);
        if (minQuantity < 1) {
          throw new PricingError(`Combo requirement group '${groupName}' min_quantity must be at least 1`);
        }
        return { id: groupId, name: groupName, item_ids: itemIds, min_quantity: minQuantity };
      });
    } else {
      groups = (raw.requirements ?? []).map((requirement, requirementIndex) => {
        const itemId = text(requirement.item_id);
        const minQuantity = toInt(requirement.min_quantity);
        if (!itemId || minQuantity < 1) throw new PricingError("Invalid combo requirement");
        return {
          id: `legacy-${requirementIndex + 1}-${itemId}`,
          name: itemId,
          item_ids: [itemId],
          min_quantity: minQuantity,
        };
      });
    }
    if (groups.length === 0) {
      throw new PricingError(`Combo deal '${name}' must include at least one requirement group`);
    }

    const groupIds = groups.map((group) => group.id);
    if (new Set(groupIds).size !== groupIds.length) {
      throw new PricingError(`Combo deal '${name}' cannot include duplicate requirement group ids`);
    }
    const seenGroupItems = new Set<string>();
    for (const group of groups) {
      for (const itemId of group.item_ids) {
        if (seenGroupItems.has(itemId)) {
          throw new PricingError(`Combo deal '${name}' repeats items across groups: ${itemId}`);
        }
        seenGroupItems.add(itemId);
      }
    }
    const missingItemIds = [...seenGroupItems].filter((itemId) => !allowedItemIds.has(itemId)).sort();
    if (missingItemIds.length > 0) {
      throw new PricingError(
        `Combo deal '${name}' references items not selected for the event: ${missingItemIds.join(", ")}`
      );
    }

    const discount = raw.discount;
    if (!discount) throw new PricingError(`Combo deal '${name}' discount is required`);
    const discountType = text(discount.type);
    if (discountType !== "fixed_amount" && discountType !== "percentage") {
      throw new PricingError(`Combo deal '${name}' discount.type must be 'fixed_amount' or 'percentage'`);
    }
    const amountValue = Math.round(Number(discount.amount || 0) * 100) / 100;
    if (amountValue <= 0) throw new PricingError(`Combo deal '${name}' discount amount must be greater than 0`);
    if (discountType === "percentage" && amountValue > 100) {
      throw new PricingError(`Combo deal '${name}' percentage discounts cannot exceed 100`);
    }

    const appliesToRaw = text(discount.applies_to);
    let targetGroupId: string | null = text(discount.target_group_id) || null;
    const targetItemId = text(discount.target_item_id) || null;
    let appliesTo: "combo_total" | "group";
    if (appliesToRaw === "group") {
      if (!targetGroupId || !groupIds.includes(targetGroupId)) {
        throw new PricingError(`Combo deal '${name}' target group must be one of its requirement groups`);
      }
      appliesTo = "group";
    } else if (appliesToRaw === "item") {
      targetGroupId = groups.find((group) => targetItemId && group.item_ids.includes(targetItemId))?.id ?? null;
      if (!targetGroupId) {
        throw new PricingError(`Combo deal '${name}' target item must belong to one of its requirement groups`);
      }
      appliesTo = "group";
    } else if (appliesToRaw === "combo_total") {
      targetGroupId = null;
      appliesTo = "combo_total";
    } else {
      throw new PricingError(`Combo deal '${name}' discount.applies_to must be 'combo_total', 'item', or 'group'`);
    }

    normalized.push({
      id: comboId,
      name,
      enabled: raw.enabled ?? true,
      sort_order: toInt(raw.sort_order) || index,
      requirement_groups: groups,
      discount: { type: discountType, amount_value: amountValue, applies_to: appliesTo, target_group_id: targetGroupId },
    });
  });

  return normalized;
}

function comboDiscountScopeLabel(combo: Combo, itemNames: Record<string, string>): string {
  if (combo.discount.applies_to === "combo_total") return "Whole combo";
  const targetGroup = combo.requirement_groups.find((group) => group.id === combo.discount.target_group_id);
  if (!targetGroup) return "Selected group";
  return groupItemLabel(targetGroup, itemNames);
}

function comboPreviewText(combo: Combo, itemNames: Record<string, string>, currency: string): string {
  const requirementCopy = combo.requirement_groups
    .map((group) => `${group.min_quantity} x ${groupItemLabel(group, itemNames)}`)
    .join(", ");
  const discountAmount =
    combo.discount.type === "fixed_amount"
      ? formatCurrency(combo.discount.amount_value, currency)
      : `${combo.discount.amount_value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}%`;
  if (combo.discount.applies_to === "combo_total") {
    return `Buy ${requirementCopy} and save ${discountAmount} on the combo.`;
  }
  return `Buy ${requirementCopy} and save ${discountAmount} on ${comboDiscountScopeLabel(combo, itemNames)}.`;
}

function consumptionTotalCents(consumption: Consumption, prices: Record<string, number>): number {
  return consumption.reduce((sum, [itemId, quantity]) => sum + prices[itemId] * quantity, 0);
}

function selectGroupConsumption(
  group: Group,
  state: number[],
  stateIndex: Record<string, number>,
  prices: Record<string, number>,
  preferHighestPrices: boolean
): Consumption {
  if (group.min_quantity < 1) return [];
  const itemIds = [...group.item_ids].sort((a, b) =>
    compareKeys(
      [preferHighestPrices ? -prices[a] : prices[a], a],
      [preferHighestPrices ? -prices[b] : prices[b], b]
    )
  );
  let remaining = group.min_quantity;
  const selected: Consumption = [];
  for (const itemId of itemIds) {
    const available = state[stateIndex[itemId]];
    if (available <= 0) continue;
    const quantity = Math.min(available, remaining);
    if (quantity > 0) {
      selected.push([itemId, quantity]);
      remaining -= quantity;
    }
    if (remaining === 0) break;
  }
  if (remaining > 0) return [];
  return sortedConsumption(selected);
}

function groupConsumptionCandidates(
  combo: Combo,
  group: Group,
  state: number[],
  stateIndex: Record<string, number>,
  prices: Record<string, number>
): Consumption[] {
  if (combo.discount.applies_to === "group" && group.id === combo.discount.target_group_id) {
    const full = sortedConsumption(
      group.item_ids
        .filter((itemId) => state[stateIndex[itemId]] > 0)
        .map((itemId): [string, number] => [itemId, state[stateIndex[itemId]]])
    );
    const total = full.reduce((sum, [, quantity]) => sum + quantity, 0);
    return total < group.min_quantity ? [] : [full];
  }

  const cheapest = selectGroupConsumption(group, state, stateIndex, prices, false);
  if (cheapest.length === 0) return [];
  if (combo.discount.applies_to === "group") return [cheapest];

  const priciest = selectGroupConsumption(group, state, stateIndex, prices, true);
  if (priciest.length === 0 || consumptionKey(priciest) === consumptionKey(cheapest)) return [cheapest];
  return combo.discount.type === "percentage" ? [priciest, cheapest] : [cheapest, priciest];
}

function allocateDiscountFromConsumption(
  consumption: Consumption,
  prices: Record<string, number>,
  savingsCents: number
): Consumption {
  const contributions = new Map<string, number>();
  for (const [itemId, quantity] of consumption) {
    if (quantity > 0) contributions.set(itemId, prices[itemId] * quantity);
  }
  const totalCents = [...contributions.values()].reduce((sum, value) => sum + value, 0);
  if (totalCents <= 0 || savingsCents <= 0) return [];

  const allocations = new Map<string, number>();
  for (const [itemId, value] of contributions) {
    allocations.set(itemId, Math.floor((savingsCents * value) / totalCents));
  }
  const allocated = [...allocations.values()].reduce((sum, value) => sum + value, 0);
  const remainder = savingsCents - allocated;
  if (remainder > 0) {
    const [highestItemId] = [...contributions.keys()].sort((a, b) =>
      compareKeys([-(contributions.get(a) ?? 0), a], [-(contributions.get(b) ?? 0), b])
    );
    allocations.set(highestItemId, (allocations.get(highestItemId) ?? 0) + remainder);
  }
  return sortedConsumption([...allocations.entries()].filter(([, cents]) => cents > 0));
}

function buildComboApplication(
  combo: Combo,
  groupConsumptions: [string, Consumption][],
  prices: Record<string, number>,
  itemNames: Record<string, string>,
  currency: string
): ComboApplication | null {
  const consumed: Consumption = [];
  let totalConsumedCents = 0;
  for (const [, consumption] of groupConsumptions) {
    consumed.push(...consumption);
    totalConsumedCents += consumptionTotalCents(consumption, prices);
  }
  if (totalConsumedCents <= 0) return null;

  let applicableConsumption: Consumption;
  let applicableTotalCents: number;
  if (combo.discount.applies_to === "combo_total") {
    applicableConsumption = sortedConsumption(consumed);
    applicableTotalCents = totalConsumedCents;
  } else {
    applicableConsumption =
      groupConsumptions.find(([groupId]) => groupId === (combo.discount.target_group_id ?? ""))?.[1] ?? [];
    applicableTotalCents = consumptionTotalCents(applicableConsumption, prices);
  }
  if (applicableTotalCents <= 0) return null;

  const savingsCents =
    combo.discount.type === "fixed_amount"
      ? Math.min(toCents(combo.discount.amount_value), applicableTotalCents)
      : Math.min(pyRound((applicableTotalCents * combo.discount.amount_value) / 100), applicableTotalCents);
  if (savingsCents <= 0) return null;

  const consumedQuantities = sortedConsumption(consumed.filter(([, quantity]) => quantity > 0));
  const preferenceScore = combo.discount.applies_to === "group" ? applicableTotalCents : totalConsumedCents;

  return {
    combo_id: combo.id,
    name: combo.name,
    consumed_quantities: consumedQuantities,
    savings_cents: savingsCents,
    discount_allocations: allocateDiscountFromConsumption(applicableConsumption, prices, savingsCents),
    discount_type: combo.discount.type,
    discount_amount: combo.discount.amount_value,
    discount_scope_label: comboDiscountScopeLabel(combo, itemNames),
    preview_text: comboPreviewText(combo, itemNames, currency),
    tie_key: [combo.sort_order, combo.name.toLowerCase(), combo.id, -preferenceScore, consumedQuantities],
  };
}

function buildComboApplicationsForState(
  combo: Combo,
  state: number[],
  stateIndex: Record<string, number>,
  prices: Record<string, number>,
  itemNames: Record<string, string>,
  currency: string
): ComboApplication[] {
  const options: Consumption[][] = [];
  for (const group of combo.requirement_groups) {
    const candidates = groupConsumptionCandidates(combo, group, state, stateIndex, prices);
    if (candidates.length === 0) return [];
    options.push(candidates);
  }

  const byConsumption = new Map<string, ComboApplication>();
  const current: [string, Consumption][] = [];
  const collect = (index: number) => {
    if (index === options.length) {
      const application = buildComboApplication(combo, [...current], prices, itemNames, currency);
      if (application) {
        const key = consumptionKey(application.consumed_quantities);
        if (!byConsumption.has(key)) byConsumption.set(key, application);
      }
      return;
    }
    const group = combo.requirement_groups[index];
    for (const consumption of options[index]) {
      current.push([group.id, consumption]);
      collect(index + 1);
      current.pop();
    }
  };
  collect(0);

  return [...byConsumption.values()].sort((a, b) =>
    compareKeys([-a.savings_cents, a.tie_key], [-b.savings_cents, b.tie_key])
  );
}

function allocateLineDiscounts(
  lines: PricingLineInput[],
  baseTotals: Record<string, number>,
  itemDiscounts: Record<string, number>
): Record<string, number> {
  const lineDiscounts: Record<string, number> = {};
  const linesByItem: Record<string, PricingLineInput[]> = {};
  for (const line of lines) {
    lineDiscounts[line.line_id] = 0;
    (linesByItem[line.item_id] ??= []).push(line);
  }

  for (const [itemId, discountCents] of Object.entries(itemDiscounts)) {
    const itemLines = linesByItem[itemId] ?? [];
    if (itemLines.length === 0 || discountCents <= 0) continue;
    const itemTotal = itemLines.reduce((sum, line) => sum + baseTotals[line.line_id], 0);
    if (itemTotal <= 0) continue;

    let allocated = 0;
    for (const line of itemLines) {
      const share = Math.min(Math.floor((discountCents * baseTotals[line.line_id]) / itemTotal), baseTotals[line.line_id]);
      lineDiscounts[line.line_id] += share;
      allocated += share;
    }
    const remainder = Math.min(discountCents - allocated, itemTotal - allocated);
    if (remainder > 0) {
      const [highest] = [...itemLines].sort((a, b) =>
        compareKeys([-baseTotals[a.line_id], a.line_id], [-baseTotals[b.line_id], b.line_id])
      );
      lineDiscounts[highest.line_id] += remainder;
    }
  }

  for (const line of lines) {
    lineDiscounts[line.line_id] = Math.min(lineDiscounts[line.line_id], baseTotals[line.line_id]);
  }
  return lineDiscounts;
}

function preferredUpsellItemId(
  group: Group,
  quantities: Record<string, number>,
  prices: Record<string, number>,
  itemNames: Record<string, string>
): string {
  const key = (itemId: string): SortKey[] => [
    -((quantities[itemId] ?? 0) > 0 ? 1 : 0),
    -(quantities[itemId] ?? 0),
    -prices[itemId],
    (itemNames[itemId] ?? itemId).toLowerCase(),
    itemId,
  ];
  return [...group.item_ids].sort((a, b) => compareKeys(key(a), key(b)))[0];
}

export function quoteCart(
  items: Item[],
  comboDeals: RawComboDeal[] | undefined,
  lines: PricingLineInput[],
  currency: string
): CartQuote {
  const itemLookup: Record<string, Item> = {};
  const prices: Record<string, number> = {};
  const itemNames: Record<string, string> = {};
  for (const item of items) {
    const itemId = String(item.id);
    itemLookup[itemId] = item;
    prices[itemId] = effectiveItemPriceCents(item);
    itemNames[itemId] = String(item.name || itemId);
  }

  const normalizedLines = lines.map((line) => {
    const itemId = String(line.item_id).trim();
    if (!itemLookup[itemId]) throw new PricingError(`Unknown item: ${itemId}`);
    const quantity = Math.trunc(Number(line.quantity));
    if (!(quantity >= 1)) throw new PricingError(`Quantity must be at least 1 for item ${itemId}`);
    return { line_id: String(line.line_id), item_id: itemId, quantity };
  });

  const combos = normalizeComboDeals(comboDeals, new Set(Object.keys(itemLookup)))
    .filter((combo) => combo.enabled)
    .sort((a, b) => compareKeys([a.sort_order, a.name.toLowerCase(), a.id], [b.sort_order, b.name.toLowerCase(), b.id]));

  const quantities: Record<string, number> = {};
  for (const line of normalizedLines) {
    quantities[line.item_id] = (quantities[line.item_id] ?? 0) + line.quantity;
  }

  const comboItemIds = [
    ...new Set(combos.flatMap((combo) => combo.requirement_groups.flatMap((group) => group.item_ids))),
  ].sort();
  const stateIndex: Record<string, number> = {};
  comboItemIds.forEach((itemId, index) => {
    stateIndex[itemId] = index;
  });
  const initialState = comboItemIds.map((itemId) => quantities[itemId] ?? 0);

  const applicationsMemo = new Map<string, ComboApplication[]>();
  const comboApplications = (comboIndex: number, state: number[]) => {
    const key = `${comboIndex}|${state.join(",")}`;
    let cached = applicationsMemo.get(key);
    if (!cached) {
      cached = buildComboApplicationsForState(combos[comboIndex], state, stateIndex, prices, itemNames, currency);
      applicationsMemo.set(key, cached);
    }
    return cached;
  };

  type Best = { savings: number; keys: SortKey[]; selected: ComboApplication[] };
  const bestMemo = new Map<string, Best>();
  const bestApplications = (state: number[]): Best => {
    const memoKey = state.join(",");
    const cached = bestMemo.get(memoKey);
    if (cached) return cached;

    let best: Best = { savings: 0, keys: [], selected: [] };
    for (let comboIndex = 0; comboIndex < combos.length; comboIndex += 1) {
      for (const application of comboApplications(comboIndex, state)) {
        const nextState = [...state];
        let feasible = true;
        for (const [itemId, quantity] of application.consumed_quantities) {
          const index = stateIndex[itemId];
          if (index === undefined || nextState[index] < quantity) {
            feasible = false;
            break;
          }
          nextState[index] -= quantity;
        }
        if (!feasible) continue;

        const child = bestApplications(nextState);
        const totalSavings = application.savings_cents + child.savings;
        const candidateKeys: SortKey[] = [application.tie_key, ...child.keys];
        if (
          totalSavings > best.savings ||
          (totalSavings === best.savings && (best.keys.length === 0 || compareKeys(candidateKeys, best.keys) < 0))
        ) {
          best = { savings: totalSavings, keys: candidateKeys, selected: [application, ...child.selected] };
        }
      }
    }
    bestMemo.set(memoKey, best);
    return best;
  };

  const { savings: bestDiscountCents, selected: chosen } = bestApplications(initialState);

  const itemDiscountCents: Record<string, number> = {};
  for (const itemId of Object.keys(quantities)) itemDiscountCents[itemId] = 0;
  const grouped = new Map<string, Omit<AppliedComboResult, "savings_total"> & { savings_cents: number }>();

  for (const application of chosen) {
    for (const [itemId, cents] of application.discount_allocations) {
      itemDiscountCents[itemId] = (itemDiscountCents[itemId] ?? 0) + cents;
    }
    const current = grouped.get(application.combo_id) ?? {
      combo_id: application.combo_id,
      name: application.name,
      application_count: 0,
      savings_cents: 0,
      preview_text: application.preview_text,
      discount_type: application.discount_type,
      discount_amount: application.discount_amount,
      discount_scope_label: application.discount_scope_label,
    };
    current.application_count += 1;
    current.savings_cents += application.savings_cents;
    grouped.set(application.combo_id, current);
  }

  const baseTotals: Record<string, number> = {};
  for (const line of normalizedLines) baseTotals[line.line_id] = prices[line.item_id] * line.quantity;
  const lineDiscounts = allocateLineDiscounts(normalizedLines, baseTotals, itemDiscountCents);
  const appliedComboIds = [...grouped.values()]
    .filter((combo) => combo.savings_cents > 0)
    .map((combo) => combo.combo_id)
    .sort();

  let subtotalCents = 0;
  const lineResults: QuoteLineResult[] = normalizedLines.map((line) => {
    const baseTotal = baseTotals[line.line_id];
    const discount = Math.min(lineDiscounts[line.line_id] ?? 0, baseTotal);
    subtotalCents += baseTotal;
    return {
      line_id: line.line_id,
      item_id: line.item_id,
      item_name: itemNames[line.item_id] ?? line.item_id,
      quantity: line.quantity,
      unit_price: centsToAmount(prices[line.item_id]),
      base_total: centsToAmount(baseTotal),
      discount_total: centsToAmount(discount),
      total_price: centsToAmount(baseTotal - discount),
      applied_combo_ids: appliedComboIds,
    };
  });

  const opportunities: UpsellOpportunityResult[] = [];
  if (Object.values(quantities).reduce((sum, quantity) => sum + quantity, 0) > 0) {
    for (const combo of combos) {
      if (buildComboApplicationsForState(combo, initialState, stateIndex, prices, itemNames, currency).length > 0) {
        continue;
      }

      const missing: UpsellMissingRequirementResult[] = [];
      let matchedRequirementCount = 0;
      const hypothetical: Record<string, number> = { ...quantities };
      for (const group of combo.requirement_groups) {
        const currentQty = group.item_ids.reduce((sum, itemId) => sum + Math.max(0, quantities[itemId] ?? 0), 0);
        if (currentQty > 0) matchedRequirementCount += 1;
        const missingQty = Math.max(0, group.min_quantity - currentQty);
        if (missingQty <= 0) continue;

        const preferredItemId = preferredUpsellItemId(group, quantities, prices, itemNames);
        hypothetical[preferredItemId] = (hypothetical[preferredItemId] ?? 0) + missingQty;
        missing.push({
          group_id: group.id,
          group_name: group.name,
          item_id: preferredItemId,
          item_name: itemNames[preferredItemId] ?? preferredItemId,
          missing_quantity: missingQty,
          group_min_quantity: group.min_quantity,
          options: group.item_ids.map((itemId) => ({
            item_id: itemId,
            item_name: itemNames[itemId] ?? itemId,
            missing_quantity: missingQty,
            group_min_quantity: group.min_quantity,
          })),
        });
      }
      if (missing.length === 0 || matchedRequirementCount === 0) continue;

      const hypotheticalState = comboItemIds.map((itemId) => hypothetical[itemId] ?? 0);
      const candidates = buildComboApplicationsForState(combo, hypotheticalState, stateIndex, prices, itemNames, currency);
      if (candidates.length === 0) continue;

      const savingsCents = candidates[0].savings_cents;
      const missingCopy = missing
        .map((entry) => {
          const group = combo.requirement_groups.find((candidate) => candidate.id === entry.group_id)!;
          return `${entry.missing_quantity} more of ${groupItemLabel(group, itemNames)}`;
        })
        .join(", ");
      opportunities.push({
        combo_id: combo.id,
        name: combo.name,
        preview_text: comboPreviewText(combo, itemNames, currency),
        message: `Add ${missingCopy} to save ${formatCurrency(centsToAmount(savingsCents), currency)}.`,
        potential_savings: centsToAmount(savingsCents),
        missing_requirements: missing,
      });
    }
  }

  const missingTotal = (entry: UpsellOpportunityResult) =>
    entry.missing_requirements.reduce((sum, requirement) => sum + requirement.missing_quantity, 0);
  opportunities.sort((a, b) =>
    compareKeys(
      [-toCents(a.potential_savings), missingTotal(a), a.name.toLowerCase()],
      [-toCents(b.potential_savings), missingTotal(b), b.name.toLowerCase()]
    )
  );

  const appliedCombos: AppliedComboResult[] = [...grouped.values()]
    .map(({ savings_cents, ...entry }) => ({ ...entry, savings_total: centsToAmount(savings_cents) }))
    .sort((a, b) =>
      compareKeys(
        [-toCents(a.savings_total), a.name.toLowerCase(), a.combo_id],
        [-toCents(b.savings_total), b.name.toLowerCase(), b.combo_id]
      )
    );

  return {
    currency,
    lines: lineResults,
    subtotal: centsToAmount(subtotalCents),
    discount_total: centsToAmount(bestDiscountCents),
    grand_total: centsToAmount(Math.max(0, subtotalCents - bestDiscountCents)),
    applied_combos: appliedCombos,
    upsell_opportunities: opportunities,
  };
}

/**
 * Validates cart lines against the event (unknown items, duplicates, limits,
 * minimum order quantities) and returns the priced quote. Throws PricingError
 * with a customer-facing message when the cart is invalid.
 */
export function priceEventCart(event: EventConfig, lines: CartLineInput[]): CartQuote {
  if (lines.length > MAX_CART_LINES) throw new PricingError(`A cart can have at most ${MAX_CART_LINES} items`);

  const seen = new Set<string>();
  let totalQuantity = 0;
  for (const line of lines) {
    const itemId = String(line.item_id ?? "").trim();
    const quantity = Number(line.quantity);
    if (!itemId) throw new PricingError("item_id cannot be empty");
    if (!Number.isInteger(quantity) || quantity < 1) throw new PricingError("Quantity must be at least 1");
    if (seen.has(itemId)) throw new PricingError(`Duplicate cart lines are not allowed: ${itemId}`);
    seen.add(itemId);
    totalQuantity += quantity;

    const item = event.items.find((entry) => entry.id === itemId);
    if (!item) throw new PricingError(`Unknown item: ${itemId}`);
    const minimum = effectiveMinimumOrderQuantityForItem(item.id, item.minimum_order_quantity, event.combo_deals);
    if (quantity < minimum) throw new PricingError(`Minimum order quantity for ${item.name} is ${minimum}`);
  }
  if (totalQuantity > MAX_CART_TOTAL_QUANTITY) {
    throw new PricingError(`Cart quantity cannot exceed ${MAX_CART_TOTAL_QUANTITY}`);
  }

  return quoteCart(
    event.items,
    event.combo_deals,
    lines.map((line, index) => ({ line_id: `${line.item_id}:${index}`, item_id: line.item_id, quantity: line.quantity })),
    event.currency
  );
}
