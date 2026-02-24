"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import CustomSelect from "@/components/ui/CustomSelect";
import { API_URL } from "@/config/event";
import { captureEvent } from "@/lib/analytics";

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const REASON_OPTIONS = [
  { value: "price_too_high", label: "Price too high" },
  { value: "location_not_convenient", label: "Pickup location not convenient" },
  { value: "dietary_needs", label: "Food does not meet dietary needs" },
  { value: "not_available", label: "Not available on the event date" },
  { value: "different_menu", label: "Prefer a different menu item" },
  { value: "prefer_delivery", label: "Prefer delivery over pickup" },
  { value: "not_interested", label: "Not interested at this time" },
  { value: "other", label: "Other" },
];

const inputClass =
  "w-full px-4 py-3 rounded-xl text-sm border bg-white focus:outline-none focus:ring-2 transition-all";

export default function FeedbackModal({ isOpen, onClose }: FeedbackModalProps) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [reason, setReason] = useState("");
  const [otherDetails, setOtherDetails] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState("");

  function resetForm() {
    setName("");
    setContact("");
    setReason("");
    setOtherDetails("");
    setReasonError("");
    setSubmitting(false);
    setSubmitted(false);
    setServerError("");
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  function validate(): boolean {
    if (!reason) {
      setReasonError("Please select a reason.");
      return false;
    }
    setReasonError("");
    return true;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setSubmitting(true);
    setServerError("");
    try {
      const res = await fetch(`${API_URL}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedback_type: "non_customer",
          name: name.trim() || null,
          contact: contact.trim() || null,
          reason,
          other_details: reason === "other" ? (otherDetails.trim() || null) : null,
        }),
      });
      if (!res.ok) {
        setServerError("Something went wrong. Please try again.");
        return;
      }
      captureEvent("feedback_submitted", { reason });
      setSubmitted(true);
    } catch {
      setServerError("Unable to connect. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const formActions = (
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
          background: "var(--color-forest)",
          color: "var(--color-cream)",
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
  );

  const thankyouActions = (
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
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Can't Join This Batch?"
      actions={submitted ? thankyouActions : formActions}
    >
      {submitted ? (
        <div style={{ textAlign: "center", padding: "8px 0 4px" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "16px" }}>
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-sage)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          </div>
          <p
            className="text-base font-semibold mb-2"
            style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}
          >
            Thank you for your feedback!
          </p>
          <p style={{ color: "var(--color-muted)" }}>
            This helps us improve future batches.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <p style={{ color: "var(--color-muted)", marginBottom: "4px" }}>
            We value your input. Let us know why this batch does not work for you.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label
                htmlFor="feedback-name"
                style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "var(--color-text)", marginBottom: "6px" }}
              >
                Your name <span style={{ color: "var(--color-muted)", fontWeight: 400 }}>(optional)</span>
              </label>
              <input
                id="feedback-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Sarah"
                className={inputClass}
                style={{ color: "var(--color-text)", borderColor: "var(--color-border)" }}
              />
            </div>
            <div>
              <label
                htmlFor="feedback-contact"
                style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "var(--color-text)", marginBottom: "6px" }}
              >
                Contact <span style={{ color: "var(--color-muted)", fontWeight: 400 }}>(optional)</span>
              </label>
              <input
                id="feedback-contact"
                type="text"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="Email or phone"
                className={inputClass}
                style={{ color: "var(--color-text)", borderColor: "var(--color-border)" }}
              />
            </div>
          </div>

          <div>
            <label
              style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "var(--color-text)", marginBottom: "6px" }}
            >
              Reason
            </label>
            <CustomSelect
              options={REASON_OPTIONS}
              value={reason}
              onChange={(v) => { setReason(v); if (v) setReasonError(""); }}
              placeholder="Select a reason"
              hasError={!!reasonError}
            />
            {reasonError && (
              <p style={{ marginTop: "4px", fontSize: "12px", color: "#ef4444" }}>{reasonError}</p>
            )}
          </div>

          {reason === "other" && (
            <div>
              <label
                htmlFor="feedback-other"
                style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "var(--color-text)", marginBottom: "6px" }}
              >
                Please tell us more <span style={{ color: "var(--color-muted)", fontWeight: 400 }}>(optional)</span>
              </label>
              <textarea
                id="feedback-other"
                rows={3}
                value={otherDetails}
                onChange={(e) => setOtherDetails(e.target.value)}
                placeholder="Any details you'd like to share..."
                className={inputClass}
                style={{
                  color: "var(--color-text)",
                  borderColor: "var(--color-border)",
                  resize: "none",
                  lineHeight: "1.5",
                }}
              />
            </div>
          )}

          {serverError && (
            <p style={{ fontSize: "12px", color: "#ef4444" }}>{serverError}</p>
          )}
        </div>
      )}
    </Modal>
  );
}
