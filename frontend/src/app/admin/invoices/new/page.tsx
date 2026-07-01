import NewInvoiceClient from "@/components/admin/invoices/NewInvoiceClient";

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ bundle_id?: string }> }) {
  const params = await searchParams;
  return <NewInvoiceClient bundleId={params.bundle_id ?? ""} />;
}
