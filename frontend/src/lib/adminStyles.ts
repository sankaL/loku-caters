import type { CSSProperties } from "react";

export const ADMIN_BUTTON_BASE_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 14px",
  borderRadius: 10,
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
  border: "1px solid var(--color-border)",
  background: "white",
  color: "var(--color-text)",
};

export const ADMIN_BUTTON_DANGER_STYLE: CSSProperties = {
  ...ADMIN_BUTTON_BASE_STYLE,
  border: "1px solid var(--color-error-border)",
  background: "var(--color-error-bg)",
  color: "var(--color-error-text)",
};

export const ADMIN_BUTTON_PRIMARY_STYLE: CSSProperties = {
  ...ADMIN_BUTTON_BASE_STYLE,
  border: "none",
  background: "var(--color-forest)",
  color: "white",
};
