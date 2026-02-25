"use client";
/* eslint-disable @next/next/no-img-element */

import { useState, useEffect } from "react";
import ReactDOM from "react-dom";

interface HeroSectionProps {
  eventDate: string;
  heroHeader: string;
  heroHeaderSage?: string;
  heroSubheader: string;
  promoDetails?: string | null;
  tooltipEnabled?: boolean;
  tooltipHeader?: string | null;
  tooltipBody?: string | null;
  tooltipImagePath?: string | null;
  heroSideImagePath?: string | null;
  onFeedbackClick?: () => void;
}

interface TooltipModalProps {
  title: string;
  body: string;
  imagePath?: string | null;
  onClose: () => void;
}

function TooltipModal({ title, body, imagePath, onClose }: TooltipModalProps) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return ReactDOM.createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(18,39,15,0.6)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "white",
          borderRadius: "24px",
          border: "1px solid var(--color-border)",
          maxWidth: "680px",
          width: "100%",
          overflow: "hidden",
          boxShadow: "0 24px 64px rgba(18,39,15,0.25)",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 24px",
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          <div>
            <p
              style={{
                margin: 0,
                fontSize: "11px",
                letterSpacing: "2px",
                textTransform: "uppercase",
                color: "var(--color-sage)",
                fontWeight: 600,
                marginBottom: "4px",
              }}
            >
              Event Tooltip
            </p>
            <h2
              style={{
                margin: 0,
                fontSize: "22px",
                fontWeight: 700,
                color: "var(--color-forest)",
                fontFamily: "var(--font-serif)",
              }}
            >
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              border: "1px solid var(--color-border)",
              background: "var(--color-cream)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              flexShrink: 0,
            }}
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {imagePath && (
          <img
            src={imagePath}
            alt={title}
            style={{ display: "block", width: "100%", height: "auto" }}
          />
        )}

        <div
          style={{
            padding: "16px 24px",
            background: "var(--color-cream)",
            borderTop: imagePath ? "1px solid var(--color-border)" : "none",
          }}
        >
          <p style={{ margin: 0, fontSize: "13px", color: "var(--color-muted)", lineHeight: 1.6 }}>
            {body}
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function HeroSection({
  eventDate,
  heroHeader,
  heroHeaderSage,
  heroSubheader,
  promoDetails,
  tooltipEnabled = false,
  tooltipHeader,
  tooltipBody,
  tooltipImagePath,
  heroSideImagePath,
  onFeedbackClick,
}: HeroSectionProps) {
  const [modalOpen, setModalOpen] = useState(false);

  const canShowTooltip = Boolean(tooltipEnabled && tooltipHeader && tooltipBody);

  return (
    <section className="w-full max-w-5xl mx-auto px-6 pt-4 pb-12">
      <div
        className="rounded-3xl overflow-hidden relative"
        style={{ background: "var(--color-forest)" }}
      >
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage:
              "radial-gradient(circle at 80% 50%, #729152 0%, transparent 60%)",
          }}
        />

        {heroSideImagePath && (
          <img
            src={heroSideImagePath}
            alt=""
            aria-hidden="true"
            className="hidden md:block absolute right-0 inset-y-0 h-full w-auto max-w-[50%] object-contain object-right-bottom pointer-events-none select-none opacity-80"
            style={{
              maskImage: "linear-gradient(to right, transparent 0%, black 45%)",
              WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 45%)",
            }}
          />
        )}

        <div className="relative px-8 py-10 md:px-14 md:py-16">
          {eventDate && (
            <p
              className="text-xs font-semibold tracking-widest uppercase mb-4 animate-fade-up"
              style={{ color: "var(--color-sage)" }}
            >
              {eventDate}
            </p>
          )}

          <h1
            className="text-4xl md:text-5xl font-bold leading-tight mb-4 animate-fade-up delay-100"
            style={{ color: "var(--color-cream)", fontFamily: "var(--font-serif)" }}
          >
            {heroHeader || "We're Making"}
            {heroHeaderSage && (
              <>
                <br />
                <span style={{ color: "var(--color-sage)" }}>{heroHeaderSage}</span>
              </>
            )}
          </h1>

          {canShowTooltip && (
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="animate-fade-up delay-150"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "5px 12px",
                borderRadius: "999px",
                border: "1px solid rgba(114,145,82,0.45)",
                background: "rgba(114,145,82,0.12)",
                fontSize: "12px",
                fontWeight: 600,
                color: "var(--color-sage)",
                cursor: "pointer",
                marginBottom: "16px",
                transition: "background 0.15s, border-color 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(114,145,82,0.22)";
                e.currentTarget.style.borderColor = "rgba(114,145,82,0.75)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(114,145,82,0.12)";
                e.currentTarget.style.borderColor = "rgba(114,145,82,0.45)";
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {tooltipHeader}
            </button>
          )}

          <p
            className="text-base md:text-lg leading-relaxed mb-2 max-w-xl animate-fade-up delay-200"
            style={{ color: "rgba(247,245,240,0.85)" }}
          >
            {heroSubheader || "We're making a fresh batch and we'd love for you to have some."}
          </p>

          {promoDetails && (
            <p
              className="text-sm mb-4 max-w-xl animate-fade-up delay-300"
              style={{ color: "var(--color-sage)" }}
            >
              {promoDetails}
            </p>
          )}

          <p
            className="text-sm animate-fade-up delay-300"
            style={{ color: "rgba(247,245,240,0.65)" }}
          >
            {"Scroll down to pre-order and we'll confirm via email before pickup."}
          </p>

          {onFeedbackClick && (
            <button
              type="button"
              onClick={onFeedbackClick}
              className="animate-fade-up delay-300"
              style={{
                marginTop: "16px",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "7px 14px",
                borderRadius: "999px",
                border: "1px solid var(--color-bark)",
                background: "var(--color-bark)",
                fontSize: "12px",
                color: "white",
                cursor: "pointer",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#7a5234";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "var(--color-bark)";
              }}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {"Can't join this batch?"}
            </button>
          )}
        </div>
      </div>

      {modalOpen && canShowTooltip && tooltipHeader && tooltipBody && (
        <TooltipModal
          title={tooltipHeader}
          body={tooltipBody}
          imagePath={tooltipImagePath}
          onClose={() => setModalOpen(false)}
        />
      )}
    </section>
  );
}
