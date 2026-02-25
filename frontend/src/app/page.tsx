"use client";

import { useState, useEffect } from "react";
import Header from "@/components/Header";
import HeroSection from "@/components/HeroSection";
import OrderForm from "@/components/OrderForm";
import SuccessView from "@/components/SuccessView";
import { fetchEventConfig, type EventConfig } from "@/config/event";
import { captureEvent } from "@/lib/analytics";
import type { OrderResult } from "@/components/OrderForm";
import FeedbackModal from "@/components/FeedbackModal";

export default function Home() {
  const [orderResults, setOrderResults] = useState<OrderResult[] | null>(null);
  const [eventConfig, setEventConfig] = useState<EventConfig | null>(null);
  const [configError, setConfigError] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  useEffect(() => {
    fetchEventConfig()
      .then(setEventConfig)
      .catch(() => setConfigError(true));
  }, []);

  function handleOrderSuccess(results: OrderResult[]) {
    results.forEach((result) => {
      captureEvent("order_submitted", {
        order_id: result.order_id,
        item_id: result.order.item_id,
        quantity: result.order.quantity,
        total_price: result.order.total_price,
        currency: result.order.currency,
        pickup_location: result.order.pickup_location,
        pickup_time_slot: result.order.pickup_time_slot,
      });
    });
    setOrderResults(results);
  }

  return (
    <main
      className="min-h-screen"
      style={{ background: "var(--color-cream)" }}
    >
      <Header />
      {!orderResults && (
        <HeroSection
          eventDate={eventConfig?.event.date ?? ""}
          heroHeader={eventConfig?.hero_header ?? ""}
          heroHeaderSage={eventConfig?.hero_header_sage ?? ""}
          heroSubheader={eventConfig?.hero_subheader ?? ""}
          promoDetails={eventConfig?.promo_details}
          tooltipEnabled={eventConfig?.tooltip_enabled ?? false}
          tooltipHeader={eventConfig?.tooltip_header}
          tooltipBody={eventConfig?.tooltip_body}
          tooltipImagePath={eventConfig?.tooltip_image_path}
          heroSideImagePath={eventConfig?.hero_side_image_path}
          onFeedbackClick={() => {
            captureEvent("feedback_modal_opened");
            setFeedbackOpen(true);
          }}
        />
      )}

      {/* Section divider */}
      <div className="max-w-2xl mx-auto px-6 mb-8">
        <div className="flex items-center gap-4">
          <div className="flex-1 h-px" style={{ background: "var(--color-border)" }} />
          <p
            className="text-xs font-semibold tracking-widest uppercase"
            style={{ color: "var(--color-sage)" }}
          >
            {orderResults ? "Order Confirmed" : "Pre-Order Below"}
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
      ) : orderResults ? (
        <SuccessView results={orderResults} />
      ) : (
        <OrderForm
          items={eventConfig.items}
          locations={eventConfig.locations}
          onSuccess={handleOrderSuccess}
        />
      )}

      <FeedbackModal isOpen={feedbackOpen} onClose={() => setFeedbackOpen(false)} />

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
