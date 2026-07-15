"use client";

import { useCallback, useRef, useState } from "react";
import { SelectButton, SelectOptionRows, type SelectOption } from "./SelectDropdownParts";
import { useDismissibleDropdown } from "./useDropdown";

interface CustomSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  hasError?: boolean;
  id?: string;
}

function CustomSelectMenu({
  open,
  options,
  value,
  onSelect,
}: {
  open: boolean;
  options: SelectOption[];
  value: string;
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
        zIndex: 50,
        background: "white",
        borderRadius: "12px",
        border: "1px solid var(--color-border)",
        boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
        overflow: "hidden",
        maxHeight: "240px",
        overflowY: "auto",
      }}
    >
      <SelectOptionRows options={options} value={value} onSelect={onSelect} />
    </div>
  );
}

export default function CustomSelect({
  options,
  value,
  onChange,
  placeholder = "Select an option",
  disabled = false,
  hasError = false,
  id,
}: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.value === value);
  const close = useCallback(() => setOpen(false), []);
  useDismissibleDropdown(open, containerRef, close);

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <SelectButton
        id={id}
        disabled={disabled}
        open={open}
        hasError={hasError}
        selectedLabel={selectedOption?.label}
        placeholder={placeholder}
        padding="12px 16px"
        onToggle={() => setOpen((previous) => !previous)}
      />
      <CustomSelectMenu
        open={open}
        options={options}
        value={value}
        onSelect={(next) => {
          onChange(next);
          close();
        }}
      />
    </div>
  );
}
