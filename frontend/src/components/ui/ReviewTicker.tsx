"use client";

import { useEffect, useRef, useCallback } from "react";
import StarRating from "@/components/ui/StarRating";

export interface PublicReview {
  id: string;
  name: string | null;
  message: string | null;
  rating: number | null;
  created_at: string | null;
}

interface ReviewCardProps {
  review: PublicReview;
  showTimestamp?: boolean;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${Math.floor(days / 7) > 1 ? "s" : ""} ago`;
  if (days < 365) return `${Math.floor(days / 30)} month${Math.floor(days / 30) > 1 ? "s" : ""} ago`;
  return `${Math.floor(days / 365)} year${Math.floor(days / 365) > 1 ? "s" : ""} ago`;
}

function ReviewCard({ review, showTimestamp = false }: ReviewCardProps) {
  return (
    <div
      style={{
        background: "white",
        border: "1px solid var(--color-border)",
        borderRadius: 24,
        padding: "28px 24px",
        minWidth: 290,
        maxWidth: 340,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        gap: 14,
        boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
      }}
    >
      {review.rating && <StarRating value={review.rating} size={18} mode="display" />}
      {review.message && (
        <p
          style={{
            color: "var(--color-text)",
            fontSize: 14,
            lineHeight: 1.65,
            margin: 0,
            display: "-webkit-box",
            WebkitLineClamp: 4,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          &ldquo;{review.message}&rdquo;
        </p>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: "var(--color-forest)" }}>
          {review.name || "Happy Customer"}
        </span>
        {showTimestamp && review.created_at && (
          <span style={{ fontSize: 11, color: "var(--color-muted)" }}>
            {relativeTime(review.created_at)}
          </span>
        )}
      </div>
    </div>
  );
}

interface ReviewTickerProps {
  reviews: PublicReview[];
  showTimestamp?: boolean;
}

export default function ReviewTicker({ reviews, showTimestamp = false }: ReviewTickerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Use a ref for pause state so the animation loop always reads the current value
  // without stale closures from useCallback/useState.
  const isPausedRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  const tick = useCallback(() => {
    const el = scrollRef.current;
    if (el && !isPausedRef.current) {
      el.scrollLeft += 0.5;
      const halfWidth = el.scrollWidth / 2;
      if (el.scrollLeft >= halfWidth) {
        el.scrollLeft = 0;
      }
    }
    // Always schedule the next frame, regardless of pause state,
    // so the loop never stops and resumes seamlessly when unpaused.
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [tick]);

  // Pause on pointer press (mobile / touch hold).
  const handlePointerDown = useCallback(() => {
    isPausedRef.current = true;
  }, []);

  // Resume when pointer is released or cancelled (lift finger, cancel, leave).
  const handlePointerUp = useCallback(() => {
    isPausedRef.current = false;
  }, []);

  const handlePointerCancel = useCallback(() => {
    isPausedRef.current = false;
  }, []);

  // Pause on mouse hover (desktop).
  const handleMouseEnter = useCallback(() => {
    isPausedRef.current = true;
  }, []);

  const handleMouseLeave = useCallback(() => {
    isPausedRef.current = false;
  }, []);

  if (reviews.length === 0) return null;

  // Duplicate reviews to create a seamless infinite loop.
  const displayReviews = [...reviews, ...reviews];

  return (
    <div
      ref={scrollRef}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        display: "flex",
        gap: 20,
        overflowX: "hidden",
        paddingBottom: 8,
        maskImage: "linear-gradient(to right, transparent, black 5%, black 95%, transparent)",
        WebkitMaskImage: "linear-gradient(to right, transparent, black 5%, black 95%, transparent)",
        // Prevent text selection while swiping on mobile.
        userSelect: "none",
        WebkitUserSelect: "none",
        // Ensure touch scrolling is smooth.
        WebkitOverflowScrolling: "touch",
      }}
    >
      {displayReviews.map((review, idx) => (
        <ReviewCard
          key={`${review.id}-${idx}`}
          review={review}
          showTimestamp={showTimestamp}
        />
      ))}
    </div>
  );
}
