// Shared helpers for the public API route handlers.

import { NextResponse, type NextRequest } from "next/server";

const MAX_BODY_BYTES = 64 * 1024;

interface RateLimitRule {
  name: string;
  requests: number;
  windowSeconds: number;
}

// Same limits the FastAPI backend enforced. In-memory is enough because the
// site runs as a single Railway instance.
export const RATE_LIMITS = {
  orderCheckout: { name: "public-order-write", requests: 8, windowSeconds: 60 },
  feedback: { name: "public-feedback-write", requests: 5, windowSeconds: 600 },
  cateringRequest: { name: "public-catering-write", requests: 5, windowSeconds: 600 },
} satisfies Record<string, RateLimitRule>;

const buckets = new Map<string, number[]>();

export function errorResponse(status: number, detail: string, headers?: Record<string, string>) {
  return NextResponse.json({ detail }, { status, headers });
}

// Railway's edge proxy appends the real client address as the last
// X-Forwarded-For entry, so anything earlier in the chain is client-supplied.
function clientIp(request: NextRequest): string {
  const forwarded = (request.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return forwarded[forwarded.length - 1] ?? request.headers.get("x-real-ip") ?? "unknown";
}

/** Returns a 429 response when the caller is over the limit, otherwise null. */
export function rateLimit(request: NextRequest, rule: RateLimitRule): NextResponse | null {
  const now = Date.now();
  const key = `${rule.name}:${clientIp(request)}`;
  const cutoff = now - rule.windowSeconds * 1000;
  const bucket = (buckets.get(key) ?? []).filter((timestamp) => timestamp > cutoff);

  if (bucket.length >= rule.requests) {
    buckets.set(key, bucket);
    const retryAfter = Math.max(1, Math.ceil((bucket[0] + rule.windowSeconds * 1000 - now) / 1000));
    return errorResponse(429, "Too many requests. Please try again shortly.", { "Retry-After": String(retryAfter) });
  }

  bucket.push(now);
  buckets.set(key, bucket);
  if (buckets.size > 10_000) {
    for (const [bucketKey, timestamps] of buckets) {
      if (timestamps[timestamps.length - 1] <= cutoff) buckets.delete(bucketKey);
    }
  }
  return null;
}

/** Parses a JSON object body, rejecting oversized or malformed payloads. */
export async function readJsonObject(request: NextRequest): Promise<Record<string, unknown> | NextResponse> {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return errorResponse(413, "Request body is too large");
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    // fall through
  }
  return errorResponse(400, "Request body must be a JSON object");
}

export class ValidationError extends Error {}

/** Trimmed optional string; throws when it exceeds maxLength. */
export function optionalText(body: Record<string, unknown>, field: string, maxLength: number): string | null {
  const value = body[field];
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (trimmed.length > maxLength) throw new ValidationError(`${field} must be at most ${maxLength} characters`);
  return trimmed || null;
}

/** Trimmed required string; throws when it is empty or too long. */
export function requiredText(body: Record<string, unknown>, field: string, maxLength: number): string {
  const value = optionalText(body, field, maxLength);
  if (!value) throw new ValidationError(`${field} cannot be empty`);
  return value;
}
