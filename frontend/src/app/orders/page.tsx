import OrdersClient from "./OrdersClient";
import { fetchEventConfig } from "@/config/event";

export const metadata = {
    title: "Live Orders | Loku Caters",
    description: "Place your order for our current Loku Caters pop-up event.",
};

export default async function OrdersPage() {
    let eventConfig = null;

    try {
        eventConfig = await fetchEventConfig();
    } catch (err) {
        console.error("Failed to load event config:", err);
    }

    return <OrdersClient eventConfig={eventConfig} />;
}
