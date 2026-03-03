"use client";

import {
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";

export interface DashboardEventSummary {
  id: number;
  name: string;
  event_date: string;
  total_revenue?: number;
  order_count?: number;
}

interface TopEventsRevenueTileProps {
  events: DashboardEventSummary[];
  currency: string;
  height?: number;
  loadFailed?: boolean;
}

interface HoverTooltipState {
  event: DashboardEventSummary;
  x: number;
  y: number;
  locked: boolean;
}

const TOOLTIP_WIDTH = 220;

function formatRevenue(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function TopEventsRevenueTile({
  events,
  currency,
  height = 140,
  loadFailed = false,
}: TopEventsRevenueTileProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [tooltip, setTooltip] = useState<HoverTooltipState | null>(null);
  const topEvents = events
    .filter((event) => (event.total_revenue ?? 0) > 0)
    .sort((a, b) => {
      const revenueDelta = (b.total_revenue ?? 0) - (a.total_revenue ?? 0);
      if (revenueDelta !== 0) return revenueDelta;
      return b.id - a.id;
    })
    .slice(0, 5);
  const maxRevenue = topEvents[0]?.total_revenue ?? 1;

  function setTooltipPosition(
    target: HTMLElement,
    event: DashboardEventSummary,
    locked: boolean,
    clientX?: number
  ) {
    const containerRect = containerRef.current?.getBoundingClientRect();
    const rowRect = target.getBoundingClientRect();

    if (!containerRect) {
      setTooltip({ event, x: 16, y: 56, locked });
      return;
    }

    const anchorX =
      typeof clientX === "number"
        ? clientX - containerRect.left
        : rowRect.right - containerRect.left - 12;
    const rowMidY = rowRect.top - containerRect.top + rowRect.height / 2;
    const maxX = Math.max(12, containerRect.width - TOOLTIP_WIDTH - 12);
    const maxY = Math.max(48, containerRect.height - 92);

    setTooltip({
      event,
      x: Math.min(Math.max(anchorX + 12, 12), maxX),
      y: Math.min(Math.max(rowMidY - 34, 48), maxY),
      locked,
    });
  }

  function showTooltip(
    e: ReactMouseEvent<HTMLButtonElement>,
    event: DashboardEventSummary
  ) {
    setTooltipPosition(e.currentTarget, event, false, e.clientX);
  }

  function showLockedTooltip(
    e: ReactMouseEvent<HTMLButtonElement> | ReactFocusEvent<HTMLButtonElement>,
    event: DashboardEventSummary
  ) {
    setTooltipPosition(e.currentTarget, event, true);
  }

  return (
    <div
      ref={containerRef}
      style={{
        background: "var(--color-forest)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 20,
        height,
        position: "relative",
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        minWidth: 0,
        boxSizing: "border-box",
        overflow: "visible",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span
          style={{
            fontSize: 13,
            color: "rgba(247,245,240,0.55)",
            fontWeight: 400,
          }}
        >
          Top 5 Events by Revenue
        </span>
        <span
          style={{
            fontSize: 11,
            color: "rgba(247,245,240,0.45)",
            whiteSpace: "nowrap",
          }}
        >
          All-time
        </span>
      </div>

      {loadFailed ? (
        <p
          style={{
            fontSize: 12,
            color: "rgba(247,245,240,0.55)",
            margin: 0,
          }}
        >
          Unable to load event revenue
        </p>
      ) : topEvents.length === 0 ? (
        <p
          style={{
            fontSize: 12,
            color: "rgba(247,245,240,0.55)",
            margin: 0,
          }}
        >
          No event revenue yet
        </p>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            flex: 1,
            minHeight: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              flex: 1,
              justifyContent: "space-between",
              minHeight: 0,
            }}
          >
            {topEvents.map((event, index) => {
              const amount = event.total_revenue ?? 0;
              const width = Math.max(12, (amount / maxRevenue) * 100);

              return (
                <button
                  key={event.id}
                  onMouseEnter={(e) => showTooltip(e, event)}
                  onMouseMove={(e) => showTooltip(e, event)}
                  onMouseLeave={() =>
                    setTooltip((current) => (current?.locked ? current : null))
                  }
                  onFocus={(e) => showLockedTooltip(e, event)}
                  onBlur={() =>
                    setTooltip((current) =>
                      current?.event.id === event.id ? null : current
                    )
                  }
                  onClick={(e) => {
                    if (tooltip?.event.id === event.id && tooltip.locked) {
                      setTooltip(null);
                      return;
                    }
                    showLockedTooltip(e, event);
                  }}
                  type="button"
                  aria-pressed={tooltip?.event.id === event.id && tooltip.locked}
                  aria-label={`${event.name}, ${formatRevenue(
                    amount,
                    currency
                  )}, ${event.order_count ?? 0} orders, ${event.event_date}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    minWidth: 0,
                    width: "100%",
                    padding: 0,
                    border: 0,
                    background: "transparent",
                    appearance: "none",
                    textAlign: "left",
                    font: "inherit",
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      width: 16,
                      fontSize: 10,
                      lineHeight: 1,
                      fontWeight: 700,
                      color:
                        index === 0
                          ? "var(--color-cream)"
                          : "rgba(247,245,240,0.65)",
                      textAlign: "center",
                      flexShrink: 0,
                    }}
                  >
                    {index + 1}
                  </div>

                  <div
                    style={{
                      flex: 1,
                      height: 9,
                      borderRadius: 999,
                      background: "rgba(247,245,240,0.12)",
                      overflow: "hidden",
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        width: `${width}%`,
                        height: "100%",
                        borderRadius: 999,
                        background:
                          index === 0 ? "var(--color-cream)" : "var(--color-sage)",
                        transition: "width 0.4s ease",
                      }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!loadFailed && topEvents.length > 0 && tooltip && (
        <div
          style={{
            position: "absolute",
            left: tooltip.x,
            top: tooltip.y,
            minWidth: TOOLTIP_WIDTH,
            maxWidth: "calc(100% - 24px)",
            background: "white",
            border: "1px solid var(--color-border)",
            borderRadius: 12,
            padding: "10px 14px",
            fontSize: 12,
            boxShadow: "0 4px 16px rgba(18,39,15,0.10)",
            pointerEvents: "none",
            zIndex: 10,
          }}
        >
          <p
            style={{
              margin: "0 0 8px",
              fontWeight: 600,
              color: "var(--color-muted)",
              fontSize: 11,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            {tooltip.event.event_date}
          </p>
          <p
            style={{
              margin: "0 0 6px",
              fontWeight: 700,
              color: "var(--color-forest)",
              fontSize: 14,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {formatRevenue(tooltip.event.total_revenue ?? 0, currency)}
          </p>
          <div
            style={{
              borderTop: "1px solid var(--color-border)",
              marginBottom: 6,
              marginTop: 6,
            }}
          />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              margin: "3px 0",
            }}
          >
            <span style={{ color: "var(--color-muted)", flexShrink: 0 }}>
              Event
            </span>
            <span
              style={{
                color: "var(--color-text)",
                fontWeight: 600,
                minWidth: 0,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {tooltip.event.name}
            </span>
          </div>
          {typeof tooltip.event.order_count === "number" && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                margin: "3px 0",
              }}
            >
              <span style={{ color: "var(--color-muted)", flexShrink: 0 }}>
                Orders
              </span>
              <span style={{ color: "var(--color-text)", fontWeight: 600 }}>
                {tooltip.event.order_count}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
