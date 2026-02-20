/**
 * Event metadata — set via environment variables.
 * Update .env.local (or Railway env vars) to change these without touching code.
 */
export const EVENT_DATE = process.env.NEXT_PUBLIC_EVENT_DATE ?? "TBD";
export const PRICE_PER_ITEM = Number(process.env.NEXT_PUBLIC_PRICE_PER_ITEM ?? "20");
export const CURRENCY = process.env.NEXT_PUBLIC_CURRENCY ?? "AUD";
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
