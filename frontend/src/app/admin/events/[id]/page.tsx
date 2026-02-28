"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { API_URL, CURRENCY } from "@/config/event";
import { getAdminToken } from "@/lib/auth";
import {
  Order,
  computeItemRevenueBreakdown,
  computeLocationBreakdown,
  computeTimeSlotBreakdown,
  computeRevenueOverTime,
  computeStatusBreakdown,
  computePaymentMethodBreakdown,
  computeItemsPerLocation,
  STATUS_STYLES,
} from "@/lib/dashboardUtils";
import RevenueRadialChart from "@/components/admin/dashboard/RevenueRadialChart";
import LocationDonutChart from "@/components/admin/dashboard/LocationDonutChart";
import TimeSlotRadialChart from "@/components/admin/dashboard/TimeSlotRadialChart";
import OrdersAreaChart from "@/components/admin/dashboard/OrdersAreaChart";
import DashboardCard from "@/components/admin/dashboard/DashboardCard";

type Range = "7d" | "30d" | "1y";

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------
function SkeletonCard({ height = 160 }: { height?: number }) {
  return (
    <div
      style={{
        background: "white",
        border: "1px solid var(--color-border)",
        borderRadius: 24,
        padding: 24,
        height,
        boxSizing: "border-box",
      }}
    >
      <div style={{ height: 12, width: "40%", background: "var(--color-cream)", borderRadius: 6, marginBottom: 16, animation: "pulse 1.5s ease-in-out infinite" }} />
      <div style={{ flex: 1, background: "var(--color-cream)", borderRadius: 12, height: height - 64, animation: "pulse 1.5s ease-in-out infinite" }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline metric cards
// ---------------------------------------------------------------------------
function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.18)",
        border: "1px solid rgba(255,255,255,0.25)",
        borderRadius: 14,
        padding: "10px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 2,
        minWidth: 100,
      }}
    >
      <span style={{ fontSize: 18, fontWeight: 700, color: "var(--color-cream)", fontFamily: "var(--font-serif)" }}>{value}</span>
      <span style={{ fontSize: 11, color: "rgba(247,245,240,0.65)" }}>{label}</span>
    </div>
  );
}

function StatusBreakdownCard({ orders }: { orders: Order[] }) {
  const data = useMemo(() => computeStatusBreakdown(orders), [orders]);
  const total = orders.length;
  return (
    <DashboardCard title="Order Status">
      {data.length === 0 ? (
        <p style={{ color: "var(--color-muted)", fontSize: 13 }}>No orders yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {data.map(({ status, count }) => {
            const style = STATUS_STYLES[status] ?? { bg: "#f3f4f6", color: "#374151", label: status };
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            return (
              <div key={status}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span
                    style={{
                      display: "inline-block",
                      background: style.bg,
                      color: style.color,
                      fontSize: 11,
                      fontWeight: 600,
                      borderRadius: 20,
                      padding: "2px 10px",
                    }}
                  >
                    {style.label}
                  </span>
                  <span style={{ fontSize: 12, color: "var(--color-muted)" }}>{count} ({pct}%)</span>
                </div>
                <div style={{ height: 6, background: "var(--color-cream)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: style.color, borderRadius: 3, transition: "width 0.4s" }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </DashboardCard>
  );
}

function PaymentMethodCard({ orders }: { orders: Order[] }) {
  const data = useMemo(() => computePaymentMethodBreakdown(orders), [orders]);
  const total = data.reduce((s, r) => s + r.count, 0);
  const fmt = (n: number) => new Intl.NumberFormat("en-CA", { style: "currency", currency: CURRENCY, maximumFractionDigits: 0 }).format(n);
  return (
    <DashboardCard title="Payment Methods" subtitle="Active orders only">
      {data.length === 0 ? (
        <p style={{ color: "var(--color-muted)", fontSize: 13 }}>No orders yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {data.map(({ method, label, count, revenue }) => {
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            return (
              <div key={method}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text)" }}>{label}</span>
                  <span style={{ fontSize: 12, color: "var(--color-muted)" }}>{count} ({pct}%) &middot; {fmt(revenue)}</span>
                </div>
                <div style={{ height: 6, background: "var(--color-cream)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: "var(--color-sage)", borderRadius: 3, transition: "width 0.4s" }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </DashboardCard>
  );
}

function ItemsPerLocationCard({ orders }: { orders: Order[] }) {
  const data = useMemo(() => computeItemsPerLocation(orders), [orders]);
  const fmt = (n: number) => new Intl.NumberFormat("en-CA", { style: "currency", currency: CURRENCY, maximumFractionDigits: 0 }).format(n);
  return (
    <DashboardCard title="Items by Location" subtitle="Active orders only">
      {data.length === 0 ? (
        <p style={{ color: "var(--color-muted)", fontSize: 13 }}>No orders yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {data.map(({ location, items }) => (
            <div key={location}>
              <p style={{ fontSize: 12, fontWeight: 700, color: "var(--color-forest)", marginBottom: 6 }}>{location}</p>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", fontSize: 11, color: "var(--color-muted)", fontWeight: 500, paddingBottom: 4 }}>Item</th>
                    <th style={{ textAlign: "right", fontSize: 11, color: "var(--color-muted)", fontWeight: 500, paddingBottom: 4 }}>Qty</th>
                    <th style={{ textAlign: "right", fontSize: 11, color: "var(--color-muted)", fontWeight: 500, paddingBottom: 4 }}>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(({ itemName, quantity, revenue }) => (
                    <tr key={itemName} style={{ borderTop: "1px solid var(--color-border)" }}>
                      <td style={{ fontSize: 12, color: "var(--color-text)", paddingTop: 5, paddingBottom: 5 }}>{itemName}</td>
                      <td style={{ textAlign: "right", fontSize: 12, color: "var(--color-text)", paddingTop: 5, paddingBottom: 5 }}>{quantity}</td>
                      <td style={{ textAlign: "right", fontSize: 12, color: "var(--color-text)", paddingTop: 5, paddingBottom: 5 }}>{fmt(revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </DashboardCard>
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface EventMeta {
  id: number;
  name: string;
  event_date: string;
  is_active: boolean;
  item_ids: string[];
  location_ids: string[];
  total_revenue?: number;
  order_count?: number;
}

interface EventConfig {
  event: { date: string };
  currency: string;
  items: { id: string; name: string }[];
  locations: { id: string; name: string }[];
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function EventDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [eventMeta, setEventMeta] = useState<EventMeta | null>(null);
  const [eventConfig, setEventConfig] = useState<EventConfig | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [range, setRange] = useState<Range>("30d");

  useEffect(() => {
    if (!id) return;
    async function load() {
      try {
        setError(null);
        const token = await getAdminToken();
        if (!token) {
          setError("Not authenticated");
          return;
        }
        const headers = { Authorization: `Bearer ${token}` };
        const [metaRes, configRes, ordersRes] = await Promise.all([
          fetch(`${API_URL}/api/admin/events/${id}`, { headers }),
          fetch(`${API_URL}/api/admin/events/${id}/config`, { headers }),
          fetch(`${API_URL}/api/admin/orders?event_id=${id}`, { headers }),
        ]);
        if (metaRes.status === 404) return;
        if (!metaRes.ok || !configRes.ok || !ordersRes.ok) {
          setError(metaRes.status === 401 || metaRes.status === 403 ? "Not authorized" : "Failed to load event data");
          return;
        }
        const [metaData, configData, ordersData] = await Promise.all([
          metaRes.json() as Promise<EventMeta>,
          configRes.json() as Promise<EventConfig>,
          ordersRes.json() as Promise<Order[]>,
        ]);
        setEventMeta(metaData);
        setEventConfig(configData);
        setOrders(ordersData);
      } catch {
        setError("Failed to load event data");
      }
    }
    setLoading(true);
    setEventMeta(null);
    setEventConfig(null);
    setOrders([]);
    load().finally(() => setLoading(false));
  }, [id]);

  // ---------------------------------------------------------------------------
  // Computed metrics
  // ---------------------------------------------------------------------------
  const itemRevenue = useMemo(() => computeItemRevenueBreakdown(orders), [orders]);
  const locationBreakdown = useMemo(() => computeLocationBreakdown(orders), [orders]);
  const timeSlotBreakdown = useMemo(() => computeTimeSlotBreakdown(orders), [orders]);
  const revenueOverTime = useMemo(() => computeRevenueOverTime(orders, range), [orders, range]);

  const totalRevenue = useMemo(
    () => orders.filter((o) => o.status !== "cancelled" && o.status !== "no_show").reduce((s, o) => s + o.total_price, 0),
    [orders]
  );
  const totalItems = useMemo(
    () => orders.filter((o) => o.status !== "cancelled" && o.status !== "no_show").reduce((s, o) => s + o.quantity, 0),
    [orders]
  );
  const activeOrders = useMemo(
    () => orders.filter((o) => o.status !== "cancelled" && o.status !== "no_show"),
    [orders]
  );
  const completionRate = useMemo(() => {
    const resolved = orders.filter((o) => o.status === "picked_up" || o.status === "no_show");
    const pickedUp = orders.filter((o) => o.status === "picked_up").length;
    return resolved.length > 0 ? Math.round((pickedUp / resolved.length) * 100) : 0;
  }, [orders]);
  const avgOrderValue = useMemo(
    () => (activeOrders.length > 0 ? totalRevenue / activeOrders.length : 0),
    [activeOrders, totalRevenue]
  );

  const fmtCurrency = (n: number) =>
    new Intl.NumberFormat("en-CA", { style: "currency", currency: CURRENCY, maximumFractionDigits: 0 }).format(n);

  const locationCount = eventConfig?.locations.length ?? 0;

  if (loading) {
    return (
      <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6" style={{ height: 180, background: "var(--color-forest)", borderRadius: 24, animation: "pulse 1.5s ease-in-out infinite" }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
          <SkeletonCard height={240} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            <SkeletonCard /><SkeletonCard /><SkeletonCard />
          </div>
        </div>
      </div>
    );
  }

  if (!eventMeta) {
    return (
      <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
        <p style={{ color: "var(--color-muted)" }}>
          {error ? `Error loading event: ${error}` : "Event not found."}
        </p>
      </div>
    );
  }

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8" style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Header card */}
      <div style={{ background: "var(--color-forest)", borderRadius: 24, padding: "20px 28px" }}>
        {/* Back link + configure button */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <button
            onClick={() => router.push("/admin/config")}
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "rgba(247,245,240,0.6)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M5 12l7 7M5 12l7-7" />
            </svg>
            Events
          </button>
          <button
            onClick={() => router.push(`/admin/config?edit=${id}`)}
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--color-forest)",
              background: "var(--color-cream)",
              border: "none",
              borderRadius: 12,
              padding: "7px 16px",
              cursor: "pointer",
            }}
          >
            Configure Event
          </button>
        </div>

        {/* Top row: name/badge/date left, stat chips right */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 700, color: "var(--color-cream)", margin: 0 }}>
                {eventMeta.name}
              </h1>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  borderRadius: 20,
                  padding: "3px 10px",
                  background: eventMeta.is_active ? "rgba(114,145,82,0.3)" : "rgba(255,255,255,0.12)",
                  color: eventMeta.is_active ? "#a8d87a" : "rgba(247,245,240,0.5)",
                }}
              >
                {eventMeta.is_active ? "ACTIVE" : "INACTIVE"}
              </span>
            </div>
            <p style={{ fontSize: 13, color: "rgba(247,245,240,0.6)", margin: 0 }}>{eventMeta.event_date}</p>
          </div>

          {/* Stat chips inline */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <StatChip label="Revenue" value={fmtCurrency(totalRevenue)} />
            <StatChip label="Orders" value={String(orders.length)} />
            <StatChip label="Items Sold" value={String(totalItems)} />
            <StatChip label="Locations" value={String(locationCount)} />
          </div>
        </div>

        {/* Items + Locations chips */}
        {eventConfig && (eventConfig.items.length > 0 || eventConfig.locations.length > 0) && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
            {eventConfig.items.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, color: "rgba(247,245,240,0.45)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Items:</span>
                {eventConfig.items.map((item) => (
                  <span
                    key={item.id}
                    style={{ fontSize: 12, fontWeight: 500, background: "rgba(255,255,255,0.1)", color: "var(--color-cream)", borderRadius: 8, padding: "3px 9px" }}
                  >
                    {item.name}
                  </span>
                ))}
              </div>
            )}
            {eventConfig.locations.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, color: "rgba(247,245,240,0.45)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Locations:</span>
                {eventConfig.locations.map((loc) => (
                  <span
                    key={loc.id}
                    style={{ fontSize: 12, fontWeight: 500, background: "rgba(114,145,82,0.25)", color: "#a8d87a", borderRadius: 8, padding: "3px 9px" }}
                  >
                    {loc.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Row 1: Orders area chart (full width) */}
      <div>
        <OrdersAreaChart
          data={revenueOverTime.data}
          topItems={revenueOverTime.topItems}
          range={range}
          onRangeChange={setRange}
          currency={CURRENCY}
        />
      </div>

      {/* Row 2: 3 radial charts */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        <RevenueRadialChart data={itemRevenue} currency={CURRENCY} />
        <LocationDonutChart data={locationBreakdown} currency={CURRENCY} />
        <TimeSlotRadialChart data={timeSlotBreakdown} />
      </div>

      {/* Row 3: Status breakdown + Payment methods */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <StatusBreakdownCard orders={orders} />
        <PaymentMethodCard orders={orders} />
      </div>

      {/* Row 4: Stat cards side by side */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <DashboardCard title="Completion Rate" subtitle="Picked up / (picked up + no show)">
          <p style={{ fontFamily: "var(--font-serif)", fontSize: 36, fontWeight: 700, color: "var(--color-forest)", margin: 0 }}>
            {completionRate}%
          </p>
        </DashboardCard>
        <DashboardCard title="Avg Order Value" subtitle="Active orders only">
          <p style={{ fontFamily: "var(--font-serif)", fontSize: 36, fontWeight: 700, color: "var(--color-forest)", margin: 0 }}>
            {fmtCurrency(avgOrderValue)}
          </p>
        </DashboardCard>
      </div>

      {/* Row 5: Items per location - full width */}
      <ItemsPerLocationCard orders={orders} />

    </div>
  );
}
