import HomeClient from "@/app/HomeClient";
import { getActiveEventConfig } from "@/config/event";
import { buildPageMetadata } from "@/config/metadata";

export const metadata = buildPageMetadata("home");

export default function Home() {
  const eventConfig = getActiveEventConfig();

  return <HomeClient eventConfig={eventConfig} />;
}
