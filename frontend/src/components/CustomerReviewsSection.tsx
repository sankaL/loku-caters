import Link from "next/link";

import ReviewTicker, { type PublicReview } from "@/components/ui/ReviewTicker";

export default function CustomerReviewsSection({
  reviews,
  className,
  showTimestamp = false,
  showShareLink = false,
}: {
  reviews: PublicReview[];
  className: string;
  showTimestamp?: boolean;
  showShareLink?: boolean;
}) {
  if (reviews.length === 0) return null;
  return (
    <section className={className}>
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-10 animate-fade-up">
          <span className="text-sm font-bold tracking-widest uppercase text-[color:var(--color-bark)] block mb-3">
            Customers
          </span>
          <h2 className="text-3xl md:text-4xl font-bold text-[color:var(--color-forest)]" style={{ fontFamily: "var(--font-serif)" }}>
            What Our Customers Say
          </h2>
        </div>
      </div>
      <div style={{ opacity: 0.75 }}><ReviewTicker reviews={reviews} showTimestamp={showTimestamp} /></div>
      {showShareLink && (
        <div className="text-center mt-10">
          <Link href="/reviews" className="inline-flex items-center gap-2 text-[color:var(--color-sage)] font-semibold hover:text-[color:var(--color-forest)] transition-colors">
            Share your experience
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </Link>
        </div>
      )}
    </section>
  );
}
