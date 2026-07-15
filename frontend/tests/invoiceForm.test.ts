import assert from "node:assert/strict";
import { describe, it } from "vitest";

import {
  createInvoiceFormLine,
  emptyInvoiceForm,
  invoiceFormFromBundle,
  invoiceFormAmounts,
  invoiceFormValidationError,
  invoicePayload,
  type InvoiceFormValues,
} from "../src/lib/invoiceForm";

function form(overrides: Partial<InvoiceFormValues> = {}): InvoiceFormValues {
  return {
    source_bundle_id: "bundle-1",
    customer_name: "  Customer  ",
    customer_email: " customer@example.com ",
    customer_phone: " 555-0100 ",
    issue_date: "2026-01-01",
    due_date: "2026-01-02",
    memo: " Thank you ",
    line_items: [createInvoiceFormLine(" Chicken Lamprais ", 2, 20)],
    discount_total: 5,
    paid: true,
    payment_method: "other",
    payment_method_other: " Cheque ",
    ...overrides,
  };
}

describe("invoice form calculations", () => {
  it("creates an empty form for the supplied local date", () => {
    const empty = emptyInvoiceForm("2026-02-03");
    assert.equal(empty.issue_date, "2026-02-03");
    assert.equal(empty.due_date, "2026-02-03");
    assert.equal(empty.line_items.length, 1);
  });

  it("normalizes invalid numeric inputs and prevents negative totals", () => {
    assert.deepEqual(invoiceFormAmounts(form({
      discount_total: 100,
      line_items: [createInvoiceFormLine("Item", -2, 20)],
    })), {
      subtotal: 0,
      discount: 100,
      total: 0,
    });
  });

  it("calculates subtotal, discount, and total", () => {
    assert.deepEqual(invoiceFormAmounts(form()), {
      subtotal: 40,
      discount: 5,
      total: 35,
    });
  });
});

describe("order-backed invoice forms", () => {
  it("maps bundle data and calculates unit prices", () => {
    const result = invoiceFormFromBundle({
      bundle_id: "bundle-1",
      primary_order_id: "order-1",
      name: "Customer",
      event_id: 1,
      email: "customer@example.com",
      phone_number: null,
      pickup_date: "2026-02-10",
      discount_total: 5,
      paid: true,
      payment_method: "cash",
      payment_method_other: null,
    }, [{
      item_name: "Chicken Lamprais",
      quantity: 2,
      base_total_price: 40,
    }], "2026-02-03");

    assert.equal(result.due_date, "2026-02-10");
    assert.equal(result.line_items[0].unit_price, 20);
    assert.equal(result.payment_method, "cash");
  });

  it("uses today for past pickup dates and clears unpaid payment details", () => {
    const result = invoiceFormFromBundle({
      bundle_id: "bundle-1",
      primary_order_id: "order-1",
      name: "Customer",
      event_id: null,
      email: null,
      phone_number: null,
      pickup_date: "2026-01-01",
      discount_total: 0,
      paid: false,
      payment_method: "other",
      payment_method_other: "Cheque",
    }, [], "2026-02-03");

    assert.equal(result.due_date, "2026-02-03");
    assert.equal(result.payment_method, null);
    assert.equal(result.payment_method_other, "");
  });
});

describe("invoice form validation", () => {
  it("accepts a valid invoice", () => {
    assert.equal(invoiceFormValidationError(form()), null);
  });

  it("returns the first actionable validation error", () => {
    assert.equal(invoiceFormValidationError(form({ customer_name: "" })), "Customer name is required");
    assert.equal(
      invoiceFormValidationError(form({ line_items: [createInvoiceFormLine("", 1, 10)] })),
      "Every invoice item needs a description",
    );
    assert.equal(
      invoiceFormValidationError(form({ discount_total: 41 })),
      "Discount cannot exceed the invoice subtotal",
    );
    assert.equal(
      invoiceFormValidationError(form({ due_date: "2025-12-31" })),
      "Due date cannot be earlier than issue date",
    );
  });
});

describe("invoice API payload", () => {
  it("trims user-entered fields and preserves paid method details", () => {
    assert.deepEqual(invoicePayload(form()), {
      source_bundle_id: "bundle-1",
      customer_name: "Customer",
      customer_email: "customer@example.com",
      customer_phone: "555-0100",
      issue_date: "2026-01-01",
      due_date: "2026-01-02",
      memo: "Thank you",
      line_items: [{ description: "Chicken Lamprais", quantity: 2, unit_price: 20 }],
      discount_total: 5,
      paid: true,
      payment_method: "other",
      payment_method_other: "Cheque",
    });
  });

  it("clears payment fields for unpaid invoices", () => {
    const payload = invoicePayload(form({ paid: false }));
    assert.equal(payload.payment_method, null);
    assert.equal(payload.payment_method_other, null);
  });
});
