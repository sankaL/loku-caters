"use client";

import { useState, type CSSProperties } from "react";
import Modal from "@/components/ui/Modal";
import CustomSelect from "@/components/ui/CustomSelect";
import { API_URL } from "@/config/event";
import { captureEvent } from "@/lib/analytics";
import { PRE_ORDER_REASON_OPTIONS } from "@/lib/feedbackOptions";

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  origin?: FeedbackOrigin;
}

export type FeedbackOrigin =
  | "events_page_non_customer"
  | "events_page_customer"
  | "event_reminder_email";

const inputClass =
  "w-full px-4 py-3 rounded-xl text-sm border bg-white focus:outline-none focus:ring-2 transition-all";

function FeedbackActions({
  submitted,
  submitting,
  onClose,
  onSubmit,
}: {
  submitted: boolean;
  submitting: boolean;
  onClose: () => void;
  onSubmit: () => void;
}) {
  if (submitted) {
    return (
      <button type="button" onClick={onClose} style={primaryButtonStyle(false)}>
        Close
      </button>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={onClose}
        style={{ color: "var(--color-muted)", fontSize: "14px", fontWeight: 500, cursor: "pointer" }}
      >
        Cancel
      </button>
      <button type="button" onClick={onSubmit} disabled={submitting} style={primaryButtonStyle(submitting)}>
        {submitting ? "Sending..." : "Send Feedback"}
      </button>
    </>
  );
}

function primaryButtonStyle(disabled: boolean): CSSProperties {
  return {
    background: "var(--color-forest)",
    color: "var(--color-cream)",
    padding: "10px 20px",
    borderRadius: "12px",
    fontSize: "14px",
    fontWeight: 600,
    opacity: disabled ? 0.6 : 1,
    cursor: disabled ? "not-allowed" : "pointer",
    border: "none",
  };
}

function FeedbackThankYou() {
  return (
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
      <p className="text-base font-semibold mb-2" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>
        Thank you for your feedback!
      </p>
      <p style={{ color: "var(--color-muted)" }}>This helps us improve future batches.</p>
    </div>
  );
}

interface FeedbackFormFieldsProps {
  name: string;
  contact: string;
  reason: string;
  otherDetails: string;
  reasonError: string;
  serverError: string;
  onNameChange: (value: string) => void;
  onContactChange: (value: string) => void;
  onReasonChange: (value: string) => void;
  onOtherDetailsChange: (value: string) => void;
}

function FeedbackFormFields(props: FeedbackFormFieldsProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <p style={{ color: "var(--color-muted)", marginBottom: "4px" }}>
        We value your input. Let us know why this batch does not work for you.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <div>
          <label htmlFor="feedback-name" style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "var(--color-text)", marginBottom: "6px" }}>
            Your name <span style={{ color: "var(--color-muted)", fontWeight: 400 }}>(optional)</span>
          </label>
          <input
            id="feedback-name"
            type="text"
            value={props.name}
            onChange={(event) => props.onNameChange(event.target.value)}
            placeholder="e.g. Sarah"
            className={inputClass}
            style={{ color: "var(--color-text)", borderColor: "var(--color-border)" }}
          />
        </div>
        <div>
          <label htmlFor="feedback-contact" style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "var(--color-text)", marginBottom: "6px" }}>
            Contact <span style={{ color: "var(--color-muted)", fontWeight: 400 }}>(optional)</span>
          </label>
          <input
            id="feedback-contact"
            type="text"
            value={props.contact}
            onChange={(event) => props.onContactChange(event.target.value)}
            placeholder="Email or phone"
            className={inputClass}
            style={{ color: "var(--color-text)", borderColor: "var(--color-border)" }}
          />
        </div>
      </div>
      <div>
        <label style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "var(--color-text)", marginBottom: "6px" }}>
          Reason
        </label>
        <CustomSelect
          options={PRE_ORDER_REASON_OPTIONS}
          value={props.reason}
          onChange={props.onReasonChange}
          placeholder="Select a reason"
          hasError={Boolean(props.reasonError)}
        />
        {props.reasonError && <p style={{ marginTop: "4px", fontSize: "12px", color: "var(--color-error-text)" }}>{props.reasonError}</p>}
      </div>
      {props.reason === "other" && (
        <div>
          <label htmlFor="feedback-other" style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "var(--color-text)", marginBottom: "6px" }}>
            Please tell us more <span style={{ color: "var(--color-muted)", fontWeight: 400 }}>(optional)</span>
          </label>
          <textarea
            id="feedback-other"
            rows={3}
            value={props.otherDetails}
            onChange={(event) => props.onOtherDetailsChange(event.target.value)}
            placeholder="Any details you'd like to share..."
            className={inputClass}
            style={{ color: "var(--color-text)", borderColor: "var(--color-border)", resize: "none", lineHeight: "1.5" }}
          />
        </div>
      )}
      {props.serverError && <p style={{ fontSize: "12px", color: "var(--color-error-text)" }}>{props.serverError}</p>}
    </div>
  );
}

export default function FeedbackModal({
  isOpen,
  onClose,
  origin = "events_page_non_customer",
}: FeedbackModalProps) {
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
          origin,
          feedback_type: "feedback",
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
      captureEvent("feedback_submitted", {
        origin,
        feedback_type: "feedback",
        reason,
      });
      setSubmitted(true);
    } catch {
      setServerError("Unable to connect. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Can't Join This Batch?"
      actions={(
        <FeedbackActions
          submitted={submitted}
          submitting={submitting}
          onClose={handleClose}
          onSubmit={handleSubmit}
        />
      )}
    >
      {submitted ? (
        <FeedbackThankYou />
      ) : (
        <FeedbackFormFields
          name={name}
          contact={contact}
          reason={reason}
          otherDetails={otherDetails}
          reasonError={reasonError}
          serverError={serverError}
          onNameChange={setName}
          onContactChange={setContact}
          onReasonChange={(value) => {
            setReason(value);
            if (value) setReasonError("");
          }}
          onOtherDetailsChange={setOtherDetails}
        />
      )}
    </Modal>
  );
}
