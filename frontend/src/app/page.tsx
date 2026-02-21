"use client";

import { useState, useEffect } from "react";
import Header from "@/components/Header";
import HeroSection from "@/components/HeroSection";
import OrderForm from "@/components/OrderForm";
import SuccessView from "@/components/SuccessView";
import { fetchEventConfig, type EventConfig } from "@/config/event";

interface OrderResult {
  order_id: string;
  order: {
    name: string;
    item_id: string;
    item_name: string;
    quantity: number;
    pickup_location: string;
    pickup_time_slot: string;
    total_price: number;
    price_per_item: number;
    currency: string;
    event_date: string;
  };
}

export default function Home() {
  const [orderResult, setOrderResult] = useState<OrderResult | null>(null);
  const [eventConfig, setEventConfig] = useState<EventConfig | null>(null);
  const [configError, setConfigError] = useState(false);

  useEffect(() => {
    fetchEventConfig()
      .then(setEventConfig)
      .catch(() => setConfigError(true));
  }, []);

  return (
    <main
      className="min-h-screen"
      style={{ background: "var(--color-cream)" }}
    >
      <Header />
      <HeroSection eventDate={eventConfig?.event.date ?? ""} />

      {/* Section divider */}
      <div className="max-w-2xl mx-auto px-6 mb-8">
        <div className="flex items-center gap-4">
          <div className="flex-1 h-px" style={{ background: "var(--color-border)" }} />
          <p
            className="text-xs font-semibold tracking-widest uppercase"
            style={{ color: "var(--color-sage)" }}
          >
            {orderResult ? "Order Confirmed" : "Pre-Order Below"}
          </p>
          <div className="flex-1 h-px" style={{ background: "var(--color-border)" }} />
        </div>
      </div>

      {configError ? (
        <div className="max-w-2xl mx-auto px-6 pb-16">
          <div className="rounded-3xl p-8 text-center" style={{ background: "white", border: "1px solid var(--color-border)" }}>
            <p style={{ color: "var(--color-muted)" }}>
              Unable to load the order form. Please refresh the page.
            </p>
          </div>
        </div>
      ) : !eventConfig ? (
        <div className="max-w-2xl mx-auto px-6 pb-16">
          <div className="rounded-3xl p-8 flex justify-center" style={{ background: "white", border: "1px solid var(--color-border)" }}>
            <svg className="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" opacity="0.3" />
              <path d="M12 2a10 10 0 0 1 10 10" />
            </svg>
          </div>
        </div>
      ) : orderResult ? (
        <SuccessView result={orderResult} />
      ) : (
        <OrderForm
          items={eventConfig.items}
          locations={eventConfig.locations}
          currency={eventConfig.currency}
          onSuccess={setOrderResult}
        />
      )}

      {/* Footer */}
      <footer
        className="text-center py-8 px-6"
        style={{ borderTop: "1px solid var(--color-border)" }}
      >
        <p className="text-xs" style={{ color: "var(--color-muted)" }}>
          © {new Date().getFullYear()} Loku Caters · Authentic Sri Lankan Cuisine
        </p>
      </footer>
    </main>
  );
}
