"use client";

import type { CSSProperties, ReactNode } from "react";

const COMPACT_METRIC_MIN_WIDTH = 120;
const COMPACT_METRIC_GAP = 14;
const COMPACT_METRIC_RADIUS = 20;

interface CompactMetricRailProps {
  children: ReactNode;
  gap?: number;
  style?: CSSProperties;
}

export function CompactMetricRail({ children, gap = COMPACT_METRIC_GAP, style }: CompactMetricRailProps) {
  return (
    <div
      style={{
        overflowX: "auto",
        overflowY: "hidden",
        WebkitOverflowScrolling: "touch",
        scrollSnapType: "x proximity",
        paddingBottom: 4,
        marginBottom: 24,
        ...style,
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "nowrap",
          alignItems: "stretch",
          gap,
        }}
      >
        {children}
      </div>
    </div>
  );
}

interface CompactMetricCardProps {
  children: ReactNode;
  minWidth?: number;
  onClick?: () => void;
  selected?: boolean;
  style?: CSSProperties;
  variant?: "light" | "dark";
}

export function CompactMetricCard({
  children,
  minWidth = COMPACT_METRIC_MIN_WIDTH,
  onClick,
  selected = false,
  style,
  variant = "light",
}: CompactMetricCardProps) {
  const sharedStyle: CSSProperties = {
    flex: `1 1 ${minWidth}px`,
    minWidth,
    width: "100%",
    boxSizing: "border-box",
    borderRadius: COMPACT_METRIC_RADIUS,
    padding: "clamp(14px, 1.4vw, 18px)",
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-start",
    textAlign: "left",
    transition: "border-color 0.15s, transform 0.15s",
    scrollSnapAlign: "start",
  };

  if (variant === "dark") {
    const darkStyle: CSSProperties = {
      ...sharedStyle,
      background: "var(--color-forest)",
      color: "var(--color-cream)",
      border: "1px solid rgba(255,255,255,0.08)",
    };

    if (onClick) {
      return (
        <button
          type="button"
          onClick={onClick}
          aria-pressed={selected}
          style={{
            ...darkStyle,
            cursor: "pointer",
            appearance: "none",
            border: "1px solid rgba(255,255,255,0.08)",
            ...style,
          }}
        >
          {children}
        </button>
      );
    }

    return <div style={{ ...darkStyle, ...style }}>{children}</div>;
  }

  const lightStyle: CSSProperties = {
    ...sharedStyle,
    background: "white",
    color: "var(--color-text)",
    border: `2px solid ${selected ? "var(--color-sage)" : "var(--color-border)"}`,
  };

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={selected}
        style={{
          ...lightStyle,
          cursor: "pointer",
          appearance: "none",
          ...style,
        }}
      >
        {children}
      </button>
    );
  }

  return <div style={{ ...lightStyle, ...style }}>{children}</div>;
}
