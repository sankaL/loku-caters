"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { SelectButton, SelectOptionRows, type SelectOption } from "./SelectDropdownParts";
import { useDismissibleDropdown, useFocusOnOpen } from "./useDropdown";

interface SearchableSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  id?: string;
}

function SearchableSelectMenu({
  open,
  inputRef,
  query,
  searchPlaceholder,
  options,
  value,
  onQueryChange,
  onSelect,
}: {
  open: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  query: string;
  searchPlaceholder: string;
  options: SelectOption[];
  value: string;
  onQueryChange: (value: string) => void;
  onSelect: (value: string) => void;
}) {
  if (!open) return null;
  return (
    <div
      style={{
        position: "absolute",
        top: "calc(100% + 4px)",
        left: 0,
        right: 0,
        zIndex: 60,
        background: "white",
        borderRadius: "12px",
        border: "1px solid var(--color-border)",
        boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "10px", borderBottom: "1px solid var(--color-border)" }}>
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={searchPlaceholder}
          className="w-full px-3 py-2 rounded-xl text-sm border bg-white focus:outline-none focus:ring-2 transition-all border-[var(--color-border)] focus:ring-[var(--color-sage)] focus:border-[var(--color-sage)]"
          style={{ color: "var(--color-text)" }}
        />
      </div>
      <div style={{ maxHeight: 260, overflowY: "auto" }}>
        <SelectOptionRows options={options} value={value} emptyMessage="No matches." onSelect={onSelect} />
      </div>
    </div>
  );
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Select an option",
  searchPlaceholder = "Search...",
  disabled = false,
  id,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const clearQuery = useCallback(() => setQuery(""), []);

  const selectedOption = options.find((o) => o.value === value);

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => {
      const label = o.label.toLowerCase();
      const val = o.value.toLowerCase();
      return label.includes(q) || val.includes(q);
    });
  }, [options, query]);

  useDismissibleDropdown(open, containerRef, close);
  useFocusOnOpen(open, inputRef, clearQuery);

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <SelectButton
        id={id}
        disabled={disabled}
        open={open}
        selectedLabel={selectedOption?.label}
        placeholder={placeholder}
        padding="0.5rem 0.75rem"
        onToggle={() => setOpen((previous) => !previous)}
      />
      <SearchableSelectMenu
        open={open}
        inputRef={inputRef}
        query={query}
        searchPlaceholder={searchPlaceholder}
        options={filteredOptions}
        value={value}
        onQueryChange={setQuery}
        onSelect={(next) => {
          onChange(next);
          close();
        }}
      />
    </div>
  );
}
