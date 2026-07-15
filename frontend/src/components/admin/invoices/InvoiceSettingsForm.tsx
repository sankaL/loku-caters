import type { FormEventHandler, ReactNode } from "react";
import { FloppyDisk } from "@phosphor-icons/react";

import type { InvoiceSettings } from "@/lib/invoices";

const FIELD_CLASS = "w-full rounded-xl border bg-white px-3 py-2.5 text-sm outline-none transition-all focus:border-[color:var(--color-sage)] focus:ring-2 focus:ring-[color:var(--color-sage)]";

interface InvoiceSettingsFormProps {
  loading: boolean;
  saving: boolean;
  form: InvoiceSettings;
  onChange: <K extends keyof InvoiceSettings>(key: K, value: InvoiceSettings[K]) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onCancel: () => void;
}

function SettingsSection({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="rounded-[1.5rem] border bg-white p-5 sm:p-6" style={{ borderColor: "var(--color-border)" }}>
      <h2 className="text-lg font-bold" style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}>{title}</h2>
      <p className="mb-5 mt-1 text-sm" style={{ color: "var(--color-muted)" }}>{description}</p>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function BusinessDetails({ form, onChange }: Pick<InvoiceSettingsFormProps, "form" | "onChange">) {
  return (
    <SettingsSection title="Business Details" description="Only completed fields appear in the From section.">
        <label className="grid gap-1.5 text-sm font-semibold" style={{ color: "var(--color-text)" }}>
          Business name
          <input required value={form.business_name} onChange={(event) => onChange("business_name", event.target.value)} className={FIELD_CLASS} style={{ borderColor: "var(--color-border)" }} />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold" style={{ color: "var(--color-text)" }}>
          Business email
          <input type="email" value={form.business_email ?? ""} onChange={(event) => onChange("business_email", event.target.value || null)} className={FIELD_CLASS} style={{ borderColor: "var(--color-border)" }} />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold" style={{ color: "var(--color-text)" }}>
          Phone number
          <input value={form.business_phone ?? ""} onChange={(event) => onChange("business_phone", event.target.value || null)} className={FIELD_CLASS} style={{ borderColor: "var(--color-border)" }} />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold sm:row-span-2" style={{ color: "var(--color-text)" }}>
          Business address
          <textarea rows={4} value={form.business_address ?? ""} onChange={(event) => onChange("business_address", event.target.value || null)} className={FIELD_CLASS} style={{ borderColor: "var(--color-border)", resize: "vertical" }} />
        </label>
    </SettingsSection>
  );
}

function PaymentDetails({ form, onChange }: Pick<InvoiceSettingsFormProps, "form" | "onChange">) {
  return (
    <SettingsSection title="Payment Details" description="Payment instructions appear only while an invoice is unpaid.">
        <label className="grid gap-1.5 text-sm font-semibold" style={{ color: "var(--color-text)" }}>
          Preferred payment method
          <select value={form.payment_method} onChange={(event) => onChange("payment_method", event.target.value as InvoiceSettings["payment_method"])} className={FIELD_CLASS} style={{ borderColor: "var(--color-border)" }}>
            <option value="none">Do not show</option>
            <option value="etransfer">E-transfer</option>
            <option value="cash">Cash</option>
            <option value="other">Other</option>
          </select>
        </label>
        {form.payment_method === "etransfer" && (
          <label className="grid gap-1.5 text-sm font-semibold" style={{ color: "var(--color-text)" }}>
            E-transfer email
            <input required type="email" value={form.payment_email ?? ""} onChange={(event) => onChange("payment_email", event.target.value || null)} className={FIELD_CLASS} style={{ borderColor: "var(--color-border)" }} />
          </label>
        )}
        <label className="grid gap-1.5 text-sm font-semibold sm:col-span-2" style={{ color: "var(--color-text)" }}>
          Payment instructions
          <textarea rows={3} value={form.payment_instructions ?? ""} onChange={(event) => onChange("payment_instructions", event.target.value || null)} placeholder="For example: Include the invoice number in the transfer message." className={FIELD_CLASS} style={{ borderColor: "var(--color-border)", resize: "vertical" }} />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold sm:col-span-2" style={{ color: "var(--color-text)" }}>
          Default footer note
          <textarea rows={2} value={form.default_footer_note ?? ""} onChange={(event) => onChange("default_footer_note", event.target.value || null)} placeholder="For example: Thank you for choosing Loku Caters." className={FIELD_CLASS} style={{ borderColor: "var(--color-border)", resize: "vertical" }} />
        </label>
    </SettingsSection>
  );
}

export default function InvoiceSettingsForm(props: InvoiceSettingsFormProps) {
  if (props.loading) {
    return <div className="h-96 animate-pulse rounded-[2rem]" style={{ background: "var(--color-cream-dark)" }} />;
  }
  return (
    <form onSubmit={props.onSubmit} className="space-y-5">
      <BusinessDetails form={props.form} onChange={props.onChange} />
      <PaymentDetails form={props.form} onChange={props.onChange} />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={props.onCancel} className="rounded-2xl border bg-white px-5 py-2.5 text-sm font-semibold" style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}>Cancel</button>
        <button disabled={props.saving} className="inline-flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold disabled:opacity-60" style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}>
          <FloppyDisk size={18} /> {props.saving ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </form>
  );
}
