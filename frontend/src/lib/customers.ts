export interface Customer {
  id: string;
  name: string;
  email: string;
  phone_number: string | null;
  pickup_locations: string[];
  created_at: string;
  updated_at: string;
}
