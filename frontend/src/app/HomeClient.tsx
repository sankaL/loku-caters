"use client";

import Link from "next/link";
import type { EventConfig } from "@/config/event";

export default function HomeClient({ eventConfig }: { eventConfig: EventConfig | null }) {
  const isActive = eventConfig !== null;

  return (
    <main className="flex-1 flex flex-col bg-[color:var(--color-cream)]">

      {/* Hero Section */}
      <section className="relative w-full min-h-[85vh] flex items-center justify-center overflow-hidden">
        {/* Background Image / Overlay */}
        <div className="absolute inset-0 z-0 bg-[color:var(--color-cream)]">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: "url('/assets/food/multi-food6.jpg')" }}
          />
          <div className="absolute inset-0 bg-black/40" />
          {/* Smooth opaque gradient transition to the next section */}
          <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-[color:var(--color-cream)] to-transparent" />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto px-6 text-center animate-fade-up">
          <h1 className="text-5xl md:text-7xl font-bold leading-tight mb-6 text-white drop-shadow-lg" style={{ fontFamily: "var(--font-serif)" }}>
            Authentic Sri Lankan Catering
          </h1>
          <p className="text-lg md:text-2xl text-[color:var(--color-cream)] mb-10 max-w-2xl mx-auto font-light opacity-80 drop-shadow-md tracking-wide">
            Bold flavors and traditional recipes for events of any scale.
          </p>

          {/* Dynamic CTA Block */}
          <div className={`backdrop-blur-md border p-8 rounded-3xl max-w-xl mx-auto shadow-2xl animate-fade-up delay-200 ${isActive ? "bg-black/40 border-white/30" : "bg-white/10 border-white/20"}`}>
            {isActive ? (
              <>
                <h2 className="text-xl font-semibold text-white mb-2">
                  We are currently accepting orders for {eventConfig.event.date}!
                </h2>
                <p className="text-[color:var(--color-cream)] opacity-80 text-sm mb-6">
                  {eventConfig.hero_subheader || "Pre-order your meal before quantities run out."}
                </p>
                <Link
                  href="/orders"
                  className="inline-block bg-[color:var(--color-sage)] text-white px-8 py-3.5 rounded-full font-bold text-lg hover:bg-[color:var(--color-forest)] hover:scale-105 transition-all duration-300 shadow-lg"
                >
                  Order Now
                </Link>
              </>
            ) : (
              <>
                <h2 className="text-xl font-semibold text-white mb-2">
                  No active events at this moment!
                </h2>
                <p className="text-[color:var(--color-cream)] opacity-80 text-sm mb-6">
                  Our next batch of Loku Caters is still taking shape. We will share it the moment it is ready. In the meantime, let us cater your next event.
                </p>
                <Link
                  href="/catering-request"
                  className="inline-block bg-[color:var(--color-sage)] text-white px-8 py-3.5 rounded-full font-bold text-lg hover:bg-[color:var(--color-forest)] hover:scale-105 transition-all duration-300 shadow-lg"
                >
                  Request Catering
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* About Snippet */}
      <section className="pb-24 pt-12 px-6 bg-[color:var(--color-cream)]">
        <div className="max-w-4xl mx-auto text-center animate-fade-up">
          <div className="text-[color:var(--color-sage)] flex justify-center mb-6">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
              <path d="M7 2v20" />
              <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
            </svg>
          </div>
          <h2 className="text-3xl md:text-5xl font-bold mb-8 text-[color:var(--color-forest)]" style={{ fontFamily: "var(--font-serif)" }}>
            Crafted with Passion
          </h2>
          <p className="text-lg md:text-xl text-[color:var(--color-muted)] leading-relaxed max-w-3xl mx-auto mb-10">
            At Loku Caters, we believe that food is the heart of every gathering. We combine quality ingredients with authentic family recipes to deliver a culinary experience that your guests will remember long after the last bite.
          </p>
          <Link
            href="/about"
            className="inline-flex items-center gap-2 text-[color:var(--color-sage)] font-semibold hover:text-[color:var(--color-forest)] transition-colors text-lg"
          >
            Discover Our Story
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>
          </Link>
        </div>
      </section>

      {/* Visual Highlights */}
      <section className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16 animate-fade-up">
            <span className="text-sm font-bold tracking-widest uppercase text-[color:var(--color-sage)] block mb-4">Our Menu</span>
            <h2 className="text-3xl md:text-5xl font-bold text-[color:var(--color-forest)]" style={{ fontFamily: "var(--font-serif)" }}>
              Signature Dishes
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { title: "Traditional Lamprais", desc: "A fragrant mixed meat curry, frikkadel, blachan, and seeni sambal, wrapped and baked in a banana leaf.", image: "/assets/food/lamprais.jpg" },
              { title: "Chicken Biryani with Raita", desc: "Aromatic basmati rice cooked with rich spices, tender chicken, and served with cooling raita.", image: "/assets/food/chicken-biryani.jpg" },
              { title: "Fish Rolls", desc: "Crispy, golden-fried rolls filled with a savory mix of spiced fish and potatoes. A classic Sri Lankan short eat.", image: "/assets/food/rolls2.jpg" }
            ].map((dish, idx) => (
              <div
                key={idx}
                className={`group bg-white rounded-3xl overflow-hidden border border-[color:var(--color-border)] shadow-sm hover:shadow-xl transition-all duration-300 transform hover:-translate-y-2 animate-fade-up delay-${(idx + 1) * 100}`}
              >
                <div
                  className="aspect-[4/3] bg-[color:var(--color-cream-dark)] relative overflow-hidden flex items-center justify-center bg-cover bg-center"
                  style={{ backgroundImage: `url('${dish.image}')` }}
                >
                  {!dish.image && <span className="text-[color:var(--color-muted)] opacity-50 font-medium">Image coming soon</span>}
                  {/* Subtle hover effect for images when they exist */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors" />
                </div>
                <div className="p-8">
                  <h3 className="text-xl font-bold text-[color:var(--color-forest)] mb-3" style={{ fontFamily: "var(--font-serif)" }}>{dish.title}</h3>
                  <p className="text-[color:var(--color-muted)] text-sm leading-relaxed mb-6">
                    {dish.desc}
                  </p>
                  <Link href="/menu" className="text-sm font-bold text-[color:var(--color-sage)] hover:text-[color:var(--color-forest)] transition-colors">
                    Explore Menu &rarr;
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

    </main>
  );
}
