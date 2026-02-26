"use client";

import {
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import DashboardCard from "./DashboardCard";

interface SlotData {
  slot: string;
  shortLabel: string;
  count: number;
}

interface TimeSlotRadialChartProps {
  data: SlotData[];
}

const FILLS = ["#12270F", "#729152", "#8B5E3C", "#A09070", "#4A6741", "#5C7A53"];

interface CustomTooltipProps {
  active?: boolean;
  payload?: { payload: SlotData & { fill: string } }[];
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
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
      <p style={{ fontWeight: 700, color: "var(--color-forest)", margin: "0 0 2px" }}>{item.slot}</p>
      <p style={{ margin: 0, color: "var(--color-text)" }}>{item.count} orders</p>
    </div>
  );
}

export default function TimeSlotRadialChart({ data }: TimeSlotRadialChartProps) {
  if (data.length === 0) {
    return (
      <DashboardCard title="Orders by Time Slot" subtitle="Distribution">
        <p style={{ fontSize: 13, color: "var(--color-muted)", textAlign: "center", padding: "40px 0" }}>
          No data
        </p>
      </DashboardCard>
    );
  }

  const max = Math.max(...data.map((d) => d.count), 1);
  // Recharts RadialBarChart needs a "name" field for each bar
  const chartData = data.map((d, i) => ({
    ...d,
    fill: FILLS[i % FILLS.length],
    name: d.shortLabel,
  }));

  return (
    <DashboardCard title="Orders by Time Slot" subtitle="Distribution">
      <div style={{ height: 120 }}>
        <ResponsiveContainer width="100%" height={120}>
          <RadialBarChart
            innerRadius="20%"
            outerRadius="90%"
            data={chartData}
            startAngle={90}
            endAngle={-270}
            barSize={10}
          >
            <PolarAngleAxis type="number" domain={[0, max]} angleAxisId={0} tick={false} />
            <RadialBar
              background={{ fill: "var(--color-cream)" }}
              dataKey="count"
              angleAxisId={0}
              cornerRadius={5}
            />
            <Tooltip content={<CustomTooltip />} />
          </RadialBarChart>
        </ResponsiveContainer>
      </div>

    </DashboardCard>
  );
}
