import assert from "node:assert/strict";
import { describe, it } from "vitest";

import {
  normalizeComboDeals,
  normalizeIncomingComboDeal,
  validateEventForm,
  type ComboDeal,
  type EventFormValidationData,
} from "../src/lib/eventComboDeals";

function combo(overrides: Partial<ComboDeal> = {}): ComboDeal {
  return {
    id: "combo-1",
    name: "Family deal",
    enabled: true,
    sort_order: 0,
    requirement_groups: [{
      id: "group-1",
      name: "Mains",
      item_ids: ["chicken"],
      min_quantity: 2,
    }],
    discount: {
      type: "fixed_amount",
      amount: 5,
      applies_to: "combo_total",
      target_group_id: null,
    },
    ...overrides,
  };
}

function form(overrides: Partial<EventFormValidationData> = {}): EventFormValidationData {
  return {
    name: "Summer event",
    event_date: "2026-08-01",
    hero_header: "Pre-order now",
    tooltip_enabled: false,
    tooltip_header: "",
    tooltip_body: "",
    etransfer_enabled: false,
    etransfer_email: "",
    item_ids: ["chicken", "vegan"],
    combo_deals: [combo()],
    ...overrides,
  };
}

describe("event combo normalization", () => {
  it("converts a legacy item discount into a group discount", () => {
    const normalized = normalizeIncomingComboDeal({
      id: "legacy",
      name: "Legacy deal",
      requirements: [{ item_id: "chicken", min_quantity: 0 }],
      discount: {
        type: "percentage",
        amount: 10,
        applies_to: "item",
        target_item_id: "chicken",
      },
    }, 3);

    assert.equal(normalized.requirement_groups.length, 1);
    assert.equal(normalized.requirement_groups[0].min_quantity, 1);
    assert.deepEqual(normalized.requirement_groups[0].item_ids, ["chicken"]);
    assert.equal(normalized.discount.applies_to, "group");
    assert.equal(normalized.discount.target_group_id, normalized.requirement_groups[0].id);
  });

  it("deduplicates group items and restores safe defaults", () => {
    const normalized = normalizeIncomingComboDeal({
      requirement_groups: [{
        id: "group",
        item_ids: ["chicken", "chicken", ""],
        min_quantity: -2,
      }],
      discount: { amount: 0 },
    }, 1);

    assert.deepEqual(normalized.requirement_groups[0].item_ids, ["chicken"]);
    assert.equal(normalized.requirement_groups[0].min_quantity, 1);
    assert.equal(normalized.enabled, true);
    assert.equal(normalized.sort_order, 1);
    assert.equal(normalized.discount.type, "fixed_amount");
  });

  it("normalizes sort order and removes an irrelevant target group", () => {
    const normalized = normalizeComboDeals([
      combo({ sort_order: 9, discount: {
        type: "fixed_amount",
        amount: 5,
        applies_to: "combo_total",
        target_group_id: "stale-group",
      } }),
    ]);

    assert.equal(normalized[0].sort_order, 0);
    assert.equal(normalized[0].discount.target_group_id, null);
  });
});

describe("event form validation", () => {
  it("accepts a complete form", () => {
    assert.doesNotThrow(() => validateEventForm(form()));
  });

  it("requires conditional tooltip and payment fields", () => {
    assert.throws(
      () => validateEventForm(form({ tooltip_enabled: true })),
      /Tooltip header and body are required/,
    );
    assert.throws(
      () => validateEventForm(form({ etransfer_enabled: true })),
      /E-transfer email is required/,
    );
  });

  it("rejects missing, unselected, and repeated requirement items", () => {
    assert.throws(
      () => validateEventForm(form({ combo_deals: [combo({ requirement_groups: [] })] })),
      /at least one requirement group/,
    );
    assert.throws(
      () => validateEventForm(form({ combo_deals: [combo({ requirement_groups: [{
        id: "group",
        name: "",
        item_ids: ["unknown"],
        min_quantity: 1,
      }] })] })),
      /not selected for the event/,
    );
    assert.throws(
      () => validateEventForm(form({ combo_deals: [combo({ requirement_groups: [
        { id: "one", name: "One", item_ids: ["chicken"], min_quantity: 1 },
        { id: "two", name: "Two", item_ids: ["chicken"], min_quantity: 1 },
      ] })] })),
      /repeats an item/,
    );
  });

  it("validates discount bounds and group targets", () => {
    assert.throws(
      () => validateEventForm(form({ combo_deals: [combo({ discount: {
        type: "fixed_amount",
        amount: 0,
        applies_to: "combo_total",
        target_group_id: null,
      } })] })),
      /discount greater than 0/,
    );
    assert.throws(
      () => validateEventForm(form({ combo_deals: [combo({ discount: {
        type: "percentage",
        amount: 101,
        applies_to: "combo_total",
        target_group_id: null,
      } })] })),
      /cannot exceed 100/,
    );
    assert.throws(
      () => validateEventForm(form({ combo_deals: [combo({ discount: {
        type: "fixed_amount",
        amount: 5,
        applies_to: "group",
        target_group_id: null,
      } })] })),
      /needs a target group/,
    );
  });
});
