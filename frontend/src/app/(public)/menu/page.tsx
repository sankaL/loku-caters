import MenuClient from "./MenuClient";
import { getActiveEventConfig } from "@/config/event";
import { buildPageMetadata } from "@/config/metadata";

export const metadata = buildPageMetadata("menu");

export default function MenuPage() {
    const eventConfig = getActiveEventConfig();

    return <MenuClient eventConfig={eventConfig} />;
}
