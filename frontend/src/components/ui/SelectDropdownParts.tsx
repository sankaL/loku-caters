export interface SelectOption {
  value: string;
  label: string;
}

export function SelectButton({
  id,
  disabled,
  open,
  hasError = false,
  selectedLabel,
  placeholder,
  padding,
  onToggle,
}: {
  id?: string;
  disabled: boolean;
  open: boolean;
  hasError?: boolean;
  selectedLabel?: string;
  placeholder: string;
  padding: string;
  onToggle: () => void;
}) {
  const borderColor = hasError
    ? "var(--color-error-border)"
    : open ? "var(--color-sage)" : "var(--color-border)";
  const boxShadow = hasError
    ? "0 0 0 3px rgba(248,113,113,0.2)"
    : open ? "0 0 0 3px rgba(114,145,82,0.2)" : "none";
  return (
    <button
      type="button"
      id={id}
      disabled={disabled}
      onClick={onToggle}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding,
        borderRadius: "12px",
        border: `1px solid ${borderColor}`,
        background: "white",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        fontSize: "14px",
        color: selectedLabel ? "var(--color-text)" : "var(--color-muted)",
        textAlign: "left",
        boxShadow,
        transition: "border-color 0.15s, box-shadow 0.15s",
        outline: "none",
      }}
    >
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {selectedLabel ?? placeholder}
      </span>
      <SelectChevron open={open} />
    </button>
  );
}

function SelectChevron({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      style={{
        flexShrink: 0,
        marginLeft: "8px",
        color: "var(--color-muted)",
        transform: open ? "rotate(180deg)" : "rotate(0deg)",
        transition: "transform 0.2s ease",
      }}
    >
      <path d="M5 7.5L10 12.5L15 7.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SelectOptionRow({
  option,
  selected,
  onSelect,
}: {
  option: SelectOption;
  selected: boolean;
  onSelect: (value: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(option.value)}
      style={{
        width: "100%",
        display: "block",
        padding: "10px 16px",
        textAlign: "left",
        fontSize: "14px",
        background: selected ? "var(--color-forest)" : "transparent",
        color: selected ? "var(--color-cream)" : "var(--color-text)",
        border: "none",
        cursor: "pointer",
        transition: "background 0.1s",
      }}
      onMouseEnter={(event) => {
        if (!selected) event.currentTarget.style.background = "var(--color-cream)";
      }}
      onMouseLeave={(event) => {
        if (!selected) event.currentTarget.style.background = "transparent";
      }}
    >
      {option.label}
    </button>
  );
}

export function SelectOptionRows({
  options,
  value,
  onSelect,
  emptyMessage,
}: {
  options: SelectOption[];
  value: string;
  onSelect: (value: string) => void;
  emptyMessage?: string;
}) {
  if (options.length === 0 && emptyMessage) {
    return <div className="px-4 py-3 text-sm" style={{ color: "var(--color-muted)" }}>{emptyMessage}</div>;
  }
  return options.map((option) => (
    <SelectOptionRow
      key={option.value}
      option={option}
      selected={option.value === value}
      onSelect={onSelect}
    />
  ));
}
