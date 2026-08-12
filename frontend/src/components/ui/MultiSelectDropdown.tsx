"use client";

import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import { CaretDown, Check } from "@phosphor-icons/react";

export interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectDropdownProps {
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder: string;
  selectedLabel?: (count: number) => string;
}

export default function MultiSelectDropdown({
  options,
  value,
  onChange,
  placeholder,
  selectedLabel = (count) => `${count} selected`,
}: MultiSelectDropdownProps) {
  return (
    <Listbox value={value} onChange={onChange} multiple>
      <div className="relative">
        <ListboxButton
          className="dropdown-trigger interactive-secondary flex min-h-10 w-full items-center justify-between gap-3 rounded-xl border bg-white px-3 py-2 text-left text-sm focus:outline-none focus:ring-2"
          style={{
            borderColor: "var(--color-border)",
            color: value.length > 0 ? "var(--color-text)" : "var(--color-muted)",
          }}
        >
          <span className="truncate">{value.length > 0 ? selectedLabel(value.length) : placeholder}</span>
          <CaretDown size={14} weight="bold" className="shrink-0" />
        </ListboxButton>
        <ListboxOptions
          anchor="bottom start"
          className="dropdown-surface z-[70] mt-1 max-h-72 w-[var(--button-width)] overflow-y-auto rounded-xl border bg-white p-1.5 shadow-lg focus:outline-none"
          style={{ borderColor: "var(--color-border)" }}
        >
          {options.map((option) => (
            <ListboxOption
              key={option.value}
              value={option.value}
              className="dropdown-option group flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm data-[focus]:bg-[var(--color-cream)]"
            >
              <span
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded border"
                style={{ borderColor: "var(--color-border)" }}
              >
                <Check size={12} weight="bold" className="hidden group-data-[selected]:block" />
              </span>
              {option.label}
            </ListboxOption>
          ))}
        </ListboxOptions>
      </div>
    </Listbox>
  );
}
