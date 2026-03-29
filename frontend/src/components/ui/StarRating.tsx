"use client";

import { useState } from "react";

interface StarRatingProps {
  value: number;
  onChange?: (value: number) => void;
  size?: number;
  mode?: "input" | "display";
}

export default function StarRating({
  value,
  onChange,
  size = 28,
  mode = "display",
}: StarRatingProps) {
  const [hoverValue, setHoverValue] = useState(0);
  const isInteractive = mode === "input" && onChange;

  return (
    <div
      style={{
        display: "inline-flex",
        gap: size * 0.14,
        alignItems: "center",
      }}
      onMouseLeave={() => isInteractive && setHoverValue(0)}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = hoverValue ? star <= hoverValue : star <= value;
        return (
          <button
            key={star}
            type="button"
            disabled={!isInteractive}
            onClick={() => isInteractive && onChange(star)}
            onMouseEnter={() => isInteractive && setHoverValue(star)}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              cursor: isInteractive ? "pointer" : "default",
              transition: "transform 0.15s ease, filter 0.15s ease",
              transform: filled && isInteractive ? "scale(1.15)" : "scale(1)",
              filter: filled ? "drop-shadow(0 0 4px rgba(242, 175, 41, 0.4))" : "none",
              lineHeight: 0,
            }}
            aria-label={`${star} star${star > 1 ? "s" : ""}`}
          >
            <svg
              width={size}
              height={size}
              viewBox="0 0 24 24"
              fill={filled ? "var(--color-accent)" : "none"}
              stroke={filled ? "var(--color-accent)" : "var(--color-border)"}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                transition: "fill 0.18s ease, stroke 0.18s ease",
              }}
            >
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </button>
        );
      })}
    </div>
  );
}
