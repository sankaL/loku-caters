import { API_URL } from "@/config/event";
import { getApiErrorMessage } from "@/lib/apiError";
import { getAdminToken } from "@/lib/auth";

async function saveAdminResource(
  resourcePath: string,
  id: string | null,
  body: Record<string, unknown>,
): Promise<boolean> {
  const token = await getAdminToken();
  if (!token) return false;
  const response = await fetch(`${API_URL}${resourcePath}${id ? `/${id}` : ""}`, {
    method: id ? "PUT" : "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await getApiErrorMessage(response, "Save failed"));
  return true;
}

async function deleteAdminResource(resourcePath: string, id: string): Promise<boolean> {
  const token = await getAdminToken();
  if (!token) return false;
  const response = await fetch(`${API_URL}${resourcePath}/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(await getApiErrorMessage(response, "Delete failed"));
  return true;
}

type AdminNotifier = (message: string, type: "success" | "error") => void;

export async function runAdminSaveAction(options: {
  resourcePath: string;
  id: string | null;
  body: Record<string, unknown>;
  successMessage: string;
  onSaved: () => Promise<void> | void;
  setSaving: (saving: boolean) => void;
  notify: AdminNotifier;
}): Promise<void> {
  options.setSaving(true);
  try {
    if (!await saveAdminResource(options.resourcePath, options.id, options.body)) return;
    await options.onSaved();
    options.notify(options.successMessage, "success");
  } catch (error) {
    options.notify(error instanceof Error ? error.message : "Save failed", "error");
  } finally {
    options.setSaving(false);
  }
}

export async function runAdminDeleteAction(options: {
  resourcePath: string;
  id: string;
  entityLabel: string;
  successMessage: string;
  onDeleted: () => Promise<void> | void;
  notify: AdminNotifier;
}): Promise<void> {
  if (!window.confirm(`Delete ${options.entityLabel} "${options.id}"?`)) return;
  try {
    if (!await deleteAdminResource(options.resourcePath, options.id)) return;
    await options.onDeleted();
    options.notify(options.successMessage, "success");
  } catch (error) {
    options.notify(error instanceof Error ? error.message : `Failed to delete ${options.entityLabel}`, "error");
  }
}
