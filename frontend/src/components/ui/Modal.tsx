"use client";

import { useEffect } from "react";
import ReactDOM from "react-dom";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  variant?: "default" | "danger";
}

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  actions,
  variant = "default",
}: ModalProps) {
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const titleColor = variant === "danger" ? "#991b1b" : "var(--color-forest)";

  return ReactDOM.createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
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
          maxWidth: "440px",
          width: "100%",
          padding: "32px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2
          className="text-xl font-bold mb-3"
          style={{ color: titleColor, fontFamily: "var(--font-serif)" }}
        >
          {title}
        </h2>
        <div className="text-sm mb-6" style={{ color: "var(--color-muted)" }}>
          {children}
        </div>
        {actions && (
          <div className="flex items-center justify-end gap-3">
            {actions}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
