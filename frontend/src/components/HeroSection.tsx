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

        {/* Decorative food image — absolute, out of flow, right-aligned */}
        <div className="absolute right-0 inset-y-0 w-1/2 md:w-[45%] pointer-events-none select-none" aria-hidden="true">
          {/* Gradient fade so image dissolves into the dark green on the left */}
          <div
            className="absolute inset-y-0 left-0 w-4/5 z-10"
            style={{ background: "linear-gradient(to right, #12270F, transparent)" }}
          />
          {/* Bottom fade so image doesn't hard-clip */}
          <div
            className="absolute bottom-0 inset-x-0 h-8 z-10"
            style={{ background: "linear-gradient(to top, #12270F, transparent)" }}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/img/background-removed-background-removed.png"
            alt=""
            className="absolute inset-0 h-full w-full object-contain object-right-bottom opacity-70"
          />
        </div>

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
            className="text-base md:text-lg leading-relaxed mb-4 max-w-xl animate-fade-up delay-300"
            style={{ color: "#b8c8a8" }}
          >
            Back after a little while, so we&apos;re offering a special welcome-back price for this batch.
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
