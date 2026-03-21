import type { ComboDeal } from "@/config/event";

export function effectiveMinimumOrderQuantityForItem(
  itemId: string,
  itemMinimumOrderQuantity: number | undefined,
  comboDeals: ComboDeal[] | undefined
): number {
  let effectiveMinimum = Math.max(1, Math.ceil(Number(itemMinimumOrderQuantity ?? 1) || 1));

  for (const combo of comboDeals ?? []) {
    if (!combo?.enabled) continue;

    const groups = combo.requirement_groups ?? [];
    for (const group of groups) {
      if (!group.item_ids.includes(itemId)) continue;
      const groupMinimum = Math.max(1, Math.ceil(Number(group.min_quantity || 1)));
      effectiveMinimum = Math.min(effectiveMinimum, groupMinimum);
    }
  }

  return effectiveMinimum;
}
