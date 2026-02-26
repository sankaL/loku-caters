import EVENT_CONFIG from "./event-config.json";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
export const CURRENCY = EVENT_CONFIG.currency;

export interface Item {
  id: string;
  name: string;
  description?: string;
  price: number;
  discounted_price?: number | null;
}

export interface Location {
  id: string;
  name: string;
  address?: string;
  timeSlots: string[];
}

export interface EventConfig {
  event: { date: string };
  currency: string;
  hero_header: string;
  hero_header_sage: string;
  hero_subheader: string;
  promo_details: string | null;
  tooltip_enabled: boolean;
  tooltip_header: string | null;
  tooltip_body: string | null;
  tooltip_image_path: string | null;
  hero_side_image_path: string | null;
  etransfer_enabled: boolean;
  etransfer_email: string | null;
  items: Item[];
  locations: Location[];
}

export async function fetchEventConfig(): Promise<EventConfig | null> {
  const res = await fetch(`${API_URL}/api/config`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to load event configuration");
  return res.json();
}
