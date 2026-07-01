import MenuClient from "./MenuClient";
import { fetchEventConfig } from "@/config/event";
import { buildPageMetadata } from "@/config/metadata";

export const metadata = buildPageMetadata("menu");

export default async function MenuPage() {
    let eventConfig = null;

    try {
        eventConfig = await fetchEventConfig();
    } catch (err) {
        console.error("Failed to load event config:", err);
    }

    return <MenuClient eventConfig={eventConfig} />;
}
