"use client";

import { useState } from "react";
import Modal from "@/components/ui/Modal";
import CustomSelect from "@/components/ui/CustomSelect";
import { API_URL } from "@/config/event";

interface ContactModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const REASON_OPTIONS = [
  { value: "catering_inquiry", label: "Catering inquiry" },
  { value: "previous_order_inquiry", label: "Question about a past order" },
  { value: "stay_updated", label: "Stay updated on future events" },
  { value: "general_feedback", label: "General feedback or suggestions" },
  { value: "other", label: "Something else" },
];

const inputClass =
  "w-full px-4 py-3 rounded-xl text-sm border bg-white focus:outline-none focus:ring-2 transition-all";

export default function ContactModal({ isOpen, onClose }: ContactModalProps) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [messageError, setMessageError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState("");

  function resetForm() {
    setName("");
    setContact("");
    setReason("");
    setMessage("");
    setMessageError("");
    setSubmitting(false);
    setSubmitted(false);
    setServerError("");
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  function validate(): boolean {
    if (!message.trim()) {
      setMessageError("Please include a message.");
      return false;
    }
    setMessageError("");
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
          feedback_type: "general_contact",
          name: name.trim() || null,
          contact: contact.trim() || null,
          reason: reason || null,
          message: message.trim(),
        }),
      });
      if (!res.ok) {
        setServerError("Something went wrong. Please try again.");
        return;
      }
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
        {submitting ? "Sending..." : "Send Message"}
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
      title="Get in Touch"
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
            Message received!
          </p>
          <p style={{ color: "var(--color-muted)" }}>
            Thanks for reaching out. We will get back to you soon.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <p style={{ color: "var(--color-muted)", marginBottom: "4px" }}>
            We would love to hear from you. Fill in what you can and we will be in touch.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="contact-name"
                style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "var(--color-text)", marginBottom: "6px" }}
              >
                Your name <span style={{ color: "var(--color-muted)", fontWeight: 400 }}>(optional)</span>
              </label>
              <input
                id="contact-name"
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
                htmlFor="contact-contact"
                style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "var(--color-text)", marginBottom: "6px" }}
              >
                Contact <span style={{ color: "var(--color-muted)", fontWeight: 400 }}>(optional)</span>
              </label>
              <input
                id="contact-contact"
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
              Reason <span style={{ color: "var(--color-muted)", fontWeight: 400 }}>(optional)</span>
            </label>
            <CustomSelect
              options={REASON_OPTIONS}
              value={reason}
              onChange={(v) => setReason(v)}
              placeholder="Select a reason"
            />
          </div>

          <div>
            <label
              htmlFor="contact-message"
              style={{ display: "block", fontSize: "13px", fontWeight: 500, color: "var(--color-text)", marginBottom: "6px" }}
            >
              Your message
            </label>
            <textarea
              id="contact-message"
              rows={4}
              value={message}
              onChange={(e) => { setMessage(e.target.value); if (e.target.value.trim()) setMessageError(""); }}
              placeholder="What can we help you with?"
              className={inputClass}
              style={{
                color: "var(--color-text)",
                borderColor: messageError ? "#ef4444" : "var(--color-border)",
                resize: "none",
                lineHeight: "1.5",
              }}
            />
            {messageError && (
              <p style={{ marginTop: "4px", fontSize: "12px", color: "#ef4444" }}>{messageError}</p>
            )}
          </div>

          {serverError && (
            <p style={{ fontSize: "12px", color: "#ef4444" }}>{serverError}</p>
          )}
        </div>
      )}
    </Modal>
  );
}
