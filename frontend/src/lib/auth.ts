import { supabase } from "./supabase";

/**
 * Returns the Bearer token for admin API calls.
 * In dev mode, reads from the cookie set by the dev login flow.
 * In production, reads from the Supabase session.
 */
export async function getAdminToken(): Promise<string | null> {
  if (process.env.NEXT_PUBLIC_DEV_MODE === "true") {
    return getCookie("dev-admin-token");
  }
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
}
