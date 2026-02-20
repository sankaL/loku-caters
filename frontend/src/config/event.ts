import config from "./event-config.json";

export const EVENT_DATE = config.event.date;
export const ITEMS = config.items;
export const LOCATIONS = config.locations;
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type Item = (typeof config.items)[number];
export type Location = (typeof config.locations)[number];
