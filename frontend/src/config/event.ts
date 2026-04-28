import EVENT_CONFIG from "./event-config.json";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
export const CURRENCY = EVENT_CONFIG.currency;

export interface Item {
  id: string;
  name: string;
  description?: string;
  price: number;
  discounted_price?: number | null;
  minimum_order_quantity?: number;
  image_key?: string | null;
  image_path?: string | null;
}

export interface ComboRequirement {
  item_id: string;
  min_quantity: number;
}

export interface ComboRequirementGroup {
  id: string;
  name: string;
  item_ids: string[];
  min_quantity: number;
}

export interface ComboDiscount {
  type: "fixed_amount" | "percentage";
  amount: number;
  applies_to: "combo_total" | "group";
  target_group_id?: string | null;
  target_item_id?: string | null;
}

export interface ComboDeal {
  id: string;
  name: string;
  enabled: boolean;
  sort_order: number;
  requirement_groups?: ComboRequirementGroup[];
  requirements?: ComboRequirement[];
  discount: ComboDiscount;
}

export interface Location {
  id: string;
  name: string;
  address?: string;
  timeSlots: string[];
}

export interface EventConfig {
  event: {
    id?: number | null;
    date: string;
  };
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
  is_active: boolean;
  combo_deals: ComboDeal[];
  items: Item[];
  locations: Location[];
  flyer: {
    appetizers: {
      name: string;
      image: string;
      imagePosition?: string;
      minOrder: number;
      varieties: {
        name: string;
        price: number;
      }[];
    }[];
    trays: {
      name: string;
      image: string;
      size: string;
      price: number;
    }[];
  };
}

export async function fetchEventConfig(eventId?: number | null): Promise<EventConfig | null> {
  const params = new URLSearchParams();
  if (typeof eventId === "number" && Number.isFinite(eventId)) {
    params.set("event_id", String(eventId));
  }

  const query = params.size > 0 ? `?${params.toString()}` : "";
  const res = await fetch(`${API_URL}/api/config${query}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text().catch(() => "unknown");
    throw new Error(`Failed to load event configuration (${res.status}): ${body}`);
  }
  return res.json();
}
