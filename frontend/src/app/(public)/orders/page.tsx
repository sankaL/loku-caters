import OrdersClient from "./OrdersClient";
import { getActiveEventConfig } from "@/config/event";
import { buildPageMetadata } from "@/config/metadata";

export const metadata = buildPageMetadata("orders");

export default function OrdersPage() {
    const eventConfig = getActiveEventConfig();

    return <OrdersClient eventConfig={eventConfig} />;
}
