"use client";

import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import { CaretDown, Check } from "@phosphor-icons/react";
import type { SelectOption } from "./SelectDropdownParts";

interface SingleSelectDropdownProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}

export default function SingleSelectDropdown({
  options,
  value,
  onChange,
  ariaLabel,
}: SingleSelectDropdownProps) {
  const selectedOption = options.find((option) => option.value === value) ?? options[0];

  return (
    <Listbox value={value} onChange={onChange}>
      <div className="relative mt-1">
        <ListboxButton
          aria-label={ariaLabel}
          className="dropdown-trigger interactive-secondary flex min-h-10 w-full items-center justify-between gap-3 rounded-xl border bg-white px-3 py-2 text-left text-sm font-medium focus:outline-none focus:ring-2"
          style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
        >
          <span className="truncate">{selectedOption?.label ?? ariaLabel}</span>
          <CaretDown size={14} weight="bold" className="shrink-0 text-[var(--color-muted)]" />
        </ListboxButton>
        <ListboxOptions
          anchor="bottom start"
          className="dropdown-surface z-[100] mt-1 max-h-64 w-[var(--button-width)] overflow-y-auto rounded-xl border bg-white p-1.5 shadow-lg focus:outline-none"
          style={{ borderColor: "var(--color-border)" }}
        >
          {options.map((option) => (
            <ListboxOption
              key={option.value}
              value={option.value}
              className="dropdown-option group flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm data-[focus]:bg-[var(--color-cream)]"
            >
              <span className="truncate">{option.label}</span>
              <Check size={14} weight="bold" className="invisible shrink-0 group-data-[selected]:visible" />
            </ListboxOption>
          ))}
        </ListboxOptions>
      </div>
    </Listbox>
  );
}
