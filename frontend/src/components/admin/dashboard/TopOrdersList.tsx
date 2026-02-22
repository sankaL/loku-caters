"use client";

import DashboardCard from "./DashboardCard";
import StatBadge from "./StatBadge";

interface CustomerRow {
  name: string;
  email: string;
  totalSpend: number;
  orderCount: number;
}

interface TopOrdersListProps {
  data: CustomerRow[];
  currency: string;
}

function fmt(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(amount);
}

export default function TopOrdersList({ data, currency }: TopOrdersListProps) {
  const maxSpend = data[0]?.totalSpend ?? 1;
  const unique = data.length;

  return (
    <DashboardCard
      title="Top Customers"
      subtitle="Ranked by total spend"
      action={<StatBadge value={unique} label="customers" />}
    >
      {data.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--color-muted)", textAlign: "center", padding: "24px 0" }}>
          No orders yet
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {data.map((row, i) => (
            <div key={row.email} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {/* Rank badge */}
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: i === 0 ? "var(--color-forest)" : "var(--color-sage)",
                  color: "white",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {i + 1}
              </div>

              {/* Name + bar */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--color-text)",
                    margin: 0,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {row.name}
                </p>
                <p
                  style={{
                    fontSize: 11,
                    color: "var(--color-muted)",
                    margin: "1px 0 4px",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {row.email}
                </p>
                {/* Mini bar */}
                <div
                  style={{
                    height: 4,
                    borderRadius: 4,
                    background: "var(--color-cream)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${(row.totalSpend / maxSpend) * 100}%`,
                      background: i === 0 ? "var(--color-forest)" : "var(--color-sage)",
                      borderRadius: 4,
                      transition: "width 0.4s ease",
                    }}
                  />
                </div>
              </div>

              {/* Spend + count */}
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "var(--color-forest)",
                    margin: 0,
                  }}
                >
                  {fmt(row.totalSpend, currency)}
                </p>
                <p style={{ fontSize: 11, color: "var(--color-muted)", margin: "1px 0 0" }}>
                  {row.orderCount} {row.orderCount === 1 ? "order" : "orders"}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardCard>
  );
}
