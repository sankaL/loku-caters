export interface AdminToastMessage {
  id?: number;
  message: string;
  type: "success" | "error";
}

export default function AdminToast({ toast }: { toast: AdminToastMessage | null }) {
  if (!toast) return null;
  const success = toast.type === "success";
  return (
    <div
      key={toast.id ?? `${toast.type}-${toast.message}`}
      role={success ? "status" : "alert"}
      aria-live={success ? "polite" : "assertive"}
      aria-atomic="true"
      className="admin-toast fixed left-4 right-4 top-4 z-[300] rounded-2xl px-5 py-3 text-sm font-semibold shadow-xl sm:left-auto sm:right-6 sm:top-6 sm:max-w-md"
      style={{
        background: success ? "var(--color-success-bg)" : "var(--color-error-bg)",
        color: success ? "var(--color-success-text)" : "var(--color-error-text)",
        border: `1px solid ${success ? "var(--color-success-border)" : "var(--color-error-border)"}`,
      }}
    >
      {toast.message}
    </div>
  );
}
