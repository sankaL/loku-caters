import { supabase } from "./supabase";

/**
 * Returns the Bearer token for admin API calls.
 * In dev mode, returns a placeholder because the local backend bypasses auth.
 * In production, reads from the Supabase session.
 */
export async function getAdminToken(): Promise<string | null> {
  if (process.env.NEXT_PUBLIC_DEV_MODE === "true") {
    return "dev-auth-disabled";
  }
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}
