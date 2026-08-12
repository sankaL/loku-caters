"use client";

import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import { Check, FunnelSimple } from "@phosphor-icons/react";

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterGroup {
  id: string;
  label: string;
  options: FilterOption[];
}

export function parseMultiFilter(value: string): string[] {
  return value === "all" || !value ? [] : value.split(",").filter(Boolean);
}

export function serializeMultiFilter(values: string[]): string {
  return values.length > 0 ? values.join(",") : "all";
}

export function filterIncludes(value: string, candidate: string): boolean {
  return parseMultiFilter(value).includes(candidate);
}

export default function GroupedMultiFilterDropdown({
  groups,
  selections,
  onChange,
}: {
  groups: FilterGroup[];
  selections: Record<string, string[]>;
  onChange: (groupId: string, values: string[]) => void;
}) {
  const activeCount = Object.values(selections).reduce((total, values) => total + values.length, 0);

  return (
    <Popover className="relative shrink-0">
      <PopoverButton
        className="flex h-10 items-center gap-2 rounded-xl border bg-white px-4 text-sm font-semibold focus:outline-none focus:ring-2"
        style={{ borderColor: "var(--color-border)", color: "var(--color-forest)" }}
      >
        <FunnelSimple size={16} weight="bold" />
        Filters
        {activeCount > 0 && (
          <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums" style={{ background: "var(--color-accent)", color: "var(--color-forest)" }}>
            {activeCount}
          </span>
        )}
      </PopoverButton>
      <PopoverPanel
        anchor="bottom end"
        className="z-[100] mt-2 max-h-[min(68vh,560px)] w-[min(92vw,620px)] overflow-y-auto rounded-2xl border bg-white p-4 shadow-lg focus:outline-none"
        style={{ borderColor: "var(--color-border)" }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {groups.map((group) => (
            <fieldset key={group.id}>
              <legend className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-muted)" }}>
                {group.label}
              </legend>
              <div className="space-y-0.5">
                {group.options.map((option) => {
                  const selected = selections[group.id]?.includes(option.value) ?? false;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="checkbox"
                      aria-checked={selected}
                      onClick={() => onChange(
                        group.id,
                        selected
                          ? selections[group.id].filter((value) => value !== option.value)
                          : [...(selections[group.id] ?? []), option.value],
                      )}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-[var(--color-cream)] focus:outline-none focus:ring-2"
                      style={{ color: "var(--color-text)" }}
                    >
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border" style={{ borderColor: selected ? "var(--color-forest)" : "var(--color-border)", background: selected ? "var(--color-forest)" : "white" }}>
                        {selected && <Check size={12} weight="bold" style={{ color: "var(--color-cream)" }} />}
                      </span>
                      <span className="truncate">{option.label}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
      </PopoverPanel>
    </Popover>
  );
}
