"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
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

export default function SuccessView({ result }: SuccessViewProps) {
  const { order } = result;
  const firstLine = order.lines[0];

  const [modalOpen, setModalOpen] = useState(false);
  const [message, setMessage] = useState("");
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
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#729152" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

        {!submitted ? (
          <div className="mb-8 flex justify-center">
            <button
              type="button"
              onClick={handleOpen}
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
              onMouseEnter={(event) => { (event.currentTarget as HTMLButtonElement).style.background = "#7a5234"; }}
              onMouseLeave={(event) => { (event.currentTarget as HTMLButtonElement).style.background = "var(--color-bark)"; }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              How can we do better?
            </button>
          </div>
        ) : (
          <div className="mb-8 flex justify-center">
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 16px",
                borderRadius: "999px",
                background: "#f0f7eb",
                border: "1px solid #c8ddb4",
                fontSize: "13px",
                fontWeight: 600,
                color: "#2d6a2d",
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><path d="M9 12l2 2 4-4" />
              </svg>
              Thanks for your feedback!
            </span>
          </div>
        )}

        <div className="rounded-2xl p-6 text-left mb-8 space-y-3" style={{ background: "var(--color-cream)", border: "1px solid var(--color-border)" }}>
          <p className="text-xs uppercase tracking-widest font-semibold mb-4" style={{ color: "var(--color-sage)" }}>
            Your Order
          </p>

          {order.lines.map((line) => (
            <div key={line.order_id} className="space-y-1 border-b pb-3" style={{ borderColor: "var(--color-border)" }}>
              <div className="flex justify-between items-center text-sm">
                <span style={{ color: "var(--color-muted)" }}>
                  {line.item_name} x {line.quantity}
                </span>
                <span className="font-semibold" style={{ color: "var(--color-text)" }}>
                  {formatCurrency(line.total_price, order.currency)}
                </span>
              </div>
              {line.discount_total > 0 && (
                <p className="text-xs text-right" style={{ color: "#2d6a2d" }}>
                  Includes {formatCurrency(line.discount_total, order.currency)} combo savings
                </p>
              )}
            </div>
          ))}

          {order.applied_combos.length > 0 && (
            <div className="space-y-2 border-b pb-3" style={{ borderColor: "var(--color-border)" }}>
              {order.applied_combos.map((combo) => (
                <div key={combo.combo_id} className="flex justify-between items-center text-sm">
                  <span style={{ color: "var(--color-muted)" }}>{combo.name}</span>
                  <span className="font-semibold" style={{ color: "#2d6a2d" }}>
                    -{formatCurrency(combo.savings_total, order.currency)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {[
            { label: "Pickup Date", value: order.event_date },
            { label: "Pickup Location", value: order.pickup_location },
            { label: "Time Slot", value: order.pickup_time_slot },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between items-center text-sm border-b pb-3 last:border-0 last:pb-0" style={{ borderColor: "var(--color-border)" }}>
              <span style={{ color: "var(--color-muted)" }}>{label}</span>
              <span className="font-semibold" style={{ color: "var(--color-text)" }}>{value}</span>
            </div>
          ))}

          <div className="flex justify-between items-center text-sm pt-1">
            <span className="font-semibold" style={{ color: "var(--color-text)" }}>Subtotal</span>
            <span className="font-semibold" style={{ color: "var(--color-text)" }}>
              {formatCurrency(order.subtotal, order.currency)}
            </span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="font-semibold" style={{ color: "var(--color-text)" }}>Combo Savings</span>
            <span className="font-semibold" style={{ color: order.discount_total > 0 ? "#2d6a2d" : "var(--color-text)" }}>
              -{formatCurrency(order.discount_total, order.currency)}
            </span>
          </div>
          <div className="flex justify-between items-center text-sm pt-1">
            <span className="font-semibold" style={{ color: "var(--color-text)" }}>Order Total</span>
            <span className="font-bold text-lg" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>
              {formatCurrency(order.total_price, order.currency)}
            </span>
          </div>
        </div>

        {order.etransfer_enabled && order.etransfer_email && (
          <div className="rounded-2xl p-5 mb-4 flex gap-4 items-start text-left" style={{ background: "#fdf8f0", border: "1px solid #e8d9b8" }}>
            <div className="mt-0.5 flex-shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9a7a3a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <path d="M2 10h20" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold mb-1" style={{ color: "#7a5a1a" }}>
                Payment by e-Transfer
              </p>
              <p className="text-sm leading-relaxed" style={{ color: "#8a6a2a" }}>
                If you would like to pay by e-Transfer, you are welcome to send your payment to{" "}
                <strong>{order.etransfer_email}</strong> at your convenience - any time before your scheduled pickup.
              </p>
            </div>
          </div>
        )}

        <div className="rounded-2xl p-5 mb-6 flex gap-4 items-start text-left" style={{ background: "#f0f7eb", border: "1px solid #c8ddb4" }}>
          <div className="mt-0.5 flex-shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#729152" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold mb-1" style={{ color: "#2d5a18" }}>
              Confirmation coming soon
            </p>
            <p className="text-sm leading-relaxed" style={{ color: "#4a7a28" }}>
              Once we have reviewed your order we will send a confirmation email with your
              <strong> pickup address</strong>. Please keep an eye on your inbox before your scheduled time.
            </p>
          </div>
        </div>

        <p className="text-base font-medium mb-1" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>
          We look forward to serving you!
        </p>
        <p className="text-xs" style={{ color: "var(--color-muted)" }}>
          Order references: {order.lines.map((line) => line.order_id.slice(0, 8).toUpperCase()).join(", ")}
        </p>
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={handleClose}
        title={submitted ? "Thank you" : "Share feedback"}
        actions={submitted ? (
          <button
            type="button"
            onClick={handleClose}
            className="px-5 py-2.5 rounded-2xl text-sm font-semibold"
            style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}
          >
            Close
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={handleClose}
              className="px-5 py-2.5 rounded-2xl text-sm font-medium"
              style={{ border: "1px solid var(--color-border)", color: "var(--color-text)", background: "white" }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="px-5 py-2.5 rounded-2xl text-sm font-semibold"
              style={{ background: "var(--color-forest)", color: "var(--color-cream)", opacity: submitting ? 0.6 : 1 }}
            >
              {submitting ? "Sending..." : "Send"}
            </button>
          </>
        )}
      >
        {submitted ? (
          <p>Thanks for taking the time to share feedback.</p>
        ) : (
          <div className="space-y-3">
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Tell us what worked or what we can improve."
              rows={5}
              className="w-full rounded-2xl border px-4 py-3 text-sm focus:outline-none focus:ring-2"
              style={{ borderColor: "var(--color-border)", color: "var(--color-text)", resize: "vertical" }}
            />
            {serverError && <p className="text-xs text-red-500">{serverError}</p>}
          </div>
        )}
      </Modal>
    </section>
  );
}
