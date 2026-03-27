"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { API_URL } from "@/config/event";
import { getAdminToken } from "@/lib/auth";

interface OrderLineResponse {
  id: string;
  group_id: string | null;
}

export default function OrderDetailRedirectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function redirectToBundle() {
      try {
        const token = await getAdminToken();
        if (!token) {
          router.replace("/admin/login");
          return;
        }

        const res = await fetch(`${API_URL}/api/admin/orders/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 404) {
          router.replace("/admin/orders");
          return;
        }
        if (!res.ok) {
          throw new Error("Failed to load order");
        }

        const order = (await res.json()) as OrderLineResponse;
        if (cancelled) return;

        const bundleId = (order.group_id ?? order.id).trim();
        const paramsForRedirect = new URLSearchParams();
        paramsForRedirect.set("highlight_bundle", bundleId);
        paramsForRedirect.set("order_id", id);
        router.replace(`/admin/orders?${paramsForRedirect.toString()}`);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to redirect to bundle");
      }
    }

    void redirectToBundle();
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  return (
    <div className="p-8">
      {error ? (
        <div>
          <p className="text-sm mb-3" style={{ color: "var(--color-muted)" }}>{error}</p>
          <button
            onClick={() => router.replace("/admin/orders")}
            className="px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}
          >
            Back to Orders
          </button>
        </div>
      ) : (
        <p className="text-sm" style={{ color: "var(--color-muted)" }}>
          Redirecting to order bundle...
        </p>
      )}
    </div>
  );
}
