"use client";

import { useState } from "react";
import { PICKUP_LOCATIONS, LOCATION_NAMES } from "@/config/locations";
import { PRICE_PER_ITEM, CURRENCY, API_URL } from "@/config/event";

interface FormData {
  name: string;
  quantity: number;
  pickup_location: string;
  pickup_time_slot: string;
  phone_number: string;
  email: string;
}

interface OrderResult {
  order_id: string;
  order: {
    name: string;
    quantity: number;
    pickup_location: string;
    pickup_time_slot: string;
    total_price: number;
  };
}

interface OrderFormProps {
  onSuccess: (result: OrderResult) => void;
}

export default function OrderForm({ onSuccess }: OrderFormProps) {
  const [form, setForm] = useState<FormData>({
    name: "",
    quantity: 1,
    pickup_location: "",
    pickup_time_slot: "",
    phone_number: "",
    email: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState("");

  const timeSlots =
    form.pickup_location && PICKUP_LOCATIONS[form.pickup_location]
      ? PICKUP_LOCATIONS[form.pickup_location]
      : [];

  const total = (form.quantity * PRICE_PER_ITEM).toFixed(2);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    const { name, value } = e.target;
    setErrors((prev) => ({ ...prev, [name]: "" }));
    setServerError("");

    if (name === "pickup_location") {
      setForm((prev) => ({ ...prev, pickup_location: value, pickup_time_slot: "" }));
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
  }

  function changeQuantity(delta: number) {
    setForm((prev) => ({
      ...prev,
      quantity: Math.max(1, prev.quantity + delta),
    }));
  }

  function validate(): boolean {
    const newErrors: Partial<Record<keyof FormData, string>> = {};
    if (!form.name.trim()) newErrors.name = "Please enter your name.";
    if (!form.pickup_location) newErrors.pickup_location = "Please select a pickup location.";
    if (!form.pickup_time_slot) newErrors.pickup_time_slot = "Please select a time slot.";
    if (!form.phone_number.trim()) newErrors.phone_number = "Please enter your phone number.";
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

    try {
      const res = await fetch(`${API_URL}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        const detail = data?.detail;
        if (Array.isArray(detail)) {
          setServerError(detail.map((d: { msg: string }) => d.msg).join(", "));
        } else {
          setServerError(detail || "Something went wrong. Please try again.");
        }
        return;
      }

      onSuccess(data);
    } catch {
      setServerError("Unable to connect. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass = (field: keyof FormData) =>
    `w-full px-4 py-3 rounded-xl text-sm border bg-white focus:outline-none focus:ring-2 transition-all ${
      errors[field]
        ? "border-red-400 focus:ring-red-200"
        : "border-[var(--color-border)] focus:ring-[var(--color-sage)] focus:ring-opacity-40 focus:border-[var(--color-sage)]"
    }`;

  return (
    <section className="w-full max-w-2xl mx-auto px-6 pb-16">
      <div
        className="rounded-3xl p-8 md:p-10 shadow-sm animate-scale-in"
        style={{
          background: "white",
          border: "1px solid var(--color-border)",
        }}
      >
        {/* Form header */}
        <div className="mb-8">
          <h2
            className="text-2xl md:text-3xl font-bold mb-1"
            style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}
          >
            Pre-Order Your Lamprais
          </h2>
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            Fill in your details below. We&apos;ll send a confirmation to your email.
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

          {/* Quantity */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-text)" }}>
              How Many Lamprais?
            </label>
            <div className="flex items-center gap-0">
              <button
                type="button"
                onClick={() => changeQuantity(-1)}
                disabled={form.quantity <= 1}
                className="flex items-center justify-center w-12 h-12 rounded-l-xl border border-r-0 text-lg font-semibold transition-all disabled:opacity-30 hover:bg-[var(--color-cream-dark)] active:scale-95"
                style={{
                  borderColor: "var(--color-border)",
                  color: "var(--color-forest)",
                  background: "var(--color-cream)",
                }}
                aria-label="Decrease quantity"
              >
                −
              </button>
              <div
                className="flex-1 h-12 flex items-center justify-center text-sm font-semibold border-t border-b"
                style={{
                  borderColor: "var(--color-border)",
                  color: "var(--color-text)",
                  background: "white",
                }}
              >
                {form.quantity} {form.quantity === 1 ? "portion" : "portions"}
              </div>
              <button
                type="button"
                onClick={() => changeQuantity(1)}
                className="flex items-center justify-center w-12 h-12 rounded-r-xl border border-l-0 text-lg font-semibold transition-all hover:bg-[var(--color-cream-dark)] active:scale-95"
                style={{
                  borderColor: "var(--color-border)",
                  color: "var(--color-forest)",
                  background: "var(--color-cream)",
                }}
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>
          </div>

          {/* Pickup Location */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-text)" }}>
              Pickup Location
            </label>
            <select
              name="pickup_location"
              value={form.pickup_location}
              onChange={handleChange}
              className={inputClass("pickup_location")}
              style={{ color: form.pickup_location ? "var(--color-text)" : "var(--color-muted)" }}
            >
              <option value="">Select a location…</option>
              {LOCATION_NAMES.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
            {errors.pickup_location && (
              <p className="mt-1 text-xs text-red-500">{errors.pickup_location}</p>
            )}
          </div>

          {/* Time Slot */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-text)" }}>
              Pickup Time Slot
            </label>
            <select
              name="pickup_time_slot"
              value={form.pickup_time_slot}
              onChange={handleChange}
              disabled={!form.pickup_location}
              className={inputClass("pickup_time_slot")}
              style={{
                color: form.pickup_time_slot ? "var(--color-text)" : "var(--color-muted)",
                opacity: !form.pickup_location ? 0.6 : 1,
              }}
            >
              <option value="">
                {form.pickup_location ? "Select a time slot…" : "Select a location first"}
              </option>
              {timeSlots.map((slot) => (
                <option key={slot} value={slot}>
                  {slot}
                </option>
              ))}
            </select>
            {errors.pickup_time_slot && (
              <p className="mt-1 text-xs text-red-500">{errors.pickup_time_slot}</p>
            )}
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-text)" }}>
              Phone Number
            </label>
            <input
              type="tel"
              name="phone_number"
              value={form.phone_number}
              onChange={handleChange}
              placeholder="+61 4XX XXX XXX"
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
            style={{
              background: "var(--color-cream)",
              border: "1px solid var(--color-border)",
            }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-widest font-semibold mb-0.5" style={{ color: "var(--color-sage)" }}>
                  Order Total
                </p>
                <p className="text-sm" style={{ color: "var(--color-muted)" }}>
                  {form.quantity} × {CURRENCY} ${PRICE_PER_ITEM.toFixed(2)} per Lamprais
                </p>
              </div>
              <p
                className="text-3xl font-bold"
                style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}
              >
                {CURRENCY} ${total}
              </p>
            </div>
          </div>

          {/* Server error */}
          {serverError && (
            <div className="rounded-xl px-4 py-3 text-sm text-red-700 bg-red-50 border border-red-200">
              {serverError}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-4 rounded-2xl text-base font-semibold tracking-wide transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
            style={{
              background: "var(--color-forest)",
              color: "var(--color-cream)",
            }}
            onMouseEnter={(e) => {
              if (!submitting) (e.currentTarget as HTMLButtonElement).style.background = "#1e3d18";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "var(--color-forest)";
            }}
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="animate-spin"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" opacity="0.3" />
                  <path d="M12 2a10 10 0 0 1 10 10" />
                </svg>
                Placing your order…
              </span>
            ) : (
              "Place Pre-Order"
            )}
          </button>

          <p className="text-xs text-center" style={{ color: "var(--color-muted)" }}>
            By submitting, you agree that we may contact you via email to confirm your order.
          </p>
        </form>
      </div>
    </section>
  );
}
