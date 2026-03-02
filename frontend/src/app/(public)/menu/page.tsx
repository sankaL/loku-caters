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
    } catch (error) {
        console.error("Menu page: failed to fetch config:", error);
    }

    return <MenuClient eventConfig={eventConfig} />;
}
