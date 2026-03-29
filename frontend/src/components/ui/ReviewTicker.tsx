"use client";

import { useEffect, useRef, useState } from "react";
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

const CARD_WIDTH = 290 + 20;
const DURATION_PER_CARD = 150;

export default function ReviewTicker({ reviews, showTimestamp = false }: ReviewTickerProps) {
  const [isPaused, setIsPaused] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      setContainerWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    setContainerWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  if (reviews.length === 0) return null;

  const baseRepeatCount = Math.max(2, Math.ceil((containerWidth * 2) / (CARD_WIDTH * reviews.length)));
  const baseSequence = Array.from({ length: baseRepeatCount }, () => reviews).flat();
  const displayReviews = [...baseSequence, ...baseSequence];

  const animDuration = (reviews.length * baseRepeatCount * DURATION_PER_CARD) / 10;

  return (
    <div
      ref={containerRef}
      onPointerDown={() => setIsPaused(true)}
      onPointerUp={() => setIsPaused(false)}
      onPointerCancel={() => setIsPaused(false)}
      onPointerLeave={() => setIsPaused(false)}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      style={{
        overflow: "hidden",
        paddingBottom: 8,
        maskImage: "linear-gradient(to right, transparent, black 5%, black 95%, transparent)",
        WebkitMaskImage: "linear-gradient(to right, transparent, black 5%, black 95%, transparent)",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 20,
          width: "max-content",
          animation: `reviewTickerScroll ${animDuration}s linear infinite`,
          animationPlayState: isPaused ? "paused" : "running",
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
      <style>{`
        @keyframes reviewTickerScroll {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
