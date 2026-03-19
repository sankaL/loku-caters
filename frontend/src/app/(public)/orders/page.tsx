import OrdersClient from "./OrdersClient";
import { fetchEventConfig } from "@/config/event";

export const metadata = {
    title: "Live Orders | Loku Caters",
    description: "Place your order for our current Loku Caters pop-up event.",
};

function parseRequestedEventId(rawValue: string | string[] | undefined): number | null {
    const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
    if (!value) return null;

    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed) || parsed < 1) {
        return null;
    }

    return parsed;
}

export default async function OrdersPage({
    searchParams,
}: {
    searchParams: Promise<{ event_id?: string | string[] }>;
}) {
    const resolvedSearchParams = await searchParams;
    const requestedEventId = parseRequestedEventId(resolvedSearchParams.event_id);
    let eventConfig = null;

    try {
        eventConfig = await fetchEventConfig(requestedEventId);
    } catch (err) {
        console.error("Failed to load event config:", err);
    }

    return <OrdersClient eventConfig={eventConfig} />;
}
