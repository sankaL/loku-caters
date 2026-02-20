import Image from "next/image";
import { EVENT_DATE } from "@/config/event";

export default function HeroSection() {
  return (
    <section className="w-full max-w-5xl mx-auto px-6 pt-4 pb-12">
      <div
        className="rounded-3xl overflow-hidden relative"
        style={{ background: "var(--color-forest)" }}
      >
        {/* Background texture overlay */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage:
              "radial-gradient(circle at 80% 50%, #729152 0%, transparent 60%)",
          }}
        />

        <div className="relative flex flex-col md:flex-row items-center gap-6 px-8 py-10 md:px-12 md:py-14">
          {/* Text content */}
          <div className="flex-1 text-center md:text-left">
            <p
              className="text-xs font-semibold tracking-widest uppercase mb-3 animate-fade-up"
              style={{ color: "var(--color-sage)" }}
            >
              A Special Occasion
            </p>
            <h1
              className="text-4xl md:text-5xl font-bold leading-tight mb-4 animate-fade-up delay-100"
              style={{ color: "var(--color-cream)", fontFamily: "var(--font-serif)" }}
            >
              We&apos;re Cooking
              <br />
              <span style={{ color: "#a8c882" }}>Lamprais</span>
            </h1>
            <p
              className="text-base md:text-lg leading-relaxed mb-6 animate-fade-up delay-200"
              style={{ color: "#b8c8a8" }}
            >
              Authentic Sri Lankan Lamprais — rice cooked in rich stock, wrapped
              in a banana leaf with fragrant accompaniments. We&apos;re making a
              fresh batch and we&apos;d love for you to have some.
            </p>

            {EVENT_DATE && EVENT_DATE !== "TBD" && (
              <div
                className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 animate-fade-up delay-300"
                style={{ background: "rgba(114,145,82,0.2)", border: "1px solid rgba(114,145,82,0.4)" }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#a8c882"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                <span className="text-sm font-medium" style={{ color: "#a8c882" }}>
                  {EVENT_DATE}
                </span>
              </div>
            )}

            <p
              className="mt-5 text-sm animate-fade-up delay-300"
              style={{ color: "#8a9a7a" }}
            >
              Scroll down to pre-order — we&apos;ll confirm via email before pickup.
            </p>
          </div>

          {/* Illustration */}
          <div className="flex-shrink-0 w-full md:w-72 flex justify-center animate-fade-in delay-200">
            <Image
              src="/hero-illustration.svg"
              alt="Sri Lankan chef preparing Lamprais on a banana leaf"
              width={320}
              height={256}
              className="w-full max-w-xs md:max-w-none drop-shadow-lg"
              priority
            />
          </div>
        </div>
      </div>
    </section>
  );
}
