import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { toggleSelectedId } from "@/lib/adminBulk";

export function usePageSelection<TItem extends { id: string }, TDetail>(pageItems: TItem[], initialDetail: TDetail) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<TDetail>(initialDetail);
  const headerCheckboxRef = useRef<HTMLInputElement>(null);
  const allOnPageSelected = pageItems.length > 0 && pageItems.every((item) => selectedIds.has(item.id));
  const someOnPageSelected = pageItems.some((item) => selectedIds.has(item.id));

  useEffect(() => {
    if (headerCheckboxRef.current) headerCheckboxRef.current.indeterminate = someOnPageSelected && !allOnPageSelected;
  }, [allOnPageSelected, someOnPageSelected]);

  function toggleAll() {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      pageItems.forEach((item) => allOnPageSelected ? next.delete(item.id) : next.add(item.id));
      return next;
    });
  }

  function toggleOne(id: string) {
    setSelectedIds((previous) => toggleSelectedId(previous, id));
  }

  return { selectedIds, setSelectedIds, detail, setDetail: setDetail as Dispatch<SetStateAction<TDetail>>, headerCheckboxRef, allOnPageSelected, toggleAll, toggleOne };
}
