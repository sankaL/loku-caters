import HomeClient from "@/app/HomeClient";
import { fetchEventConfig } from "@/config/event";

export default async function Home() {
  let eventConfig = null;

  try {
    eventConfig = await fetchEventConfig();
  } catch (err) {
    console.error("Failed to load event config:", err);
  }

  return <HomeClient eventConfig={eventConfig} />;
}
