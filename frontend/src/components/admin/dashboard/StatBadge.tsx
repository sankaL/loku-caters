"use client";

interface StatBadgeProps {
  label: string;
  value: string | number;
}

export default function StatBadge({ label, value }: StatBadgeProps) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: "var(--color-cream)",
        border: "1px solid var(--color-border)",
        borderRadius: 20,
        padding: "4px 12px",
        fontSize: 12,
      }}
    >
      <span style={{ fontWeight: 600, color: "var(--color-forest)" }}>{value}</span>
      <span style={{ color: "var(--color-muted)" }}>{label}</span>
    </div>
  );
}
