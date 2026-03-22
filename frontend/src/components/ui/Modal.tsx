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
  size?: "md" | "lg" | "xl";
}

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  actions,
  variant = "default",
  size = "md",
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
  const maxWidth = size === "xl" ? "960px" : size === "lg" ? "720px" : "440px";

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
        className="p-6 md:p-8"
        style={{
          background: "white",
          borderRadius: "24px",
          border: "1px solid var(--color-border)",
          maxWidth,
          width: "100%",
          maxHeight: "calc(100vh - 32px)",
          overflowY: "auto",
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
