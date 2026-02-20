interface HeroSectionProps {
  eventDate: string;
}

export default function HeroSection({ eventDate }: HeroSectionProps) {
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

        {/* Decorative food image */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/assets/img/background-removed-background-removed.png"
          alt=""
          aria-hidden="true"
          className="hidden md:block absolute right-0 inset-y-0 h-full w-auto max-w-[50%] object-contain object-right-bottom pointer-events-none select-none opacity-80"
          style={{
            maskImage: "linear-gradient(to right, transparent 0%, black 45%)",
            WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 45%)",
          }}
        />

        <div className="relative px-8 py-10 md:px-14 md:py-16">
          {eventDate && (
            <p
              className="text-xs font-semibold tracking-widest uppercase mb-4 animate-fade-up"
              style={{ color: "var(--color-sage)" }}
            >
              {eventDate}
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
            className="text-sm mb-4 max-w-xl animate-fade-up delay-300"
            style={{ color: "#a8c882" }}
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
