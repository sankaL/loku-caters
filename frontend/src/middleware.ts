import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow login page through
  if (pathname === "/admin/login") {
    return NextResponse.next();
  }

  // Check for Supabase session via the access token cookie
  const accessToken =
    request.cookies.get("sb-access-token")?.value ??
    getTokenFromAuthCookies(request);

  if (!accessToken) {
    const loginUrl = new URL("/admin/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Verify the token is valid by decoding it (lightweight check)
  try {
    const [, payload] = accessToken.split(".");
    if (!payload) throw new Error("malformed");
    const decoded = JSON.parse(Buffer.from(payload, "base64").toString("utf-8"));
    if (!decoded.exp || decoded.exp * 1000 < Date.now()) {
      throw new Error("expired");
    }
    return NextResponse.next();
  } catch {
    const loginUrl = new URL("/admin/login", request.url);
    return NextResponse.redirect(loginUrl);
  }
}

/**
 * Supabase stores the session in a cookie named like
 * `sb-<project-ref>-auth-token` as a JSON array [access_token, ...].
 * Try to extract the access token from that cookie.
 */
function getTokenFromAuthCookies(request: NextRequest): string | undefined {
  for (const [name, cookie] of request.cookies) {
    if (name.startsWith("sb-") && name.endsWith("-auth-token")) {
      try {
        const parsed = JSON.parse(decodeURIComponent(cookie.value));
        if (Array.isArray(parsed) && typeof parsed[0] === "string") {
          return parsed[0];
        }
        if (parsed?.access_token) return parsed.access_token;
      } catch {
        // ignore
      }
    }
  }
  return undefined;
}

export const config = {
  matcher: ["/admin/:path*"],
};
