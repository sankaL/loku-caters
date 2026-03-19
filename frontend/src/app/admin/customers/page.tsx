"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/ui/Modal";
import { API_URL } from "@/config/event";
import { getAdminToken } from "@/lib/auth";
import { getApiErrorMessage } from "@/lib/apiError";
import type { Customer } from "@/lib/customers";


function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}


export default function AdminCustomersPage() {
  const router = useRouter();
  const headerCheckboxRef = useRef<HTMLInputElement | null>(null);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [pickupLocation, setPickupLocation] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const loadCustomers = useCallback(async () => {
    try {
      const token = await getAdminToken();
      if (!token) {
        router.push("/admin/login");
        return;
      }

      const res = await fetch(`${API_URL}/api/admin/customers`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) {
        router.push("/admin/login");
        return;
      }
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, "Failed to load customers"));
      }

      setCustomers(await res.json());
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed to load customers", "error");
    } finally {
      setLoading(false);
    }
  }, [router, showToast]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const pickupLocationOptions = useMemo(() => {
    const values = new Set<string>();
    for (const customer of customers) {
      for (const location of customer.pickup_locations || []) {
        if (location?.trim()) values.add(location.trim());
      }
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [customers]);

  const filteredCustomers = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return customers.filter((customer) => {
      const matchesSearch = !normalizedSearch || [
        customer.name,
        customer.email,
        customer.phone_number ?? "",
        ...(customer.pickup_locations || []),
      ].some((value) => value.toLowerCase().includes(normalizedSearch));

      const matchesPickupLocation = pickupLocation === "all"
        || (customer.pickup_locations || []).includes(pickupLocation);

      return matchesSearch && matchesPickupLocation;
    });
  }, [customers, pickupLocation, search]);

  useEffect(() => {
    setSelectedIds((prev) => {
      const next = new Set<string>();
      const visibleIds = new Set(filteredCustomers.map((customer) => customer.id));
      for (const id of prev) {
        if (visibleIds.has(id)) next.add(id);
      }
      return next;
    });
  }, [filteredCustomers]);

  const allVisibleSelected = filteredCustomers.length > 0 && filteredCustomers.every((customer) => selectedIds.has(customer.id));
  const someVisibleSelected = filteredCustomers.some((customer) => selectedIds.has(customer.id));

  useEffect(() => {
    if (!headerCheckboxRef.current) return;
    headerCheckboxRef.current.indeterminate = !allVisibleSelected && someVisibleSelected;
  }, [allVisibleSelected, someVisibleSelected]);

  function toggleSelectAll() {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
      return;
    }

    setSelectedIds(new Set(filteredCustomers.map((customer) => customer.id)));
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBulkDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    setBulkDeleting(true);
    try {
      const token = await getAdminToken();
      if (!token) {
        router.push("/admin/login");
        return;
      }

      const res = await fetch(`${API_URL}/api/admin/customers/bulk-delete`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids }),
      });

      if (res.status === 401) {
        router.push("/admin/login");
        return;
      }
      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, "Failed to delete customers"));
      }

      const idSet = new Set(ids);
      setCustomers((prev) => prev.filter((customer) => !idSet.has(customer.id)));
      setSelectedIds(new Set());
      setShowBulkDeleteModal(false);
      showToast(`${ids.length} customer${ids.length === 1 ? "" : "s"} deleted`, "success");
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed to delete customers", "error");
    } finally {
      setBulkDeleting(false);
    }
  }

  const btnBase: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "9px 14px",
    borderRadius: 10,
    border: "1px solid var(--color-border)",
    background: "white",
    color: "var(--color-text)",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
  };

  const btnDanger: CSSProperties = {
    ...btnBase,
    background: "#fff1f2",
    border: "1px solid #fecdd3",
    color: "#be123c",
  };

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
      {toast && (
        <div
          className="fixed top-6 right-6 z-50 px-5 py-3 rounded-xl text-sm font-medium shadow-lg"
          style={{
            background: toast.type === "success" ? "#d1fae5" : "#fee2e2",
            color: toast.type === "success" ? "#065f46" : "#991b1b",
            border: `1px solid ${toast.type === "success" ? "#6ee7b7" : "#fca5a5"}`,
          }}
        >
          {toast.message}
        </div>
      )}

      <div className="mb-8 flex flex-col gap-4">
        <div>
          <h1
            className="text-2xl font-bold mb-1"
            style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}
          >
            Customers
          </h1>
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            Manage the saved customer contact list built from orders.
          </p>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, phone, or pickup location"
            className="w-full lg:flex-1 px-4 py-3 rounded-xl text-sm border bg-white focus:outline-none focus:ring-2 transition-all border-[var(--color-border)] focus:ring-[var(--color-sage)] focus:border-[var(--color-sage)]"
          />

          <select
            value={pickupLocation}
            onChange={(e) => setPickupLocation(e.target.value)}
            className="w-full lg:w-64 px-4 py-3 rounded-xl text-sm border bg-white focus:outline-none focus:ring-2 transition-all border-[var(--color-border)] focus:ring-[var(--color-sage)] focus:border-[var(--color-sage)]"
          >
            <option value="all">All pickup locations</option>
            {pickupLocationOptions.map((location) => (
              <option key={location} value={location}>
                {location}
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "10px 16px",
            background: "#f0f7eb",
            border: "1px solid #c8ddb4",
            borderRadius: 12,
            marginBottom: 12,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-forest)" }}>
            {selectedIds.size} selected
          </span>
          <div style={{ width: 1, height: 20, background: "#c8ddb4" }} />
          <button onClick={() => setShowBulkDeleteModal(true)} style={btnDanger}>
            Delete selected
          </button>
          <button onClick={() => setSelectedIds(new Set())} style={{ ...btnBase, marginLeft: "auto" }}>
            Clear
          </button>
        </div>
      )}

      <div
        style={{
          background: "white",
          border: "1px solid var(--color-border)",
          borderRadius: 20,
          overflow: "hidden",
        }}
      >
        {loading ? (
          <div className="flex justify-center py-16">
            <svg className="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" opacity="0.3" />
              <path d="M12 2a10 10 0 0 1 10 10" stroke="var(--color-sage)" />
            </svg>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center" }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: "var(--color-forest)", marginBottom: 4 }}>
              No customers found
            </p>
            <p style={{ fontSize: 13, color: "var(--color-muted)" }}>
              {search.trim() || pickupLocation !== "all"
                ? "No customers match the current filters."
                : "Customers will appear here as orders are placed and backfilled."}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-cream)" }}>
                  <th style={{ padding: "11px 12px 11px 16px", width: 36 }}>
                    <input
                      ref={headerCheckboxRef}
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAll}
                      style={{ cursor: "pointer" }}
                    />
                  </th>
                  {["Name", "Email", "Phone", "Pickup Locations", "Created", "Updated"].map((label) => (
                    <th
                      key={label}
                      style={{
                        textAlign: "left",
                        padding: "11px 16px",
                        fontSize: 11,
                        fontWeight: 600,
                        color: "var(--color-muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.07em",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.map((customer, idx) => (
                  <tr
                    key={customer.id}
                    style={{
                      borderBottom: idx < filteredCustomers.length - 1 ? "1px solid var(--color-border)" : "none",
                      background: "white",
                    }}
                  >
                    <td style={{ padding: "13px 12px 13px 16px", verticalAlign: "top" }}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(customer.id)}
                        onChange={() => toggleSelect(customer.id)}
                        style={{ cursor: "pointer" }}
                      />
                    </td>
                    <td style={{ padding: "13px 16px", verticalAlign: "top", fontWeight: 600, color: "var(--color-text)" }}>
                      {customer.name}
                    </td>
                    <td style={{ padding: "13px 16px", verticalAlign: "top", color: "var(--color-text)", whiteSpace: "nowrap" }}>
                      {customer.email}
                    </td>
                    <td style={{ padding: "13px 16px", verticalAlign: "top", color: "var(--color-text)", whiteSpace: "nowrap" }}>
                      {customer.phone_number || <span style={{ color: "var(--color-border)" }}>-</span>}
                    </td>
                    <td style={{ padding: "13px 16px", verticalAlign: "top" }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {(customer.pickup_locations || []).length > 0 ? (
                          customer.pickup_locations.map((location) => (
                            <span
                              key={location}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                padding: "4px 9px",
                                borderRadius: 999,
                                fontSize: 12,
                                fontWeight: 600,
                                background: "#edf5e7",
                                color: "var(--color-forest)",
                                border: "1px solid #d8e7cc",
                              }}
                            >
                              {location}
                            </span>
                          ))
                        ) : (
                          <span style={{ color: "var(--color-border)" }}>-</span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: "13px 16px", verticalAlign: "top", color: "var(--color-muted)", whiteSpace: "nowrap" }}>
                      {formatDateTime(customer.created_at)}
                    </td>
                    <td style={{ padding: "13px 16px", verticalAlign: "top", color: "var(--color-muted)", whiteSpace: "nowrap" }}>
                      {formatDateTime(customer.updated_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        isOpen={showBulkDeleteModal}
        onClose={() => !bulkDeleting && setShowBulkDeleteModal(false)}
        title={`Delete ${selectedIds.size} customer${selectedIds.size === 1 ? "" : "s"}`}
        variant="danger"
        actions={
          <>
            <button onClick={() => setShowBulkDeleteModal(false)} style={btnBase} disabled={bulkDeleting}>
              Cancel
            </button>
            <button onClick={handleBulkDelete} style={btnDanger} disabled={bulkDeleting}>
              {bulkDeleting ? "Deleting..." : "Delete all"}
            </button>
          </>
        }
      >
        {selectedIds.size} customer record{selectedIds.size === 1 ? "" : "s"} will be permanently deleted from the customer list. Orders will not be changed.
      </Modal>
    </div>
  );
}
