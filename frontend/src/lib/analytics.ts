"use client";

import posthog from "posthog-js";

const isPostHogConfigured = Boolean(
  process.env.NEXT_PUBLIC_POSTHOG_KEY && process.env.NEXT_PUBLIC_POSTHOG_HOST
);

export function captureEvent(eventName: string, properties?: Record<string, unknown>) {
  if (!isPostHogConfigured) return;

  posthog.capture(eventName, properties);
}
