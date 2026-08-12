"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarCheck, Receipt } from "@phosphor-icons/react";
import { supabase } from "@/lib/supabase";
import { API_URL } from "@/config/event";
import { getAdminToken } from "@/lib/auth";
import AdminToast from "@/components/admin/AdminToast";
import { useAdminToast } from "@/hooks/useAdminToast";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  notificationKey?: NotificationKey;
}

interface NavGroup {
  label: string | null;
  items: NavItem[];
}

type NotificationKey = "orders" | "feedback" | "catering";
type NotificationCounts = Record<NotificationKey, number>;
type NotificationIds = Record<NotificationKey, string[]>;

const EMPTY_NOTIFICATION_COUNTS: NotificationCounts = { orders: 0, feedback: 0, catering: 0 };
const EMPTY_NOTIFICATION_IDS: NotificationIds = { orders: [], feedback: [], catering: [] };
const NAV_SEEN_KEY = "admin-nav-seen-items";

const dashboardItem: NavItem =
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
  };

const ordersItem: NavItem =
  {
    href: "/admin/orders",
    label: "Orders",
    notificationKey: "orders",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
        <rect x="9" y="3" width="6" height="4" rx="1" />
        <line x1="9" y1="12" x2="15" y2="12" />
        <line x1="9" y1="16" x2="13" y2="16" />
      </svg>
    ),
  };

const planningItem: NavItem =
  {
    href: "/admin/planning",
    label: "Planning",
    icon: <CalendarCheck size={18} weight="bold" />,
  };

const invoicesItem: NavItem =
  {
    href: "/admin/invoices",
    label: "Invoices",
    icon: <Receipt size={18} weight="bold" />,
  };

const customersItem: NavItem =
  {
    href: "/admin/customers",
    label: "Customers",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  };

const eventsItem: NavItem =
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
  };

const itemsItem: NavItem =
  {
    href: "/admin/items",
    label: "Items",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
        <line x1="7" y1="7" x2="7.01" y2="7" />
      </svg>
    ),
  };

const locationsItem: NavItem =
  {
    href: "/admin/locations",
    label: "Locations",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
    ),
  };

const feedbackItem: NavItem =
  {
    href: "/admin/feedback",
    label: "Feedback",
    notificationKey: "feedback",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  };

const cateringItem: NavItem =
  {
    href: "/admin/catering-requests",
    label: "Catering",
    notificationKey: "catering",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 3v9" />
        <path d="M12 3v9" />
        <path d="M10 12v9" />
        <path d="M17 3v18" />
        <path d="M17 8a4 4 0 0 0 0-5" />
        <path d="M6 3v5a2 2 0 0 0 4 0V3" />
      </svg>
    ),
  };

const navGroups: NavGroup[] = [
  { label: null, items: [dashboardItem] },
  { label: "Operations", items: [ordersItem, planningItem] },
  { label: "Event setup", items: [eventsItem, itemsItem, locationsItem] },
  { label: "Customer Management", items: [invoicesItem, customersItem, feedbackItem, cateringItem] },
];

const COLLAPSED_KEY = "admin-sidebar-collapsed";

function MobileBackdrop({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <button
      type="button"
      aria-label="Close menu"
      className="drawer-backdrop fixed inset-0 z-30 md:hidden"
      style={{ background: "rgba(0,0,0,0.4)" }}
      onClick={onClose}
    />
  );
}

function SidebarBrand({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <div className="px-4 py-5 border-b flex items-center overflow-hidden" style={{ borderColor: "rgba(255,255,255,0.08)", gap: collapsed ? 0 : 12 }}>
      <div className={`shrink-0 ${collapsed ? "md:hidden" : ""}`}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--color-sage)" }}>
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
      </div>
      {!collapsed && (
        <div className="flex-1 overflow-hidden">
          <p className="text-xs font-semibold tracking-widest uppercase mb-0.5 truncate" style={{ color: "var(--color-sage)" }}>Loku Caters</p>
          <p className="text-sm font-semibold truncate" style={{ color: "var(--color-cream)" }}>Admin</p>
        </div>
      )}
      <button
        type="button"
        onClick={onToggle}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-expanded={!collapsed}
        className="interactive-icon interactive-menu-item hidden shrink-0 rounded-xl md:inline-flex"
        style={{ color: "rgba(247,245,240,0.55)", marginLeft: collapsed ? "auto" : undefined }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: collapsed ? "rotate(180deg)" : "rotate(0deg)", transition: "transform var(--motion-control) var(--ease-out-responsive)" }}>
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
    </div>
  );
}

function readSeenItems(): NotificationIds {
  try {
    const stored = JSON.parse(localStorage.getItem(NAV_SEEN_KEY) ?? "{}") as Partial<NotificationIds>;
    return {
      orders: Array.isArray(stored.orders) ? stored.orders : [],
      feedback: Array.isArray(stored.feedback) ? stored.feedback : [],
      catering: Array.isArray(stored.catering) ? stored.catering : [],
    };
  } catch {
    return EMPTY_NOTIFICATION_IDS;
  }
}

function useAdminNavNotifications(pathname: string) {
  const [counts, setCounts] = useState<NotificationCounts>(EMPTY_NOTIFICATION_COUNTS);
  const [currentIds, setCurrentIds] = useState<NotificationIds>(EMPTY_NOTIFICATION_IDS);
  const [hasLoaded, setHasLoaded] = useState(false);
  const lastMarkedPath = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let requestSequence = 0;
    let activeController: AbortController | null = null;

    async function loadNotifications() {
      const sequence = ++requestSequence;
      activeController?.abort();
      const token = await getAdminToken();
      if (!token || cancelled || sequence !== requestSequence) return;

      const controller = new AbortController();
      activeController = controller;
      const timeout = window.setTimeout(() => controller.abort(), 15_000);
      const headers = { Authorization: `Bearer ${token}` };
      try {
        const responses = await Promise.allSettled([
          fetch(`${API_URL}/api/admin/orders?view=bundle&status=pending`, { headers, signal: controller.signal }),
          fetch(`${API_URL}/api/admin/feedback`, { headers, signal: controller.signal }),
          fetch(`${API_URL}/api/admin/catering-requests`, { headers, signal: controller.signal }),
        ]);
        if (cancelled || controller.signal.aborted || sequence !== requestSequence) return;

        const nextIds: NotificationIds = { orders: [], feedback: [], catering: [] };
        const [ordersResult, feedbackResult, cateringResult] = responses;
        if (ordersResult.status === "fulfilled" && ordersResult.value.ok) {
          const rows = await ordersResult.value.json() as Array<{ bundle_id?: string; id?: string }>;
          nextIds.orders = rows.map((row) => row.bundle_id ?? row.id ?? "").filter(Boolean);
        }
        if (feedbackResult.status === "fulfilled" && feedbackResult.value.ok) {
          const response = await feedbackResult.value.json() as { items?: Array<{ id: string; status: string }> };
          nextIds.feedback = (response.items ?? []).filter((item) => item.status === "new").map((item) => item.id);
        }
        if (cateringResult.status === "fulfilled" && cateringResult.value.ok) {
          const response = await cateringResult.value.json() as { items?: Array<{ id: string; status: string }> };
          nextIds.catering = (response.items ?? []).filter((item) => item.status === "new").map((item) => item.id);
        }
        if (cancelled || controller.signal.aborted || sequence !== requestSequence) return;

        const seen = readSeenItems();
        setCurrentIds(nextIds);
        setHasLoaded(true);
        setCounts({
          orders: nextIds.orders.filter((id) => !seen.orders.includes(id)).length,
          feedback: nextIds.feedback.filter((id) => !seen.feedback.includes(id)).length,
          catering: nextIds.catering.filter((id) => !seen.catering.includes(id)).length,
        });
      } finally {
        window.clearTimeout(timeout);
        if (activeController === controller) activeController = null;
      }
    }

    void loadNotifications();
    const interval = window.setInterval(loadNotifications, 60_000);
    window.addEventListener("focus", loadNotifications);
    return () => {
      cancelled = true;
      requestSequence += 1;
      activeController?.abort();
      window.clearInterval(interval);
      window.removeEventListener("focus", loadNotifications);
    };
  }, []);

  useEffect(() => {
    const activeKey: NotificationKey | null = pathname.startsWith("/admin/orders")
      ? "orders"
      : pathname.startsWith("/admin/feedback")
        ? "feedback"
        : pathname.startsWith("/admin/catering-requests")
          ? "catering"
          : null;
    if (!activeKey || !hasLoaded || lastMarkedPath.current === pathname) return;
    const seen = readSeenItems();
    const nextSeen = { ...seen, [activeKey]: currentIds[activeKey] };
    localStorage.setItem(NAV_SEEN_KEY, JSON.stringify(nextSeen));
    setCounts((previous) => ({ ...previous, [activeKey]: 0 }));
    lastMarkedPath.current = pathname;
  }, [currentIds, hasLoaded, pathname]);

  return counts;
}

function NotificationBadge({ count, collapsed }: { count: number; collapsed: boolean }) {
  if (count <= 0) return null;
  const label = count > 99 ? "99+" : String(count);
  return (
    <span
      aria-label={`${count} new item${count === 1 ? "" : "s"}`}
      className={collapsed ? "absolute right-1 top-1 h-2.5 w-2.5 rounded-full" : "ml-auto min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold tabular-nums"}
      style={{
        background: "var(--color-accent)",
        color: "var(--color-forest)",
        boxShadow: "0 0 0 2px var(--color-forest), 0 2px 8px rgba(242,175,41,0.35)",
      }}
    >
      {collapsed ? null : label}
    </span>
  );
}

function AdminNavigation({ pathname, collapsed, counts }: { pathname: string; collapsed: boolean; counts: NotificationCounts }) {
  return (
    <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-3">
      {navGroups.map((group, groupIndex) => (
        <div key={group.label ?? "dashboard"} className={groupIndex === 0 ? "" : "mt-5"}>
          {group.label && !collapsed && (
            <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: "rgba(247,245,240,0.35)" }}>
              {group.label}
            </p>
          )}
          {group.label && collapsed && <div className="mx-2 mb-2 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }} />}
          <div className="space-y-1">
            {group.items.map((item) => {
              const active = pathname.startsWith(item.href) ||
                (item.href === "/admin/config" && pathname.startsWith("/admin/events"));
              const count = item.notificationKey ? counts[item.notificationKey] : 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? `${item.label}${count ? `, ${count} new` : ""}` : undefined}
                  aria-current={active ? "page" : undefined}
                  className="interactive-menu-item relative flex min-h-10 items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5 text-sm font-medium"
                  style={{
                    color: active ? "var(--color-cream)" : "rgba(247,245,240,0.55)",
                    background: active ? "rgba(255,255,255,0.12)" : undefined,
                    justifyContent: collapsed ? "center" : "flex-start",
                  }}
                >
                  <span data-nav-icon className="shrink-0" style={{ color: active ? "var(--color-sage)" : "rgba(114,145,82,0.72)" }}>{item.icon}</span>
                  {!collapsed && <span className="truncate">{item.label}</span>}
                  <NotificationBadge count={count} collapsed={collapsed} />
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function MobileHeader({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="md:hidden flex items-center px-4 py-3 border-b" style={{ background: "white", borderColor: "var(--color-border)" }}>
      <button type="button" onClick={onOpen} aria-label="Open menu" aria-haspopup="dialog" className="interactive-icon interactive-secondary inline-flex rounded-xl" style={{ color: "var(--color-forest)" }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
      <p className="ml-3 text-sm font-semibold" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>Loku Caters Admin</p>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const { toast, showToast } = useAdminToast();
  const notificationCounts = useAdminNavNotifications(pathname);

  // Load persisted collapsed state after mount
  useEffect(() => {
    const stored = localStorage.getItem(COLLAPSED_KEY);
    if (stored === "true") setIsCollapsed(true);
  }, []);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileOpen(false);
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [mobileOpen]);

  function toggleCollapsed() {
    const next = !isCollapsed;
    setIsCollapsed(next);
    localStorage.setItem(COLLAPSED_KEY, String(next));
  }

  if (pathname === "/admin/login") {
    return <>{children}</>;
  }

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      document.cookie = "dev-admin-token=; path=/; max-age=0";
      document.cookie = "sb-access-token=; path=/; max-age=0";
      router.push("/admin/login");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to sign out. Please try again.", "error");
      setSigningOut(false);
    }
  }

  const sidebarWidth = isCollapsed ? 56 : 224;

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--color-cream)" }}>
      <AdminToast toast={toast} />
      <MobileBackdrop open={mobileOpen} onClose={() => setMobileOpen(false)} />

      {/* Sidebar */}
      <aside
        className={`admin-sidebar fixed md:relative inset-y-0 left-0 z-40 flex flex-col flex-shrink-0 md:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
        style={{
          "--admin-sidebar-width": `${sidebarWidth}px`,
          height: "100%",
          background: "var(--color-forest)",
          borderRight: "1px solid rgba(255,255,255,0.08)",
          transition: "width var(--motion-surface) var(--ease-out-responsive), transform var(--motion-surface) var(--ease-out-responsive)",
        } as React.CSSProperties}
      >
        <SidebarBrand collapsed={isCollapsed} onToggle={toggleCollapsed} />
        <AdminNavigation pathname={pathname} collapsed={isCollapsed} counts={notificationCounts} />

        {/* Sign out */}
        <div className="px-2 pb-4 overflow-hidden">
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            aria-busy={signingOut}
            title={isCollapsed ? "Sign Out" : undefined}
            className="interactive-menu-item flex min-h-10 w-full items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5 text-sm font-medium"
            style={{
              color: "rgba(247,245,240,0.55)",
              justifyContent: isCollapsed ? "center" : "flex-start",
            }}
          >
            <span data-nav-icon className="shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </span>
            {!isCollapsed && <span className="truncate">{signingOut ? "Signing Out..." : "Sign Out"}</span>}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto min-w-0">
        <MobileHeader onOpen={() => setMobileOpen(true)} />
        {children}
      </main>
    </div>
  );
}
