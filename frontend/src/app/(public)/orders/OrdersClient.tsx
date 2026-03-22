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

export default function OrdersClient({ eventConfig }: { eventConfig: EventConfig | null }) {
    const [orderResult, setOrderResult] = useState<CheckoutResult | null>(null);
    const [feedbackOpen, setFeedbackOpen] = useState(false);
    const [feedbackOrigin, setFeedbackOrigin] = useState<FeedbackOrigin>("events_page_non_customer");
    const [autoOpenedFeedback, setAutoOpenedFeedback] = useState(false);
    const orderingAvailable = Boolean(eventConfig?.is_active);

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
                    onAutoOpen={() => {
                        captureEvent("feedback_modal_opened", {
                            origin: "event_reminder_email",
                            feedback_type: "feedback",
                        });
                        setFeedbackOrigin("event_reminder_email");
                        setFeedbackOpen(true);
                        setAutoOpenedFeedback(true);
                    }}
                />
            </Suspense>

            {orderingAvailable && !orderResult && (
                <HeroSection
                    eventDate={eventConfig?.event.date ?? ""}
                    heroHeader={eventConfig?.hero_header ?? ""}
                    heroHeaderSage={eventConfig?.hero_header_sage ?? ""}
                    heroSubheader={eventConfig?.hero_subheader ?? ""}
                    promoDetails={eventConfig?.promo_details ?? null}
                    tooltipEnabled={eventConfig?.tooltip_enabled ?? false}
                    tooltipHeader={eventConfig?.tooltip_header ?? null}
                    tooltipBody={eventConfig?.tooltip_body ?? null}
                    tooltipImagePath={eventConfig?.tooltip_image_path ?? null}
                    heroSideImagePath={eventConfig?.hero_side_image_path ?? null}
                    onFeedbackClick={() => {
                        captureEvent("feedback_modal_opened", {
                            origin: "events_page_non_customer",
                            feedback_type: "feedback",
                        });
                        setFeedbackOrigin("events_page_non_customer");
                        setFeedbackOpen(true);
                    }}
                />
            )}

            {orderingAvailable ? (
                <div className="max-w-2xl mx-auto px-6 mb-8">
                    <div className="text-center mb-10 animate-fade-up">
                        <div className="flex items-center gap-4">
                            <div className="flex-1 h-px bg-[color:var(--color-border)]" />
                            <p className="text-xs font-semibold tracking-widest uppercase text-[color:var(--color-sage)]">
                                {orderResult ? "Order Confirmed" : "Pre-Order Below"}
                            </p>
                            <div className="flex-1 h-px bg-[color:var(--color-border)]" />
                        </div>
                    </div>
                </div>
            ) : null}

            {!orderingAvailable ? (
                <NoEventPage />
            ) : orderResult ? (
                <SuccessView result={orderResult} />
            ) : (
                <OrderForm
                    items={eventConfig?.items ?? []}
                    locations={eventConfig?.locations ?? []}
                    comboDeals={eventConfig?.combo_deals ?? []}
                    onSuccess={handleOrderSuccess}
                />
            )}

            <FeedbackModal
                isOpen={feedbackOpen}
                onClose={() => setFeedbackOpen(false)}
                origin={feedbackOrigin}
            />
        </main>
    );
}
