"use client";

import { useState, useMemo, useEffect } from "react";
import { API_URL, type Item, type Location } from "@/config/event";
import CustomSelect from "@/components/ui/CustomSelect";
import Modal from "@/components/ui/Modal";

export interface OrderResult {
  order_id: string;
  order: {
    name: string;
    email: string;
    phone_number: string | null;
    item_id: string;
    item_name: string;
    quantity: number;
    pickup_location: string;
    pickup_time_slot: string;
    total_price: number;
    price_per_item: number;
    currency: string;
    event_date: string;
    etransfer_enabled: boolean;
    etransfer_email: string | null;
  };
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
  onSuccess: (results: OrderResult[]) => void;
}

export default function OrderForm({ items, locations, onSuccess }: OrderFormProps) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [form, setForm] = useState<ContactForm>({
    name: "",
    pickup_location: "",
    pickup_time_slot: "",
    phone_number: "",
    email: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState("");
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");

  const timeSlots = form.pickup_location
    ? (locations.find((l) => l.name === form.pickup_location)?.timeSlots ?? [])
    : [];

  const selectedLines = items
    .filter((i) => (quantities[i.id] ?? 0) > 0)
    .map((i) => ({ item: i, qty: quantities[i.id] }));

  const grandTotal = selectedLines.reduce((sum, { item, qty }) => {
    return sum + (item.discounted_price ?? item.price) * qty;
  }, 0);

  const pickerItems = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) =>
      i.name.toLowerCase().includes(q) ||
      (i.description ?? "").toLowerCase().includes(q)
    );
  }, [items, pickerSearch]);

  useEffect(() => {
    if (!pickerOpen) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [pickerOpen]);

  function changeQty(itemId: string, delta: number) {
    setQuantities((prev) => ({
      ...prev,
      [itemId]: Math.max(0, (prev[itemId] ?? 0) + delta),
    }));
    setErrors((prev) => ({ ...prev, items: "" }));
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    setErrors((prev) => ({ ...prev, [name]: "" }));
    setServerError("");
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleSelectChange(name: keyof ContactForm, value: string) {
    setErrors((prev) => ({ ...prev, [name]: "" }));
    setServerError("");
    if (name === "pickup_location") {
      setForm((prev) => ({ ...prev, pickup_location: value, pickup_time_slot: "" }));
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
  }

  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    if (selectedLines.length === 0) newErrors.items = "Please add at least one item.";
    if (!form.name.trim()) newErrors.name = "Please enter your name.";
    if (!form.pickup_location) newErrors.pickup_location = "Please select a pickup location.";
    if (!form.pickup_time_slot) newErrors.pickup_time_slot = "Please select a time slot.";
    if (!form.email.trim()) {
      newErrors.email = "Please enter your email address.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = "Please enter a valid email address.";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    setServerError("");

    const results: OrderResult[] = [];
    try {
      for (const { item, qty } of selectedLines) {
        const res = await fetch(`${API_URL}/api/orders`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name.trim(),
            item_id: item.id,
            quantity: qty,
            pickup_location: form.pickup_location,
            pickup_time_slot: form.pickup_time_slot,
            phone_number: form.phone_number.trim(),
            email: form.email.trim(),
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          const detail = data?.detail;
          const msg = Array.isArray(detail)
            ? detail.map((d: { msg: string }) => d.msg).join(", ")
            : (detail || "Something went wrong. Please try again.");
          setServerError(msg);
          setShowErrorModal(true);
          return;
        }
        results.push(data);
      }
      onSuccess(results);
    } catch {
      setServerError("Unable to connect. Please check your connection and try again.");
      setShowErrorModal(true);
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass = (field: string) =>
    `w-full px-4 py-3 rounded-xl text-sm border bg-white focus:outline-none focus:ring-2 transition-all ${
      errors[field]
        ? "border-red-400 focus:ring-red-200"
        : "border-[var(--color-border)] focus:ring-[var(--color-sage)] focus:ring-opacity-40 focus:border-[var(--color-sage)]"
    }`;

  return (
    <section className="w-full max-w-2xl mx-auto px-6 pb-16">
      <div
        className="rounded-3xl p-8 md:p-10 shadow-sm animate-scale-in"
        style={{ background: "white", border: "1px solid var(--color-border)" }}
      >
        <div className="mb-8">
          <h2
            className="text-2xl md:text-3xl font-bold mb-1"
            style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}
          >
            Place Your Pre-Order
          </h2>
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            Fill in your details below. We&apos;ll send a confirmation to your email once we verify your order.
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          {/* Name */}
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

          {/* Items -- Cart + Browse button */}
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
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 rounded-xl px-4 py-2.5"
                      style={{ border: "1px solid var(--color-sage)", background: "#f0fdf4" }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: "var(--color-forest)" }}>{item.name}</p>
                        <p className="text-xs" style={{ color: "var(--color-muted)" }}>${price.toFixed(2)} each</p>
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
                        <div
                          className="w-10 h-9 flex items-center justify-center text-sm font-semibold border-t border-b"
                          style={{ borderColor: "var(--color-sage)", color: "var(--color-text)", background: "white" }}
                        >
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
                        ${(price * qty).toFixed(2)}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              onClick={() => { setPickerOpen(true); setPickerSearch(""); }}
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

          {/* Pickup Location */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-text)" }}>
              Pickup Location
            </label>
            <CustomSelect
              options={locations.map((loc) => ({ value: loc.name, label: loc.name }))}
              value={form.pickup_location}
              onChange={(val) => handleSelectChange("pickup_location", val)}
              placeholder="Select a location"
              hasError={!!errors.pickup_location}
            />
            {errors.pickup_location && (
              <p className="mt-1 text-xs text-red-500">{errors.pickup_location}</p>
            )}
          </div>

          {/* Time Slot */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-text)" }}>
              Pickup Time Slot
            </label>
            <CustomSelect
              options={timeSlots.map((slot) => ({ value: slot, label: slot }))}
              value={form.pickup_time_slot}
              onChange={(val) => handleSelectChange("pickup_time_slot", val)}
              placeholder={form.pickup_location ? "Select a time slot" : "Select a location first"}
              disabled={!form.pickup_location}
              hasError={!!errors.pickup_time_slot}
            />
            {errors.pickup_time_slot && (
              <p className="mt-1 text-xs text-red-500">{errors.pickup_time_slot}</p>
            )}
          </div>

          {/* Phone */}
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
            {errors.phone_number && (
              <p className="mt-1 text-xs text-red-500">{errors.phone_number}</p>
            )}
          </div>

          {/* Email */}
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

          {/* Order Summary */}
          <div
            className="rounded-2xl p-5 mt-2"
            style={{ background: "var(--color-cream)", border: "1px solid var(--color-border)" }}
          >
            <p className="text-xs uppercase tracking-widest font-semibold mb-3" style={{ color: "var(--color-sage)" }}>
              Order Summary
            </p>
            {selectedLines.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--color-muted)" }}>
                No items selected yet.
              </p>
            ) : (
              <div className="space-y-2">
                {selectedLines.map(({ item, qty }) => {
                  const price = item.discounted_price ?? item.price;
                  return (
                    <div key={item.id} className="flex justify-between text-sm">
                      <span style={{ color: "var(--color-muted)" }}>
                        {item.name} x {qty}
                      </span>
                      <span className="font-semibold" style={{ color: "var(--color-text)" }}>
                        ${(price * qty).toFixed(2)}
                      </span>
                    </div>
                  );
                })}
                <div
                  className="flex justify-between items-center pt-2 mt-1 border-t"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                    Total
                  </p>
                  <p
                    className="text-3xl font-bold"
                    style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}
                  >
                    ${grandTotal.toFixed(2)}
                  </p>
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-4 rounded-2xl text-base font-semibold tracking-wide transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}
            onMouseEnter={(e) => {
              if (!submitting) (e.currentTarget as HTMLButtonElement).style.background = "#1e3d18";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "var(--color-forest)";
            }}
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" opacity="0.3" />
                  <path d="M12 2a10 10 0 0 1 10 10" />
                </svg>
                Placing your order...
              </span>
            ) : (
              "Place Pre-Order"
            )}
          </button>

          <p className="text-xs text-center" style={{ color: "var(--color-muted)" }}>
            By submitting, you agree that we may contact you via email to confirm your order.
          </p>

          {/* Item Picker overlay */}
          {pickerOpen && (
            <>
              {/* Backdrop */}
              <div
                style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 200 }}
                onClick={() => setPickerOpen(false)}
              />

              {/* Sheet: bottom-sheet on mobile, centered modal on md+ */}
              <div
                className="animate-slide-up left-0 right-0 bottom-0 md:bottom-auto md:top-1/2 md:-translate-y-1/2 md:left-1/2 md:-translate-x-1/2 md:right-auto md:max-w-lg md:w-full md:rounded-3xl"
                style={{
                  position: "fixed",
                  zIndex: 201,
                  background: "white",
                  borderRadius: "24px 24px 0 0",
                  border: "1px solid var(--color-border)",
                  maxHeight: "80vh",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {/* Header */}
                <div
                  className="flex items-center justify-between px-5 py-4 border-b shrink-0"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <h3 className="text-base font-bold" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>
                    Add Items
                  </h3>
                  <button
                    type="button"
                    onClick={() => setPickerOpen(false)}
                    aria-label="Close item picker"
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-sm font-semibold transition-all"
                    style={{ color: "var(--color-muted)", background: "var(--color-cream)", border: "1px solid var(--color-border)" }}
                  >
                    X
                  </button>
                </div>

                {/* Search */}
                <div className="px-5 py-3 border-b shrink-0" style={{ borderColor: "var(--color-border)" }}>
                  <input
                    type="text"
                    value={pickerSearch}
                    onChange={(e) => setPickerSearch(e.target.value)}
                    placeholder="Search items..."
                    autoFocus
                    className="w-full px-4 py-2.5 rounded-xl text-sm border bg-white focus:outline-none focus:ring-2 transition-all"
                    style={{
                      borderColor: "var(--color-border)",
                      color: "var(--color-text)",
                    }}
                  />
                </div>

                {/* Item list */}
                <div className="overflow-y-auto flex-1 px-5 py-3 space-y-2">
                  {pickerItems.length === 0 ? (
                    <p className="text-sm py-4 text-center" style={{ color: "var(--color-muted)" }}>No items match your search.</p>
                  ) : (
                    pickerItems.map((item) => {
                      const qty = quantities[item.id] ?? 0;
                      const inCart = qty > 0;
                      const price = item.discounted_price ?? item.price;
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
                              <p className="text-xs mt-0.5 truncate" style={{ color: "var(--color-muted)" }}>{item.description}</p>
                            )}
                            <div className="mt-0.5 flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-bold" style={{ color: "var(--color-forest)" }}>
                                ${price.toFixed(2)}
                              </span>
                              {item.discounted_price != null && (
                                <span className="text-xs line-through font-medium" style={{ color: "#e05252" }}>
                                  ${item.price.toFixed(2)}
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
                              <div
                                className="w-10 h-9 flex items-center justify-center text-sm font-semibold border-t border-b"
                                style={{ borderColor: "var(--color-sage)", color: "var(--color-text)", background: "white" }}
                              >
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

                {/* Footer */}
                <div
                  className="px-5 py-4 border-t shrink-0 flex items-center justify-between gap-3"
                  style={{ borderColor: "var(--color-border)" }}
                >
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
            </>
          )}
        </form>
      </div>

      <Modal
        isOpen={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        title="Order Failed"
        variant="danger"
        actions={
          <button
            type="button"
            onClick={() => setShowErrorModal(false)}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}
          >
            OK
          </button>
        }
      >
        {serverError}
      </Modal>
    </section>
  );
}
