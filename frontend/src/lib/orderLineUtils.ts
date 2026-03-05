import type { Item } from "@/config/event";

export interface OrderLineItem extends Item {
  is_locked?: boolean;
  legacy_reason?: string;
  source_item_id?: string;
  source_order_id?: string;
}

export interface QuantityLine<TItem extends { id: string }> {
  item: TItem;
  qty: number;
}

export function getMinimumOrderQuantity(
  item: Pick<Item, "minimum_order_quantity"> | undefined
): number {
  const value = Number(item?.minimum_order_quantity ?? 1);
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.max(1, Math.ceil(value));
}

export function linesFromQuantities<TItem extends { id: string }>(
  items: TItem[],
  quantities: Record<string, number>
): QuantityLine<TItem>[] {
  return items
    .map((item) => ({ item, qty: quantities[item.id] ?? 0 }))
    .filter((line) => line.qty > 0);
}

export function aggregateQuantitiesFromOrders<TOrder extends { item_id: string; quantity: number }>(
  orders: TOrder[]
): Record<string, number> {
  const aggregated: Record<string, number> = {};
  for (const order of orders) {
    const itemId = String(order.item_id || "").trim();
    if (!itemId) continue;
    const qty = Number(order.quantity);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    aggregated[itemId] = (aggregated[itemId] ?? 0) + qty;
  }
  return aggregated;
}

export interface LegacyOrderLineSource {
  item_id: string;
  item_name: string;
  quantity: number;
  total_price: number;
}

export function buildLegacyItemsFromOrders(
  orders: LegacyOrderLineSource[],
  knownItemIds: Set<string>
): OrderLineItem[] {
  const byId = new Map<string, OrderLineItem>();
  for (const order of orders) {
    const itemId = String(order.item_id || "").trim();
    if (!itemId || knownItemIds.has(itemId) || byId.has(itemId)) continue;

    const quantity = Number(order.quantity);
    const totalPrice = Number(order.total_price);
    const unitPrice =
      Number.isFinite(quantity) && quantity > 0 && Number.isFinite(totalPrice)
        ? Math.max(0, totalPrice / quantity)
        : 0;

    byId.set(itemId, {
      id: itemId,
      name: String(order.item_name || itemId).trim() || itemId,
      description: "Legacy item not in this event catalog",
      price: unitPrice,
      discounted_price: null,
      minimum_order_quantity: 1,
      is_locked: true,
      legacy_reason: "Missing from current event catalog",
    });
  }
  return Array.from(byId.values());
}
