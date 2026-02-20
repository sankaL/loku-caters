"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { API_URL } from "@/config/event";

const DEV_MODE = process.env.NEXT_PUBLIC_DEV_MODE === "true";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (authError) {
        setError(authError.message);
        return;
      }
      router.push("/admin/orders");
    } finally {
      setLoading(false);
    }
  }

  async function handleDevLogin() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/dev-login`, { method: "POST" });
      if (!res.ok) throw new Error("Dev login endpoint not available");
      const { access_token } = await res.json();
      // Store in cookie so middleware can read it
      document.cookie = `dev-admin-token=${encodeURIComponent(access_token)}; path=/; max-age=${7 * 24 * 3600}`;
      router.push("/admin/orders");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dev login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      className="min-h-screen flex items-center justify-center px-6"
      style={{ background: "var(--color-cream)" }}
    >
      <div className="w-full max-w-sm">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <p
            className="text-xs font-semibold tracking-widest uppercase mb-2"
            style={{ color: "var(--color-sage)" }}
          >
            Loku Caters
          </p>
          <h1
            className="text-3xl font-bold"
            style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}
          >
            Admin Portal
          </h1>
          {DEV_MODE && (
            <p className="mt-2 text-xs px-3 py-1 rounded-full inline-block" style={{ background: "#fef3c7", color: "#92400e" }}>
              Dev Mode
            </p>
          )}
        </div>

        <div
          className="rounded-3xl p-8 shadow-sm"
          style={{ background: "white", border: "1px solid var(--color-border)" }}
        >
          {/* Dev login shortcut */}
          {DEV_MODE && (
            <div className="mb-6 pb-6" style={{ borderBottom: "1px solid var(--color-border)" }}>
              <p className="text-xs mb-3" style={{ color: "var(--color-muted)" }}>
                Local testing
              </p>
              <button
                type="button"
                onClick={handleDevLogin}
                disabled={loading}
                className="w-full py-3 rounded-2xl text-sm font-semibold tracking-wide transition-all active:scale-[0.98] disabled:opacity-60"
                style={{ background: "var(--color-sage)", color: "white" }}
              >
                {loading ? "Signing in..." : "Sign in as Dev Admin"}
              </button>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            {!DEV_MODE && (
              <p className="text-xs" style={{ color: "var(--color-muted)" }}>
                Supabase credentials
              </p>
            )}
            <div>
              <label
                className="block text-sm font-medium mb-1.5"
                style={{ color: "var(--color-text)" }}
              >
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="admin@example.com"
                className="w-full px-4 py-3 rounded-xl text-sm border bg-white focus:outline-none focus:ring-2 transition-all border-[var(--color-border)] focus:ring-[var(--color-sage)] focus:border-[var(--color-sage)]"
                style={{ color: "var(--color-text)" }}
              />
            </div>

            <div>
              <label
                className="block text-sm font-medium mb-1.5"
                style={{ color: "var(--color-text)" }}
              >
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Password"
                className="w-full px-4 py-3 rounded-xl text-sm border bg-white focus:outline-none focus:ring-2 transition-all border-[var(--color-border)] focus:ring-[var(--color-sage)] focus:border-[var(--color-sage)]"
                style={{ color: "var(--color-text)" }}
              />
            </div>

            {error && (
              <div className="rounded-xl px-4 py-3 text-sm font-medium text-red-700 bg-red-50 border border-red-200">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 rounded-2xl text-sm font-semibold tracking-wide transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}
              onMouseEnter={(e) => {
                if (!loading) (e.currentTarget as HTMLButtonElement).style.background = "#1e3d18";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "var(--color-forest)";
              }}
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
