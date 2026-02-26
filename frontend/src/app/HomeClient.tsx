"use client";

import { useState } from "react";
import Header from "@/components/Header";
import HeroSection from "@/components/HeroSection";
import OrderForm from "@/components/OrderForm";
import SuccessView from "@/components/SuccessView";
import FeedbackModal from "@/components/FeedbackModal";
import { captureEvent } from "@/lib/analytics";
import type { EventConfig } from "@/config/event";
import type { OrderResult } from "@/components/OrderForm";

export default function HomeClient({ eventConfig }: { eventConfig: EventConfig }) {
  const [orderResults, setOrderResults] = useState<OrderResult[] | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

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
    <main className="min-h-screen" style={{ background: "var(--color-cream)" }}>
      <Header />

      {!orderResults && (
        <HeroSection
          eventDate={eventConfig.event.date}
          heroHeader={eventConfig.hero_header}
          heroHeaderSage={eventConfig.hero_header_sage}
          heroSubheader={eventConfig.hero_subheader}
          promoDetails={eventConfig.promo_details}
          tooltipEnabled={eventConfig.tooltip_enabled}
          tooltipHeader={eventConfig.tooltip_header}
          tooltipBody={eventConfig.tooltip_body}
          tooltipImagePath={eventConfig.tooltip_image_path}
          heroSideImagePath={eventConfig.hero_side_image_path}
          onFeedbackClick={() => {
            captureEvent("feedback_modal_opened");
            setFeedbackOpen(true);
          }}
        />
      )}

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

      {orderResults ? (
        <SuccessView results={orderResults} />
      ) : (
        <OrderForm
          items={eventConfig.items}
          locations={eventConfig.locations}
          onSuccess={handleOrderSuccess}
        />
      )}

      <FeedbackModal isOpen={feedbackOpen} onClose={() => setFeedbackOpen(false)} />

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
