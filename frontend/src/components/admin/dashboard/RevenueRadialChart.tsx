"use client";

import {
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
  ResponsiveContainer,
} from "recharts";
import DashboardCard from "./DashboardCard";

interface RevenueRadialChartProps {
  totalRevenue: number;
  currency: string;
}

function fmt(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function ceiling(val: number): number {
  if (val === 0) return 500;
  const magnitude = Math.pow(10, Math.floor(Math.log10(val)));
  return Math.ceil(val / magnitude) * magnitude;
}

export default function RevenueRadialChart({ totalRevenue, currency }: RevenueRadialChartProps) {
  const max = ceiling(totalRevenue || 100);
  const data = [{ name: "Revenue", value: totalRevenue }];

  return (
    <DashboardCard title="Total Revenue" subtitle="Active orders only">
      <div style={{ position: "relative", height: 120 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            innerRadius="60%"
            outerRadius="90%"
            startAngle={220}
            endAngle={-40}
            data={data}
            barSize={14}
          >
            <PolarAngleAxis type="number" domain={[0, max]} angleAxisId={0} tick={false} />
            <RadialBar
              background={{ fill: "var(--color-cream)" }}
              dataKey="value"
              angleAxisId={0}
              cornerRadius={8}
              fill="#729152"
            />
          </RadialBarChart>
        </ResponsiveContainer>
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
              fontSize: 20,
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
    </DashboardCard>
  );
}
