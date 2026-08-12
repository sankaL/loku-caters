import { useCallback, useEffect, useRef, useState } from "react";
import type { AdminToastMessage } from "@/components/admin/AdminToast";

export function useAdminToast(delay = 3500) {
  const [toast, setToast] = useState<AdminToastMessage | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastIdRef = useRef(0);

  const showToast = useCallback((message: string, type: AdminToastMessage["type"]) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    toastIdRef.current += 1;
    setToast({ id: toastIdRef.current, message, type });
    timerRef.current = setTimeout(() => setToast(null), delay);
  }, [delay]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return { toast, showToast };
}
