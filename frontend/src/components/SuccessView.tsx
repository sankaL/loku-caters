import { CURRENCY } from "@/config/event";

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

interface SuccessViewProps {
  result: OrderResult;
}

export default function SuccessView({ result }: SuccessViewProps) {
  const { order, order_id } = result;

  return (
    <section className="w-full max-w-2xl mx-auto px-6 pb-20">
      <div
        className="rounded-3xl p-8 md:p-12 text-center shadow-sm animate-scale-in"
        style={{
          background: "white",
          border: "1px solid var(--color-border)",
        }}
      >
        {/* Success icon */}
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
          style={{ background: "var(--color-cream)" }}
        >
          <svg
            width="44"
            height="44"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#729152"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
        </div>

        {/* Heading */}
        <h2
          className="text-3xl md:text-4xl font-bold mb-3"
          style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}
        >
          Order Placed!
        </h2>
        <p className="text-base mb-8" style={{ color: "var(--color-muted)" }}>
          Thank you, <strong style={{ color: "var(--color-text)" }}>{order.name}</strong>. Your Lamprais pre-order has been submitted.
        </p>

        {/* Order summary card */}
        <div
          className="rounded-2xl p-6 text-left mb-8 space-y-3"
          style={{ background: "var(--color-cream)", border: "1px solid var(--color-border)" }}
        >
          <p className="text-xs uppercase tracking-widest font-semibold mb-4" style={{ color: "var(--color-sage)" }}>
            Your Order
          </p>

          {[
            { label: "Lamprais", value: `${order.quantity} ${order.quantity === 1 ? "portion" : "portions"}` },
            { label: "Pickup Location", value: order.pickup_location },
            { label: "Time Slot", value: order.pickup_time_slot },
            { label: "Order Total", value: `${CURRENCY} $${order.total_price.toFixed(2)}` },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between items-center text-sm border-b pb-3 last:border-0 last:pb-0" style={{ borderColor: "var(--color-border)" }}>
              <span style={{ color: "var(--color-muted)" }}>{label}</span>
              <span className="font-semibold" style={{ color: "var(--color-text)" }}>{value}</span>
            </div>
          ))}
        </div>

        {/* Email confirmation notice */}
        <div
          className="rounded-2xl p-5 mb-6 flex gap-4 items-start text-left"
          style={{ background: "#f0f7eb", border: "1px solid #c8ddb4" }}
        >
          <div className="mt-0.5 flex-shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#729152" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold mb-1" style={{ color: "#2d5a18" }}>
              Check your inbox
            </p>
            <p className="text-sm leading-relaxed" style={{ color: "#4a7a28" }}>
              We&apos;ve sent a confirmation to your email. We&apos;ll follow up to confirm your order and
              provide the <strong>pickup address</strong> before your scheduled time. Please don&apos;t hesitate to reply if you have any questions.
            </p>
          </div>
        </div>

        <p className="text-base font-medium mb-1" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>
          We look forward to serving you! 🌿
        </p>
        <p className="text-xs" style={{ color: "var(--color-muted)" }}>
          Order reference: {order_id.slice(0, 8).toUpperCase()}
        </p>
      </div>
    </section>
  );
}
