"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import OrderForm from "@/components/OrderForm";
import SuccessView from "@/components/SuccessView";
import NoEventPage from "@/components/NoEventPage";
import HeroSection from "@/components/HeroSection";
import FeedbackModal, { type FeedbackOrigin } from "@/components/FeedbackModal";
import type { EventConfig } from "@/config/event";
import type { CheckoutResult } from "@/components/OrderForm";
import { captureEvent } from "@/lib/analytics";

function FeedbackAutoOpen({
    autoOpenedFeedback,
    onAutoOpen,
}: {
    autoOpenedFeedback: boolean;
    onAutoOpen: () => void;
}) {
    const searchParams = useSearchParams();

    useEffect(() => {
        if (autoOpenedFeedback) return;
        if (searchParams.get("feedback") !== "event-reminder") return;

        onAutoOpen();
    }, [autoOpenedFeedback, onAutoOpen, searchParams]);

    return null;
}

function OrderSectionHeader({ confirmed }: { confirmed: boolean }) {
    return (
        <div className="max-w-2xl mx-auto px-6 mb-8">
            <div className="text-center mb-10 animate-fade-up">
                <div className="flex items-center gap-4">
                    <div className="flex-1 h-px bg-[color:var(--color-border)]" />
                    <p className="text-xs font-semibold tracking-widest uppercase text-[color:var(--color-sage)]">
                        {confirmed ? "Order Confirmed" : "Pre-Order Below"}
                    </p>
                    <div className="flex-1 h-px bg-[color:var(--color-border)]" />
                </div>
            </div>
        </div>
    );
}

function ActiveOrderExperience({
    eventConfig,
    orderResult,
    onOrderSuccess,
    onFeedbackClick,
}: {
    eventConfig: EventConfig;
    orderResult: CheckoutResult | null;
    onOrderSuccess: (result: CheckoutResult) => void;
    onFeedbackClick: () => void;
}) {
    if (orderResult) {
        return (
            <>
                <OrderSectionHeader confirmed />
                <SuccessView result={orderResult} />
            </>
        );
    }

    return (
        <>
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
                onFeedbackClick={onFeedbackClick}
            />
            <OrderSectionHeader confirmed={false} />
            <OrderForm
                items={eventConfig.items}
                locations={eventConfig.locations}
                comboDeals={eventConfig.combo_deals}
                onSuccess={onOrderSuccess}
            />
        </>
    );
}

function OrderExperience({
    eventConfig,
    orderResult,
    onOrderSuccess,
    onFeedbackClick,
}: {
    eventConfig: EventConfig | null;
    orderResult: CheckoutResult | null;
    onOrderSuccess: (result: CheckoutResult) => void;
    onFeedbackClick: () => void;
}) {
    if (!eventConfig?.is_active) return <NoEventPage />;
    return (
        <ActiveOrderExperience
            eventConfig={eventConfig}
            orderResult={orderResult}
            onOrderSuccess={onOrderSuccess}
            onFeedbackClick={onFeedbackClick}
        />
    );
}

export default function OrdersClient({ eventConfig }: { eventConfig: EventConfig | null }) {
    const [orderResult, setOrderResult] = useState<CheckoutResult | null>(null);
    const [feedbackOpen, setFeedbackOpen] = useState(false);
    const [feedbackOrigin, setFeedbackOrigin] = useState<FeedbackOrigin>("events_page_non_customer");
    const [autoOpenedFeedback, setAutoOpenedFeedback] = useState(false);

    function openFeedback(origin: FeedbackOrigin) {
        captureEvent("feedback_modal_opened", {
            origin,
            feedback_type: "feedback",
        });
        setFeedbackOrigin(origin);
        setFeedbackOpen(true);
    }

    function handleAutoOpenFeedback() {
        openFeedback("event_reminder_email");
        setAutoOpenedFeedback(true);
    }

    function handleOrderSuccess(result: CheckoutResult) {
        result.order.lines.forEach((line) => {
            captureEvent("order_submitted", {
                order_id: line.order_id,
                group_id: result.group_id,
                item_id: line.item_id,
                quantity: line.quantity,
                total_price: line.total_price,
                currency: result.order.currency,
                pickup_location: result.order.pickup_location,
                pickup_time_slot: result.order.pickup_time_slot,
            });
        });
        setOrderResult(result);
    }

    return (
        <main className="flex-1 bg-[color:var(--color-cream)] py-4 md:py-6">
            <Suspense fallback={null}>
                <FeedbackAutoOpen
                    autoOpenedFeedback={autoOpenedFeedback}
                    onAutoOpen={handleAutoOpenFeedback}
                />
            </Suspense>

            <OrderExperience
                eventConfig={eventConfig}
                orderResult={orderResult}
                onOrderSuccess={handleOrderSuccess}
                onFeedbackClick={() => openFeedback("events_page_non_customer")}
            />

            <FeedbackModal
                isOpen={feedbackOpen}
                onClose={() => setFeedbackOpen(false)}
                origin={feedbackOrigin}
            />
        </main>
    );
}
