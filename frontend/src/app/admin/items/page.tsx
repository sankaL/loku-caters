"use client";

import { useCallback, useEffect, useState } from "react";
import { API_URL, CURRENCY } from "@/config/event";
import { getAdminToken } from "@/lib/auth";
import { getApiErrorMessage } from "@/lib/apiError";

interface Item {
  id: string;
  name: string;
  description: string;
  price: number;
  discounted_price: number | null;
  sort_order: number;
}

const EMPTY_FORM = {
  name: "",
  description: "",
  price: "",
  discounted_price: "",
};

export default function AdminItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const loadItems = useCallback(async () => {
    try {
      const token = await getAdminToken();
      if (!token) return;
      const res = await fetch(`${API_URL}/api/admin/items`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load items");
      setItems(await res.json());
    } catch {
      showToast("Failed to load items", "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadItems(); }, [loadItems]);

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  }

  function openEdit(item: Item) {
    setEditingId(item.id);
    setForm({
      name: item.name,
      description: item.description,
      price: String(item.price),
      discounted_price: item.discounted_price != null ? String(item.discounted_price) : "",
    });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.price) return;
    setSaving(true);
    try {
      const token = await getAdminToken();
      if (!token) return;

      const body: Record<string, unknown> = {
        name: form.name.trim(),
        description: form.description.trim(),
        price: parseFloat(form.price) || 0,
        discounted_price: form.discounted_price ? parseFloat(form.discounted_price) : null,
      };

      let res: Response;
      if (editingId) {
        res = await fetch(`${API_URL}/api/admin/items/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch(`${API_URL}/api/admin/items`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        });
      }

      if (!res.ok) {
        throw new Error(await getApiErrorMessage(res, "Save failed"));
      }

      setShowModal(false);
      showToast(editingId ? "Item updated." : "Item created.", "success");
      await loadItems();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm(`Delete item "${id}"?`)) return;
    try {
      const token = await getAdminToken();
      if (!token) return;
      const res = await fetch(`${API_URL}/api/admin/items/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Delete failed");
      showToast("Item deleted.", "success");
      await loadItems();
    } catch {
      showToast("Failed to delete item", "error");
    }
  }

  const inputClass =
    "w-full px-4 py-3 rounded-xl text-sm border bg-white focus:outline-none focus:ring-2 transition-all border-[var(--color-border)] focus:ring-[var(--color-sage)] focus:border-[var(--color-sage)]";
  const labelClass = "block text-sm font-medium mb-1.5";

  return (
    <div className="p-8 max-w-4xl">
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

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1
            className="text-2xl font-bold mb-1"
            style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}
          >
            Menu Items
          </h1>
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            Manage the items available on the order form.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all"
          style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#1e3d18"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--color-forest)"; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          Add Item
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <svg className="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" opacity="0.3" />
            <path d="M12 2a10 10 0 0 1 10 10" stroke="var(--color-sage)" />
          </svg>
        </div>
      ) : items.length === 0 ? (
        <div
          className="rounded-2xl p-10 text-center"
          style={{ background: "white", border: "1px solid var(--color-border)" }}
        >
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            No items yet. Add one above.
          </p>
        </div>
      ) : (
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: "white", border: "1px solid var(--color-border)" }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                <th className="text-left px-5 py-3 font-semibold" style={{ color: "var(--color-muted)" }}>ID</th>
                <th className="text-left px-5 py-3 font-semibold" style={{ color: "var(--color-muted)" }}>Name</th>
                <th className="text-left px-5 py-3 font-semibold" style={{ color: "var(--color-muted)" }}>Price</th>
                <th className="text-left px-5 py-3 font-semibold" style={{ color: "var(--color-muted)" }}>Sale Price</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr
                  key={item.id}
                  style={{ borderTop: idx > 0 ? "1px solid var(--color-border)" : undefined }}
                >
                  <td className="px-5 py-3 font-mono text-xs" style={{ color: "var(--color-muted)" }}>{item.id}</td>
                  <td className="px-5 py-3 font-medium" style={{ color: "var(--color-text)" }}>
                    <div>{item.name}</div>
                    {item.description && (
                      <div className="text-xs font-normal mt-0.5" style={{ color: "var(--color-muted)" }}>
                        {item.description.slice(0, 60)}{item.description.length > 60 ? "..." : ""}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3" style={{ color: "var(--color-text)" }}>${item.price.toFixed(2)}</td>
                  <td className="px-5 py-3" style={{ color: item.discounted_price != null ? "#12270F" : "var(--color-muted)" }}>
                    {item.discounted_price != null ? `$${item.discounted_price.toFixed(2)}` : "-"}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3 justify-end">
                      <button
                        onClick={() => openEdit(item)}
                        className="text-xs font-medium transition-colors"
                        style={{ color: "var(--color-sage)" }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--color-forest)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--color-sage)"; }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="text-xs font-medium text-red-400 hover:text-red-600 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.4)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div
            className="w-full max-w-md rounded-2xl p-6 space-y-4"
            style={{ background: "white" }}
          >
            <h2 className="text-lg font-semibold" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>
              {editingId ? "Edit Item" : "Add Item"}
            </h2>

            <div>
              <label className={labelClass} style={{ color: "var(--color-text)" }}>Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Lamprais"
                className={inputClass}
                style={{ color: "var(--color-text)" }}
              />
            </div>

            <div>
              <label className={labelClass} style={{ color: "var(--color-text)" }}>Description</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Short description"
                className={inputClass}
                style={{ color: "var(--color-text)" }}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass} style={{ color: "var(--color-text)" }}>Price ({CURRENCY})</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.price}
                  onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))}
                  placeholder="23.00"
                  className={inputClass}
                  style={{ color: "var(--color-text)" }}
                />
              </div>
              <div>
                <label className={labelClass} style={{ color: "var(--color-text)" }}>Sale Price (optional)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.discounted_price}
                  onChange={(e) => setForm((p) => ({ ...p, discounted_price: e.target.value }))}
                  placeholder="Leave blank"
                  className={inputClass}
                  style={{ color: "var(--color-text)" }}
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2.5 rounded-xl text-sm font-medium"
                style={{ background: "var(--color-cream)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-60"
                style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
