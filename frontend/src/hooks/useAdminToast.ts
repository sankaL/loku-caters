import { useCallback, useEffect, useState } from "react";
import type { AdminToastMessage } from "@/components/admin/AdminToast";

export function useAdminToast() {
  const [toast, setToast] = useState<AdminToastMessage | null>(null);
  useEffect(() => {
    if (!toast) return;
    const timeoutId = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timeoutId);
  }, [toast]);
  const showToast = useCallback((message: string, type: AdminToastMessage["type"]) => setToast({ message, type }), []);
  return { toast, showToast };
}
