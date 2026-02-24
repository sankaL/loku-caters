"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { API_URL } from "@/config/event";
import { getAdminToken } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FeedbackMetric {
  reason: string;
  label: string;
  count: number;
  pct: number;
}

interface FeedbackItem {
  id: string;
  feedback_type: string;
  order_id: string | null;
  name: string | null;
  contact: string | null;
  reason: string | null;
  reason_label: string | null;
  other_details: string | null;
  message: string | null;
  created_at: string | null;
}

interface FeedbackResponse {
  total: number;
  customer_count: number;
  non_customer_count: number;
  metrics: FeedbackMetric[];
  items: FeedbackItem[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
}

function formatTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit" });
}

const REASON_COLORS: Record<string, { bg: string; text: string }> = {
  price_too_high:          { bg: "#fef2f2", text: "#c53030" },
  location_not_convenient: { bg: "#fff7ed", text: "#9a3412" },
  dietary_needs:           { bg: "#fefce8", text: "#854d0e" },
  not_available:           { bg: "#f0fdf4", text: "#166534" },
  different_menu:          { bg: "#eff6ff", text: "#1d4ed8" },
  prefer_delivery:         { bg: "#f0f9ff", text: "#0369a1" },
  not_interested:          { bg: "#faf5ff", text: "#6b21a8" },
  other:                   { bg: "var(--color-cream)", text: "var(--color-muted)" },
};

function ReasonBadge({ reason, label }: { reason: string; label: string }) {
  const colors = REASON_COLORS[reason] ?? { bg: "var(--color-cream)", text: "var(--color-muted)" };
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: "999px",
        fontSize: "12px",
        fontWeight: 600,
        background: colors.bg,
        color: colors.text,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  const isCustomer = type === "customer";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: "999px",
        fontSize: "12px",
        fontWeight: 600,
        background: isCustomer ? "#f0f7eb" : "var(--color-cream)",
        color: isCustomer ? "#2d6a2d" : "var(--color-muted)",
        whiteSpace: "nowrap",
        border: isCustomer ? "1px solid #c8ddb4" : "1px solid var(--color-border)",
      }}
    >
      {isCustomer ? "Customer" : "Non-customer"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function Skeleton({ w = "100%", h = 16 }: { w?: string | number; h?: number }) {
  return (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: 8,
        background: "var(--color-cream)",
        animation: "pulse 1.5s ease-in-out infinite",
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminFeedbackPage() {
  const router = useRouter();

  const [data, setData] = useState<FeedbackResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [reasonFilter, setReasonFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);

  const PAGE_SIZE = 15;

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      const token = await getAdminToken();
      if (!token) {
        router.push("/admin/login");
        return;
      }
      try {
        const res = await fetch(`${API_URL}/api/admin/feedback`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401) {
          router.push("/admin/login");
          return;
        }
        if (!res.ok) throw new Error("Failed to load feedback");
        const json: FeedbackResponse = await res.json();
        setData(json);
      } catch {
        setError("Could not load feedback. Please refresh.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [router]);

  const filtered = useMemo(() => {
    if (!data) return [];
    let items = data.items;
    if (typeFilter !== "all") items = items.filter((i) => i.feedback_type === typeFilter);
    if (reasonFilter !== "all") items = items.filter((i) => i.reason === reasonFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      items = items.filter(
        (i) =>
          (i.name ?? "").toLowerCase().includes(q) ||
          (i.contact ?? "").toLowerCase().includes(q) ||
          (i.reason_label ?? "").toLowerCase().includes(q) ||
          (i.other_details ?? "").toLowerCase().includes(q) ||
          (i.message ?? "").toLowerCase().includes(q)
      );
    }
    return items;
  }, [data, typeFilter, reasonFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [typeFilter, reasonFilter, searchQuery]);

  const sortedMetrics = useMemo(
    () => (data ? [...data.metrics].sort((a, b) => b.count - a.count).filter((m) => m.count > 0) : []),
    [data]
  );

  const hasFilters = typeFilter !== "all" || reasonFilter !== "all" || !!searchQuery;

  return (
    <div style={{ padding: "32px 32px 64px", maxWidth: 1100, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: "var(--color-forest)",
            fontFamily: "var(--font-serif)",
            marginBottom: 4,
          }}
        >
          Feedback
        </h1>
        <p style={{ fontSize: 14, color: "var(--color-muted)" }}>
          Pre-order feedback from visitors and post-order feedback from customers.
        </p>
      </div>

      {error && (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 12,
            padding: "12px 16px",
            fontSize: 14,
            color: "#c53030",
            marginBottom: 24,
          }}
        >
          {error}
        </div>
      )}

      {/* Top metric cards */}
      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16, marginBottom: 28 }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} style={{ background: "white", border: "1px solid var(--color-border)", borderRadius: 20, padding: 20 }}>
              <Skeleton w="60%" h={12} />
              <div style={{ marginTop: 12 }}><Skeleton w="40%" h={28} /></div>
            </div>
          ))}
        </div>
      ) : data && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16, marginBottom: 28 }}>
          {/* Total */}
          <div style={{ background: "var(--color-forest)", borderRadius: 20, padding: 20 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: "var(--color-sage)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
              Total Responses
            </p>
            <p style={{ fontSize: 32, fontWeight: 700, color: "var(--color-cream)", fontFamily: "var(--font-serif)", lineHeight: 1 }}>
              {data.total}
            </p>
          </div>

          {/* Customers */}
          <div
            style={{
              background: "white",
              border: `2px solid ${typeFilter === "customer" ? "var(--color-sage)" : "var(--color-border)"}`,
              borderRadius: 20,
              padding: 20,
              cursor: "pointer",
              transition: "border-color 0.15s",
            }}
            onClick={() => setTypeFilter(typeFilter === "customer" ? "all" : "customer")}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                Customers
              </p>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2d6a2d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <p style={{ fontSize: 28, fontWeight: 700, color: "var(--color-forest)", fontFamily: "var(--font-serif)", lineHeight: 1 }}>
              {data.customer_count}
            </p>
            <p style={{ fontSize: 11, color: "var(--color-muted)", marginTop: 6 }}>Post-order feedback</p>
          </div>

          {/* Non-customers */}
          <div
            style={{
              background: "white",
              border: `2px solid ${typeFilter === "non_customer" ? "var(--color-sage)" : "var(--color-border)"}`,
              borderRadius: 20,
              padding: 20,
              cursor: "pointer",
              transition: "border-color 0.15s",
            }}
            onClick={() => setTypeFilter(typeFilter === "non_customer" ? "all" : "non_customer")}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                Non-customers
              </p>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-bark)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <p style={{ fontSize: 28, fontWeight: 700, color: "var(--color-forest)", fontFamily: "var(--font-serif)", lineHeight: 1 }}>
              {data.non_customer_count}
            </p>
            <p style={{ fontSize: 11, color: "var(--color-muted)", marginTop: 6 }}>Pre-order feedback</p>
          </div>

          {/* Top non-customer reason */}
          {sortedMetrics[0] && (() => {
            const m = sortedMetrics[0];
            const colors = REASON_COLORS[m.reason] ?? { bg: "var(--color-cream)", text: "var(--color-muted)" };
            return (
              <div
                style={{
                  background: "white",
                  border: "1px solid var(--color-border)",
                  borderRadius: 20,
                  padding: 20,
                  cursor: "pointer",
                }}
                onClick={() => setReasonFilter(reasonFilter === m.reason ? "all" : m.reason)}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                    Top Reason
                  </p>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: "999px", background: colors.bg, color: colors.text }}>
                    {m.pct}%
                  </span>
                </div>
                <p style={{ fontSize: 14, fontWeight: 700, color: "var(--color-forest)", lineHeight: 1.3, marginBottom: 6 }}>
                  {m.label}
                </p>
                <p style={{ fontSize: 24, fontWeight: 700, color: "var(--color-forest)", fontFamily: "var(--font-serif)", lineHeight: 1 }}>
                  {m.count}
                </p>
              </div>
            );
          })()}
        </div>
      )}

      {/* Reason breakdown (non-customer only) */}
      {!loading && data && data.non_customer_count > 0 && (
        <div
          style={{
            background: "white",
            border: "1px solid var(--color-border)",
            borderRadius: 20,
            padding: 20,
            marginBottom: 24,
          }}
        >
          <p style={{ fontSize: 12, fontWeight: 600, color: "var(--color-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>
            Pre-order Reason Breakdown
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {sortedMetrics.map((m) => {
              const colors = REASON_COLORS[m.reason] ?? { bg: "var(--color-cream)", text: "var(--color-muted)" };
              const isActive = reasonFilter === m.reason;
              return (
                <div
                  key={m.reason}
                  style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}
                  onClick={() => setReasonFilter(isActive ? "all" : m.reason)}
                >
                  <div style={{ width: 140, flexShrink: 0, fontSize: 13, color: isActive ? "var(--color-forest)" : "var(--color-text)", fontWeight: isActive ? 600 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {m.label}
                  </div>
                  <div style={{ flex: 1, height: 8, borderRadius: 4, background: "var(--color-cream)", overflow: "hidden" }}>
                    <div
                      style={{
                        height: 8,
                        borderRadius: 4,
                        width: `${m.pct}%`,
                        background: isActive ? "var(--color-forest)" : colors.text,
                        opacity: isActive ? 1 : 0.6,
                        transition: "width 0.4s ease, background 0.15s",
                      }}
                    />
                  </div>
                  <div style={{ width: 36, flexShrink: 0, textAlign: "right", fontSize: 13, fontWeight: 600, color: "var(--color-forest)" }}>
                    {m.count}
                  </div>
                  <div style={{ width: 36, flexShrink: 0, textAlign: "right", fontSize: 12, color: "var(--color-muted)" }}>
                    {m.pct}%
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative", flex: "1 1 220px", minWidth: 0 }}>
          <svg
            width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
            style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--color-muted)", pointerEvents: "none" }}
          >
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Search name, contact, message..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "9px 12px 9px 36px",
              borderRadius: 12,
              border: "1px solid var(--color-border)",
              fontSize: 13,
              color: "var(--color-text)",
              background: "white",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          style={{
            padding: "9px 12px",
            borderRadius: 12,
            border: "1px solid var(--color-border)",
            fontSize: 13,
            color: "var(--color-text)",
            background: "white",
            cursor: "pointer",
            outline: "none",
          }}
        >
          <option value="all">All types</option>
          <option value="customer">Customer</option>
          <option value="non_customer">Non-customer</option>
        </select>

        <select
          value={reasonFilter}
          onChange={(e) => setReasonFilter(e.target.value)}
          style={{
            padding: "9px 12px",
            borderRadius: 12,
            border: "1px solid var(--color-border)",
            fontSize: 13,
            color: "var(--color-text)",
            background: "white",
            cursor: "pointer",
            outline: "none",
          }}
        >
          <option value="all">All reasons</option>
          <option value="price_too_high">Price too high</option>
          <option value="location_not_convenient">Pickup location not convenient</option>
          <option value="dietary_needs">Food does not meet dietary needs</option>
          <option value="not_available">Not available on the event date</option>
          <option value="different_menu">Prefer a different menu item</option>
          <option value="prefer_delivery">Prefer delivery over pickup</option>
          <option value="not_interested">Not interested at this time</option>
          <option value="other">Other</option>
        </select>

        {hasFilters && (
          <button
            onClick={() => { setTypeFilter("all"); setReasonFilter("all"); setSearchQuery(""); }}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 12px", borderRadius: 12,
              border: "1px solid var(--color-border)", background: "white",
              fontSize: 13, color: "var(--color-muted)", cursor: "pointer",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            Clear
          </button>
        )}

        {!loading && (
          <span style={{ fontSize: 13, color: "var(--color-muted)", marginLeft: "auto" }}>
            {filtered.length} result{filtered.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Table */}
      <div
        style={{
          background: "white",
          border: "1px solid var(--color-border)",
          borderRadius: 20,
          overflow: "hidden",
        }}
      >
        {loading ? (
          <div style={{ padding: 32, display: "flex", flexDirection: "column", gap: 16 }}>
            {[...Array(5)].map((_, i) => <Skeleton key={i} h={20} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center" }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-border)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 12px" }}>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <p style={{ fontSize: 15, fontWeight: 600, color: "var(--color-forest)", marginBottom: 4 }}>No feedback yet</p>
            <p style={{ fontSize: 13, color: "var(--color-muted)" }}>
              {hasFilters ? "No results match your filters." : "Feedback from visitors and customers will appear here."}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-cream)" }}>
                  {["Date", "Type", "Name", "Contact", "Reason", "Message / Details"].map((col) => (
                    <th
                      key={col}
                      style={{
                        textAlign: "left",
                        padding: "11px 16px",
                        fontSize: 11,
                        fontWeight: 600,
                        color: "var(--color-muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.07em",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.map((item, idx) => (
                  <tr
                    key={item.id}
                    style={{
                      borderBottom: idx < paginated.length - 1 ? "1px solid var(--color-border)" : "none",
                      background: "white",
                    }}
                  >
                    {/* Date */}
                    <td style={{ padding: "13px 16px", whiteSpace: "nowrap", verticalAlign: "top" }}>
                      <div style={{ fontWeight: 500, color: "var(--color-text)" }}>{formatDate(item.created_at)}</div>
                      <div style={{ fontSize: 11, color: "var(--color-muted)", marginTop: 2 }}>{formatTime(item.created_at)}</div>
                    </td>

                    {/* Type */}
                    <td style={{ padding: "13px 16px", whiteSpace: "nowrap", verticalAlign: "top" }}>
                      <TypeBadge type={item.feedback_type} />
                    </td>

                    {/* Name */}
                    <td style={{ padding: "13px 16px", whiteSpace: "nowrap", verticalAlign: "top" }}>
                      {item.name ? (
                        <span style={{ fontWeight: 500, color: "var(--color-text)" }}>{item.name}</span>
                      ) : (
                        <span style={{ color: "var(--color-muted)", fontStyle: "italic" }}>Anonymous</span>
                      )}
                    </td>

                    {/* Contact */}
                    <td style={{ padding: "13px 16px", whiteSpace: "nowrap", verticalAlign: "top" }}>
                      {item.contact ? (
                        <span style={{ fontSize: 13, color: "var(--color-text)" }}>{item.contact}</span>
                      ) : (
                        <span style={{ color: "var(--color-border)" }}>-</span>
                      )}
                    </td>

                    {/* Reason */}
                    <td style={{ padding: "13px 16px", verticalAlign: "top" }}>
                      {item.reason && item.reason_label ? (
                        <ReasonBadge reason={item.reason} label={item.reason_label} />
                      ) : (
                        <span style={{ color: "var(--color-border)" }}>-</span>
                      )}
                    </td>

                    {/* Message / Details */}
                    <td style={{ padding: "13px 16px", color: "var(--color-text)", maxWidth: 300, verticalAlign: "top" }}>
                      {item.message ? (
                        <span>{item.message}</span>
                      ) : item.other_details ? (
                        <span style={{ color: "var(--color-muted)" }}>{item.other_details}</span>
                      ) : (
                        <span style={{ color: "var(--color-border)" }}>-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 16 }}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{
              padding: "7px 14px", borderRadius: 10, border: "1px solid var(--color-border)",
              background: "white", fontSize: 13, color: page === 1 ? "var(--color-border)" : "var(--color-text)",
              cursor: page === 1 ? "not-allowed" : "pointer",
            }}
          >
            Previous
          </button>
          <span style={{ fontSize: 13, color: "var(--color-muted)" }}>
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={{
              padding: "7px 14px", borderRadius: 10, border: "1px solid var(--color-border)",
              background: "white", fontSize: 13, color: page === totalPages ? "var(--color-border)" : "var(--color-text)",
              cursor: page === totalPages ? "not-allowed" : "pointer",
            }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
