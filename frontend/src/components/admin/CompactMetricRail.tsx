"use client";

import type { CSSProperties, ReactNode } from "react";

const COMPACT_METRIC_MIN_WIDTH = 120;
const COMPACT_METRIC_GAP = 14;
const COMPACT_METRIC_RADIUS = 24;

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
      border: "1px solid color-mix(in srgb, var(--color-cream) 8%, transparent)",
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
            border: "1px solid color-mix(in srgb, var(--color-cream) 8%, transparent)",
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
    border: "1px solid var(--color-border)",
    boxShadow: selected ? "0 0 0 1px var(--color-sage)" : "none",
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

export function CompactMetricTotalCard({ label, value }: { label: string; value: ReactNode }) {
  return (
    <CompactMetricCard variant="dark">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--color-sage)" }}>{label}</p>
      <p className="font-bold leading-none" style={{ fontSize: "clamp(24px, 2vw, 28px)", color: "var(--color-cream)", fontFamily: "var(--font-serif)" }}>{value}</p>
    </CompactMetricCard>
  );
}

export function CompactMetricSkeletonRail({ count }: { count: number }) {
  return (
    <CompactMetricRail>
      {Array.from({ length: count }, (_, index) => (
        <CompactMetricCard key={index} variant={index === 0 ? "dark" : "light"}>
          <div className="h-2.5 w-3/5 animate-pulse rounded-full" style={{ background: "var(--color-border)" }} />
          <div className="mt-3 h-6 w-2/5 animate-pulse rounded-full" style={{ background: "var(--color-border)" }} />
        </CompactMetricCard>
      ))}
    </CompactMetricRail>
  );
}
