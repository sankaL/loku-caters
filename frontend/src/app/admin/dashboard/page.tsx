"use client";

import { useCallback, useEffect, useState } from "react";
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
  computeRevenueOverTime,
  computeKPIs,
} from "@/lib/dashboardUtils";
import RevenueRadialChart from "@/components/admin/dashboard/RevenueRadialChart";
import LocationDonutChart from "@/components/admin/dashboard/LocationDonutChart";
import TimeSlotRadialChart from "@/components/admin/dashboard/TimeSlotRadialChart";
import TopOrdersList from "@/components/admin/dashboard/TopOrdersList";
import OpenOrdersList from "@/components/admin/dashboard/OpenOrdersList";
import OrdersAreaChart from "@/components/admin/dashboard/OrdersAreaChart";
import TopEventsRevenueTile, {
  type DashboardEventSummary,
} from "@/components/admin/dashboard/TopEventsRevenueTile";
import AdminToast from "@/components/admin/AdminToast";
import { useAdminToast } from "@/hooks/useAdminToast";

type Range = "7d" | "30d" | "1y";
const TOP_METRIC_HEIGHT = 160;

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
  height?: number;
}

function KpiTile({
  label,
  value,
  delta,
  trendText,
  subtitle,
  height = TOP_METRIC_HEIGHT,
}: KpiTileProps) {
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
        height,
        padding: "20px 22px",
        display: "flex",
        flexDirection: "column",
        gap: 0,
        boxSizing: "border-box",
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

function fmt0(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

function itemWord(count: number): string {
  return count === 1 ? "item" : "items";
}

interface DashboardState {
  orders: Order[];
  events: DashboardEventSummary[];
  eventsLoadFailed: boolean;
  currency: string;
  loading: boolean;
  range: Range;
}

const INITIAL_DASHBOARD_STATE: DashboardState = {
  orders: [],
  events: [],
  eventsLoadFailed: false,
  currency: CURRENCY,
  loading: true,
  range: "7d",
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function DashboardPage() {
  const router = useRouter();
  const [state, setState] = useState<DashboardState>(INITIAL_DASHBOARD_STATE);
  const { orders, events, eventsLoadFailed, currency, loading, range } = state;
  const { toast, showToast } = useAdminToast(4000);
  const updateState = useCallback((patch: Partial<DashboardState>) => {
    setState((current) => ({ ...current, ...patch }));
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const token = await getAdminToken();
        if (!token) { router.push("/admin/login"); return; }
        updateState({ eventsLoadFailed: false });

        const [ordersResult, configResult, eventsResult] = await Promise.allSettled([
          fetch(`${API_URL}/api/admin/orders`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetchEventConfig(),
          fetch(`${API_URL}/api/admin/events`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (ordersResult.status === "rejected") {
          throw new Error("Failed to load orders");
        }

        const ordersRes = ordersResult.value;
        if (ordersRes.status === 401) { router.push("/admin/login"); return; }
        if (!ordersRes.ok) throw new Error("Failed to load orders");

        const patch: Partial<DashboardState> = { orders: await ordersRes.json() };
        if (configResult.status === "fulfilled" && configResult.value) {
          patch.currency = configResult.value.currency;
        }
        if (eventsResult.status === "fulfilled" && eventsResult.value.status === 401) {
          router.push("/admin/login");
          return;
        }
        if (eventsResult.status === "fulfilled" && eventsResult.value.ok) {
          patch.events = await eventsResult.value.json();
        } else {
          patch.events = [];
          patch.eventsLoadFailed = true;
        }
        updateState(patch);
      } catch {
        showToast("Failed to load dashboard data", "error");
      } finally {
        updateState({ loading: false });
      }
    }
    load();
  }, [router, showToast, updateState]);

  // Aggregations
  const revenue = computeRevenue(orders);
  const items = computeItemRevenueBreakdown(orders);
  const locations = computeLocationBreakdown(orders);
  const timeSlots = computeTimeSlotBreakdown(orders);
  const topCustomers = computeTopCustomers(orders, 5);
  const openOrders = filterOpenOrders(orders);
  const { data: timeline, topItems: timelineItems } = computeRevenueOverTime(orders, range);
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
    <div style={{ width: "100%", padding: "clamp(20px, 2vw, 32px) clamp(16px, 2vw, 32px) 56px" }}>
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
          {[0, 1].map((i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: TOP_METRIC_HEIGHT,
                background: "var(--color-forest)",
                borderRadius: 20,
                opacity: 0.4,
                animation: "pulse 1.5s ease-in-out infinite",
              }}
            />
          ))}
          <div
            className="sm:col-span-2 xl:col-span-2"
            style={{
              flex: 1,
              height: TOP_METRIC_HEIGHT,
              background: "var(--color-forest)",
              borderRadius: 20,
              opacity: 0.4,
              animation: "pulse 1.5s ease-in-out infinite",
            }}
          />
        </div>
      ) : (
        <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiTile
            label="Total Orders"
            value={String(kpis.totalOrders)}
            delta={kpis.totalOrdersDelta}
            trendText={trendLabel(kpis.totalOrdersDelta, "Trending up this month", "Trending down this month", "Orders this month")}
            subtitle={`${kpis.totalItems} ${itemWord(kpis.totalItems)} this month`}
          />
          <KpiTile
            label="Total Revenue"
            value={fmt0(revenue.total, currency)}
            delta={revenueDelta}
            trendText={`This month: ${fmt0(currMonthRevenue, currency)}`}
            subtitle="All time"
          />
          <div className="sm:col-span-2 xl:col-span-2">
            <TopEventsRevenueTile
              events={events}
              currency={currency}
              height={TOP_METRIC_HEIGHT}
              loadFailed={eventsLoadFailed}
            />
          </div>
        </div>
      )}

      {/* ---- Row 1: Orders over time (full-width) ---- */}
      <div style={{ marginBottom: 20 }}>
        {loading ? (
          <SkeletonCard height={290} />
        ) : (
          <OrdersAreaChart
            data={timeline}
            topItems={timelineItems}
            range={range}
            onRangeChange={(nextRange) => updateState({ range: nextRange })}
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

      <AdminToast toast={toast} />

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
