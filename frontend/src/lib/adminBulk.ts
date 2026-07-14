const ADMIN_BULK_BATCH_SIZE = 500;

function chunkAdminBulkIds(ids: string[]): string[][] {
  const batches: string[][] = [];
  for (let index = 0; index < ids.length; index += ADMIN_BULK_BATCH_SIZE) {
    batches.push(ids.slice(index, index + ADMIN_BULK_BATCH_SIZE));
  }
  return batches;
}

export async function runAdminBulkBatches(
  ids: string[],
  submit: (batch: string[]) => Promise<void>,
  onSuccess?: (batch: string[]) => void,
): Promise<void> {
  for (const batch of chunkAdminBulkIds(ids)) {
    await submit(batch);
    onSuccess?.(batch);
  }
}
