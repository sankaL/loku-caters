import { describe, expect, it } from "vitest";
import type { EventConfig } from "../src/config/event";
import { PricingError, priceEventCart } from "../src/lib/pricing";
import fixture from "./fixtures/pricing-event.json";

// Expected values were produced by the original Python pricing service
// (backend/services/pricing.py on main) for the Sep 26th, 2026 event.
const event = fixture as unknown as EventConfig;
const idByName = Object.fromEntries(event.items.map((item) => [item.name, item.id]));

function cart(lines: [string, number][]) {
  return priceEventCart(
    event,
    lines.map(([name, quantity]) => ({ item_id: idByName[name], quantity }))
  );
}

describe("priceEventCart", () => {
  it("applies the 10% apps discount when a main and 10 apps are ordered", () => {
    const quote = cart([
      ["Chicken Lamprais w/ Pork&Beef Cutlet", 2],
      ["Cutlets - Fish", 10],
      ["Rolls - Mutton", 5],
    ]);
    expect(quote.subtotal).toBe(70);
    expect(quote.discount_total).toBe(3);
    expect(quote.grand_total).toBe(67);
    expect(quote.lines.map((line) => [line.discount_total, line.total_price])).toEqual([
      [0, 40],
      [1.25, 11.25],
      [1.75, 15.75],
    ]);
    expect(quote.applied_combos.map((combo) => [combo.name, combo.application_count, combo.savings_total])).toEqual([
      ["Main w/ Apps", 1, 3],
    ]);
    expect(quote.upsell_opportunities).toEqual([]);
  });

  it("uses discounted prices and splits the discount across app lines", () => {
    const quote = cart([
      ["Lamprais - Vegetarian", 1],
      ["Lamprais w/ Fish Curry", 1],
      ["Patties - Fish", 20],
      ["Pastries - Fish", 5],
    ]);
    expect([quote.subtotal, quote.discount_total, quote.grand_total]).toEqual([84.5, 4.25, 80.25]);
  });

  it("suggests the apps needed to unlock the combo", () => {
    const quote = cart([
      ["Chicken Lamprais w/ Pork&Beef Cutlet", 1],
      ["Rolls - Mutton", 5],
    ]);
    expect(quote.discount_total).toBe(0);
    expect(quote.upsell_opportunities.map((entry) => entry.message)).toEqual([
      "Add 5 more of Cutlets - Fish, Pastries - Fish, Patties - Fish, Rolls - Mutton, or Rolls - Fish to save CAD $3.50.",
    ]);
  });

  it("suggests a main when only apps are ordered", () => {
    const quote = cart([["Cutlets - Fish", 10]]);
    expect(quote.grand_total).toBe(12.5);
    expect(quote.upsell_opportunities.map((entry) => entry.message)).toEqual([
      "Add 1 more of Chicken Lamprais w/ Pork&Beef Cutlet, Lamprais - Vegetarian, Lamprais w/ Fish Cutlet, or Lamprais w/ Fish Curry to save CAD $1.25.",
    ]);
  });

  it("rejects quantities below the minimum order", () => {
    expect(() => cart([["Pastries - Fish", 3]])).toThrow(new PricingError("Minimum order quantity for Pastries - Fish is 5"));
  });

  it("rejects unknown items and duplicate lines", () => {
    expect(() => priceEventCart(event, [{ item_id: "nope", quantity: 1 }])).toThrow("Unknown item: nope");
    const id = idByName["Rolls - Fish"];
    expect(() =>
      priceEventCart(event, [
        { item_id: id, quantity: 5 },
        { item_id: id, quantity: 5 },
      ])
    ).toThrow("Duplicate cart lines");
  });
});
