"use client";
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useState } from "react";
import { API_URL, CURRENCY } from "@/config/event";
import { getAdminToken } from "@/lib/auth";
import AdminToast from "@/components/admin/AdminToast";
import { useAdminToast } from "@/components/admin/useAdminToast";
import { runAdminDeleteAction, runAdminSaveAction } from "@/lib/adminCrud";
import {
  ADMIN_FORM_INPUT_CLASS,
  ADMIN_FORM_LABEL_CLASS,
  AdminCrudContent,
  AdminCrudPageHeader,
  AdminCrudRowActions,
  AdminModalActions,
} from "@/components/admin/AdminCrudParts";

interface Item {
  id: string;
  name: string;
  description: string;
  price: number;
  discounted_price: number | null;
  minimum_order_quantity?: number;
  image_key: string | null;
  image_path: string | null;
  sort_order: number;
}

interface EventImage {
  key: string;
  type: string;
  label: string;
  path: string;
  alt: string;
}

const EMPTY_FORM = {
  name: "",
  description: "",
  price: "",
  discounted_price: "",
  minimum_order_quantity: "1",
  image_key: "",
};

type ItemForm = typeof EMPTY_FORM;

interface ItemsPageState {
  items: Item[];
  menuImages: EventImage[];
  loading: boolean;
  showModal: boolean;
  editingId: string | null;
  form: ItemForm;
  saving: boolean;
}

const INITIAL_STATE: ItemsPageState = {
  items: [],
  menuImages: [],
  loading: true,
  showModal: false,
  editingId: null,
  form: EMPTY_FORM,
  saving: false,
};

function normalizeMenuImages(data: unknown): EventImage[] {
  if (!data || typeof data !== "object") return [];
  const raw = data as { images?: unknown[] };
  const images = Array.isArray(raw.images) ? raw.images : [];
  return images
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    .map((entry): EventImage => ({
      key: typeof entry.key === "string" ? entry.key : "",
      type: typeof entry.type === "string" ? entry.type : "",
      label: typeof entry.label === "string" ? entry.label : "",
      path: typeof entry.path === "string" ? entry.path : "",
      alt: typeof entry.alt === "string" ? entry.alt : "",
    }))
    .filter((entry) => entry.type === "menu_item" && Boolean(entry.key) && Boolean(entry.path) && Boolean(entry.label));
}

export default function AdminItemsPage() {
  const [state, setState] = useState<ItemsPageState>(INITIAL_STATE);
  const { items, menuImages, loading, showModal, editingId, form, saving } = state;
  const { toast, showToast } = useAdminToast(4000);
  const updateState = useCallback((patch: Partial<ItemsPageState>) => {
    setState((current) => ({ ...current, ...patch }));
  }, []);
  const updateForm = useCallback((patch: Partial<ItemForm>) => {
    setState((current) => ({ ...current, form: { ...current.form, ...patch } }));
  }, []);

  const selectedFormImage = useMemo(
    () => menuImages.find((image) => image.key === form.image_key) ?? null,
    [menuImages, form.image_key]
  );

  const loadItems = useCallback(async () => {
    try {
      const token = await getAdminToken();
      if (!token) return;
      const headers = { Authorization: `Bearer ${token}` };
      const [itemsRes, imagesRes] = await Promise.all([
        fetch(`${API_URL}/api/admin/items`, { headers }),
        fetch(`${API_URL}/api/admin/event-images`, { headers }),
      ]);
      if (!itemsRes.ok) throw new Error("Failed to load items");
      if (!imagesRes.ok) throw new Error("Failed to load image catalog");
      const [itemsData, imagesData] = await Promise.all([
        itemsRes.json() as Promise<Item[]>,
        imagesRes.json() as Promise<unknown>,
      ]);
      updateState({ items: itemsData, menuImages: normalizeMenuImages(imagesData) });
    } catch {
      showToast("Failed to load items", "error");
    } finally {
      updateState({ loading: false });
    }
  }, [showToast, updateState]);

  useEffect(() => { loadItems(); }, [loadItems]);

  function openCreate() {
    updateState({ editingId: null, form: EMPTY_FORM, showModal: true });
  }

  function openEdit(item: Item) {
    updateState({
      editingId: item.id,
      showModal: true,
      form: {
      name: item.name,
      description: item.description,
      price: String(item.price),
      discounted_price: item.discounted_price != null ? String(item.discounted_price) : "",
      minimum_order_quantity: String(item.minimum_order_quantity ?? 1),
      image_key: item.image_key ?? "",
      },
    });
  }

  async function handleSave() {
    if (!form.name.trim() || !form.price) return;
    const minimumOrderQuantity = Number.parseInt(form.minimum_order_quantity, 10);
    if (!Number.isFinite(minimumOrderQuantity) || minimumOrderQuantity < 1) {
      showToast("Minimum order must be at least 1.", "error");
      return;
    }
    await runAdminSaveAction({
      resourcePath: "/api/admin/items",
      id: editingId,
      body: {
        name: form.name.trim(),
        description: form.description.trim(),
        price: parseFloat(form.price) || 0,
        discounted_price: form.discounted_price ? parseFloat(form.discounted_price) : null,
        minimum_order_quantity: minimumOrderQuantity,
        image_key: form.image_key || null,
      },
      successMessage: editingId ? "Item updated." : "Item created.",
      onSaved: async () => {
        updateState({ showModal: false });
        await loadItems();
      },
      setSaving: (next) => updateState({ saving: next }),
      notify: showToast,
    });
  }

  async function handleDelete(id: string) {
    await runAdminDeleteAction({ resourcePath: "/api/admin/items", id, entityLabel: "item", successMessage: "Item deleted.", onDeleted: loadItems, notify: showToast });
  }

  return (
    <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
      <AdminToast toast={toast} />

      <AdminCrudPageHeader title="Menu Items" description="Manage the items available on the order form." actionLabel="Add Item" onAction={openCreate} />

      <AdminCrudContent loading={loading} empty={items.length === 0} emptyMessage="No items yet. Add one above.">
        <div
          className="rounded-2xl"
          style={{ background: "white", border: "1px solid var(--color-border)" }}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[940px] text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                <th className="text-left px-5 py-3 font-semibold" style={{ color: "var(--color-muted)" }}>ID</th>
                <th className="text-left px-5 py-3 font-semibold" style={{ color: "var(--color-muted)" }}>Image</th>
                <th className="text-left px-5 py-3 font-semibold" style={{ color: "var(--color-muted)" }}>Name</th>
                <th className="text-left px-5 py-3 font-semibold" style={{ color: "var(--color-muted)" }}>Price</th>
                <th className="text-left px-5 py-3 font-semibold" style={{ color: "var(--color-muted)" }}>Sale Price</th>
                <th className="text-left px-5 py-3 font-semibold" style={{ color: "var(--color-muted)" }}>Min Order</th>
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
                  <td className="px-5 py-3">
                    {item.image_path ? (
                      <img
                        src={item.image_path}
                        alt={item.name}
                        className="h-12 w-16 rounded-xl object-cover"
                        style={{ border: "1px solid var(--color-border)" }}
                      />
                    ) : (
                      <div
                        className="flex h-12 w-16 items-center justify-center rounded-xl text-xs font-semibold"
                        style={{ background: "var(--color-cream)", color: "var(--color-muted)", border: "1px solid var(--color-border)" }}
                      >
                        None
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3 font-medium" style={{ color: "var(--color-text)" }}>
                    <div>{item.name}</div>
                    {item.description && (
                      <div className="text-xs font-normal mt-0.5" style={{ color: "var(--color-muted)" }}>
                        {item.description.slice(0, 60)}{item.description.length > 60 ? "..." : ""}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3" style={{ color: "var(--color-text)" }}>${item.price.toFixed(2)}</td>
                  <td className="px-5 py-3" style={{ color: item.discounted_price != null ? "var(--color-forest)" : "var(--color-muted)" }}>
                    {item.discounted_price != null ? `$${item.discounted_price.toFixed(2)}` : "-"}
                  </td>
                  <td className="px-5 py-3" style={{ color: "var(--color-text)" }}>
                    {item.minimum_order_quantity ?? 1}
                  </td>
                  <td className="px-5 py-3">
                    <AdminCrudRowActions onEdit={() => openEdit(item)} onDelete={() => handleDelete(item.id)} />
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        </div>
      </AdminCrudContent>

      {/* Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.4)" }}
          onClick={(event) => { if (event.target === event.currentTarget) updateState({ showModal: false }); }}
        >
          <div
            className="w-full max-w-2xl rounded-2xl p-6 space-y-4"
            style={{ background: "white" }}
          >
            <h2 className="text-lg font-semibold" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>
              {editingId ? "Edit Item" : "Add Item"}
            </h2>

            <div>
              <label className={ADMIN_FORM_LABEL_CLASS} style={{ color: "var(--color-text)" }}>Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(event) => updateForm({ name: event.target.value })}
                placeholder="e.g. Lamprais"
                className={ADMIN_FORM_INPUT_CLASS}
                style={{ color: "var(--color-text)" }}
              />
            </div>

            <div>
              <label className={ADMIN_FORM_LABEL_CLASS} style={{ color: "var(--color-text)" }}>Description</label>
              <input
                type="text"
                value={form.description}
                onChange={(event) => updateForm({ description: event.target.value })}
                placeholder="Short description"
                className={ADMIN_FORM_INPUT_CLASS}
                style={{ color: "var(--color-text)" }}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_10rem] sm:items-end">
              <div>
                <label className={ADMIN_FORM_LABEL_CLASS} style={{ color: "var(--color-text)" }}>Menu Image</label>
                <select
                  value={form.image_key}
                  onChange={(event) => updateForm({ image_key: event.target.value })}
                  className={ADMIN_FORM_INPUT_CLASS}
                  style={{ color: "var(--color-text)" }}
                >
                  <option value="">None</option>
                  {menuImages.map((image) => (
                    <option key={image.key} value={image.key}>{image.label}</option>
                  ))}
                </select>
              </div>
              <div
                className="h-28 overflow-hidden rounded-2xl"
                style={{ background: "var(--color-cream)", border: "1px solid var(--color-border)" }}
              >
                {selectedFormImage ? (
                  <img
                    src={selectedFormImage.path}
                    alt={selectedFormImage.alt}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center px-4 text-center text-xs font-semibold" style={{ color: "var(--color-muted)" }}>
                    No image selected
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-end">
              <div>
                <label className={ADMIN_FORM_LABEL_CLASS} style={{ color: "var(--color-text)" }}>Price ({CURRENCY})</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.price}
                  onChange={(event) => updateForm({ price: event.target.value })}
                  placeholder="23.00"
                  className={ADMIN_FORM_INPUT_CLASS}
                  style={{ color: "var(--color-text)" }}
                />
              </div>
              <div>
                <label className={ADMIN_FORM_LABEL_CLASS} style={{ color: "var(--color-text)" }}>Sale Price (optional)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.discounted_price}
                  onChange={(event) => updateForm({ discounted_price: event.target.value })}
                  placeholder="Leave blank"
                  className={ADMIN_FORM_INPUT_CLASS}
                  style={{ color: "var(--color-text)" }}
                />
              </div>
              <div>
                <label className={ADMIN_FORM_LABEL_CLASS} style={{ color: "var(--color-text)" }}>Min Order</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={form.minimum_order_quantity}
                  onChange={(event) => updateForm({ minimum_order_quantity: event.target.value })}
                  placeholder="1"
                  className={ADMIN_FORM_INPUT_CLASS}
                  style={{ color: "var(--color-text)" }}
                />
              </div>
            </div>

            <AdminModalActions saving={saving} onCancel={() => updateState({ showModal: false })} onSave={handleSave} />
          </div>
        </div>
      )}
    </div>
  );
}
