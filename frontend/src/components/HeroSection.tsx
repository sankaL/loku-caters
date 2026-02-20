import { EVENT_DATE } from "@/config/event";

export default function HeroSection() {
  return (
    <section className="w-full max-w-5xl mx-auto px-6 pt-4 pb-12">
      <div
        className="rounded-3xl overflow-hidden relative"
        style={{ background: "var(--color-forest)" }}
      >
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage:
              "radial-gradient(circle at 80% 50%, #729152 0%, transparent 60%)",
          }}
        />

        <div className="relative px-8 py-10 md:px-14 md:py-16">
          {EVENT_DATE && (
            <p
              className="text-xs font-semibold tracking-widest uppercase mb-4 animate-fade-up"
              style={{ color: "var(--color-sage)" }}
            >
              {EVENT_DATE}
            </p>
          )}

          <h1
            className="text-4xl md:text-5xl font-bold leading-tight mb-4 animate-fade-up delay-100"
            style={{ color: "var(--color-cream)", fontFamily: "var(--font-serif)" }}
          >
            We&apos;re Cooking
            <br />
            <span style={{ color: "#a8c882" }}>Lamprais</span>
          </h1>

          <p
            className="text-base md:text-lg leading-relaxed mb-2 max-w-xl animate-fade-up delay-200"
            style={{ color: "#b8c8a8" }}
          >
            We&apos;re making a fresh batch and we&apos;d love for you to have some.
          </p>

          <p
            className="text-sm animate-fade-up delay-300"
            style={{ color: "#8a9a7a" }}
          >
            Scroll down to pre-order and we&apos;ll confirm via email before pickup.
          </p>
        </div>
      </div>
    </section>
  );
}
