"use client";

import { useState, useEffect } from "react";
import StarRating from "@/components/ui/StarRating";
import ReviewTicker from "@/components/ui/ReviewTicker";
import type { PublicReview } from "@/components/ui/ReviewTicker";
import { API_URL } from "@/config/event";
import { captureEvent } from "@/lib/analytics";

/* ---------- Main page ---------- */

export default function ReviewsClient() {
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [rating, setRating] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [reviews, setReviews] = useState<PublicReview[]>([]);

  useEffect(() => {
    async function loadReviews() {
      try {
        const res = await fetch(`${API_URL}/api/feedback/reviews`);
        if (res.ok) {
          const data: PublicReview[] = await res.json();
          setReviews(data);
        }
      } catch {
        // Silently fail - reviews are secondary content
      }
    }
    loadReviews();
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (rating === 0) {
      setErrorDetails("Please select a star rating before submitting.");
      return;
    }
    setIsSubmitting(true);
    setErrorDetails(null);

    const payload = {
      origin: "reviews_page",
      feedback_type: "feedback",
      name: name.trim() || null,
      message: message.trim() || null,
      rating,
    };

    try {
      const resp = await fetch(`${API_URL}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        throw new Error("Failed to submit review");
      }

      const data = await resp.json();
      if (data.success) {
        setIsSuccess(true);
        captureEvent("review_submitted", {
          origin: "reviews_page",
          rating,
        });
      } else {
        throw new Error("Submission failed on server");
      }
    } catch {
      setErrorDetails(
        "Something went wrong while submitting your review. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex-1 bg-[color:var(--color-cream)]">
      {/* Hero header */}
      <section className="bg-[color:var(--color-forest)] text-white py-20 px-6 text-center">
        <div className="max-w-3xl mx-auto animate-fade-up">
          <span className="text-sm font-bold tracking-widest uppercase text-[color:var(--color-sage)] block mb-4">
            Your Voice Matters
          </span>
          <h1
            className="text-4xl md:text-5xl font-bold mb-4"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Share Your Experience
          </h1>
          <p className="text-lg opacity-90 text-[color:var(--color-cream-dark)] max-w-xl mx-auto">
            Tell us about your Loku Caters experience. Your feedback helps us keep
            improving and serving you the best way we can.
          </p>
        </div>
      </section>

      {/* Feedback form */}
      <section className="py-16 px-6">
        <div className="max-w-xl mx-auto">
          {isSuccess ? (
            <div className="bg-white p-12 rounded-3xl shadow-lg border border-[color:var(--color-border)] text-center animate-scale-in">
              <div className="w-16 h-16 bg-[color:var(--color-success-bg)] text-[color:var(--color-success-text)] rounded-full flex items-center justify-center mb-6 mx-auto">
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
              <h2
                className="text-2xl font-bold text-[color:var(--color-forest)] mb-4"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                Thank You!
              </h2>
              <p className="text-[color:var(--color-muted)] mb-3 leading-relaxed">
                Your feedback is incredibly valuable to us. It helps us keep improving
                and serving you the best way we can.
              </p>
              <p className="text-[color:var(--color-muted)] mb-8 leading-relaxed text-sm">
                We appreciate you taking the time to share your thoughts.
              </p>
              <button
                onClick={() => {
                  setIsSuccess(false);
                  setName("");
                  setMessage("");
                  setRating(0);
                }}
                className="bg-[color:var(--color-sage)] text-white px-8 py-3 rounded-full font-bold hover:bg-[color:var(--color-forest)] transition-colors"
              >
                Leave Another Review
              </button>
            </div>
          ) : (
            <div className="bg-white p-8 md:p-10 rounded-3xl shadow-xl border border-[color:var(--color-border)] animate-fade-up">
              <h2
                className="text-2xl font-bold text-[color:var(--color-forest)] mb-6"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                How was your experience?
              </h2>

              {errorDetails && (
                <div className="mb-6 p-4 bg-[color:var(--color-error-bg)] text-[color:var(--color-error-text)] rounded-xl border border-[color:var(--color-error-border)] text-sm font-medium">
                  {errorDetails}
                </div>
              )}

              <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="review-name"
                    className="text-sm font-semibold text-[color:var(--color-text)]"
                  >
                    Your Name{" "}
                    <span className="font-normal text-[color:var(--color-muted)]">
                      (optional)
                    </span>
                  </label>
                  <input
                    type="text"
                    id="review-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Sarah"
                    className="p-3 border border-[color:var(--color-border)] rounded-xl bg-[color:var(--color-cream)] focus:border-[color:var(--color-sage)] focus:bg-white transition-colors"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label
                    htmlFor="review-message"
                    className="text-sm font-semibold text-[color:var(--color-text)]"
                  >
                    Your Review{" "}
                    <span className="font-normal text-[color:var(--color-muted)]">
                      (optional)
                    </span>
                  </label>
                  <textarea
                    id="review-message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={4}
                    placeholder="Tell us about your experience..."
                    className="p-3 border border-[color:var(--color-border)] rounded-xl bg-[color:var(--color-cream)] focus:border-[color:var(--color-sage)] focus:bg-white resize-y transition-colors"
                  />
                </div>

                {/* Star rating */}
                <div className="flex flex-col gap-3">
                  <label className="text-sm font-semibold text-[color:var(--color-text)]">
                    Your Rating
                  </label>
                  <div className="flex items-center gap-4">
                    <StarRating
                      value={rating}
                      onChange={setRating}
                      size={36}
                      mode="input"
                    />
                    {rating > 0 && (
                      <span
                        className="text-sm font-medium animate-fade-in"
                        style={{ color: "var(--color-accent)" }}
                      >
                        {rating === 5
                          ? "Amazing!"
                          : rating === 4
                          ? "Great!"
                          : rating === 3
                          ? "Good"
                          : rating === 2
                          ? "Fair"
                          : "Needs work"}
                      </span>
                    )}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="mt-2 w-full bg-[color:var(--color-forest)] text-white py-4 rounded-xl font-bold text-lg hover:bg-[color:var(--color-sage)] transition-colors disabled:opacity-70 disabled:cursor-not-allowed shadow-md"
                >
                  {isSubmitting ? "Submitting..." : "Submit Review"}
                </button>
              </form>
            </div>
          )}
        </div>
      </section>

      {/* Public reviews carousel */}
      {reviews.length > 0 && (
        <section className="pb-20 px-6">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-10 animate-fade-up">
              <span className="text-sm font-bold tracking-widest uppercase text-[color:var(--color-bark)] block mb-3">
                Customers
              </span>
              <h2
                className="text-3xl md:text-4xl font-bold text-[color:var(--color-forest)]"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                What Our Customers Say
              </h2>
            </div>
          </div>

          <div style={{ opacity: 0.75 }}>
            <ReviewTicker reviews={reviews} showTimestamp />
          </div>
        </section>
      )}
    </main>
  );
}
