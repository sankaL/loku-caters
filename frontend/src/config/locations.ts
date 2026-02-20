/**
 * Pickup location configuration.
 * Edit this file to add/remove locations or change time slots.
 * No other code changes are needed.
 */
export const PICKUP_LOCATIONS: Record<string, string[]> = {
  "Colombo 03": [
    "11:00 AM – 12:00 PM",
    "12:00 PM – 1:00 PM",
    "1:00 PM – 2:00 PM",
  ],
  "Mount Lavinia": [
    "12:00 PM – 1:00 PM",
    "1:00 PM – 2:00 PM",
    "2:00 PM – 3:00 PM",
  ],
};

export const LOCATION_NAMES = Object.keys(PICKUP_LOCATIONS);
