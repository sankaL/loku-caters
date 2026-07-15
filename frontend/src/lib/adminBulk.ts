const ADMIN_BULK_BATCH_SIZE = 500;

interface AdminBulkRequestOptions {
  ids: string[];
  url: string;
  headers: Record<string, string>;
  body?: (batch: string[]) => Record<string, unknown>;
  onUnauthorized?: () => void;
  getErrorMessage?: (response: Response) => Promise<string>;
}

export interface AdminBulkResult {
  completedIds: string[];
  error: Error | null;
}

interface AdminBulkActionOptions {
  ids: string[];
  request: () => Promise<AdminBulkResult>;
  applyCompleted: (completedIds: string[]) => void;
  closeModal: () => void;
  notify: (message: string, type: "success" | "error") => void;
  successMessage: string;
  failureAction: string;
  failureMessage: string;
}

interface IdentifiedItem {
  id: string;
}

interface StatusItem extends IdentifiedItem {
  status: string;
}

function chunkAdminBulkIds(ids: string[]): string[][] {
  const batches: string[][] = [];
  for (let index = 0; index < ids.length; index += ADMIN_BULK_BATCH_SIZE) {
    batches.push(ids.slice(index, index + ADMIN_BULK_BATCH_SIZE));
  }
  return batches;
}

export function toggleSelectedId(current: Set<string>, id: string): Set<string> {
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function removeSelectedIds(current: Set<string>, ids: string[]): Set<string> {
  const next = new Set(current);
  for (const id of ids) next.delete(id);
  return next;
}

export function removeItemsByIds<T extends IdentifiedItem>(items: T[], ids: string[]): T[] {
  const removedIds = new Set(ids);
  return items.filter((item) => !removedIds.has(item.id));
}

export function updateItemStatuses<T extends StatusItem>(
  items: T[],
  ids: string[],
  status: T["status"],
): T[] {
  const updatedIds = new Set(ids);
  return items.map((item) => updatedIds.has(item.id) ? { ...item, status } : item);
}

function bulkFailureMessage(
  action: string,
  completed: number,
  total: number,
  fallback: string,
): string {
  return completed > 0 ? `${action} ${completed}; ${total - completed} failed` : fallback;
}

export async function runAdminBulkAction(options: AdminBulkActionOptions): Promise<void> {
  let completed = 0;

  try {
    const result = await options.request();
    options.applyCompleted(result.completedIds);
    completed = result.completedIds.length;
    if (result.error) throw result.error;
    options.closeModal();
    options.notify(options.successMessage, "success");
  } catch {
    const message = bulkFailureMessage(
      options.failureAction,
      completed,
      options.ids.length,
      options.failureMessage,
    );
    options.notify(message, "error");
  }
}

function requestBody(options: AdminBulkRequestOptions, batch: string[]): Record<string, unknown> {
  return options.body ? options.body(batch) : { ids: batch };
}

async function responseError(
  options: AdminBulkRequestOptions,
  response: Response,
): Promise<Error> {
  if (response.status === 401 && options.onUnauthorized) {
    options.onUnauthorized();
    return new Error("Administrator session expired");
  }
  const message = options.getErrorMessage
    ? await options.getErrorMessage(response)
    : "Bulk request failed";
  return new Error(message);
}

async function postAdminBulkBatch(
  options: AdminBulkRequestOptions,
  batch: string[],
  headers: Record<string, string>,
): Promise<void> {
  const response = await fetch(options.url, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody(options, batch)),
  });
  if (response.ok) return;
  throw await responseError(options, response);
}

export function postAdminBulkDelete(
  url: string,
  ids: string[],
  headers: Record<string, string>,
): Promise<AdminBulkResult> {
  return postAdminBulkBatches({ ids, url, headers });
}

export function postAdminBulkStatus(
  url: string,
  ids: string[],
  headers: Record<string, string>,
  status: string,
): Promise<AdminBulkResult> {
  return postAdminBulkBatches({
    ids,
    url,
    headers,
    body: (batch) => ({ ids: batch, status }),
  });
}

export async function postAdminBulkBatches(
  options: AdminBulkRequestOptions,
): Promise<AdminBulkResult> {
  const completedIds: string[] = [];
  const headers = { ...options.headers, "Content-Type": "application/json" };

  for (const batch of chunkAdminBulkIds(options.ids)) {
    try {
      await postAdminBulkBatch(options, batch, headers);
      completedIds.push(...batch);
    } catch (error) {
      return {
        completedIds,
        error: error instanceof Error ? error : new Error("Bulk request failed"),
      };
    }
  }

  return { completedIds, error: null };
}
