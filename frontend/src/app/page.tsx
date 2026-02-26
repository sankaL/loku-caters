import Header from "@/components/Header";
import NoEventPage from "@/components/NoEventPage";
import HomeClient from "@/app/HomeClient";
import { fetchEventConfig } from "@/config/event";

export default async function Home() {
  try {
    const eventConfig = await fetchEventConfig();

    if (!eventConfig) {
      return (
        <main className="min-h-screen" style={{ background: "var(--color-cream)" }}>
          <Header />
          <NoEventPage />
        </main>
      );
    }

    return <HomeClient eventConfig={eventConfig} />;
  } catch {
    return (
      <main className="min-h-screen" style={{ background: "var(--color-cream)" }}>
        <Header />
        <div className="max-w-2xl mx-auto px-6 pb-16">
          <div
            className="rounded-3xl p-8 text-center"
            style={{ background: "white", border: "1px solid var(--color-border)" }}
          >
            <p style={{ color: "var(--color-muted)" }}>
              Unable to load the order page. Please refresh the page.
            </p>
          </div>
        </div>
      </main>
    );
  }
}
