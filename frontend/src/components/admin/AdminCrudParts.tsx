import type { ReactNode, RefObject } from "react";

export const ADMIN_FORM_INPUT_CLASS = "w-full px-4 py-3 rounded-xl text-sm border bg-white focus:outline-none focus:ring-2 transition-all border-[var(--color-border)] focus:ring-[var(--color-sage)] focus:border-[var(--color-sage)]";
export const ADMIN_FORM_LABEL_CLASS = "block text-sm font-medium mb-1.5";

export function AdminCrudPageHeader({ title, description, actionLabel, onAction }: { title: string; description: string; actionLabel: string; onAction: () => void }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>{title}</h1>
        <p className="text-sm" style={{ color: "var(--color-muted)" }}>{description}</p>
      </div>
      <button onClick={onAction} className="px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all hover:bg-[color:var(--color-forest-hover)]" style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        {actionLabel}
      </button>
    </div>
  );
}

export function AdminCrudContent({ loading, empty, emptyMessage, children }: { loading: boolean; empty: boolean; emptyMessage: string; children: ReactNode }) {
  if (loading) {
    return <div className="flex justify-center py-16"><svg className="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" opacity="0.3" /><path d="M12 2a10 10 0 0 1 10 10" stroke="var(--color-sage)" /></svg></div>;
  }
  if (empty) {
    return <div className="rounded-2xl p-10 text-center" style={{ background: "white", border: "1px solid var(--color-border)" }}><p className="text-sm" style={{ color: "var(--color-muted)" }}>{emptyMessage}</p></div>;
  }
  return children;
}

export function AdminSelectableTable({
  headerCheckboxRef,
  allSelected,
  onToggleAll,
  headers,
  children,
}: {
  headerCheckboxRef: RefObject<HTMLInputElement | null>;
  allSelected: boolean;
  onToggleAll: () => void;
  headers: string[];
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b bg-[var(--color-cream)]" style={{ borderColor: "var(--color-border)" }}>
            <th className="w-9 py-[11px] pl-4 pr-3">
              <input ref={headerCheckboxRef} type="checkbox" checked={allSelected} onChange={onToggleAll} className="cursor-pointer" />
            </th>
            {headers.map((label) => (
              <th key={label} className="whitespace-nowrap px-4 py-[11px] text-left text-[11px] font-semibold uppercase tracking-[0.07em]" style={{ color: "var(--color-muted)" }}>{label}</th>
            ))}
            <th className="w-[92px] whitespace-nowrap px-4 py-[11px] text-center text-[11px] font-semibold uppercase tracking-[0.07em]" style={{ color: "var(--color-muted)" }}>Actions</th>
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function AdminModalActions({ saving, onCancel, onSave }: { saving: boolean; onCancel: () => void; onSave: () => void }) {
  return (
    <div className="flex gap-3 justify-end pt-2">
      <button onClick={onCancel} className="px-4 py-2.5 rounded-xl text-sm font-medium" style={{ background: "var(--color-cream)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}>Cancel</button>
      <button onClick={onSave} disabled={saving} className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-60" style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}>{saving ? "Saving..." : "Save"}</button>
    </div>
  );
}

export function AdminCrudRowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center gap-3 justify-end">
      <button onClick={onEdit} className="text-xs font-medium text-[color:var(--color-sage)] transition-colors hover:text-[color:var(--color-forest)]">Edit</button>
      <button onClick={onDelete} className="text-xs font-medium text-red-400 hover:text-red-600 transition-colors">Delete</button>
    </div>
  );
}
