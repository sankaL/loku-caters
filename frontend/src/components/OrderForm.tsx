"use client";

import { useState } from "react";
import { API_URL, type Item, type Location } from "@/config/event";
import CustomSelect from "@/components/ui/CustomSelect";
import Modal from "@/components/ui/Modal";

interface FormData {
  name: string;
  item_id: string;
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
    email: string;
    phone_number: string;
    item_id: string;
    item_name: string;
    quantity: number;
    pickup_location: string;
    pickup_time_slot: string;
    total_price: number;
    price_per_item: number;
    currency: string;
    event_date: string;
  };
}

interface OrderFormProps {
  items: Item[];
  locations: Location[];
  currency: string;
  onSuccess: (result: OrderResult) => void;
}

export default function OrderForm({ items, locations, currency, onSuccess }: OrderFormProps) {
  const defaultItem = items[0];

  const [form, setForm] = useState<FormData>({
    name: "",
    item_id: defaultItem?.id ?? "",
    quantity: 1,
    pickup_location: "",
    pickup_time_slot: "",
    phone_number: "",
    email: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState("");
  const [showErrorModal, setShowErrorModal] = useState(false);

  const selectedItem: Item =
    items.find((i) => i.id === form.item_id) ?? defaultItem;

  const timeSlots =
    form.pickup_location
      ? (locations.find((l) => l.name === form.pickup_location)?.timeSlots ?? [])
      : [];

  const effectivePrice = selectedItem?.discounted_price ?? selectedItem?.price ?? 0;
  const total = (form.quantity * effectivePrice).toFixed(2);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    const { name, value } = e.target;
    setErrors((prev) => ({ ...prev, [name]: "" }));
    setServerError("");

    if (name === "pickup_location") {
      setForm((prev) => ({ ...prev, pickup_location: value, pickup_time_slot: "" }));
    } else if (name === "item_id") {
      setForm((prev) => ({ ...prev, item_id: value }));
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
  }

  function handleSelectChange(name: keyof FormData, value: string) {
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
    if (!form.item_id) newErrors.item_id = "Please select an item.";
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
        const msg = Array.isArray(detail)
          ? detail.map((d: { msg: string }) => d.msg).join(", ")
          : (detail || "Something went wrong. Please try again.");
        setServerError(msg);
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

          {/* Item selection */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-text)" }}>
              What would you like to order?
            </label>
            <CustomSelect
              options={items.map((item) => ({ value: item.id, label: item.name }))}
              value={form.item_id}
              onChange={(val) => handleSelectChange("item_id", val)}
              hasError={!!errors.item_id}
            />
            {selectedItem?.description && (
              <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--color-muted)" }}>
                {selectedItem.description}
              </p>
            )}
            <div className="mt-2 flex items-center gap-3 flex-wrap">
              <span className="text-lg font-bold" style={{ color: "var(--color-forest)" }}>
                ${effectivePrice.toFixed(2)}
              </span>
              {selectedItem?.discounted_price != null && (
                <>
                  <span className="text-sm line-through font-medium" style={{ color: "#e05252" }}>
                    ${selectedItem.price.toFixed(2)}
                  </span>
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: "#fef2f2", color: "#c53030", border: "1px solid #fecaca" }}
                  >
                    Save ${(selectedItem.price - selectedItem.discounted_price).toFixed(2)}
                  </span>
                </>
              )}
            </div>
            {errors.item_id && <p className="mt-1 text-xs text-red-500">{errors.item_id}</p>}
          </div>

          {/* Quantity */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-text)" }}>
              How many {selectedItem?.name}?
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
                -
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
              Phone Number
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
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-widest font-semibold mb-0.5" style={{ color: "var(--color-sage)" }}>
                  Order Total
                </p>
                <p className="text-sm" style={{ color: "var(--color-muted)" }}>
                  {form.quantity} x {selectedItem?.name} @ ${effectivePrice.toFixed(2)} each
                </p>
              </div>
              <p
                className="text-3xl font-bold"
                style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}
              >
                ${total}
              </p>
            </div>
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
                Placing your order...
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
