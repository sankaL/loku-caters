import assert from "node:assert/strict";
import { describe, it } from "vitest";

import {
  computeItemRevenueBreakdown,
  computeItemsPerLocation,
  computeKPIs,
  computePaymentMethodBreakdown,
  computeRevenue,
  computeRevenueOverTime,
  computeStatusBreakdown,
  computeTopCustomers,
  filterOpenOrders,
  type Order,
} from "../src/lib/dashboardUtils";

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    event_id: 1,
    name: "Customer",
    email: "customer@example.com",
    phone_number: null,
    item_name: "Chicken Lamprais",
    item_id: "chicken",
    quantity: 1,
    pickup_location: "Downtown",
    pickup_time_slot: "12:00 - 12:30",
    total_price: 20,
    status: "confirmed",
    reminded: false,
    paid: true,
    payment_method: "cash",
    payment_method_other: null,
    created_at: "2026-01-15T12:00:00",
    ...overrides,
  };
}

describe("dashboard revenue", () => {
  it("excludes cancelled and no-show orders from revenue", () => {
    const orders = [
      order({ id: "active", total_price: 25 }),
      order({ id: "cancelled", status: "cancelled", total_price: 100 }),
      order({ id: "no-show", status: "no_show", total_price: 50 }),
    ];

    assert.equal(computeRevenue(orders).total, 25);
  });

  it("aggregates item revenue and retains a useful item name", () => {
    const rows = computeItemRevenueBreakdown([
      order({ id: "one", item_name: "", item_id: "chicken", quantity: 1, total_price: 20 }),
      order({ id: "two", item_name: "Chicken Lamprais", item_id: "chicken", quantity: 2, total_price: 40 }),
    ]);

    assert.deepEqual(rows, [{
      itemId: "chicken",
      itemName: "Chicken Lamprais",
      orderCount: 2,
      quantity: 3,
      revenue: 60,
    }]);
  });

  it("builds deterministic daily buckets and ranks the top items", () => {
    const result = computeRevenueOverTime([
      order({ id: "one", created_at: "2026-01-15T12:00:00", total_price: 20 }),
      order({ id: "two", created_at: "2026-01-14T12:00:00", item_id: "vegan", item_name: "Vegan", total_price: 35 }),
      order({ id: "old", created_at: "2025-12-01T12:00:00", total_price: 99 }),
      order({ id: "invalid", created_at: "invalid", total_price: 99 }),
    ], "7d", new Date(2026, 0, 15, 9));

    assert.equal(result.data.length, 7);
    assert.equal(result.data[0].date, "2026-01-09");
    assert.equal(result.data[6].date, "2026-01-15");
    assert.equal(result.data[5].totalRevenue, 35);
    assert.equal(result.data[6].totalRevenue, 20);
    assert.deepEqual(result.topItems.map((item) => item.itemId), ["vegan", "chicken"]);
  });

  it("builds twelve calendar-month buckets for yearly data", () => {
    const result = computeRevenueOverTime([
      order({ created_at: "2025-02-10T12:00:00", total_price: 30 }),
      order({ id: "current", created_at: "2026-01-02T12:00:00", total_price: 20 }),
    ], "1y", new Date(2026, 0, 15));

    assert.equal(result.data.length, 12);
    assert.equal(result.data[0].date, "2025-02");
    assert.equal(result.data[0].totalRevenue, 30);
    assert.equal(result.data[11].date, "2026-01");
    assert.equal(result.data[11].totalRevenue, 20);
  });
});

describe("dashboard breakdowns", () => {
  it("groups item, paid, unpaid, and payment totals per location", () => {
    const rows = computeItemsPerLocation([
      order({ id: "cash", quantity: 2, total_price: 40, payment_method: "cash" }),
      order({ id: "unpaid", paid: false, payment_method: null, quantity: 1, total_price: 20 }),
      order({ id: "other", item_name: "Vegan", item_id: "vegan", total_price: 25, payment_method: "cheque" }),
      order({ id: "cancelled", status: "cancelled", total_price: 500 }),
    ]);

    assert.equal(rows.length, 1);
    assert.equal(rows[0].paidRevenue, 65);
    assert.equal(rows[0].unpaidRevenue, 20);
    assert.deepEqual(rows[0].byMethod, [
      { method: "cash", label: "Cash", revenue: 40, count: 1 },
      { method: "other", label: "Other", revenue: 25, count: 1 },
    ]);
    assert.deepEqual(rows[0].items.map((item) => [item.itemName, item.quantity]), [
      ["Chicken Lamprais", 3],
      ["Vegan", 1],
    ]);
  });

  it("computes status, payment, customer, and open-order summaries", () => {
    const orders = [
      order({ id: "newer", name: "New Name", created_at: "2026-01-15T12:00:00", status: "pending" }),
      order({ id: "older", created_at: "2026-01-14T12:00:00", status: "pending", total_price: 30 }),
      order({ id: "cancelled", status: "cancelled", payment_method: "card", total_price: 100 }),
    ];

    assert.deepEqual(computeStatusBreakdown(orders), [
      { status: "pending", count: 2 },
      { status: "cancelled", count: 1 },
    ]);
    assert.deepEqual(computePaymentMethodBreakdown(orders), [
      { method: "cash", label: "Cash", count: 2, revenue: 50 },
    ]);
    assert.deepEqual(filterOpenOrders(orders).map((item) => item.id), ["newer", "older"]);
    assert.deepEqual(computeTopCustomers(orders, 1), [{
      email: "customer@example.com",
      name: "Customer",
      totalSpend: 150,
      orderCount: 3,
    }]);
  });
});

describe("dashboard KPIs", () => {
  it("compares current and previous calendar months", () => {
    const result = computeKPIs([
      order({ id: "current-1", created_at: "2026-01-10T12:00:00", quantity: 2, total_price: 40, status: "picked_up" }),
      order({ id: "current-2", created_at: "2026-01-11T12:00:00", quantity: 1, total_price: 20, status: "confirmed" }),
      order({ id: "previous", created_at: "2025-12-10T12:00:00", quantity: 1, total_price: 20, status: "picked_up" }),
    ], new Date(2026, 0, 15));

    assert.equal(result.totalOrders, 2);
    assert.equal(result.totalItems, 3);
    assert.equal(result.totalOrdersDelta, 100);
    assert.equal(result.confirmedRate, 100);
    assert.equal(result.confirmedRateDelta, 0);
    assert.equal(result.avgOrderValue, 30);
    assert.equal(result.avgOrderValueDelta, 50);
    assert.equal(result.completionRate, 100);
    assert.equal(result.completionRateDelta, 0);
  });
});
