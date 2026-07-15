import { useEffect, useState } from "react";

export function usePendingStatusChange<TStatus extends string>(
  itemId: string,
  onStatusChange: (id: string, status: TStatus) => Promise<void>,
) {
  const [updating, setUpdating] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<TStatus | null>(null);

  useEffect(() => setPendingStatus(null), [itemId]);

  async function confirmStatusChange() {
    if (!pendingStatus) return;
    const nextStatus = pendingStatus;
    setPendingStatus(null);
    setUpdating(true);
    try {
      await onStatusChange(itemId, nextStatus);
    } finally {
      setUpdating(false);
    }
  }

  return {
    updating,
    pendingStatus,
    setPendingStatus,
    confirmStatusChange,
    cancelStatusChange: () => setPendingStatus(null),
  };
}
