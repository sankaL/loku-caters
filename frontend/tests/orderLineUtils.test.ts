import assert from "node:assert/strict";
import { describe, it } from "vitest";

import {
  buildLegacyItemsFromOrders,
  getMinimumOrderQuantity,
  linesFromQuantities,
  updateOrderLineQuantity,
  type OrderLineItem,
} from "../src/lib/orderLineUtils";

function item(overrides: Partial<OrderLineItem> = {}): OrderLineItem {
  return {
    id: "chicken",
    name: "Chicken Lamprais",
    description: "",
    price: 20,
    discounted_price: null,
    minimum_order_quantity: 3,
    ...overrides,
  };
}

describe("order line quantities", () => {
  it("normalizes minimum quantities", () => {
    assert.equal(getMinimumOrderQuantity(undefined), 1);
    assert.equal(getMinimumOrderQuantity({ minimum_order_quantity: 2.2 }), 3);
    assert.equal(getMinimumOrderQuantity({ minimum_order_quantity: Number.NaN }), 1);
  });

  it("adds a new item at its minimum and initializes its editable price", () => {
    const result = updateOrderLineQuantity(item({ discounted_price: 18 }), {}, 1, {
      allowPriceEdit: true,
      linePrices: {},
    });

    assert.deepEqual(result, {
      quantities: { chicken: 3 },
      linePrices: { chicken: 18 },
    });
  });

  it("supports below-minimum admin quantities", () => {
    const result = updateOrderLineQuantity(item(), {}, 1, { allowBelowMinimumOrder: true });
    assert.deepEqual(result, { quantities: { chicken: 1 } });
  });

  it("decrements above the minimum and removes at the minimum", () => {
    assert.deepEqual(
      updateOrderLineQuantity(item(), { chicken: 5 }, -1),
      { quantities: { chicken: 4 } },
    );
    assert.deepEqual(
      updateOrderLineQuantity(item(), { chicken: 3 }, -1, { linePrices: { chicken: 19 } }),
      { quantities: {}, linePrices: {} },
    );
  });

  it("does not change locked, missing, or zero-delta lines", () => {
    assert.equal(updateOrderLineQuantity(item({ is_locked: true }), { chicken: 1 }, 1), null);
    assert.equal(updateOrderLineQuantity(undefined, {}, 1), null);
    assert.equal(updateOrderLineQuantity(item(), {}, 0), null);
  });

  it("returns only selected lines", () => {
    const items = [item(), item({ id: "vegan", name: "Vegan" })];
    assert.deepEqual(
      linesFromQuantities(items, { chicken: 2, vegan: 0 }),
      [{ item: items[0], qty: 2 }],
    );
  });
});

describe("legacy order lines", () => {
  it("creates one locked item per missing catalog item", () => {
    const result = buildLegacyItemsFromOrders([
      { item_id: "legacy", item_name: "Old menu item", quantity: 2, total_price: 30 },
      { item_id: "legacy", item_name: "Duplicate", quantity: 1, total_price: 99 },
      { item_id: "known", item_name: "Known", quantity: 1, total_price: 20 },
    ], new Set(["known"]));

    assert.equal(result.length, 1);
    assert.equal(result[0].id, "legacy");
    assert.equal(result[0].price, 15);
    assert.equal(result[0].is_locked, true);
  });
});
