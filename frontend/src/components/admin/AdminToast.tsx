export interface AdminToastMessage {
  message: string;
  type: "success" | "error";
}

export default function AdminToast({ toast }: { toast: AdminToastMessage | null }) {
  if (!toast) return null;
  const success = toast.type === "success";
  return (
    <div
      className="fixed right-6 top-6 z-50 rounded-2xl px-5 py-3 text-sm font-semibold shadow-xl"
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
