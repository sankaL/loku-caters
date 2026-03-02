"use client";

import { useState } from "react";
import Link from "next/link";
import OrderForm from "@/components/OrderForm";
import SuccessView from "@/components/SuccessView";
import type { EventConfig } from "@/config/event";
import type { OrderResult } from "@/components/OrderForm";
import { captureEvent } from "@/lib/analytics";

export default function OrdersClient({ eventConfig }: { eventConfig: EventConfig | null }) {
    const [orderResults, setOrderResults] = useState<OrderResult[] | null>(null);

    if (!eventConfig || !eventConfig.is_active) {
        return (
            <main className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-[color:var(--color-cream)]">
                <h1 className="text-3xl md:text-5xl font-bold text-[color:var(--color-forest)] mb-6 animate-fade-up" style={{ fontFamily: "var(--font-serif)" }}>
                    No Active Events
                </h1>
                <p className="text-[color:var(--color-muted)] text-lg mb-10 max-w-md animate-fade-up delay-100">
                    There are currently no pop-up events running, but our kitchen is always open for your special occasions.
                </p>
                <Link
                    href="/catering-request"
                    className="inline-block bg-[color:var(--color-sage)] text-white px-8 py-3.5 rounded-full font-bold text-lg hover:bg-[color:var(--color-forest)] transition-all duration-300 shadow-md hover:shadow-lg transform hover:-translate-y-1 animate-fade-up delay-200"
                >
                    Request Catering
                </Link>
            </main>
        );
    }

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
        <main className="flex-1 bg-[color:var(--color-cream)] py-12 px-6">
            <div className="max-w-2xl mx-auto">
                <div className="text-center mb-10 animate-fade-up">
                    <span className="text-sm font-bold tracking-widest uppercase text-[color:var(--color-sage)] block mb-2">Live Event</span>
                    <h1 className="text-3xl md:text-4xl font-bold text-[color:var(--color-forest)] mb-4" style={{ fontFamily: "var(--font-serif)" }}>
                        {eventConfig.hero_header}
                    </h1>
                    <p className="text-[color:var(--color-muted)]">
                        {eventConfig.hero_subheader}
                    </p>
                </div>

                <div className="flex items-center gap-4 mb-8">
                    <div className="flex-1 h-px bg-[color:var(--color-border)]" />
                    <p className="text-xs font-semibold tracking-widest uppercase text-[color:var(--color-sage)]">
                        {orderResults ? "Order Confirmed" : "Pre-Order Below"}
                    </p>
                    <div className="flex-1 h-px bg-[color:var(--color-border)]" />
                </div>

                {orderResults ? (
                    <SuccessView results={orderResults} />
                ) : (
                    <div className="bg-white rounded-3xl p-6 md:p-8 shadow-xl border border-[color:var(--color-border)] animate-fade-up delay-100">
                        <OrderForm
                            items={eventConfig.items}
                            locations={eventConfig.locations}
                            onSuccess={handleOrderSuccess}
                        />
                    </div>
                )}
            </div>
        </main>
    );
}
