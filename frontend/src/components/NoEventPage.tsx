"use client";

import { useState } from "react";
import ContactModal from "@/components/ContactModal";

export default function NoEventPage() {
  const [contactOpen, setContactOpen] = useState(false);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "calc(100vh - 80px)",
        padding: "60px 24px",
        textAlign: "center",
      }}
    >
      {/* Botanical SVG icon */}
      <div className="animate-fade-up" style={{ marginBottom: "28px" }}>
        <svg
          width="72"
          height="72"
          viewBox="0 0 72 72"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          {/* Stem */}
          <path
            d="M36 62 C36 62 36 38 36 28"
            stroke="var(--color-sage)"
            strokeWidth="2"
            strokeLinecap="round"
          />
          {/* Left large leaf */}
          <path
            d="M36 42 C28 36 14 34 12 22 C24 18 36 28 36 42Z"
            fill="var(--color-sage)"
            opacity="0.85"
          />
          {/* Right large leaf */}
          <path
            d="M36 42 C44 36 58 34 60 22 C48 18 36 28 36 42Z"
            fill="var(--color-sage)"
            opacity="0.65"
          />
          {/* Top frond left */}
          <path
            d="M36 28 C30 22 20 20 18 12 C28 10 36 20 36 28Z"
            fill="var(--color-sage)"
            opacity="0.75"
          />
          {/* Top frond right */}
          <path
            d="M36 28 C42 22 52 20 54 12 C44 10 36 20 36 28Z"
            fill="var(--color-sage)"
            opacity="0.55"
          />
          {/* Center top leaf */}
          <path
            d="M36 28 C33 18 34 10 36 8 C38 10 39 18 36 28Z"
            fill="var(--color-sage)"
            opacity="0.9"
          />
        </svg>
      </div>

      {/* Eyebrow */}
      <p
        className="animate-fade-up delay-100"
        style={{
          fontSize: "11px",
          fontWeight: 600,
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          color: "var(--color-sage)",
          marginBottom: "16px",
        }}
      >
        Loku Caters
      </p>

      {/* Headline */}
      <h1
        className="animate-fade-up delay-100"
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: "clamp(1.8rem, 5vw, 2.5rem)",
          fontWeight: 700,
          color: "var(--color-forest)",
          lineHeight: 1.2,
          maxWidth: "480px",
          marginBottom: "20px",
        }}
      >
        No events at this moment!
      </h1>

      {/* Divider */}
      <div
        className="animate-fade-up delay-200"
        style={{
          width: "40px",
          height: "2px",
          background: "var(--color-sage)",
          opacity: 0.4,
          borderRadius: "2px",
          marginBottom: "20px",
        }}
      />

      {/* Body text */}
      <p
        className="animate-fade-up delay-200"
        style={{
          fontSize: "15px",
          color: "var(--color-muted)",
          lineHeight: 1.7,
          maxWidth: "420px",
          marginBottom: "36px",
        }}
      >
        Our next batch of Loku Caters is still taking shape.
        We will share it the moment it is ready. In the meantime, we are always
        happy to hear from you.
      </p>

      {/* CTAs */}
      <div className="animate-fade-up delay-300" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
        <button
          onClick={() => setContactOpen(true)}
          style={{
            background: "var(--color-forest)",
            color: "var(--color-cream)",
            padding: "14px 32px",
            borderRadius: "14px",
            fontSize: "15px",
            fontWeight: 600,
            cursor: "pointer",
            border: "none",
            letterSpacing: "0.01em",
          }}
        >
          Get in Touch
        </button>
        <a
          href="tel:+16478301812"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "7px",
            fontSize: "14px",
            fontWeight: 500,
            color: "var(--color-muted)",
            textDecoration: "none",
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.63 3.38 2 2 0 0 1 3.6 1.21h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.85a16 16 0 0 0 6.29 6.29l.96-.96a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
          </svg>
          +1 (647) 830-1812
        </a>
      </div>

      {/* Footer note */}
      <p
        className="animate-fade-up delay-300"
        style={{
          fontSize: "14px",
          color: "var(--color-text)",
          fontWeight: 500,
          maxWidth: "340px",
          lineHeight: 1.6,
        }}
      >
        Have a past order question or a catering request? We would love to help.
      </p>

      <ContactModal isOpen={contactOpen} onClose={() => setContactOpen(false)} />
    </div>
  );
}
