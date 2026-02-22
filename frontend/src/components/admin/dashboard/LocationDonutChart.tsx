"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import DashboardCard from "./DashboardCard";

interface LocationData {
  location: string;
  count: number;
  revenue: number;
}

interface LocationDonutChartProps {
  data: LocationData[];
  currency: string;
}

const FILLS = ["#12270F", "#729152", "#8B5E3C", "#A09070"];

function fmt(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(amount);
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: { name: string; value: number; payload: LocationData }[];
  currency: string;
}

function CustomTooltip({ active, payload, currency }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <div
      style={{
        background: "white",
        border: "1px solid var(--color-border)",
        borderRadius: 12,
        padding: "8px 12px",
        fontSize: 12,
      }}
    >
      <p style={{ fontWeight: 700, color: "var(--color-forest)", margin: "0 0 4px" }}>
        {item.location}
      </p>
      <p style={{ margin: "0 0 2px", color: "var(--color-text)" }}>{item.count} orders</p>
      <p style={{ margin: 0, color: "var(--color-muted)" }}>{fmt(item.revenue, currency)}</p>
    </div>
  );
}

export default function LocationDonutChart({ data, currency }: LocationDonutChartProps) {
  const total = data.reduce((s, d) => s + d.count, 0);

  return (
    <DashboardCard title="Orders by Location" subtitle="All time">
      <div style={{ position: "relative", height: 120 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="count"
              nameKey="location"
              cx="50%"
              cy="50%"
              innerRadius="55%"
              outerRadius="85%"
              paddingAngle={2}
              strokeWidth={0}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={FILLS[i % FILLS.length]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip currency={currency} />} />
          </PieChart>
        </ResponsiveContainer>
        {/* Center label */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 22,
              fontWeight: 700,
              color: "var(--color-forest)",
              lineHeight: 1,
            }}
          >
            {total}
          </span>
          <span style={{ fontSize: 10, color: "var(--color-muted)", marginTop: 3 }}>orders</span>
        </div>
      </div>

    </DashboardCard>
  );
}
