import { useCallback, useState, type SetStateAction } from "react";

export function useObjectState<TState>(initialState: TState) {
  const [state, setState] = useState(initialState);
  const setField = useCallback(function setField<TKey extends keyof TState>(key: TKey, value: SetStateAction<TState[TKey]>) {
    setState((previous) => ({
      ...previous,
      [key]: typeof value === "function"
        ? (value as (current: TState[TKey]) => TState[TKey])(previous[key])
        : value,
    }));
  }, []);
  return [state, setField] as const;
}
