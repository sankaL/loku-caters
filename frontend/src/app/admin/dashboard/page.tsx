"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { API_URL, CURRENCY, fetchEventConfig } from "@/config/event";
import { getAdminToken } from "@/lib/auth";
import {
  Order,
  KPIData,
  computeRevenue,
  computeItemRevenueBreakdown,
  computeLocationBreakdown,
  computeTimeSlotBreakdown,
  computeTopCustomers,
  filterOpenOrders,
  computeOrdersOverTime,
  computeKPIs,
} from "@/lib/dashboardUtils";
import RevenueRadialChart from "@/components/admin/dashboard/RevenueRadialChart";
import LocationDonutChart from "@/components/admin/dashboard/LocationDonutChart";
import TimeSlotRadialChart from "@/components/admin/dashboard/TimeSlotRadialChart";
import TopOrdersList from "@/components/admin/dashboard/TopOrdersList";
import OpenOrdersList from "@/components/admin/dashboard/OpenOrdersList";
import OrdersAreaChart from "@/components/admin/dashboard/OrdersAreaChart";

type Range = "7d" | "30d" | "1y";

// ---------------------------------------------------------------------------
// Skeleton helpers
// ---------------------------------------------------------------------------
function SkeletonCard({ height = 160 }: { height?: number }) {
  return (
    <div
      style={{
        background: "white",
        border: "1px solid var(--color-border)",
        borderRadius: 24,
        padding: 24,
        height: height,
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          height: 12,
          width: "40%",
          background: "var(--color-cream)",
          borderRadius: 6,
          marginBottom: 16,
          animation: "pulse 1.5s ease-in-out infinite",
        }}
      />
      <div
        style={{
          flex: 1,
          background: "var(--color-cream)",
          borderRadius: 12,
          height: height - 64,
          animation: "pulse 1.5s ease-in-out infinite",
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI tile (dark card with trend badge, matching reference design)
// ---------------------------------------------------------------------------
function TrendBadge({ delta }: { delta: number | null }) {
  if (delta === null) return null;
  const up = delta >= 0;
  const bg = up ? "rgba(114,145,82,0.18)" : "rgba(239,68,68,0.15)";
  const color = up ? "#729152" : "#ef4444";
  const arrow = up ? (
    <svg width="10" height="10" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 15L10 5L15 15" />
    </svg>
  ) : (
    <svg width="10" height="10" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 5L10 15L15 5" />
    </svg>
  );
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        background: bg,
        color,
        fontSize: 12,
        fontWeight: 600,
        borderRadius: 20,
        padding: "3px 10px",
        whiteSpace: "nowrap",
      }}
    >
      {arrow}
      {delta > 0 ? "+" : ""}{delta}%
    </span>
  );
}

interface KpiTileProps {
  label: string;
  value: string;
  delta: number | null;
  trendText: string;
  subtitle: string;
}

function KpiTile({ label, value, delta, trendText, subtitle }: KpiTileProps) {
  const up = delta === null ? null : delta >= 0;
  const trendArrow = up === null ? null : up ? (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 17L17 7M17 7H7M17 7V17" />
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 7L17 17M17 17H7M17 17V7" />
    </svg>
  );

  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        background: "var(--color-forest)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 20,
        padding: "20px 22px",
        display: "flex",
        flexDirection: "column",
        gap: 0,
      }}
    >
      {/* Label row + badge */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: "rgba(247,245,240,0.55)", fontWeight: 400 }}>{label}</span>
        <TrendBadge delta={delta} />
      </div>

      {/* Large value */}
      <p
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: 30,
          fontWeight: 700,
          color: "var(--color-cream)",
          margin: "0 0 14px",
          lineHeight: 1,
        }}
      >
        {value}
      </p>

      {/* Trend line */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          color: "var(--color-cream)",
          fontWeight: 600,
          fontSize: 13,
          marginBottom: 4,
        }}
      >
        {trendText}
        {trendArrow && (
          <span style={{ color: up ? "#729152" : "#ef4444", display: "flex" }}>{trendArrow}</span>
        )}
      </div>

      {/* Subtitle */}
      <p style={{ fontSize: 12, color: "rgba(247,245,240,0.45)", margin: 0 }}>{subtitle}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trend text helper
// ---------------------------------------------------------------------------
function trendLabel(delta: number | null, upLabel: string, downLabel: string, neutralLabel: string): string {
  if (delta === null) return neutralLabel;
  if (delta > 0) return upLabel;
  if (delta < 0) return downLabel;
  return "No change this month";
}

function fmt(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency }).format(amount);
}

function fmt0(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function DashboardPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [currency, setCurrency] = useState(CURRENCY);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>("7d");
  const [toast, setToast] = useState<string | null>(null);

  function itemWord(n: number): string {
    return n === 1 ? "item" : "items";
  }

  useEffect(() => {
    async function load() {
      try {
        const token = await getAdminToken();
        if (!token) { router.push("/admin/login"); return; }

        const [ordersResult, configResult] = await Promise.allSettled([
          fetch(`${API_URL}/api/admin/orders`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetchEventConfig(),
        ]);

        if (ordersResult.status === "rejected") {
          throw new Error("Failed to load orders");
        }

        const ordersRes = ordersResult.value;
        if (ordersRes.status === 401) { router.push("/admin/login"); return; }
        if (!ordersRes.ok) throw new Error("Failed to load orders");

        setOrders(await ordersRes.json());
        if (configResult.status === "fulfilled" && configResult.value) {
          setCurrency(configResult.value.currency);
        }
      } catch {
        setToast("Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [router]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // Aggregations
  const revenue = computeRevenue(orders);
  const items = computeItemRevenueBreakdown(orders);
  const locations = computeLocationBreakdown(orders);
  const timeSlots = computeTimeSlotBreakdown(orders);
  const topCustomers = computeTopCustomers(orders, 5);
  const openOrders = filterOpenOrders(orders);
  const timeline = computeOrdersOverTime(orders, range);
  const kpis: KPIData = computeKPIs(orders);

  const currMonthRevenue = revenue.monthly[revenue.monthly.length - 1]?.revenue ?? 0;
  const prevMonthRevenue = revenue.monthly[revenue.monthly.length - 2]?.revenue ?? 0;
  const revenueDelta = prevMonthRevenue === 0 ? null : Math.round(((currMonthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100);

  const today = new Date().toLocaleDateString("en-CA", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div style={{ padding: "32px", maxWidth: 1280, margin: "0 auto" }}>
      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <h1
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 28,
            fontWeight: 700,
            color: "var(--color-forest)",
            margin: 0,
          }}
        >
          Dashboard
        </h1>
        <p style={{ fontSize: 13, color: "var(--color-muted)", margin: "4px 0 0" }}>{today}</p>
      </div>

      {/* ---- Row 0: KPI bar ---- */}
      {loading ? (
        <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: 138,
                background: "var(--color-forest)",
                borderRadius: 20,
                opacity: 0.4,
                animation: "pulse 1.5s ease-in-out infinite",
              }}
            />
          ))}
        </div>
      ) : (
        <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiTile
            label="Total Orders"
            value={String(kpis.totalOrders)}
            delta={kpis.totalOrdersDelta}
            trendText={trendLabel(kpis.totalOrdersDelta, "Trending up this month", "Trending down this month", "Orders this month")}
            subtitle={`Non-cancelled pre-orders | ${kpis.totalItems} ${itemWord(kpis.totalItems)} this month`}
          />
          <KpiTile
            label="Total Revenue"
            value={fmt0(revenue.total, currency)}
            delta={revenueDelta}
            trendText={`This month: ${fmt0(currMonthRevenue, currency)}`}
            subtitle="Active orders only"
          />
          <KpiTile
            label="Avg Order Value"
            value={fmt(kpis.avgOrderValue, currency)}
            delta={kpis.avgOrderValueDelta}
            trendText={trendLabel(kpis.avgOrderValueDelta, "Value trending up", "Value trending down", "Average per order")}
            subtitle="Active orders only"
          />
          <KpiTile
            label="Pickup Completion"
            value={`${kpis.completionRate}%`}
            delta={kpis.completionRateDelta}
            trendText={trendLabel(kpis.completionRateDelta, "Completion improving", "More no-shows this month", "Pickup completion rate")}
            subtitle="Of expected pickups fulfilled"
          />
        </div>
      )}

      {/* ---- Row 1: Orders over time (full-width) ---- */}
      <div style={{ marginBottom: 20 }}>
        {loading ? (
          <SkeletonCard height={290} />
        ) : (
          <OrdersAreaChart
            data={timeline}
            range={range}
            onRangeChange={setRange}
            currency={currency}
          />
        )}
      </div>

      {/* ---- 3-column grid for remaining cards ---- */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {/* Row 2: 3 small charts */}
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          <>
            <RevenueRadialChart data={items} currency={currency} />
            <LocationDonutChart data={locations} currency={currency} />
            <TimeSlotRadialChart data={timeSlots} />
          </>
        )}

        {/* Row 3: top customers (span 2) + open orders */}
        {loading ? (
          <>
            <div className="xl:col-span-2"><SkeletonCard height={280} /></div>
            <SkeletonCard height={280} />
          </>
        ) : (
          <>
            <div className="xl:col-span-2">
              <TopOrdersList data={topCustomers} currency={currency} />
            </div>
            <OpenOrdersList orders={openOrders} currency={currency} />
          </>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            background: "white",
            border: "1px solid #fee2e2",
            borderRadius: 16,
            padding: "14px 20px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            display: "flex",
            alignItems: "center",
            gap: 10,
            zIndex: 9999,
            fontSize: 14,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span style={{ color: "var(--color-text)" }}>{toast}</span>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
