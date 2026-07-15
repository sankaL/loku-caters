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
  type ItemsPerLocationRow,
} from "@/lib/dashboardUtils";
import RevenueRadialChart from "@/components/admin/dashboard/RevenueRadialChart";
import LocationDonutChart from "@/components/admin/dashboard/LocationDonutChart";
import TimeSlotRadialChart from "@/components/admin/dashboard/TimeSlotRadialChart";
import OrdersAreaChart from "@/components/admin/dashboard/OrdersAreaChart";
import DashboardCard from "@/components/admin/dashboard/DashboardCard";

type Range = "7d" | "30d" | "1y";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: CURRENCY, maximumFractionDigits: 0 }).format(value);
}

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
            const style = STATUS_STYLES[status] ?? { bg: "var(--color-cream)", color: "var(--color-text)", label: status };
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
                  <span style={{ fontSize: 12, color: "var(--color-muted)" }}>{count} ({pct}%) &middot; {formatCurrency(revenue)}</span>
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

function LocationSection({ row }: { row: ItemsPerLocationRow }) {
  const { location, items, paidRevenue, unpaidRevenue, byMethod } = row;
  const totalRevenue = paidRevenue + unpaidRevenue;
  const paidPct = totalRevenue > 0 ? Math.round((paidRevenue / totalRevenue) * 100) : 0;

  return (
    <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: 16 }}>
      <p style={{ fontSize: 13, fontWeight: 700, color: "var(--color-forest)", marginBottom: 12 }}>{location}</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {/* Left: items table */}
        <div>
          <p style={{ fontSize: 11, fontWeight: 600, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Items</p>
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
                  <td style={{ textAlign: "right", fontSize: 12, color: "var(--color-text)", paddingTop: 5, paddingBottom: 5 }}>{formatCurrency(revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Right: payment breakdown */}
        <div>
          <p style={{ fontSize: 11, fontWeight: 600, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Payments</p>

          {/* Paid vs unpaid bar */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
              <div style={{ display: "flex", gap: 12 }}>
                <span style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: "var(--color-forest)", display: "inline-block" }} />
                  <span style={{ color: "var(--color-text)", fontWeight: 600 }}>Paid</span>
                  <span style={{ color: "var(--color-muted)" }}>{formatCurrency(paidRevenue)}</span>
                </span>
                <span style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: "var(--color-border)", display: "inline-block" }} />
                  <span style={{ color: "var(--color-text)", fontWeight: 600 }}>Unpaid</span>
                  <span style={{ color: "var(--color-muted)" }}>{formatCurrency(unpaidRevenue)}</span>
                </span>
              </div>
              <span style={{ fontSize: 11, color: "var(--color-muted)" }}>{paidPct}%</span>
            </div>
            <div style={{ height: 8, background: "var(--color-cream)", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${paidPct}%`, background: "var(--color-forest)", borderRadius: 4, transition: "width 0.4s" }} />
            </div>
          </div>

          {/* Per-method breakdown */}
          {byMethod.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <p style={{ fontSize: 11, color: "var(--color-muted)", marginBottom: 2 }}>Paid by method</p>
              {byMethod.map(({ label, revenue, count }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12, color: "var(--color-text)" }}>
                    {label}
                    <span style={{ color: "var(--color-muted)", marginLeft: 4 }}>({count})</span>
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-forest)" }}>{formatCurrency(revenue)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ItemsPerLocationCard({ orders }: { orders: Order[] }) {
  const data = useMemo(() => computeItemsPerLocation(orders), [orders]);
  return (
    <DashboardCard title="Items by Location" subtitle="Active orders only">
      {data.length === 0 ? (
        <p style={{ color: "var(--color-muted)", fontSize: 13 }}>No orders yet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {data.map((row) => (
            <LocationSection key={row.location} row={row} />
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
  kind?: string;
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

interface EventDetailState {
  loading: boolean;
  error: string | null;
  eventMeta: EventMeta | null;
  eventConfig: EventConfig | null;
  orders: Order[];
  range: Range;
}

const INITIAL_STATE: EventDetailState = {
  loading: true,
  error: null,
  eventMeta: null,
  eventConfig: null,
  orders: [],
  range: "30d",
};

function computeEventMetrics(orders: Order[], range: Range) {
  const activeOrders = orders.filter((order) => order.status !== "cancelled" && order.status !== "no_show");
  const totalRevenue = activeOrders.reduce((sum, order) => sum + order.total_price, 0);
  const totalItems = activeOrders.reduce((sum, order) => sum + order.quantity, 0);
  const resolvedOrders = orders.filter((order) => order.status === "picked_up" || order.status === "no_show");
  const pickedUpCount = orders.filter((order) => order.status === "picked_up").length;
  return {
    itemRevenue: computeItemRevenueBreakdown(orders),
    locationBreakdown: computeLocationBreakdown(orders),
    timeSlotBreakdown: computeTimeSlotBreakdown(orders),
    revenueOverTime: computeRevenueOverTime(orders, range),
    totalRevenue,
    totalItems,
    completionRate: resolvedOrders.length > 0 ? Math.round((pickedUpCount / resolvedOrders.length) * 100) : 0,
    avgOrderValue: activeOrders.length > 0 ? totalRevenue / activeOrders.length : 0,
  };
}

function EventConfigChips({ eventConfig }: { eventConfig: EventConfig | null }) {
  if (!eventConfig || (eventConfig.items.length === 0 && eventConfig.locations.length === 0)) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
      {eventConfig.items.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "rgba(247,245,240,0.45)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Items:</span>
          {eventConfig.items.map((item) => (
            <span key={item.id} style={{ fontSize: 12, fontWeight: 500, background: "rgba(255,255,255,0.1)", color: "var(--color-cream)", borderRadius: 8, padding: "3px 9px" }}>
              {item.name}
            </span>
          ))}
        </div>
      )}
      {eventConfig.locations.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "rgba(247,245,240,0.45)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Locations:</span>
          {eventConfig.locations.map((location) => (
            <span key={location.id} style={{ fontSize: 12, fontWeight: 500, background: "rgba(114,145,82,0.25)", color: "var(--color-success-border)", borderRadius: 8, padding: "3px 9px" }}>
              {location.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function EventHeader({
  eventMeta,
  eventConfig,
  totalRevenue,
  totalItems,
  orderCount,
  onBack,
  onConfigure,
}: {
  eventMeta: EventMeta;
  eventConfig: EventConfig | null;
  totalRevenue: number;
  totalItems: number;
  orderCount: number;
  onBack: () => void;
  onConfigure: () => void;
}) {
  const isRandomRequests = eventMeta.kind === "random_requests";
  return (
    <div style={{ background: "var(--color-forest)", borderRadius: 24, padding: "20px 28px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <button
          onClick={onBack}
          style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "rgba(247,245,240,0.6)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M5 12l7 7M5 12l7-7" />
          </svg>
          Events
        </button>
        <button
          onClick={onConfigure}
          disabled={isRandomRequests}
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--color-forest)",
            background: isRandomRequests ? "rgba(247,245,240,0.7)" : "var(--color-cream)",
            border: "none",
            borderRadius: 12,
            padding: "7px 16px",
            cursor: isRandomRequests ? "not-allowed" : "pointer",
            opacity: isRandomRequests ? 0.7 : 1,
          }}
          title={isRandomRequests ? "Random Requests is a reserved system event" : "Configure event"}
        >
          {isRandomRequests ? "System Event" : "Configure Event"}
        </button>
      </div>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <h1 style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 700, color: "var(--color-cream)", margin: 0 }}>{eventMeta.name}</h1>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                borderRadius: 20,
                padding: "3px 10px",
                background: eventMeta.is_active ? "rgba(114,145,82,0.3)" : "rgba(255,255,255,0.12)",
                color: eventMeta.is_active ? "var(--color-success-border)" : "rgba(247,245,240,0.5)",
              }}
            >
              {eventMeta.is_active ? "ACTIVE" : "INACTIVE"}
            </span>
            {isRandomRequests && (
              <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 20, padding: "3px 10px", background: "rgba(247,245,240,0.16)", color: "rgba(247,245,240,0.75)" }}>
                SYSTEM
              </span>
            )}
          </div>
          <p style={{ fontSize: 13, color: "rgba(247,245,240,0.6)", margin: 0 }}>{eventMeta.event_date}</p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <StatChip label="Revenue" value={formatCurrency(totalRevenue)} />
          <StatChip label="Orders" value={String(orderCount)} />
          <StatChip label="Items Sold" value={String(totalItems)} />
          <StatChip label="Locations" value={String(eventConfig?.locations.length ?? 0)} />
        </div>
      </div>
      <EventConfigChips eventConfig={eventConfig} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function EventDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const [state, setState] = useState<EventDetailState>(INITIAL_STATE);
  const { loading, error, eventMeta, eventConfig, orders, range } = state;

  useEffect(() => {
    if (!id) return;
    async function load() {
      try {
        setState((current) => ({ ...current, error: null }));
        const token = await getAdminToken();
        if (!token) {
          setState((current) => ({ ...current, error: "Not authenticated" }));
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
          setState((current) => ({
            ...current,
            error: metaRes.status === 401 || metaRes.status === 403 ? "Not authorized" : "Failed to load event data",
          }));
          return;
        }
        const [metaData, configData, ordersData] = await Promise.all([
          metaRes.json() as Promise<EventMeta>,
          configRes.json() as Promise<EventConfig>,
          ordersRes.json() as Promise<Order[]>,
        ]);
        setState((current) => ({ ...current, eventMeta: metaData, eventConfig: configData, orders: ordersData }));
      } catch {
        setState((current) => ({ ...current, error: "Failed to load event data" }));
      }
    }
    setState((current) => ({ ...current, loading: true, eventMeta: null, eventConfig: null, orders: [] }));
    load().finally(() => setState((current) => ({ ...current, loading: false })));
  }, [id]);

  // ---------------------------------------------------------------------------
  // Computed metrics
  // ---------------------------------------------------------------------------
  const metrics = useMemo(() => computeEventMetrics(orders, range), [orders, range]);
  const { itemRevenue, locationBreakdown, timeSlotBreakdown, revenueOverTime, totalRevenue, totalItems, completionRate, avgOrderValue } = metrics;

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

      <EventHeader
        eventMeta={eventMeta}
        eventConfig={eventConfig}
        totalRevenue={totalRevenue}
        totalItems={totalItems}
        orderCount={orders.length}
        onBack={() => router.push("/admin/config")}
        onConfigure={() => router.push(`/admin/events/${id}/edit`)}
      />

      {/* Row 1: Orders area chart (full width) */}
      <div>
        <OrdersAreaChart
          data={revenueOverTime.data}
          topItems={revenueOverTime.topItems}
          range={range}
          onRangeChange={(nextRange) => setState((current) => ({ ...current, range: nextRange }))}
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
            {formatCurrency(avgOrderValue)}
          </p>
        </DashboardCard>
      </div>

      {/* Row 5: Items per location - full width */}
      <ItemsPerLocationCard orders={orders} />

    </div>
  );
}
