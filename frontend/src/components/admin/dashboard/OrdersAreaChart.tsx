"use client";

import * as React from "react";
import {
  AreaChart,
  Area,
  XAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { RevenueTimePoint } from "@/lib/dashboardUtils";

type Range = "7d" | "30d" | "1y";

interface RevenueOverTimeChartProps {
  data: RevenueTimePoint[];
  topItems: { itemId: string; itemName: string }[];
  range: Range;
  onRangeChange: (r: Range) => void;
  currency: string;
}

// Index 0 = bottom of stack (largest item, darkest), last index = top (lightest)
const AREA_COLORS = ["#12270F", "#3A5C28", "#729152", "#4A7C59", "#9CB070", "#C5D9A3"];

function fmt(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

// ---------------------------------------------------------------------------
// Custom tooltip
// ---------------------------------------------------------------------------
interface TooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ dataKey: string; value: number }>;
  label?: string | number;
  currency: string;
  topItems: { itemId: string; itemName: string }[];
  hasOther: boolean;
}

function CustomTooltip({ active, payload, label, currency, topItems, hasOther }: TooltipProps) {
  if (!active || !payload?.length) return null;

  const valMap = new Map<string, number>();
  for (const p of payload) valMap.set(p.dataKey, p.value);

  const total =
    topItems.reduce((s, item) => s + (valMap.get(item.itemId) ?? 0), 0) +
    (hasOther ? (valMap.get("__other__") ?? 0) : 0);

  return (
    <div
      style={{
        background: "white",
        border: "1px solid var(--color-border)",
        borderRadius: 12,
        padding: "10px 14px",
        fontSize: 12,
        boxShadow: "0 4px 16px rgba(18,39,15,0.10)",
        minWidth: 170,
      }}
    >
      {label != null && (
        <p style={{ margin: "0 0 8px", fontWeight: 600, color: "var(--color-muted)", fontSize: 11, letterSpacing: "0.04em", textTransform: "uppercase" }}>
          {String(label)}
        </p>
      )}
      <p style={{ margin: "0 0 6px", fontWeight: 700, color: "var(--color-forest)", fontSize: 14 }}>
        {fmt(total, currency)}
      </p>
      <div style={{ borderTop: "1px solid var(--color-border)", marginBottom: 6, marginTop: 6 }} />
      {/* Show items top-to-bottom = lightest first (top of stack) so order matches visual */}
      {[...topItems].reverse().map((item, i) => {
        const colorIdx = topItems.length - 1 - i;
        return (
          <div key={item.itemId} style={{ display: "flex", alignItems: "center", gap: 7, margin: "3px 0", color: "var(--color-text)" }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: AREA_COLORS[colorIdx], flexShrink: 0, display: "inline-block" }} />
            <span style={{ flex: 1, color: "var(--color-muted)" }}>{item.itemName}</span>
            <span style={{ fontWeight: 600 }}>{fmt(valMap.get(item.itemId) ?? 0, currency)}</span>
          </div>
        );
      })}
      {hasOther && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, margin: "3px 0", color: "var(--color-text)" }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: AREA_COLORS[5], flexShrink: 0, display: "inline-block" }} />
          <span style={{ flex: 1, color: "var(--color-muted)" }}>Other</span>
          <span style={{ fontWeight: 600 }}>{fmt(valMap.get("__other__") ?? 0, currency)}</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom legend
// ---------------------------------------------------------------------------
function ChartLegend({
  topItems,
  hasOther,
}: {
  topItems: { itemId: string; itemName: string }[];
  hasOther: boolean;
}) {
  const entries = [
    ...topItems.map((item, i) => ({ label: item.itemName, color: AREA_COLORS[i] })),
    ...(hasOther ? [{ label: "Other", color: AREA_COLORS[5] }] : []),
  ];
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", justifyContent: "center", marginTop: 12 }}>
      {entries.map(({ label, color }) => (
        <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--color-muted)" }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0, display: "inline-block" }} />
          {label}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// X-axis tick interval
// ---------------------------------------------------------------------------
function tickInterval(range: Range): number {
  if (range === "1y") return 0;
  if (range === "7d") return 0;
  return 4; // 30d: every 5th label
}

// ---------------------------------------------------------------------------
// Main chart
// ---------------------------------------------------------------------------
export default function OrdersAreaChart({
  data,
  topItems,
  range,
  onRangeChange,
  currency,
}: RevenueOverTimeChartProps) {
  // Compute "Other" revenue per point (total minus top-item sum)
  const dataWithOther = React.useMemo(() => {
    return data.map((point) => {
      const itemSum = topItems.reduce((s, item) => s + ((point[item.itemId] as number) ?? 0), 0);
      return { ...point, __other__: Math.max(0, point.totalRevenue - itemSum) };
    });
  }, [data, topItems]);

  const hasOther = dataWithOther.some((p) => p.__other__ > 0);
  const interval = tickInterval(range);

  return (
    <div
      style={{
        background: "white",
        border: "1px solid var(--color-border)",
        borderRadius: 24,
        overflow: "hidden",
      }}
    >
      {/* Header - matches shadcn CardHeader with border-b */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "16px 24px",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: "var(--font-serif)", fontSize: 15, fontWeight: 600, color: "var(--color-forest)", margin: 0 }}>
            Revenue Over Time
          </p>
          <p style={{ fontSize: 12, color: "var(--color-muted)", margin: "2px 0 0" }}>
            Total and per-item revenue
          </p>
        </div>
        <select
          value={range}
          onChange={(e) => onRangeChange(e.target.value as Range)}
          style={{
            background: "white",
            color: "var(--color-text)",
            border: "1px solid var(--color-border)",
            borderRadius: "0.75rem",
            padding: "0.375rem 2.5rem 0.375rem 0.75rem",
            fontSize: "0.8rem",
            cursor: "pointer",
            outline: "none",
            flexShrink: 0,
          }}
        >
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="1y">Last year</option>
        </select>
      </div>

      {/* Chart body */}
      <div style={{ padding: "16px 8px 4px" }}>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={dataWithOther} margin={{ top: 4, right: 12, left: 12, bottom: 0 }}>
            <defs>
              {topItems.map((item, i) => (
                <linearGradient key={item.itemId} id={`fill_${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={AREA_COLORS[i]} stopOpacity={0.85} />
                  <stop offset="95%" stopColor={AREA_COLORS[i]} stopOpacity={0.1} />
                </linearGradient>
              ))}
              {hasOther && (
                <linearGradient id="fill_other" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={AREA_COLORS[5]} stopOpacity={0.85} />
                  <stop offset="95%" stopColor={AREA_COLORS[5]} stopOpacity={0.1} />
                </linearGradient>
              )}
            </defs>

            <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 3" />

            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11, fill: "var(--color-muted)" } as React.SVGProps<SVGTextElement>}
              tickMargin={8}
              interval={interval}
            />

            <Tooltip
              cursor={{ stroke: "var(--color-border)", strokeWidth: 1 }}
              content={(props) => (
                <CustomTooltip
                  {...props}
                  currency={currency}
                  topItems={topItems}
                  hasOther={hasOther}
                />
              )}
            />

            {/* Render topItems in order: index 0 = bottom of stack (largest, darkest) */}
            {topItems.map((item, i) => (
              <Area
                key={item.itemId}
                type="monotone"
                dataKey={item.itemId}
                stackId="a"
                stroke={AREA_COLORS[i]}
                strokeWidth={1.5}
                fill={`url(#fill_${i})`}
              />
            ))}

            {hasOther && (
              <Area
                type="monotone"
                dataKey="__other__"
                stackId="a"
                stroke={AREA_COLORS[5]}
                strokeWidth={1.5}
                fill="url(#fill_other)"
              />
            )}
          </AreaChart>
        </ResponsiveContainer>

        <ChartLegend topItems={topItems} hasOther={hasOther} />
      </div>
    </div>
  );
}
