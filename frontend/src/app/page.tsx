"use client";

import { useState } from "react";
import Header from "@/components/Header";
import HeroSection from "@/components/HeroSection";
import OrderForm from "@/components/OrderForm";
import SuccessView from "@/components/SuccessView";

interface OrderResult {
  order_id: string;
  order: {
    name: string;
    quantity: number;
    pickup_location: string;
    pickup_time_slot: string;
    total_price: number;
  };
}

export default function Home() {
  const [orderResult, setOrderResult] = useState<OrderResult | null>(null);

  return (
    <main
      className="min-h-screen"
      style={{ background: "var(--color-cream)" }}
    >
      <Header />
      <HeroSection />

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

      {orderResult ? (
        <SuccessView result={orderResult} />
      ) : (
        <OrderForm onSuccess={setOrderResult} />
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
