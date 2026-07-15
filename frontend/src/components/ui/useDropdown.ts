import { useEffect, type RefObject } from "react";

export function useDismissibleDropdown(
  open: boolean,
  containerRef: RefObject<HTMLElement | null>,
  onDismiss: () => void,
) {
  useEffect(() => {
    if (!open) return;

    function handleMouseDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) onDismiss();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onDismiss();
    }

    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [containerRef, onDismiss, open]);
}

export function useFocusOnOpen(
  open: boolean,
  inputRef: RefObject<HTMLInputElement | null>,
  beforeFocus: () => void,
) {
  useEffect(() => {
    if (!open) return;
    beforeFocus();
    const timer = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [beforeFocus, inputRef, open]);
}
