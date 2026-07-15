import assert from "node:assert/strict";
import { describe, it } from "vitest";

import {
  bundleBasePayload,
  bundleEditInitialState,
  bundleLineUnitPrice,
  bundleLineValidationError,
  existingLineUnitPrice,
  planBundleLineChanges,
  type BundleEditForm,
  type DesiredBundleLine,
  type EditableOrderLine,
} from "../src/lib/bundleEditUtils";
import type { OrderLineItem } from "../src/lib/orderLineUtils";

function item(id: string, overrides: Partial<OrderLineItem> = {}): OrderLineItem {
  return {
    id,
    name: id.toUpperCase(),
    description: "",
    price: 20,
    discounted_price: null,
    minimum_order_quantity: 2,
    ...overrides,
  };
}

function desired(id: string, qty = 2, overrides: Partial<OrderLineItem> = {}): DesiredBundleLine {
  return { item: item(id, overrides), qty };
}

function row(id: string, itemId: string, overrides: Partial<EditableOrderLine> = {}): EditableOrderLine {
  return {
    id,
    event_id: 1,
    group_id: "bundle",
    name: "Customer",
    email: "customer@example.com",
    phone_number: null,
    item_id: itemId,
    item_name: itemId.toUpperCase(),
    quantity: 2,
    pickup_location: "Downtown",
    pickup_time_slot: "12:00",
    total_price: 40,
    status: "confirmed",
    ...overrides,
  };
}

function form(): BundleEditForm {
  return {
    name: "Customer",
    email: "customer@example.com",
    phone_number: "",
    pickup_location: "Downtown",
    pickup_time_slot: "12:00",
    pickup_address: "123 Main St",
    pickup_date: "2026-02-01",
    notes: "Note",
    exclude_email: false,
  };
}

describe("bundle line validation", () => {
  it("requires at least one item", () => {
    assert.equal(bundleLineValidationError([], false, {}), "Please add at least one item.");
  });

  it("enforces catalog minimums for event orders", () => {
    assert.equal(
      bundleLineValidationError([desired("chicken", 1)], false, {}),
      "CHICKEN requires a minimum order of 2.",
    );
  });

  it("validates manual prices for random orders", () => {
    assert.equal(
      bundleLineValidationError([desired("chicken")], true, { chicken: -1 }),
      "Set a valid unit price for CHICKEN.",
    );
    assert.equal(bundleLineValidationError([desired("chicken")], true, { chicken: 0 }), null);
  });
});

describe("bundle line planning", () => {
  it("initializes the form and combines duplicate item quantities", () => {
    const primary = row("primary", "chicken", {
      name: "Customer",
      email: null,
      quantity: 2,
      total_price: 40,
      exclude_email: true,
    });
    const result = bundleEditInitialState(primary, [
      primary,
      row("second", "chicken", { quantity: 1, total_price: 30 }),
      row("invalid", "vegan", { quantity: 0 }),
    ]);

    assert.equal(result.form.name, "Customer");
    assert.equal(result.form.email, "");
    assert.equal(result.form.exclude_email, true);
    assert.deepEqual(result.quantities, { chicken: 3 });
    assert.deepEqual(result.linePrices, { chicken: 20 });
  });

  it("keeps matching rows before reusing another editable row", () => {
    const plan = planBundleLineChanges(
      [row("row-a", "a"), row("row-b", "b")],
      [desired("b"), desired("c")],
      new Set(),
    );

    assert.deepEqual(plan.assignments.map(({ row: assigned, line }) => [assigned.id, line.item.id]), [
      ["row-b", "b"],
      ["row-a", "c"],
    ]);
    assert.deepEqual(plan.createLines, []);
    assert.deepEqual(plan.deleteRows, []);
  });

  it("separates locked rows and identifies creates and deletes", () => {
    const locked = row("legacy-row", "legacy");
    const plan = planBundleLineChanges(
      [row("row-a", "a"), row("row-b", "b"), locked],
      [desired("a"), desired("c"), desired("d"), desired("legacy", 1, { is_locked: true })],
      new Set(["legacy"]),
    );

    assert.equal(plan.assignments.length, 2);
    assert.deepEqual(plan.createLines.map((line) => line.item.id), ["d"]);
    assert.deepEqual(plan.deleteRows, []);
    assert.deepEqual(plan.lockedRows, [locked]);

    const deletionPlan = planBundleLineChanges(
      [row("row-a", "a"), row("row-b", "b")],
      [desired("a")],
      new Set(),
    );
    assert.deepEqual(deletionPlan.deleteRows.map((entry) => entry.id), ["row-b"]);
  });
});

describe("bundle edit payloads", () => {
  it("includes freeform pickup fields only for random orders", () => {
    assert.equal(bundleBasePayload(form(), false).pickup_address, undefined);
    assert.equal(bundleBasePayload(form(), true).pickup_address, "123 Main St");
  });

  it("uses overrides for editable prices and derives legacy unit prices", () => {
    assert.equal(bundleLineUnitPrice(desired("chicken"), { chicken: 17.5 }), 17.5);
    assert.equal(bundleLineUnitPrice(desired("chicken"), {}), 20);
    assert.equal(existingLineUnitPrice(row("row", "chicken", { quantity: 3, total_price: 50 })), 16.67);
    assert.equal(existingLineUnitPrice(row("row", "chicken", { quantity: 0 })), 0);
  });
});
