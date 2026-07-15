import { useCallback, useEffect, useRef, useState } from "react";

import type { AdminToastMessage } from "./AdminToast";

export function useAdminToast(delay = 4200) {
  const [toast, setToast] = useState<AdminToastMessage | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, type: AdminToastMessage["type"]) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast({ message, type });
    timerRef.current = setTimeout(() => setToast(null), delay);
  }, [delay]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return { toast, showToast };
}
