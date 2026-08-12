"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import StarRating from "@/components/ui/StarRating";
import { API_URL } from "@/config/event";
import { captureEvent } from "@/lib/analytics";
import type { CheckoutResult } from "@/components/OrderForm";

interface SuccessViewProps {
  result: CheckoutResult;
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatComboDiscountLabel(
  combo: CheckoutResult["order"]["applied_combos"][number],
  currency: string
): string {
  if (combo.discount_type === "percentage") {
    const amount = combo.discount_amount.toFixed(2).replace(/\.00$/, "").replace(/(\.\d*[1-9])0$/, "$1");
    return `${amount}% off ${combo.discount_scope_label.toLowerCase()}`;
  }
  return `${formatCurrency(combo.discount_amount, currency)} off ${combo.discount_scope_label.toLowerCase()}`;
}

type CheckoutOrder = CheckoutResult["order"];

function FeedbackStatus({ submitted, onOpen }: { submitted: boolean; onOpen: () => void }) {
  return (
    <div className="mb-8 flex justify-center">
      {submitted ? (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "8px 16px",
            borderRadius: "999px",
            background: "var(--color-success-bg)",
            border: "1px solid var(--color-success-border)",
            fontSize: "13px",
            fontWeight: 600,
            color: "var(--color-success-text)",
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><path d="M9 12l2 2 4-4" />
          </svg>
          Thanks for your feedback!
        </span>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          className="hover:bg-[color:var(--color-bark-hover)]"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "8px 16px",
            borderRadius: "999px",
            border: "none",
            background: "var(--color-bark)",
            fontSize: "13px",
            fontWeight: 600,
            color: "white",
            cursor: "pointer",
            transition: "background 0.15s",
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          How can we do better?
        </button>
      )}
    </div>
  );
}

function OrderLines({ order }: { order: CheckoutOrder }) {
  return order.lines.map((line) => (
    <div key={line.order_id} className="space-y-1 border-b pb-3" style={{ borderColor: "var(--color-border)" }}>
      <div className="flex justify-between items-center text-sm">
        <span style={{ color: "var(--color-muted)" }}>{line.item_name} x {line.quantity}</span>
        <span className="font-semibold" style={{ color: "var(--color-text)" }}>{formatCurrency(line.total_price, order.currency)}</span>
      </div>
      {line.discount_total > 0 && (
        <p className="text-xs text-right" style={{ color: "var(--color-success-text)" }}>
          Includes {formatCurrency(line.discount_total, order.currency)} combo savings
        </p>
      )}
    </div>
  ));
}

function AppliedCombos({ order }: { order: CheckoutOrder }) {
  if (order.applied_combos.length === 0) return null;
  return (
    <div className="space-y-2 border-b pb-3" style={{ borderColor: "var(--color-border)" }}>
      {order.applied_combos.map((combo) => (
        <div key={combo.combo_id} className="flex justify-between items-center gap-3 text-sm">
          <div>
            <div style={{ color: "var(--color-muted)" }}>{combo.name}</div>
            <div className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>{formatComboDiscountLabel(combo, order.currency)}</div>
          </div>
          <span className="font-semibold" style={{ color: "var(--color-success-text)" }}>-{formatCurrency(combo.savings_total, order.currency)}</span>
        </div>
      ))}
    </div>
  );
}

function OrderSummary({ order }: { order: CheckoutOrder }) {
  const pickupDetails = [
    { label: "Pickup Date", value: order.event_date },
    { label: "Pickup Location", value: order.pickup_location },
    { label: "Time Slot", value: order.pickup_time_slot },
  ];
  return (
    <div className="rounded-2xl p-6 text-left mb-8 space-y-3" style={{ background: "var(--color-cream)", border: "1px solid var(--color-border)" }}>
      <p className="text-xs uppercase tracking-widest font-semibold mb-4" style={{ color: "var(--color-sage)" }}>Your Order</p>
      <OrderLines order={order} />
      <AppliedCombos order={order} />
      {pickupDetails.map(({ label, value }) => (
        <div key={label} className="flex justify-between items-center text-sm border-b pb-3 last:border-0 last:pb-0" style={{ borderColor: "var(--color-border)" }}>
          <span style={{ color: "var(--color-muted)" }}>{label}</span>
          <span className="font-semibold" style={{ color: "var(--color-text)" }}>{value}</span>
        </div>
      ))}
      <div className="flex justify-between items-center text-sm pt-1">
        <span className="font-semibold" style={{ color: "var(--color-text)" }}>Subtotal</span>
        <span className="font-semibold" style={{ color: "var(--color-text)" }}>{formatCurrency(order.subtotal, order.currency)}</span>
      </div>
      <div className="flex justify-between items-center text-sm">
        <span className="font-semibold" style={{ color: "var(--color-text)" }}>Combo Savings</span>
        <span className="font-semibold" style={{ color: order.discount_total > 0 ? "var(--color-success-text)" : "var(--color-text)" }}>-{formatCurrency(order.discount_total, order.currency)}</span>
      </div>
      <div className="flex justify-between items-center text-sm pt-1">
        <span className="font-semibold" style={{ color: "var(--color-text)" }}>Order Total</span>
        <span className="font-bold text-lg" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>{formatCurrency(order.total_price, order.currency)}</span>
      </div>
    </div>
  );
}

function PaymentNotice({ order }: { order: CheckoutOrder }) {
  if (!order.etransfer_enabled || !order.etransfer_email) return null;
  return (
    <div className="rounded-2xl p-5 mb-4 flex gap-4 items-start text-left" style={{ background: "var(--color-warning-bg)", border: "1px solid var(--color-warning-border)" }}>
      <div className="mt-0.5 flex-shrink-0">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-warning-text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" />
        </svg>
      </div>
      <div>
        <p className="text-sm font-semibold mb-1" style={{ color: "var(--color-warning-text)" }}>Payment by e-Transfer</p>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-warning-text)" }}>
          If you would like to pay by e-Transfer, you are welcome to send your payment to <strong>{order.etransfer_email}</strong> at your convenience, any time before your scheduled pickup.
        </p>
      </div>
    </div>
  );
}

function ConfirmationNotice() {
  return (
    <div className="rounded-2xl p-5 mb-6 flex gap-4 items-start text-left" style={{ background: "var(--color-success-bg)", border: "1px solid var(--color-success-border)" }}>
      <div className="mt-0.5 flex-shrink-0">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-sage)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
        </svg>
      </div>
      <div>
        <p className="text-sm font-semibold mb-1" style={{ color: "var(--color-success-text)" }}>Confirmation coming soon</p>
        <p className="text-sm leading-relaxed" style={{ color: "var(--color-success-text)" }}>
          Once we have reviewed your order we will send a confirmation email with your <strong>pickup address</strong>. Please keep an eye on your inbox before your scheduled time.
        </p>
      </div>
    </div>
  );
}

function SuccessFeedbackModal({
  open,
  submitted,
  submitting,
  message,
  rating,
  error,
  onClose,
  onSubmit,
  onMessageChange,
  onRatingChange,
}: {
  open: boolean;
  submitted: boolean;
  submitting: boolean;
  message: string;
  rating: number;
  error: string;
  onClose: () => void;
  onSubmit: () => void;
  onMessageChange: (value: string) => void;
  onRatingChange: (value: number) => void;
}) {
  const actions = submitted ? (
    <button type="button" onClick={onClose} className="interactive-primary px-5 py-2.5 rounded-2xl text-sm font-semibold" style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}>Close</button>
  ) : (
    <>
      <button type="button" onClick={onClose} className="interactive-secondary px-5 py-2.5 rounded-2xl text-sm font-medium" style={{ border: "1px solid var(--color-border)", color: "var(--color-text)", background: "white" }}>Cancel</button>
      <button type="button" onClick={onSubmit} disabled={submitting} aria-busy={submitting} className="interactive-primary px-5 py-2.5 rounded-2xl text-sm font-semibold" style={{ background: "var(--color-forest)", color: "var(--color-cream)", opacity: submitting ? 0.6 : 1 }}>{submitting ? "Sending..." : "Send"}</button>
    </>
  );
  return (
    <Modal isOpen={open} onClose={onClose} title={submitted ? "Thank you" : "Share feedback"} actions={actions}>
      {submitted ? <p>Thanks for taking the time to share feedback.</p> : (
        <div className="space-y-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>How would you rate your experience?</label>
            <StarRating value={rating} onChange={onRatingChange} size={32} mode="input" />
          </div>
          <textarea value={message} onChange={(event) => onMessageChange(event.target.value)} placeholder="Tell us what worked or what we can improve." rows={5} className="w-full rounded-2xl border px-4 py-3 text-sm focus:outline-none focus:ring-2" style={{ borderColor: "var(--color-border)", color: "var(--color-text)", resize: "vertical" }} />
          {error && <p className="text-xs" style={{ color: "var(--color-error-text)" }}>{error}</p>}
        </div>
      )}
    </Modal>
  );
}

export default function SuccessView({ result }: SuccessViewProps) {
  const { order } = result;
  const firstLine = order.lines[0];

  const [modalOpen, setModalOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState("");

  function handleOpen() {
    captureEvent("feedback_modal_opened", { origin: "events_page_customer", feedback_type: "feedback" });
    setModalOpen(true);
  }

  function handleClose() {
    setModalOpen(false);
    if (!submitted) {
      setMessage("");
      setServerError("");
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setServerError("");
    try {
      const res = await fetch(`${API_URL}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: "events_page_customer",
          feedback_type: "feedback",
          order_id: firstLine?.order_id ?? null,
          name: order.name,
          contact: order.email,
          message: message.trim() || null,
          rating: rating > 0 ? rating : null,
        }),
      });
      if (!res.ok) {
        setServerError("Something went wrong. Please try again.");
        return;
      }
      captureEvent("feedback_submitted", {
        origin: "events_page_customer",
        feedback_type: "feedback",
        order_id: firstLine?.order_id ?? null,
      });
      setSubmitted(true);
    } catch {
      setServerError("Unable to send. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="w-full max-w-2xl mx-auto px-6 pb-20">
      <div className="rounded-3xl p-8 md:p-12 text-center shadow-sm animate-scale-in" style={{ background: "white", border: "1px solid var(--color-border)" }}>
        <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6" style={{ background: "var(--color-cream)" }}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--color-sage)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        </div>
        <h2 className="text-3xl md:text-4xl font-bold mb-3" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>
          Order Placed!
        </h2>
        <p className="text-base mb-5" style={{ color: "var(--color-muted)" }}>
          Thank you, <strong style={{ color: "var(--color-text)" }}>{order.name}</strong>. Your pre-order has been submitted.
        </p>
        <FeedbackStatus submitted={submitted} onOpen={handleOpen} />
        <OrderSummary order={order} />
        <PaymentNotice order={order} />
        <ConfirmationNotice />
        <p className="text-base font-medium mb-1" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>
          We look forward to serving you!
        </p>
        <p className="text-xs" style={{ color: "var(--color-muted)" }}>
          Order references: {order.lines.map((line) => line.order_id.slice(0, 8).toUpperCase()).join(", ")}
        </p>
      </div>
      <SuccessFeedbackModal
        open={modalOpen}
        submitted={submitted}
        submitting={submitting}
        message={message}
        rating={rating}
        error={serverError}
        onClose={handleClose}
        onSubmit={handleSubmit}
        onMessageChange={setMessage}
        onRatingChange={setRating}
      />
    </section>
  );
}
