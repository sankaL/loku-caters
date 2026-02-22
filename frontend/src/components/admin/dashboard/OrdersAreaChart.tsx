"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import DashboardCard from "./DashboardCard";

interface DataPoint {
  date: string;
  label: string;
  count: number;
  revenue: number;
}

type Range = "7d" | "30d" | "1y";

interface OrdersAreaChartProps {
  data: DataPoint[];
  range: Range;
  onRangeChange: (r: Range) => void;
  currency: string;
}

function fmt(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(amount);
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: { value: number; payload: DataPoint }[];
  label?: string;
  currency: string;
}

function CustomTooltip({ active, payload, currency }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div
      style={{
        background: "white",
        border: "1px solid var(--color-border)",
        borderRadius: 12,
        padding: "10px 14px",
        fontSize: 12,
        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
      }}
    >
      <p style={{ fontWeight: 700, color: "var(--color-forest)", margin: "0 0 6px" }}>
        {point.label}
      </p>
      <p style={{ margin: "0 0 2px", color: "var(--color-text)" }}>
        <span style={{ fontWeight: 600 }}>{point.count}</span> orders
      </p>
      <p style={{ margin: 0, color: "var(--color-muted)" }}>{fmt(point.revenue, currency)}</p>
    </div>
  );
}

const dropdownStyle: React.CSSProperties = {
  appearance: "none",
  WebkitAppearance: "none",
  background: "white",
  color: "var(--color-text)",
  border: "1px solid var(--color-border)",
  borderRadius: "0.75rem",
  padding: "0.375rem 1.75rem 0.375rem 0.625rem",
  fontSize: "0.8rem",
  cursor: "pointer",
  outline: "none",
};

function SelectChevron() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        position: "absolute",
        right: 8,
        top: "50%",
        transform: "translateY(-50%)",
        pointerEvents: "none",
        color: "var(--color-muted)",
      }}
    >
      <path d="M5 8l5 5 5-5" />
    </svg>
  );
}

// Determine x-axis tick interval to avoid crowding
function tickInterval(range: Range, total: number): number {
  if (range === "1y") return 0; // show all 12 months
  if (range === "7d") return 0; // show all 7 days
  // 30d: show every 5 days
  return 4;
}

export default function OrdersAreaChart({ data, range, onRangeChange, currency }: OrdersAreaChartProps) {
  const interval = tickInterval(range, data.length);

  const rangeAction = (
    <div style={{ position: "relative", display: "inline-block" }}>
      <select
        value={range}
        onChange={(e) => onRangeChange(e.target.value as Range)}
        style={dropdownStyle}
      >
        <option value="7d">Last 7 days</option>
        <option value="30d">Last 30 days</option>
        <option value="1y">Last year</option>
      </select>
      <SelectChevron />
    </div>
  );

  return (
    <DashboardCard
      title="Orders Over Time"
      subtitle="Daily order volume"
      action={rangeAction}
    >
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#12270F" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#12270F" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--color-border)"
            vertical={false}
          />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "var(--color-muted)" } as React.SVGProps<SVGTextElement>}
            axisLine={false}
            tickLine={false}
            interval={interval}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11, fill: "var(--color-muted)" } as React.SVGProps<SVGTextElement>}
            axisLine={false}
            tickLine={false}
            width={32}
          />
          <Tooltip content={<CustomTooltip currency={currency} />} />
          <Area
            type="monotone"
            dataKey="count"
            stroke="#12270F"
            strokeWidth={2}
            fill="url(#areaGradient)"
            activeDot={{ r: 5, fill: "#729152", stroke: "white", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </DashboardCard>
  );
}
