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

interface QuantityUpdateOptions {
  allowBelowMinimumOrder?: boolean;
  allowPriceEdit?: boolean;
  linePrices?: Record<string, number>;
}

export interface QuantityUpdateResult {
  quantities: Record<string, number>;
  linePrices?: Record<string, number>;
}

function increaseQuantity(
  item: OrderLineItem,
  currentQty: number,
  delta: number,
  quantities: Record<string, number>,
  options: QuantityUpdateOptions,
): QuantityUpdateResult {
  const next = { ...quantities };
  const minimum = options.allowBelowMinimumOrder ? 1 : getMinimumOrderQuantity(item);
  next[item.id] = currentQty === 0 ? minimum : currentQty + delta;

  if (!options.linePrices) return { quantities: next };
  const linePrices = { ...options.linePrices };
  if (options.allowPriceEdit && linePrices[item.id] === undefined) {
    linePrices[item.id] = Number((item.discounted_price ?? item.price).toFixed(2));
  }
  return { quantities: next, linePrices };
}

function decreaseQuantity(
  item: OrderLineItem,
  currentQty: number,
  delta: number,
  quantities: Record<string, number>,
  options: QuantityUpdateOptions,
): QuantityUpdateResult {
  const next = { ...quantities };
  const minimum = options.allowBelowMinimumOrder ? 1 : getMinimumOrderQuantity(item);
  if (currentQty > minimum) {
    next[item.id] = Math.max(minimum, currentQty + delta);
    return { quantities: next };
  }

  delete next[item.id];
  if (!options.linePrices) return { quantities: next };
  const linePrices = { ...options.linePrices };
  delete linePrices[item.id];
  return { quantities: next, linePrices };
}

export function updateOrderLineQuantity(
  item: OrderLineItem | undefined,
  quantities: Record<string, number>,
  delta: number,
  options: QuantityUpdateOptions = {},
): QuantityUpdateResult | null {
  if (!item || item.is_locked || delta === 0) return null;
  const currentQty = quantities[item.id] ?? 0;
  return delta > 0
    ? increaseQuantity(item, currentQty, delta, quantities, options)
    : decreaseQuantity(item, currentQty, delta, quantities, options);
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
