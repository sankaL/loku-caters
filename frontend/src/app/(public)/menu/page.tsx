import MenuClient from "./MenuClient";
import { fetchEventConfig } from "@/config/event";

export const metadata = {
    title: "Catering Menu | Loku Caters",
    description: "Explore our rich selection of authentic Sri Lankan appetizers, classic curries, lamprais, and desserts.",
};

export default async function MenuPage() {
    let eventConfig = null;

    try {
        eventConfig = await fetchEventConfig();
    } catch (err) {
        console.error("Failed to load event config:", err);
    }

    return <MenuClient eventConfig={eventConfig} />;
}
