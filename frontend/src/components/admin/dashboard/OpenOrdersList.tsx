"use client";

import { useState } from "react";
import Link from "next/link";
import DashboardCard from "./DashboardCard";
import StatBadge from "./StatBadge";
import { Order } from "@/lib/dashboardUtils";

interface OpenOrdersListProps {
  orders: Order[];
  currency: string;
}

const PAGE_SIZE = 6;

function fmt(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(amount);
}

export default function OpenOrdersList({ orders, currency }: OpenOrdersListProps) {
  const [page, setPage] = useState(1);
  const displayed = orders.slice(0, page * PAGE_SIZE);
  const hasMore = displayed.length < orders.length;

  return (
    <DashboardCard
      title="Pending Orders"
      subtitle="Awaiting confirmation"
      action={<StatBadge value={orders.length} label="pending" />}
    >
      {orders.length === 0 ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            flex: 1,
            gap: 8,
          }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-sage)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <p style={{ fontSize: 13, color: "var(--color-muted)", margin: 0 }}>All clear</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
            {displayed.map((order) => (
              <Link
                key={order.id}
                href={`/admin/orders/${order.id}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 10px",
                  borderRadius: 12,
                  textDecoration: "none",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.background = "var(--color-cream)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
                }}
              >
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
                    {order.name}
                  </p>
                  <p
                    style={{
                      fontSize: 11,
                      color: "var(--color-muted)",
                      margin: "2px 0 0",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {order.pickup_location} · {order.pickup_time_slot}
                  </p>
                </div>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "var(--color-forest)",
                    flexShrink: 0,
                  }}
                >
                  {fmt(order.total_price, currency)}
                </span>
              </Link>
            ))}
          </div>

          {hasMore && (
            <button
              onClick={() => setPage((p) => p + 1)}
              style={{
                marginTop: 8,
                width: "100%",
                padding: "8px",
                background: "var(--color-cream)",
                border: "1px solid var(--color-border)",
                borderRadius: 12,
                fontSize: 12,
                color: "var(--color-muted)",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = "var(--color-forest)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = "var(--color-muted)";
              }}
            >
              Show {Math.min(PAGE_SIZE, orders.length - displayed.length)} more
            </button>
          )}
        </div>
      )}
    </DashboardCard>
  );
}
