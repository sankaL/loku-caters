"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { API_URL, CURRENCY, type ComboDeal, type Item, type Location } from "@/config/event";
import CustomSelect from "@/components/ui/CustomSelect";
import DescriptionPopover from "@/components/ui/DescriptionPopover";
import Modal from "@/components/ui/Modal";
import { effectiveMinimumOrderQuantityForItem } from "@/lib/comboDealUtils";

export interface AppliedComboSummary {
  combo_id: string;
  name: string;
  application_count: number;
  savings_total: number;
  preview_text: string;
  discount_type: "fixed_amount" | "percentage";
  discount_amount: number;
  discount_scope_label: string;
}

export interface CheckoutLineResult {
  order_id: string;
  item_id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  base_total: number;
  discount_total: number;
  total_price: number;
}

export interface CheckoutResult {
  success: boolean;
  group_id: string;
  message: string;
  order: {
    group_id: string;
    name: string;
    email: string;
    phone_number: string | null;
    pickup_location: string;
    pickup_time_slot: string;
    currency: string;
    event_date: string;
    etransfer_enabled: boolean;
    etransfer_email: string | null;
    location_address: string;
    subtotal: number;
    discount_total: number;
    total_price: number;
    applied_combos: AppliedComboSummary[];
    lines: CheckoutLineResult[];
  };
}

interface QuoteLine {
  line_id: string;
  item_id: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  base_total: number;
  discount_total: number;
  total_price: number;
}

interface UpsellOpportunity {
  combo_id: string;
  name: string;
  preview_text: string;
  message: string;
  potential_savings: number;
  missing_requirements: Array<{
    item_id: string;
    item_name: string;
    missing_quantity: number;
  }>;
}

interface QuoteResult {
  currency: string;
  lines: QuoteLine[];
  subtotal: number;
  discount_total: number;
  grand_total: number;
  applied_combos: AppliedComboSummary[];
  upsell_opportunities: UpsellOpportunity[];
}

interface ContactForm {
  name: string;
  pickup_location: string;
  pickup_time_slot: string;
  phone_number: string;
  email: string;
}

interface OrderFormProps {
  items: Item[];
  locations: Location[];
  comboDeals: ComboDeal[];
  onSuccess: (result: CheckoutResult) => void;
}

const EMPTY_QUOTE: QuoteResult = {
  currency: CURRENCY,
  lines: [],
  subtotal: 0,
  discount_total: 0,
  grand_total: 0,
  applied_combos: [],
  upsell_opportunities: [],
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: CURRENCY,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatComboDiscountLabel(combo: AppliedComboSummary): string {
  if (combo.discount_type === "percentage") {
    const amount = combo.discount_amount.toFixed(2).replace(/\.00$/, "").replace(/(\.\d*[1-9])0$/, "$1");
    return `${amount}% off ${combo.discount_scope_label.toLowerCase()}`;
  }
  return `${formatCurrency(combo.discount_amount)} off ${combo.discount_scope_label.toLowerCase()}`;
}

function formatComboPrimaryBadge(combo: AppliedComboSummary): string {
  if (combo.discount_type === "percentage") {
    const amount = combo.discount_amount.toFixed(2).replace(/\.00$/, "").replace(/(\.\d*[1-9])0$/, "$1");
    return `${amount}% off`;
  }
  return `Save ${formatCurrency(combo.savings_total)}`;
}

export default function OrderForm({ items, locations, comboDeals, onSuccess }: OrderFormProps) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [form, setForm] = useState<ContactForm>({
    name: "",
    pickup_location: "",
    pickup_time_slot: "",
    phone_number: "",
    email: "",
  });
  const [quote, setQuote] = useState<QuoteResult>(EMPTY_QUOTE);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState("");
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [openDescriptionItemId, setOpenDescriptionItemId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const timeSlots = form.pickup_location
    ? (locations.find((location) => location.name === form.pickup_location)?.timeSlots ?? [])
    : [];

  function getMinimumOrderQuantity(item: Item | undefined): number {
    if (!item) return 1;
    return effectiveMinimumOrderQuantityForItem(item.id, item.minimum_order_quantity, comboDeals);
  }

  const selectedLines = useMemo(
    () =>
      items
        .filter((item) => (quantities[item.id] ?? 0) > 0)
        .map((item) => ({ item, qty: quantities[item.id] ?? 0 })),
    [items, quantities]
  );

  const pickerItems = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      item.name.toLowerCase().includes(q) ||
      (item.description ?? "").toLowerCase().includes(q)
    );
  }, [items, pickerSearch]);

  useEffect(() => {
    if (!pickerOpen) {
      setOpenDescriptionItemId(null);
      return;
    }

    if (openDescriptionItemId && !pickerItems.some((item) => item.id === openDescriptionItemId)) {
      setOpenDescriptionItemId(null);
    }
  }, [openDescriptionItemId, pickerItems, pickerOpen]);

  const fallbackSubtotal = useMemo(
    () =>
      selectedLines.reduce((sum, { item, qty }) => {
        return sum + (item.discounted_price ?? item.price) * qty;
      }, 0),
    [selectedLines]
  );

  const summarySubtotal = selectedLines.length > 0 ? (quote.lines.length > 0 ? quote.subtotal : fallbackSubtotal) : 0;
  const summaryDiscount = selectedLines.length > 0 ? quote.discount_total : 0;
  const summaryGrandTotal = selectedLines.length > 0 ? (quote.lines.length > 0 ? quote.grand_total : fallbackSubtotal) : 0;

  useEffect(() => {
    if (!pickerOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPickerOpen(false);
      }
    }

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    requestAnimationFrame(() => {
      searchInputRef.current?.focus({ preventScroll: true });
    });

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [pickerOpen]);

  useEffect(() => {
    const controller = new AbortController();
    if (selectedLines.length === 0) {
      setQuote(EMPTY_QUOTE);
      setQuoteLoading(false);
      setQuoteError("");
      return () => controller.abort();
    }

    setQuoteLoading(true);
    setQuoteError("");
    setQuote(EMPTY_QUOTE);
    const timeoutId = window.setTimeout(async () => {
      try {
        const res = await fetch(`${API_URL}/api/orders/quote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lines: selectedLines.map(({ item, qty }) => ({ item_id: item.id, quantity: qty })),
          }),
          signal: controller.signal,
        });
        const data = await res.json();
        if (!res.ok) {
          const detail = Array.isArray(data?.detail) ? data.detail.map((entry: { msg: string }) => entry.msg).join(", ") : (data?.detail || "Failed to price cart");
          throw new Error(detail);
        }
        setQuote(data);
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        setQuote(EMPTY_QUOTE);
        setQuoteError(error instanceof Error ? error.message : "Failed to price cart");
      } finally {
        setQuoteLoading(false);
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [selectedLines]);

  function changeQty(itemId: string, delta: number) {
    setQuantities((prev) => {
      const next = { ...prev };
      const currentQty = prev[itemId] ?? 0;
      const item = items.find((entry) => entry.id === itemId);
      const minimumOrderQuantity = getMinimumOrderQuantity(item);

      if (delta > 0) {
        next[itemId] = currentQty === 0 ? minimumOrderQuantity : currentQty + delta;
        return next;
      }

      if (delta < 0) {
        if (currentQty <= minimumOrderQuantity) {
          delete next[itemId];
          return next;
        }
        next[itemId] = Math.max(minimumOrderQuantity, currentQty + delta);
        return next;
      }

      return next;
    });
    setErrors((prev) => ({ ...prev, items: "" }));
    setServerError("");
  }

  function addMissingRequirements(opportunity: UpsellOpportunity) {
    setQuantities((prev) => {
      const next = { ...prev };
      for (const missing of opportunity.missing_requirements) {
        const existingQty = next[missing.item_id] ?? 0;
        const item = items.find((entry) => entry.id === missing.item_id);
        const minimumOrderQuantity = getMinimumOrderQuantity(item);
        if (existingQty > 0) {
          next[missing.item_id] = existingQty + missing.missing_quantity;
        } else {
          next[missing.item_id] = Math.max(minimumOrderQuantity, missing.missing_quantity);
        }
      }
      return next;
    });
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = event.target;
    setErrors((prev) => ({ ...prev, [name]: "" }));
    setServerError("");
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleSelectChange(name: keyof ContactForm, value: string) {
    setErrors((prev) => ({ ...prev, [name]: "" }));
    setServerError("");
    if (name === "pickup_location") {
      setForm((prev) => ({ ...prev, pickup_location: value, pickup_time_slot: "" }));
      return;
    }
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function closePicker() {
    setPickerOpen(false);
    setOpenDescriptionItemId(null);
  }

  function validate(): boolean {
    const nextErrors: Record<string, string> = {};
    if (selectedLines.length === 0) nextErrors.items = "Please add at least one item.";
    for (const { item, qty } of selectedLines) {
      const minimumOrderQuantity = getMinimumOrderQuantity(item);
      if (qty < minimumOrderQuantity) {
        nextErrors.items = `${item.name} requires a minimum order of ${minimumOrderQuantity}.`;
        break;
      }
    }
    if (!form.name.trim()) nextErrors.name = "Please enter your name.";
    if (!form.pickup_location) nextErrors.pickup_location = "Please select a pickup location.";
    if (!form.pickup_time_slot) nextErrors.pickup_time_slot = "Please select a time slot.";
    if (!form.email.trim()) {
      nextErrors.email = "Please enter your email address.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      nextErrors.email = "Please enter a valid email address.";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate()) return;
    if (quoteLoading) return;

    setSubmitting(true);
    setServerError("");
    try {
      const res = await fetch(`${API_URL}/api/orders/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          pickup_location: form.pickup_location,
          pickup_time_slot: form.pickup_time_slot,
          phone_number: form.phone_number.trim(),
          email: form.email.trim(),
          lines: selectedLines.map(({ item, qty }) => ({ item_id: item.id, quantity: qty })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const detail = Array.isArray(data?.detail)
          ? data.detail.map((entry: { msg: string }) => entry.msg).join(", ")
          : (data?.detail || "Something went wrong. Please try again.");
        setServerError(detail);
        setShowErrorModal(true);
        return;
      }
      onSuccess(data);
    } catch {
      setServerError("Unable to connect. Please check your connection and try again.");
      setShowErrorModal(true);
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass = (field: string) =>
    `w-full px-4 py-3 rounded-xl text-sm border bg-white focus:outline-none focus:ring-2 transition-all ${errors[field]
      ? "border-red-400 focus:ring-red-200"
      : "border-[var(--color-border)] focus:ring-[var(--color-sage)] focus:ring-opacity-40 focus:border-[var(--color-sage)]"
    }`;

  const pickerModal = pickerOpen
    ? ReactDOM.createPortal(
      <div
        className="animate-fade-in"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 200,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px",
          background: "rgba(0,0,0,0.45)",
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            closePicker();
          }
        }}
      >
        <div
          className="animate-scale-in"
          style={{
            width: "100%",
            maxWidth: "512px",
            maxHeight: "min(calc(100dvh - 32px), 85vh)",
            minHeight: 0,
            background: "white",
            borderRadius: "24px",
            border: "1px solid var(--color-border)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b shrink-0" style={{ borderColor: "var(--color-border)" }}>
            <h3 className="text-base font-bold" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>
              Add Items
            </h3>
            <button
              type="button"
              onClick={closePicker}
              aria-label="Close item picker"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-sm font-semibold transition-all"
              style={{ color: "var(--color-muted)", background: "var(--color-cream)", border: "1px solid var(--color-border)" }}
            >
              X
            </button>
          </div>

          <div className="px-5 py-3 border-b shrink-0" style={{ borderColor: "var(--color-border)" }}>
            <input
              type="text"
              value={pickerSearch}
              onChange={(event) => setPickerSearch(event.target.value)}
              ref={searchInputRef}
              placeholder="Search items..."
              className="w-full px-4 py-2.5 rounded-xl text-sm border bg-white focus:outline-none focus:ring-2 transition-all"
              style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
            />
          </div>

          <div className="overflow-y-auto flex-1 min-h-0 px-5 py-3 space-y-2" style={{ overscrollBehavior: "contain" }}>
            {pickerItems.length === 0 ? (
              <p className="text-sm py-4 text-center" style={{ color: "var(--color-muted)" }}>No items match your search.</p>
            ) : (
              pickerItems.map((item) => {
                const qty = quantities[item.id] ?? 0;
                const inCart = qty > 0;
                const price = item.discounted_price ?? item.price;
                const minimumOrderQuantity = getMinimumOrderQuantity(item);
                return (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 rounded-2xl px-4 py-3 transition-all"
                    style={{
                      border: `1px solid ${inCart ? "var(--color-sage)" : "var(--color-border)"}`,
                      background: inCart ? "#f0fdf4" : "white",
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: "var(--color-forest)" }}>{item.name}</p>
                      {item.description && (
                        <DescriptionPopover
                          description={item.description}
                          open={openDescriptionItemId === item.id}
                          onOpenChange={(nextOpen) => {
                            setOpenDescriptionItemId(nextOpen ? item.id : null);
                          }}
                          className="text-xs mt-0.5"
                        />
                      )}
                      <div className="mt-0.5 flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold" style={{ color: "var(--color-forest)" }}>
                          {formatCurrency(price)}
                        </span>
                        {item.discounted_price != null && (
                          <span className="text-xs line-through font-medium" style={{ color: "#e05252" }}>
                            {formatCurrency(item.price)}
                          </span>
                        )}
                        {minimumOrderQuantity > 1 && (
                          <span className="text-xs font-semibold" style={{ color: "var(--color-sage)" }}>
                            Min {minimumOrderQuantity}
                          </span>
                        )}
                      </div>
                    </div>

                    {inCart ? (
                      <div className="flex items-center gap-0 shrink-0">
                        <button
                          type="button"
                          onClick={() => changeQty(item.id, -1)}
                          className="flex items-center justify-center w-9 h-9 rounded-l-xl border border-r-0 text-base font-semibold transition-all"
                          style={{ borderColor: "var(--color-sage)", color: "var(--color-forest)", background: "white" }}
                          aria-label={`Decrease ${item.name} quantity`}
                        >
                          -
                        </button>
                        <div className="w-10 h-9 flex items-center justify-center text-sm font-semibold border-t border-b" style={{ borderColor: "var(--color-sage)", color: "var(--color-text)", background: "white" }}>
                          {qty}
                        </div>
                        <button
                          type="button"
                          onClick={() => changeQty(item.id, 1)}
                          className="flex items-center justify-center w-9 h-9 rounded-r-xl border border-l-0 text-base font-semibold transition-all"
                          style={{ borderColor: "var(--color-sage)", color: "var(--color-forest)", background: "white" }}
                          aria-label={`Increase ${item.name} quantity`}
                        >
                          +
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => changeQty(item.id, 1)}
                        className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                        style={{ border: "1px solid var(--color-sage)", color: "var(--color-forest)", background: "white" }}
                      >
                        + Add
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="px-5 py-4 border-t shrink-0 flex items-center justify-between gap-3" style={{ borderColor: "var(--color-border)" }}>
            <p className="text-sm" style={{ color: "var(--color-muted)" }}>
              {selectedLines.length} item{selectedLines.length !== 1 ? "s" : ""} selected
            </p>
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
              style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}
            >
              Done
            </button>
          </div>
        </div>
      </div>,
      document.body
    )
    : null;

  return (
    <section className="w-full max-w-2xl mx-auto px-6 pb-16">
      <div className="rounded-3xl p-8 md:p-10 shadow-sm animate-scale-in" style={{ background: "white", border: "1px solid var(--color-border)" }}>
        <div className="mb-8">
          <h2 className="text-2xl md:text-3xl font-bold mb-1" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>
            Place Your Pre-Order
          </h2>
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            Fill in your details below. We&apos;ll send a confirmation to your email once we verify your order.
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-text)" }}>
              Full Name
            </label>
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="Your name"
              className={inputClass("name")}
              style={{ color: "var(--color-text)" }}
            />
            {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-text)" }}>
              Your Items
            </label>

            {selectedLines.length === 0 ? (
              <div style={{ border: "1px dashed var(--color-border)", borderRadius: 16, padding: "20px 16px", textAlign: "center" }}>
                <p className="text-sm" style={{ color: "var(--color-muted)" }}>No items added yet.</p>
              </div>
            ) : (
              <div className="space-y-2 mb-3">
                {selectedLines.map(({ item, qty }) => {
                  const price = item.discounted_price ?? item.price;
                  const minimumOrderQuantity = getMinimumOrderQuantity(item);
                  return (
                    <div key={item.id} className="flex items-center gap-3 rounded-xl px-4 py-2.5" style={{ border: "1px solid var(--color-sage)", background: "#f0fdf4" }}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: "var(--color-forest)" }}>{item.name}</p>
                        <p className="text-xs" style={{ color: "var(--color-muted)" }}>{formatCurrency(price)} each</p>
                        {minimumOrderQuantity > 1 && (
                          <p className="text-xs" style={{ color: "var(--color-muted)" }}>
                            Minimum order: {minimumOrderQuantity}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-0 shrink-0">
                        <button
                          type="button"
                          onClick={() => changeQty(item.id, -1)}
                          className="flex items-center justify-center w-9 h-9 rounded-l-xl border border-r-0 text-base font-semibold transition-all"
                          style={{ borderColor: "var(--color-sage)", color: "var(--color-forest)", background: "white" }}
                          aria-label={`Decrease ${item.name} quantity`}
                        >
                          -
                        </button>
                        <div className="w-10 h-9 flex items-center justify-center text-sm font-semibold border-t border-b" style={{ borderColor: "var(--color-sage)", color: "var(--color-text)", background: "white" }}>
                          {qty}
                        </div>
                        <button
                          type="button"
                          onClick={() => changeQty(item.id, 1)}
                          className="flex items-center justify-center w-9 h-9 rounded-r-xl border border-l-0 text-base font-semibold transition-all"
                          style={{ borderColor: "var(--color-sage)", color: "var(--color-forest)", background: "white" }}
                          aria-label={`Increase ${item.name} quantity`}
                        >
                          +
                        </button>
                      </div>
                      <p className="text-sm font-bold shrink-0" style={{ color: "var(--color-forest)" }}>
                        {formatCurrency(price * qty)}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              onClick={() => { setPickerOpen(true); setPickerSearch(""); setOpenDescriptionItemId(null); }}
              className="w-full py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2"
              style={{ background: "var(--color-sage)", color: "white", border: "1px solid var(--color-sage)" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              See Menu
            </button>
            {errors.items && <p className="mt-1.5 text-xs text-red-500">{errors.items}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-text)" }}>
              Pickup Location
            </label>
            <CustomSelect
              options={locations.map((location) => ({ value: location.name, label: location.name }))}
              value={form.pickup_location}
              onChange={(value) => handleSelectChange("pickup_location", value)}
              placeholder="Select a location"
              hasError={!!errors.pickup_location}
            />
            {errors.pickup_location && <p className="mt-1 text-xs text-red-500">{errors.pickup_location}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-text)" }}>
              Pickup Time Slot
            </label>
            <CustomSelect
              options={timeSlots.map((slot) => ({ value: slot, label: slot }))}
              value={form.pickup_time_slot}
              onChange={(value) => handleSelectChange("pickup_time_slot", value)}
              placeholder={form.pickup_location ? "Select a time slot" : "Select a location first"}
              disabled={!form.pickup_location}
              hasError={!!errors.pickup_time_slot}
            />
            {errors.pickup_time_slot && <p className="mt-1 text-xs text-red-500">{errors.pickup_time_slot}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-text)" }}>
              Phone Number <span style={{ color: "var(--color-muted)", fontWeight: 400 }}>(Optional)</span>
            </label>
            <input
              type="tel"
              name="phone_number"
              value={form.phone_number}
              onChange={handleChange}
              placeholder="+1 (XXX) XXX-XXXX"
              className={inputClass("phone_number")}
              style={{ color: "var(--color-text)" }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-text)" }}>
              Email Address
            </label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              placeholder="you@example.com"
              className={inputClass("email")}
              style={{ color: "var(--color-text)" }}
            />
            {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email}</p>}
          </div>

          <div className="rounded-2xl p-5 mt-2" style={{ background: "var(--color-cream)", border: "1px solid var(--color-border)" }}>
            <p className="text-xs uppercase tracking-widest font-semibold mb-3" style={{ color: "var(--color-sage)" }}>
              Order Summary
            </p>
            {selectedLines.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--color-muted)" }}>
                No items selected yet.
              </p>
            ) : (
              <div className="space-y-2">
                {(quote.lines.length > 0 ? quote.lines : selectedLines.map(({ item, qty }) => ({
                  line_id: item.id,
                  item_id: item.id,
                  item_name: item.name,
                  quantity: qty,
                  unit_price: item.discounted_price ?? item.price,
                  base_total: (item.discounted_price ?? item.price) * qty,
                  discount_total: 0,
                  total_price: (item.discounted_price ?? item.price) * qty,
                }))).map((line) => (
                  <div key={line.item_id} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span style={{ color: "var(--color-muted)" }}>
                        {line.item_name} x {line.quantity}
                      </span>
                      <span className="font-semibold" style={{ color: "var(--color-text)" }}>
                        {formatCurrency(line.total_price)}
                      </span>
                    </div>
                    {line.discount_total > 0 && (
                      <p className="text-xs text-right" style={{ color: "#2d6a2d" }}>
                        Includes {formatCurrency(line.discount_total)} combo savings
                      </p>
                    )}
                  </div>
                ))}

                {quote.applied_combos.length > 0 && (
                  <div className="pt-2 mt-2 border-t space-y-1" style={{ borderColor: "var(--color-border)" }}>
                    {quote.applied_combos.map((combo) => (
                      <div key={combo.combo_id} className="flex justify-between gap-3 text-sm">
                        <div>
                          <div style={{ color: "var(--color-muted)" }}>{combo.name}</div>
                          <div className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
                            {formatComboDiscountLabel(combo)}
                          </div>
                        </div>
                        <span style={{ color: "#2d6a2d", fontWeight: 600 }}>-{formatCurrency(combo.savings_total)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="pt-2 mt-1 border-t space-y-1" style={{ borderColor: "var(--color-border)" }}>
                  <div className="flex justify-between text-sm">
                    <span style={{ color: "var(--color-muted)" }}>Subtotal</span>
                    <span className="font-semibold" style={{ color: "var(--color-text)" }}>{formatCurrency(summarySubtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span style={{ color: "var(--color-muted)" }}>Combo savings</span>
                    <span className="font-semibold" style={{ color: summaryDiscount > 0 ? "#2d6a2d" : "var(--color-text)" }}>
                      -{formatCurrency(summaryDiscount)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-2 mt-1 border-t" style={{ borderColor: "var(--color-border)" }}>
                    <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>Total</p>
                    <p className="text-3xl font-bold" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>
                      {formatCurrency(summaryGrandTotal)}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting || quoteLoading || selectedLines.length === 0}
            className="w-full py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}
          >
            {submitting ? "Submitting..." : quoteLoading ? "Refreshing Deals..." : "Submit Pre-Order"}
          </button>

          {selectedLines.length > 0 && (
            <div className="rounded-3xl overflow-hidden" style={{ background: "linear-gradient(135deg, #12270F 0%, #1a3316 50%, #203b19 100%)", color: "white", boxShadow: "0 4px 24px rgba(18,39,15,0.25)" }}>
              {/* Section header */}
              <div className="flex items-center justify-between gap-4 px-5 md:px-6 pt-5 md:pt-6 pb-3">
                <div className="flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(247,245,240,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z" />
                  </svg>
                  <p className="text-xs uppercase tracking-[0.2em] font-semibold" style={{ color: "rgba(247,245,240,0.6)" }}>
                    Deals For Your Cart
                  </p>
                </div>
                <div className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: quote.applied_combos.length > 0 ? "rgba(114,145,82,0.35)" : "rgba(255,255,255,0.1)", color: "var(--color-cream)", border: `1px solid ${quote.applied_combos.length > 0 ? "rgba(114,145,82,0.5)" : "rgba(255,255,255,0.08)"}` }}>
                  {quoteLoading ? "Checking deals..." : `${quote.applied_combos.length} applied`}
                </div>
              </div>

              {quoteError && (
                <p className="text-sm px-5 md:px-6 pb-3" style={{ color: "#fbd5d5" }}>
                  {quoteError}
                </p>
              )}

              {/* Applied combo deals */}
              {quote.applied_combos.length > 0 && (
                <div className="space-y-3 px-5 md:px-6 pb-4">
                  {quote.applied_combos.map((combo) => (
                    <div
                      key={combo.combo_id}
                      className="rounded-2xl p-4 relative overflow-hidden"
                      style={{
                        background: "rgba(255,255,255,0.08)",
                        border: "1px solid rgba(114,145,82,0.35)",
                        backdropFilter: "blur(8px)",
                      }}
                    >
                      {/* Subtle gradient accent on left edge */}
                      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: "linear-gradient(180deg, var(--color-sage) 0%, rgba(114,145,82,0.3) 100%)", borderRadius: "3px 0 0 3px" }} />

                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5 min-w-0">
                          {/* Checkmark icon */}
                          <div className="shrink-0 mt-0.5 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: "var(--color-sage)" }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </div>
                          <div className="min-w-0">
                            <p className="text-base font-bold leading-tight">{combo.name}</p>
                            <p className="text-xs mt-1.5 leading-relaxed" style={{ color: "rgba(247,245,240,0.65)" }}>
                              {combo.preview_text}
                            </p>
                          </div>
                        </div>
                        <span className="shrink-0 rounded-full px-3 py-1 text-xs font-bold" style={{ background: "var(--color-bark)", color: "white", boxShadow: "0 2px 8px rgba(139,94,60,0.35)" }}>
                          {formatComboPrimaryBadge(combo)}
                        </span>
                      </div>

                      {/* Savings callout */}
                      <div className="flex items-center gap-2 mt-3 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8bc34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z" />
                        </svg>
                        <span className="text-sm font-semibold" style={{ color: "#8bc34a" }}>
                          Saved {formatCurrency(combo.savings_total)}
                        </span>
                        <span className="text-xs ml-1" style={{ color: "rgba(247,245,240,0.5)" }}>
                          {formatComboDiscountLabel(combo)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Upsell opportunities */}
              {quote.upsell_opportunities.length > 0 ? (
                <div className="px-5 md:px-6 pb-5 md:pb-6" style={{ borderTop: quote.applied_combos.length > 0 ? "1px solid rgba(255,255,255,0.06)" : "none", paddingTop: quote.applied_combos.length > 0 ? "16px" : 0 }}>
                  <div className="space-y-3">
                    {quote.upsell_opportunities.map((opportunity) => (
                      <div
                        key={opportunity.combo_id}
                        className="rounded-2xl overflow-hidden"
                        style={{ background: "#F7F5F0", color: "var(--color-text)", border: "1px solid rgba(114,145,82,0.2)" }}
                      >
                        <div className="p-4 pb-3">
                          <div className="flex items-start gap-2.5">
                            {/* Tag icon */}
                            <div className="shrink-0 mt-0.5">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-sage)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
                                <line x1="7" y1="7" x2="7.01" y2="7" />
                              </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold" style={{ color: "var(--color-forest)" }}>{opportunity.name}</p>
                              <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--color-muted)" }}>{opportunity.preview_text}</p>
                              <p className="text-sm mt-2 font-medium" style={{ color: "var(--color-forest)" }}>{opportunity.message}</p>
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => addMissingRequirements(opportunity)}
                          className="w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-all"
                          style={{ background: "var(--color-sage)", color: "white", borderTop: "1px solid rgba(114,145,82,0.3)" }}
                        >
                          Add and Save
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="5" y1="12" x2="19" y2="12" />
                            <polyline points="12 5 19 12 12 19" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : quote.applied_combos.length === 0 && !quoteLoading ? (
                <div className="px-5 md:px-6 pb-5 md:pb-6">
                  <p className="text-sm" style={{ color: "rgba(247,245,240,0.6)" }}>
                    Add more qualifying items to unlock combo savings when available.
                  </p>
                </div>
              ) : (
                <div className="pb-1" />
              )}
            </div>
          )}
        </form>
      </div>

      {pickerModal}

      <Modal isOpen={showErrorModal} onClose={() => setShowErrorModal(false)} title="Unable to submit order">
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-muted)" }}>
          {serverError || "Something went wrong. Please try again."}
        </p>
      </Modal>
    </section>
  );
}
