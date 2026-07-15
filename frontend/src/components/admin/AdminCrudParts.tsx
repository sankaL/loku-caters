import type { CSSProperties, ReactNode, RefObject } from "react";

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

function AdminBulkActionBar({
  selectedCount,
  children,
  onClear,
  clearButtonStyle,
}: {
  selectedCount: number;
  children: ReactNode;
  onClear: () => void;
  clearButtonStyle?: CSSProperties;
}) {
  if (selectedCount === 0) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-2.5" style={{ background: "var(--color-success-bg)", borderColor: "var(--color-success-border)" }}>
      <span className="text-[13px] font-semibold" style={{ color: "var(--color-forest)" }}>{selectedCount} selected</span>
      <div className="h-5 w-px" style={{ background: "var(--color-success-border)" }} />
      {children}
      <button onClick={onClear} style={{ ...clearButtonStyle, marginLeft: "auto" }}>Clear</button>
    </div>
  );
}

function AdminBulkDeleteButton({ onClick, buttonStyle }: { onClick: () => void; buttonStyle?: CSSProperties }) {
  return (
    <button onClick={onClick} style={buttonStyle}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6l-1 14H6L5 6" />
        <path d="M10 11v6M14 11v6" />
        <path d="M9 6V4h6v2" />
      </svg>
      Delete selected
    </button>
  );
}

export function AdminDeleteIconButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} title="Delete" className="inline-flex cursor-pointer items-center rounded-lg border bg-white px-2 py-1.5" style={{ borderColor: "var(--color-border)", color: "var(--color-muted)" }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" /></svg>
    </button>
  );
}

export function AdminRowCheckboxCell({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return <td className="py-[13px] pl-4 pr-3 align-top" onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={checked} onChange={onChange} className="cursor-pointer" /></td>;
}

export function AdminDateCell({ date, time }: { date: string; time: string }) {
  return <td className="whitespace-nowrap px-4 py-[13px] align-top"><div className="font-medium" style={{ color: "var(--color-text)" }}>{date}</div><div className="mt-0.5 text-[11px]" style={{ color: "var(--color-muted)" }}>{time}</div></td>;
}

export function AdminSearchInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <div className="relative min-w-0 flex-[1_1_240px]">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--color-muted)" }}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
      <input type="text" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full rounded-xl border bg-white py-[9px] pl-9 pr-3 text-[13px] outline-none" style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }} />
    </div>
  );
}

export function AdminClearFiltersButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border bg-white px-3 py-2 text-[13px]" style={{ borderColor: "var(--color-border)", color: "var(--color-muted)" }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
      Clear
    </button>
  );
}

function AdminTableSkeleton() {
  return <div className="flex flex-col gap-4 p-8">{[0, 1, 2, 3, 4].map((index) => <div key={index} className="h-5 animate-pulse rounded-full" style={{ background: "var(--color-border)" }} />)}</div>;
}

export function AdminTableEmptyState({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="p-12 text-center">
      <div className="mx-auto mb-3 w-fit" style={{ color: "var(--color-border)" }}>{icon}</div>
      <p className="mb-1 text-[15px] font-semibold" style={{ color: "var(--color-forest)" }}>{title}</p>
      <p className="text-[13px]" style={{ color: "var(--color-muted)" }}>{description}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

function AdminBulkStatusControl<TStatus extends string>({
  value,
  options,
  onChange,
  onApply,
  buttonStyle,
}: {
  value: TStatus;
  options: Array<{ value: TStatus; label: string }>;
  onChange: (status: TStatus) => void;
  onApply: () => void;
  buttonStyle?: CSSProperties;
}) {
  return (
    <div className="flex items-center gap-2">
      <select value={value} onChange={(event) => onChange(event.target.value as TStatus)} className="cursor-pointer rounded-lg border bg-white px-2.5 py-1.5 text-[13px] outline-none" style={{ borderColor: "var(--color-success-border)", color: "var(--color-text)" }}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <button onClick={onApply} style={buttonStyle}>Mark all as</button>
    </div>
  );
}

interface AdminBulkStatusProps<TStatus extends string> {
  selectedCount: number;
  status: TStatus;
  options: Array<{ value: TStatus; label: string }>;
  onStatusChange: (status: TStatus) => void;
  onApply: () => void;
  onDelete: () => void;
  onClear: () => void;
  buttonStyle?: CSSProperties;
  dangerButtonStyle?: CSSProperties;
}

export function buildAdminBulkStatusProps<TStatus extends string>(selectedCount: number, status: TStatus, options: Array<{ value: TStatus; label: string }>, onStatusChange: (status: TStatus) => void, onApply: () => void, onDelete: () => void, onClear: () => void, buttonStyle?: CSSProperties, dangerButtonStyle?: CSSProperties): AdminBulkStatusProps<TStatus> {
  return { selectedCount, status, options, onStatusChange, onApply, onDelete, onClear, buttonStyle, dangerButtonStyle };
}

function AdminBulkStatusBar<TStatus extends string>({ selectedCount, status, options, onStatusChange, onApply, onDelete, onClear, buttonStyle, dangerButtonStyle }: AdminBulkStatusProps<TStatus>) {
  return (
    <AdminBulkActionBar selectedCount={selectedCount} onClear={onClear} clearButtonStyle={buttonStyle}>
      <AdminBulkStatusControl value={status} options={options} onChange={onStatusChange} onApply={onApply} buttonStyle={buttonStyle} />
      <div className="h-5 w-px" style={{ background: "var(--color-success-border)" }} />
      <AdminBulkDeleteButton onClick={onDelete} buttonStyle={dangerButtonStyle} />
    </AdminBulkActionBar>
  );
}

function AdminTableFrame({
  loading,
  empty,
  loadingState,
  emptyState,
  children,
}: {
  loading: boolean;
  empty: boolean;
  loadingState: ReactNode;
  emptyState: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-[20px] border bg-white" style={{ borderColor: "var(--color-border)" }}>
      {loading ? loadingState : empty ? emptyState : children}
    </div>
  );
}

export function AdminBulkTableFrame<TStatus extends string>({
  bulk,
  loading,
  empty,
  emptyState,
  children,
}: {
  bulk: AdminBulkStatusProps<TStatus>;
  loading: boolean;
  empty: boolean;
  emptyState: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <AdminBulkStatusBar {...bulk} />
      <AdminTableFrame loading={loading} empty={empty} loadingState={<AdminTableSkeleton />} emptyState={emptyState}>{children}</AdminTableFrame>
    </>
  );
}

export function AdminPagination({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (page: number) => void }) {
  if (totalPages <= 1) return null;
  const buttonStyle: CSSProperties = {
    padding: "7px 14px",
    borderRadius: 10,
    border: "1px solid var(--color-border)",
    background: "white",
    fontSize: 13,
  };
  return (
    <div className="mt-4 flex items-center justify-center gap-2">
      <button onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page === 1} style={{ ...buttonStyle, color: page === 1 ? "var(--color-border)" : "var(--color-text)", cursor: page === 1 ? "not-allowed" : "pointer" }}>Previous</button>
      <span className="text-[13px]" style={{ color: "var(--color-muted)" }}>Page {page} of {totalPages}</span>
      <button onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page === totalPages} style={{ ...buttonStyle, color: page === totalPages ? "var(--color-border)" : "var(--color-text)", cursor: page === totalPages ? "not-allowed" : "pointer" }}>Next</button>
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
