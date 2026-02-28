"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  {
    href: "/admin/dashboard",
    label: "Dashboard",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    href: "/admin/orders",
    label: "Orders",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
        <rect x="9" y="3" width="6" height="4" rx="1" />
        <line x1="9" y1="12" x2="15" y2="12" />
        <line x1="9" y1="16" x2="13" y2="16" />
      </svg>
    ),
  },
  {
    href: "/admin/config",
    label: "Events",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        <path d="M4.93 4.93a10 10 0 0 0 0 14.14" />
      </svg>
    ),
  },
  {
    href: "/admin/items",
    label: "Items",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
        <line x1="7" y1="7" x2="7.01" y2="7" />
      </svg>
    ),
  },
  {
    href: "/admin/locations",
    label: "Locations",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    ),
  },
  {
    href: "/admin/feedback",
    label: "Feedback",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
];

const COLLAPSED_KEY = "admin-sidebar-collapsed";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Load persisted collapsed state after mount
  useEffect(() => {
    const stored = localStorage.getItem(COLLAPSED_KEY);
    if (stored === "true") setIsCollapsed(true);
  }, []);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  function toggleCollapsed() {
    const next = !isCollapsed;
    setIsCollapsed(next);
    localStorage.setItem(COLLAPSED_KEY, String(next));
  }

  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    document.cookie = "dev-admin-token=; path=/; max-age=0";
    document.cookie = "sb-access-token=; path=/; max-age=0";
    router.push("/admin/login");
  }

  const sidebarWidth = isCollapsed ? 56 : 224;

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--color-cream)" }}>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 md:hidden"
          style={{ background: "rgba(0,0,0,0.4)" }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed md:relative inset-y-0 left-0 z-40 flex flex-col flex-shrink-0 md:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
        style={{
          width: `${sidebarWidth}px`,
          height: "100%",
          background: "var(--color-forest)",
          borderRight: "1px solid rgba(255,255,255,0.08)",
          transition: "width 0.2s ease, transform 0.2s ease",
        }}
      >

        {/* Brand + collapse toggle */}
        <div
          className="px-4 py-5 border-b flex items-center overflow-hidden"
          style={{ borderColor: "rgba(255,255,255,0.08)", gap: isCollapsed ? 0 : 12 }}
        >
          {/* Logo icon — hidden on desktop when collapsed to give room for the toggle */}
          <div className={`shrink-0 ${isCollapsed ? "md:hidden" : ""}`}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-sage)" }}>
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          {!isCollapsed && (
            <div className="flex-1 overflow-hidden">
              <p
                className="text-xs font-semibold tracking-widest uppercase mb-0.5 truncate"
                style={{ color: "var(--color-sage)" }}
              >
                Loku Caters
              </p>
              <p className="text-sm font-semibold truncate" style={{ color: "var(--color-cream)" }}>
                Admin
              </p>
            </div>
          )}
          {/* Collapse toggle (desktop only) */}
          <button
            onClick={toggleCollapsed}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="hidden md:flex shrink-0 items-center justify-center rounded-lg transition-all"
            style={{
              color: "rgba(247,245,240,0.35)",
              padding: "4px",
              marginLeft: isCollapsed ? "auto" : undefined,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "rgba(247,245,240,0.7)";
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "rgba(247,245,240,0.35)";
              (e.currentTarget as HTMLButtonElement).style.background = "transparent";
            }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                transform: isCollapsed ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.2s ease",
              }}
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-4 space-y-1 overflow-hidden">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href) ||
              (item.href === "/admin/config" && pathname.startsWith("/admin/events"));
            return (
              <Link
                key={item.href}
                href={item.href}
                title={isCollapsed ? item.label : undefined}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all overflow-hidden"
                style={{
                  color: active ? "var(--color-cream)" : "rgba(247,245,240,0.55)",
                  background: active ? "rgba(255,255,255,0.12)" : "transparent",
                  justifyContent: isCollapsed ? "center" : "flex-start",
                }}
              >
                <span className="shrink-0" style={{ color: active ? "var(--color-sage)" : "rgba(114,145,82,0.6)" }}>
                  {item.icon}
                </span>
                {!isCollapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Sign out */}
        <div className="px-2 pb-4 overflow-hidden">
          <button
            onClick={handleSignOut}
            title={isCollapsed ? "Sign Out" : undefined}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-all overflow-hidden"
            style={{
              color: "rgba(247,245,240,0.45)",
              justifyContent: isCollapsed ? "center" : "flex-start",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "rgba(247,245,240,0.75)";
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "rgba(247,245,240,0.45)";
              (e.currentTarget as HTMLButtonElement).style.background = "transparent";
            }}
          >
            <span className="shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </span>
            {!isCollapsed && <span className="truncate">Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto min-w-0">
        {/* Hamburger (mobile only) */}
        <div className="md:hidden flex items-center px-4 py-3 border-b" style={{ background: "white", borderColor: "var(--color-border)" }}>
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="p-2 rounded-xl transition-all"
            style={{ color: "var(--color-forest)" }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <p className="ml-3 text-sm font-semibold" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>
            Loku Caters Admin
          </p>
        </div>
        {children}
      </main>
    </div>
  );
}
