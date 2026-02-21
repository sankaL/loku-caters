import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow login page through always
  if (pathname === "/admin/login") {
    return NextResponse.next();
  }

  // Dev mode: bypass Supabase auth, check for dev token cookie instead
  if (process.env.NEXT_PUBLIC_DEV_MODE === "true") {
    const devToken = request.cookies.get("dev-admin-token")?.value;
    if (!devToken) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
    // Lightweight expiry check on the dev JWT
    try {
      const [, payload] = devToken.split(".");
      const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
      if (!decoded.exp || decoded.exp * 1000 < Date.now()) throw new Error("expired");
    } catch {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
    return NextResponse.next();
  }

  // Production: check for Supabase session cookie
  const accessToken =
    request.cookies.get("sb-access-token")?.value ??
    getTokenFromAuthCookies(request);

  if (!accessToken) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  try {
    const [, payload] = accessToken.split(".");
    if (!payload) throw new Error("malformed");
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
    if (!decoded.exp || decoded.exp * 1000 < Date.now()) throw new Error("expired");
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }
}

function getTokenFromAuthCookies(request: NextRequest): string | undefined {
  for (const [name, cookie] of request.cookies) {
    if (name.startsWith("sb-") && name.endsWith("-auth-token")) {
      try {
        const parsed = JSON.parse(decodeURIComponent(cookie.value));
        if (Array.isArray(parsed) && typeof parsed[0] === "string") return parsed[0];
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
