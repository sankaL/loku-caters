"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from "recharts";
import DashboardCard from "./DashboardCard";
import { ItemRevenueRow } from "@/lib/dashboardUtils";

interface RevenueRadialChartProps {
  data: ItemRevenueRow[];
  currency: string;
}

function fmt(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

const FILLS = ["#12270F", "#729152", "#8B5E3C", "#A09070", "#4A6741"];

type Slice = {
  id: string;
  name: string;
  fullName: string;
  value: number;
  quantity: number;
  orders: number;
};

function shortId(id: string): string {
  const v = (id || "").trim();
  if (!v) return "";
  if (v.length <= 14) return v;
  return `${v.slice(0, 11)}...`;
}

function buildSlices(rows: ItemRevenueRow[], maxSlices = 5): Slice[] {
  const sorted = [...rows]
    .filter((r) => r.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue);

  const nameCounts = sorted.reduce((acc, r) => {
    const base = (r.itemName || "").trim() || r.itemId;
    acc.set(base, (acc.get(base) ?? 0) + 1);
    return acc;
  }, new Map<string, number>());

  const displayNameFor = (r: ItemRevenueRow): { name: string; fullName: string } => {
    const base = (r.itemName || "").trim() || r.itemId;
    const fullName = base;
    const count = nameCounts.get(base) ?? 0;
    if (count <= 1) return { name: base, fullName };
    const suffix = shortId(r.itemId);
    return { name: suffix ? `${base} (${suffix})` : base, fullName };
  };

  if (sorted.length <= maxSlices) {
    return sorted.map((r) => ({
      id: r.itemId,
      ...displayNameFor(r),
      value: r.revenue,
      quantity: r.quantity,
      orders: r.orderCount,
    }));
  }

  const keep = sorted.slice(0, Math.max(1, maxSlices - 1));
  const rest = sorted.slice(keep.length);
  const other = rest.reduce(
    (acc, r) => {
      acc.value += r.revenue;
      acc.quantity += r.quantity;
      acc.orders += r.orderCount;
      return acc;
    },
    { id: "__other__", name: "Other", fullName: "Other", value: 0, quantity: 0, orders: 0 } as Slice
  );

  return [
    ...keep.map((r) => ({
      id: r.itemId,
      ...displayNameFor(r),
      value: r.revenue,
      quantity: r.quantity,
      orders: r.orderCount,
    })),
    other,
  ];
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: { name: string; value: number; payload: Slice }[];
  currency: string;
  total: number;
}

function CustomTooltip({ active, payload, currency, total }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;

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
        {item.fullName}
      </p>
      <p style={{ margin: "0 0 2px", color: "var(--color-text)" }}>{fmt(item.value, currency)} ({pct}%)</p>
      <p style={{ margin: 0, color: "var(--color-muted)" }}>{item.orders} orders, {item.quantity} qty</p>
    </div>
  );
}

export default function RevenueRadialChart({ data, currency }: RevenueRadialChartProps) {
  const totalRevenue = data.reduce((s, d) => s + d.revenue, 0);
  const slices = buildSlices(data);

  return (
    <DashboardCard title="Total revenue by item" subtitle="Excludes no-shows and cancellations">
      {slices.length === 0 || totalRevenue <= 0 ? (
        <p style={{ fontSize: 13, color: "var(--color-muted)", textAlign: "center", padding: "40px 0" }}>
          No data
        </p>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ position: "relative", height: 120, width: 150, flexShrink: 0 }}>
            <PieChart width={150} height={120}>
              <Pie
                data={slices}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius="60%"
                outerRadius="90%"
                startAngle={220}
                endAngle={-40}
                paddingAngle={2}
                strokeWidth={0}
              >
                {slices.map((s, i) => (
                  <Cell key={s.id} fill={FILLS[i % FILLS.length]} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip currency={currency} total={totalRevenue} />} />
            </PieChart>

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
                  fontSize: 18,
                  fontWeight: 700,
                  color: "var(--color-forest)",
                  lineHeight: 1,
                }}
              >
                {fmt(totalRevenue, currency)}
              </span>
              <span style={{ fontSize: 10, color: "var(--color-muted)", marginTop: 4 }}>total</span>
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {slices.map((s, i) => {
                const pct = totalRevenue > 0 ? Math.round((s.value / totalRevenue) * 100) : 0;
                return (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 999,
                          background: FILLS[i % FILLS.length],
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "var(--color-text)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                        title={s.fullName}
                      >
                        {s.name}
                      </span>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--color-forest)" }}>
                        {fmt(s.value, currency)}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--color-muted)", marginLeft: 8 }}>{pct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </DashboardCard>
  );
}
