import Image from "next/image";

import {
  formatInvoiceDate,
  formatInvoiceMoney,
  paymentMethodLabel,
  type InvoiceDetail,
} from "@/lib/invoices";

function InvoiceDocumentHeader({ invoice }: { invoice: InvoiceDetail }) {
  const vendor = invoice.snapshot.vendor;
  const contactDetails = [
    vendor.business_address,
    vendor.business_email,
    vendor.business_phone,
  ].filter(Boolean).join("\n");

  return (
    <header
      className="flex flex-col gap-5 border-b pb-7 sm:flex-row sm:items-start sm:justify-between"
      style={{ borderColor: "var(--color-border)" }}
    >
      <div className="flex items-center gap-4">
        <Image
          src="/logo-color.svg"
          alt="Loku Caters logo"
          width={64}
          height={64}
          className="rounded-2xl"
        />
        <div>
          <p
            className="text-lg font-bold"
            style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}
          >
            {vendor.business_name}
          </p>
          <p
            className="mt-1 max-w-xs whitespace-pre-line text-xs leading-5"
            style={{ color: "var(--color-muted)" }}
          >
            {contactDetails}
          </p>
        </div>
      </div>
      <div className="sm:text-right">
        <p
          className="text-3xl font-bold tracking-tight"
          style={{ color: "var(--color-forest)", fontFamily: "var(--font-serif)" }}
        >
          INVOICE
        </p>
        <p className="mt-1 text-sm font-semibold" style={{ color: "var(--color-sage)" }}>
          {invoice.invoice_number}
        </p>
      </div>
    </header>
  );
}

function InvoiceDetails({ invoice }: { invoice: InvoiceDetail }) {
  const order = invoice.snapshot.order;
  const pickupDetails = order ? [
    order.pickup_date ? formatInvoiceDate(order.pickup_date) : null,
    order.pickup_location,
    order.pickup_time_slot,
  ].filter(Boolean).join(" | ") : "";

  return (
    <div
      className={`grid gap-6 border-b py-7 ${order ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}
      style={{ borderColor: "var(--color-border)" }}
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-sage)" }}>
          Bill To
        </p>
        <p className="mt-2 font-semibold">{invoice.customer_name}</p>
        {invoice.customer_email && (
          <p className="mt-1 text-sm" style={{ color: "var(--color-muted)" }}>
            {invoice.customer_email}
          </p>
        )}
        {invoice.customer_phone && (
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            {invoice.customer_phone}
          </p>
        )}
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-sage)" }}>
          Invoice Details
        </p>
        <dl className="mt-2 space-y-1 text-sm">
          <div className="flex justify-between gap-3">
            <dt style={{ color: "var(--color-muted)" }}>Issue date</dt>
            <dd>{formatInvoiceDate(invoice.issue_date)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt style={{ color: "var(--color-muted)" }}>Due date</dt>
            <dd>{formatInvoiceDate(invoice.due_date)}</dd>
          </div>
          {invoice.order_reference && (
            <div className="flex justify-between gap-3">
              <dt style={{ color: "var(--color-muted)" }}>Order</dt>
              <dd>#{invoice.order_reference}</dd>
            </div>
          )}
        </dl>
      </div>
      {order && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-sage)" }}>
            Pickup
          </p>
          <p className="mt-2 text-sm font-semibold">{order.event_name ?? "Order"}</p>
          <p className="mt-1 text-sm" style={{ color: "var(--color-muted)" }}>
            {pickupDetails}
          </p>
        </div>
      )}
    </div>
  );
}

function InvoicePaymentBanner({ invoice }: { invoice: InvoiceDetail }) {
  const paid = invoice.payment.paid;
  const paymentMethod = paymentMethodLabel(
    invoice.payment.payment_method,
    invoice.payment.payment_method_other,
  );
  const tone = paid ? "success" : "warning";

  return (
    <div
      className="my-6 flex items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold"
      style={{
        background: `var(--color-${tone}-bg)`,
        color: `var(--color-${tone}-text)`,
        border: `1px solid var(--color-${tone}-border)`,
      }}
    >
      <span>{paid ? "PAID" : "PAYMENT DUE"}</span>
      <span>{paid && paymentMethod ? paymentMethod : formatInvoiceMoney(invoice.total, invoice.currency)}</span>
    </div>
  );
}

function InvoiceLines({ invoice }: { invoice: InvoiceDetail }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] text-sm">
        <thead>
          <tr style={{ background: "var(--color-forest)", color: "var(--color-cream)" }}>
            <th className="rounded-l-xl px-4 py-3 text-left font-semibold">Item</th>
            <th className="px-4 py-3 text-right font-semibold">Qty</th>
            <th className="px-4 py-3 text-right font-semibold">Unit Price</th>
            <th className="rounded-r-xl px-4 py-3 text-right font-semibold">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {invoice.line_items.map((line, index) => (
            <tr key={`${line.description}-${index}`} style={{ borderBottom: "1px solid var(--color-border)" }}>
              <td className="px-4 py-3">{line.description}</td>
              <td className="px-4 py-3 text-right">{line.quantity}</td>
              <td className="px-4 py-3 text-right">{formatInvoiceMoney(line.unit_price, invoice.currency)}</td>
              <td className="px-4 py-3 text-right font-semibold">{formatInvoiceMoney(line.subtotal, invoice.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InvoiceTotals({ invoice }: { invoice: InvoiceDetail }) {
  return (
    <div className="ml-auto mt-6 w-full max-w-sm space-y-2 text-sm">
      <div className="flex justify-between">
        <span style={{ color: "var(--color-muted)" }}>Subtotal</span>
        <span>{formatInvoiceMoney(invoice.subtotal, invoice.currency)}</span>
      </div>
      {invoice.discount_total > 0 && (
        <div className="flex justify-between">
          <span style={{ color: "var(--color-muted)" }}>Discount</span>
          <span>-{formatInvoiceMoney(invoice.discount_total, invoice.currency)}</span>
        </div>
      )}
      <div
        className="flex justify-between border-t pt-3 text-lg font-bold"
        style={{ borderColor: "var(--color-forest)", color: "var(--color-forest)" }}
      >
        <span>Total</span>
        <span>{formatInvoiceMoney(invoice.total, invoice.currency)}</span>
      </div>
    </div>
  );
}

function InvoiceNotes({ invoice }: { invoice: InvoiceDetail }) {
  const vendor = invoice.snapshot.vendor;
  const paymentDue = !invoice.payment.paid && vendor.payment_method !== "none";
  if (!invoice.memo && !paymentDue) return null;

  return (
    <div
      className="mt-8 grid gap-5 rounded-2xl p-5 sm:grid-cols-2"
      style={{ background: "var(--color-cream)", border: "1px solid var(--color-border)" }}
    >
      {invoice.memo && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-sage)" }}>
            Memo
          </p>
          <p className="mt-2 whitespace-pre-line text-sm leading-6">{invoice.memo}</p>
        </div>
      )}
      {paymentDue && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-sage)" }}>
            Payment
          </p>
          <p className="mt-2 text-sm font-semibold">
            {paymentMethodLabel(vendor.payment_method)}
            {vendor.payment_method === "etransfer" && vendor.payment_email
              ? ` to ${vendor.payment_email}`
              : ""}
          </p>
          {vendor.payment_instructions && (
            <p className="mt-1 whitespace-pre-line text-sm leading-6" style={{ color: "var(--color-muted)" }}>
              {vendor.payment_instructions}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function InvoiceDocument({ invoice }: { invoice: InvoiceDetail }) {
  const footerNote = invoice.snapshot.vendor.default_footer_note;
  return (
    <article
      className="overflow-hidden rounded-[1.75rem] border bg-white shadow-[0_24px_70px_-45px_rgba(18,39,15,0.45)]"
      style={{ borderColor: "var(--color-border)" }}
    >
      <div className="p-6 sm:p-9 lg:p-12">
        <InvoiceDocumentHeader invoice={invoice} />
        <InvoiceDetails invoice={invoice} />
        <InvoicePaymentBanner invoice={invoice} />
        <InvoiceLines invoice={invoice} />
        <InvoiceTotals invoice={invoice} />
        <InvoiceNotes invoice={invoice} />
        {footerNote && (
          <p className="mt-7 text-center text-xs" style={{ color: "var(--color-muted)" }}>
            {footerNote}
          </p>
        )}
      </div>
    </article>
  );
}
