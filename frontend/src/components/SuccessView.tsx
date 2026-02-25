"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import { API_URL } from "@/config/event";
import { captureEvent } from "@/lib/analytics";
import type { OrderResult } from "@/components/OrderForm";

interface SuccessViewProps {
  results: OrderResult[];
}

export default function SuccessView({ results }: SuccessViewProps) {
  const first = results[0];
  const { order } = first;

  const grandTotal = results.reduce((sum, r) => sum + r.order.total_price, 0);

  const [modalOpen, setModalOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState("");

  function handleOpen() {
    captureEvent("feedback_modal_opened", { feedback_type: "customer" });
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
          feedback_type: "customer",
          order_id: first.order_id,
          name: order.name,
          contact: order.email,
          message: message.trim() || null,
        }),
      });
      if (!res.ok) {
        setServerError("Something went wrong. Please try again.");
        return;
      }
      captureEvent("feedback_submitted", { feedback_type: "customer", order_id: first.order_id });
      setSubmitted(true);
    } catch {
      setServerError("Unable to send. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="w-full max-w-2xl mx-auto px-6 pb-20">
      <div
        className="rounded-3xl p-8 md:p-12 text-center shadow-sm animate-scale-in"
        style={{ background: "white", border: "1px solid var(--color-border)" }}
      >
        {/* Success icon */}
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
          style={{ background: "var(--color-cream)" }}
        >
          <svg
            width="44"
            height="44"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#729152"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        </div>

        <h2
          className="text-3xl md:text-4xl font-bold mb-3"
          style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}
        >
          Order Placed!
        </h2>

        <p className="text-base mb-5" style={{ color: "var(--color-muted)" }}>
          Thank you, <strong style={{ color: "var(--color-text)" }}>{order.name}</strong>. Your pre-order has been submitted.
        </p>

        {/* Feedback badge */}
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
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#7a5234"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--color-bark)"; }}
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

        {/* Order details */}
        <div
          className="rounded-2xl p-6 text-left mb-8 space-y-3"
          style={{ background: "var(--color-cream)", border: "1px solid var(--color-border)" }}
        >
          <p className="text-xs uppercase tracking-widest font-semibold mb-4" style={{ color: "var(--color-sage)" }}>
            Your Order
          </p>

          {/* Line items */}
          {results.map((r) => (
            <div
              key={r.order_id}
              className="flex justify-between items-center text-sm border-b pb-3"
              style={{ borderColor: "var(--color-border)" }}
            >
              <span style={{ color: "var(--color-muted)" }}>
                {r.order.item_name} x {r.order.quantity}
              </span>
              <span className="font-semibold" style={{ color: "var(--color-text)" }}>
                {r.order.currency} ${r.order.total_price.toFixed(2)}
              </span>
            </div>
          ))}

          {/* Shared pickup details */}
          {[
            { label: "Pickup Date", value: order.event_date },
            { label: "Pickup Location", value: order.pickup_location },
            { label: "Time Slot", value: order.pickup_time_slot },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="flex justify-between items-center text-sm border-b pb-3 last:border-0 last:pb-0"
              style={{ borderColor: "var(--color-border)" }}
            >
              <span style={{ color: "var(--color-muted)" }}>{label}</span>
              <span className="font-semibold" style={{ color: "var(--color-text)" }}>{value}</span>
            </div>
          ))}

          {/* Grand total */}
          <div className="flex justify-between items-center text-sm pt-1">
            <span className="font-semibold" style={{ color: "var(--color-text)" }}>Order Total</span>
            <span className="font-bold text-lg" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>
              {order.currency} ${grandTotal.toFixed(2)}
            </span>
          </div>
        </div>

        {order.etransfer_enabled && order.etransfer_email && (
          <div
            className="rounded-2xl p-5 mb-4 flex gap-4 items-start text-left"
            style={{ background: "#fdf8f0", border: "1px solid #e8d9b8" }}
          >
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

        {/* Email notice */}
        <div
          className="rounded-2xl p-5 mb-6 flex gap-4 items-start text-left"
          style={{ background: "#f0f7eb", border: "1px solid #c8ddb4" }}
        >
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
          {results.length === 1
            ? `Order reference: ${first.order_id.slice(0, 8).toUpperCase()}`
            : `Order references: ${results.map((r) => r.order_id.slice(0, 8).toUpperCase()).join(", ")}`}
        </p>
      </div>

      {/* Feedback modal */}
      <Modal
        isOpen={modalOpen}
        onClose={handleClose}
        title="How can we do better?"
        actions={
          submitted ? (
            <button
              type="button"
              onClick={handleClose}
              style={{
                background: "var(--color-forest)",
                color: "var(--color-cream)",
                padding: "10px 20px",
                borderRadius: "12px",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
                border: "none",
              }}
            >
              Close
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleClose}
                style={{ color: "var(--color-muted)", fontSize: "14px", fontWeight: 500, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                style={{
                  background: "var(--color-bark)",
                  color: "white",
                  padding: "10px 20px",
                  borderRadius: "12px",
                  fontSize: "14px",
                  fontWeight: 600,
                  opacity: submitting ? 0.6 : 1,
                  cursor: submitting ? "not-allowed" : "pointer",
                  border: "none",
                }}
              >
                {submitting ? "Sending..." : "Send Feedback"}
              </button>
            </>
          )
        }
      >
        {submitted ? (
          <div style={{ textAlign: "center", padding: "8px 0 4px" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "16px" }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-sage)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            </div>
            <p className="text-base font-semibold mb-2" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>
              Thank you for your feedback!
            </p>
            <p style={{ color: "var(--color-muted)" }}>
              Your thoughts help us make every batch better.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <p style={{ color: "var(--color-muted)" }}>
              Your feedback helps us improve every batch.
            </p>
            <textarea
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What did you love? What could we improve? Any suggestions are welcome."
              style={{
                width: "100%",
                padding: "12px 16px",
                borderRadius: "12px",
                border: "1px solid var(--color-border)",
                fontSize: "14px",
                color: "var(--color-text)",
                background: "white",
                resize: "none",
                lineHeight: 1.6,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            {serverError && (
              <p style={{ fontSize: "12px", color: "#ef4444" }}>{serverError}</p>
            )}
          </div>
        )}
      </Modal>
    </section>
  );
}
