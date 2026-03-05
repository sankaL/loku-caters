"use client";

import { useMemo, useState } from "react";
import {
  getMinimumOrderQuantity,
  linesFromQuantities,
  type OrderLineItem,
} from "@/lib/orderLineUtils";

interface ItemQuantityPickerProps {
  items: OrderLineItem[];
  quantities: Record<string, number>;
  onChange: (next: Record<string, number>) => void;
  currency: string;
  disabled?: boolean;
  error?: string | null;
}

export default function ItemQuantityPicker({
  items,
  quantities,
  onChange,
  currency,
  disabled = false,
  error,
}: ItemQuantityPickerProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");

  const selectedLines = useMemo(
    () => linesFromQuantities(items, quantities),
    [items, quantities]
  );

  const pickerItems = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      return (
        item.name.toLowerCase().includes(q) ||
        (item.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [items, pickerSearch]);

  function updateQty(itemId: string, delta: number) {
    if (disabled) return;

    const item = items.find((entry) => entry.id === itemId);
    if (!item || item.is_locked) return;

    const currentQty = quantities[itemId] ?? 0;
    const minimumOrderQuantity = getMinimumOrderQuantity(item);
    const next = { ...quantities };

    if (delta > 0) {
      next[itemId] = currentQty === 0 ? minimumOrderQuantity : currentQty + delta;
      onChange(next);
      return;
    }

    if (delta < 0) {
      if (currentQty <= minimumOrderQuantity) {
        delete next[itemId];
        onChange(next);
        return;
      }
      next[itemId] = Math.max(minimumOrderQuantity, currentQty + delta);
      onChange(next);
    }
  }

  return (
    <div>
      <label className="block text-xs font-semibold mb-1.5" style={{ color: "var(--color-muted)" }}>
        Your Items
      </label>

      {selectedLines.length === 0 ? (
        <div
          style={{
            border: "1px dashed var(--color-border)",
            borderRadius: 16,
            padding: "18px 14px",
            textAlign: "center",
          }}
        >
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>No items added yet.</p>
        </div>
      ) : (
        <div className="space-y-2 mb-3">
          {selectedLines.map(({ item, qty }) => {
            const price = item.discounted_price ?? item.price;
            const minimumOrderQuantity = getMinimumOrderQuantity(item);
            return (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-xl px-4 py-2.5"
                style={{ border: "1px solid var(--color-sage)", background: "#f0fdf4" }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: "var(--color-forest)" }}>
                    {item.name}
                  </p>
                  <p className="text-xs" style={{ color: "var(--color-muted)" }}>
                    {currency} ${price.toFixed(2)} each
                  </p>
                  {item.is_locked ? (
                    <p className="text-xs font-semibold" style={{ color: "var(--color-bark)" }}>
                      Legacy item (locked)
                    </p>
                  ) : (
                    minimumOrderQuantity > 1 && (
                      <p className="text-xs" style={{ color: "var(--color-muted)" }}>
                        Minimum order: {minimumOrderQuantity}
                      </p>
                    )
                  )}
                </div>

                {item.is_locked ? (
                  <div
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold shrink-0"
                    style={{ background: "var(--color-cream)", color: "var(--color-bark)", border: "1px solid var(--color-border)" }}
                  >
                    Locked
                  </div>
                ) : (
                  <div className="flex items-center gap-0 shrink-0">
                    <button
                      type="button"
                      onClick={() => updateQty(item.id, -1)}
                      className="flex items-center justify-center w-9 h-9 rounded-l-xl border border-r-0 text-base font-semibold transition-all"
                      style={{ borderColor: "var(--color-sage)", color: "var(--color-forest)", background: "white" }}
                      aria-label={`Decrease ${item.name} quantity`}
                    >
                      -
                    </button>
                    <div
                      className="w-10 h-9 flex items-center justify-center text-sm font-semibold border-t border-b"
                      style={{ borderColor: "var(--color-sage)", color: "var(--color-text)", background: "white" }}
                    >
                      {qty}
                    </div>
                    <button
                      type="button"
                      onClick={() => updateQty(item.id, 1)}
                      className="flex items-center justify-center w-9 h-9 rounded-r-xl border border-l-0 text-base font-semibold transition-all"
                      style={{ borderColor: "var(--color-sage)", color: "var(--color-forest)", background: "white" }}
                      aria-label={`Increase ${item.name} quantity`}
                    >
                      +
                    </button>
                  </div>
                )}

                <p className="text-sm font-bold shrink-0" style={{ color: "var(--color-forest)" }}>
                  {currency} ${(price * qty).toFixed(2)}
                </p>
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          if (disabled) return;
          setPickerSearch("");
          setPickerOpen(true);
        }}
        className="w-full py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ background: "var(--color-sage)", color: "white", border: "1px solid var(--color-sage)" }}
        disabled={disabled}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
        See Menu
      </button>

      {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}

      {pickerOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 300,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
            background: "rgba(0,0,0,0.45)",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setPickerOpen(false);
            }
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "520px",
              maxHeight: "min(calc(100dvh - 32px), 85vh)",
              minHeight: 0,
              background: "white",
              borderRadius: "24px",
              border: "1px solid var(--color-border)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center justify-between px-5 py-4 border-b shrink-0"
              style={{ borderColor: "var(--color-border)" }}
            >
              <h3 className="text-base font-bold" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>
                Add Items
              </h3>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-sm font-semibold transition-all"
                style={{ color: "var(--color-muted)", background: "var(--color-cream)", border: "1px solid var(--color-border)" }}
                aria-label="Close item picker"
              >
                X
              </button>
            </div>

            <div className="px-5 py-3 border-b shrink-0" style={{ borderColor: "var(--color-border)" }}>
              <input
                type="text"
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                placeholder="Search items..."
                className="w-full px-4 py-2.5 rounded-xl text-sm border bg-white focus:outline-none focus:ring-2 transition-all"
                style={{
                  borderColor: "var(--color-border)",
                  color: "var(--color-text)",
                }}
              />
            </div>

            <div
              className="overflow-y-auto flex-1 min-h-0 px-5 py-3 space-y-2"
              style={{ overscrollBehavior: "contain" }}
            >
              {pickerItems.length === 0 ? (
                <p className="text-sm py-4 text-center" style={{ color: "var(--color-muted)" }}>
                  No items match your search.
                </p>
              ) : (
                pickerItems.map((item) => {
                  const qty = quantities[item.id] ?? 0;
                  const inCart = qty > 0;
                  const price = item.discounted_price ?? item.price;
                  const minimumOrderQuantity = getMinimumOrderQuantity(item);
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 rounded-2xl px-4 py-3 transition-all"
                      style={{
                        border: `1px solid ${inCart ? "var(--color-sage)" : "var(--color-border)"}`,
                        background: inCart ? "#f0fdf4" : "white",
                        opacity: item.is_locked ? 0.9 : 1,
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: "var(--color-forest)" }}>{item.name}</p>
                        {item.description && (
                          <p className="text-xs mt-0.5 truncate" style={{ color: "var(--color-muted)" }}>{item.description}</p>
                        )}
                        <div className="mt-0.5 flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold" style={{ color: "var(--color-forest)" }}>
                            {currency} ${price.toFixed(2)}
                          </span>
                          {item.discounted_price != null && (
                            <span className="text-xs line-through font-medium" style={{ color: "#e05252" }}>
                              {currency} ${item.price.toFixed(2)}
                            </span>
                          )}
                          {item.is_locked ? (
                            <span className="text-xs font-semibold" style={{ color: "var(--color-bark)" }}>
                              Locked legacy item
                            </span>
                          ) : (
                            minimumOrderQuantity > 1 && (
                              <span className="text-xs font-semibold" style={{ color: "var(--color-sage)" }}>
                                Min {minimumOrderQuantity}
                              </span>
                            )
                          )}
                        </div>
                      </div>

                      {item.is_locked ? (
                        <div
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold shrink-0"
                          style={{ background: "var(--color-cream)", color: "var(--color-bark)", border: "1px solid var(--color-border)" }}
                        >
                          Locked
                        </div>
                      ) : inCart ? (
                        <div className="flex items-center gap-0 shrink-0">
                          <button
                            type="button"
                            onClick={() => updateQty(item.id, -1)}
                            className="flex items-center justify-center w-9 h-9 rounded-l-xl border border-r-0 text-base font-semibold transition-all"
                            style={{ borderColor: "var(--color-sage)", color: "var(--color-forest)", background: "white" }}
                            aria-label={`Decrease ${item.name} quantity`}
                          >
                            -
                          </button>
                          <div
                            className="w-10 h-9 flex items-center justify-center text-sm font-semibold border-t border-b"
                            style={{ borderColor: "var(--color-sage)", color: "var(--color-text)", background: "white" }}
                          >
                            {qty}
                          </div>
                          <button
                            type="button"
                            onClick={() => updateQty(item.id, 1)}
                            className="flex items-center justify-center w-9 h-9 rounded-r-xl border border-l-0 text-base font-semibold transition-all"
                            style={{ borderColor: "var(--color-sage)", color: "var(--color-forest)", background: "white" }}
                            aria-label={`Increase ${item.name} quantity`}
                          >
                            +
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => updateQty(item.id, 1)}
                          className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                          style={{ border: "1px solid var(--color-sage)", color: "var(--color-forest)", background: "white" }}
                        >
                          + Add
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div
              className="px-5 py-4 border-t shrink-0 flex items-center justify-between gap-3"
              style={{ borderColor: "var(--color-border)" }}
            >
              <p className="text-sm" style={{ color: "var(--color-muted)" }}>
                {selectedLines.length} item{selectedLines.length !== 1 ? "s" : ""} selected
              </p>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
