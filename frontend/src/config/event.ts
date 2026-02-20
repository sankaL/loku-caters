export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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
  items: Item[];
  locations: Location[];
}

export async function fetchEventConfig(): Promise<EventConfig> {
  const res = await fetch(`${API_URL}/api/config`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load event configuration");
  return res.json();
}
