import HomeClient from "@/app/HomeClient";
import { fetchEventConfig, type EventConfig } from "@/config/event";

export default async function Home() {
  let eventConfig: EventConfig | null = null;

  try {
    eventConfig = await fetchEventConfig();
  } catch (err) {
    console.error("Failed to load event config:", err);
  }

  return <HomeClient eventConfig={eventConfig} />;
}
