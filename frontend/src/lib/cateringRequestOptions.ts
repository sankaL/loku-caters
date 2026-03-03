import { CURRENCY } from "@/config/event";

export interface CateringOption {
  id: string;
  name: string;
}

export const CATERING_EVENT_TYPES: CateringOption[] = [
  { id: "corporate", name: "Corporate Event" },
  { id: "wedding", name: "Wedding" },
  { id: "birthday", name: "Birthday Party" },
  { id: "private-dinner", name: "Private Dinner" },
  { id: "other", name: "Other" },
];

export const CATERING_BUDGET_RANGES: CateringOption[] = [
  { id: "under-500", name: `Under ${CURRENCY} 500` },
  { id: "500-1000", name: `${CURRENCY} 500 - 1,000` },
  { id: "1000-2500", name: `${CURRENCY} 1,000 - 2,500` },
  { id: "2500-5000", name: `${CURRENCY} 2,500 - 5,000` },
  { id: "5000-plus", name: `${CURRENCY} 5,000+` },
];

function titleCaseToken(token: string): string {
  if (!token) return token;
  return token.charAt(0).toUpperCase() + token.slice(1);
}

export function humanizeCateringOptionValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed
    .split("-")
    .filter(Boolean)
    .map(titleCaseToken)
    .join(" ");
}

export function getCateringEventTypeLabel(value: string | null | undefined): string {
  if (!value) return "Not provided";
  const option = CATERING_EVENT_TYPES.find((item) => item.id === value);
  return option?.name ?? humanizeCateringOptionValue(value);
}

export function getCateringBudgetRangeLabel(value: string | null | undefined): string {
  if (!value) return "Not provided";
  const option = CATERING_BUDGET_RANGES.find((item) => item.id === value);
  return option?.name ?? humanizeCateringOptionValue(value);
}
