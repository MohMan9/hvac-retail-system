import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getServerDictionary } from "@/lib/i18n/get-server-locale";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Receipt } from "lucide-react";
import {
  cardClass,
  linkClass,
  mutedTextClass,
  pageTitleClass,
  sectionTitleClass,
  tableWrapClass,
  tdClass,
  theadRowClass,
  thClass,
  trClass,
} from "@/lib/ui";

type PageProps = {
  params: Promise<{ id: string }>;
};

function formatMoney(value: number | string | null) {
  return Number(value ?? 0).toFixed(2);
}

const customerTypeKeys: Record<string, "customerType.wholesale" | "customerType.craftsman" | "customerType.shop" | "customerType.retail"> = {
  wholesale: "customerType.wholesale",
  craftsman: "customerType.craftsman",
  shop: "customerType.shop",
  retail: "customerType.retail",
};

export default async function CustomerDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const { dict } = await getServerDictionary();

  if (!authData.user) {
    redirect("/signin");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", authData.user.id)
    .single();

  if (!profile) {
    redirect("/signin");
  }

  const { data: customer } = await supabase
    .from("customers")
    .select("id, name, phone, customer_type")
    .eq("id", id)
    .eq("organization_id", profile.organization_id)
    .single();

  if (!customer) {
    notFound();
  }

  const { data: invoices } = await supabase
    .from("invoices")
    .select("id, invoice_number, sale_date, status, total")
    .eq("customer_id", customer.id)
    .eq("organization_id", profile.organization_id)
    .order("sale_date", { ascending: false });

  const invoiceCount = invoices?.length ?? 0;
  const lifetimeValue = (invoices ?? [])
    .filter((invoice) => invoice.status === "completed")
    .reduce((sum, invoice) => sum + Number(invoice.total ?? 0), 0);
  const typeKey = customerTypeKeys[customer.customer_type];
  const invoiceWord =
    invoiceCount === 1 ? dict["customers.invoiceSingular"] : dict["customers.invoicePlural"];

  return (
    <main className="mx-auto max-w-4xl px-8 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className={pageTitleClass}>{customer.name}</h1>
        <div className="flex items-center gap-4">
          <Link href={`/dashboard/customers/${customer.id}/edit`} className={linkClass}>
            {dict["common.edit"]}
          </Link>
          <Link href="/dashboard/customers" className={linkClass}>
            {dict["customers.backToCustomers"]}
          </Link>
        </div>
      </div>

      <section className={`mb-6 grid gap-3 ${cardClass} p-4 text-sm md:grid-cols-2`}>
        <div>
          <span className="font-medium text-slate-700">{dict["customers.phoneLabel"]}: </span>
          <span className="text-slate-600" dir="ltr">
            {customer.phone ?? "—"}
          </span>
        </div>
        <div>
          <span className="font-medium text-slate-700">{dict["customers.typeLabel"]}: </span>
          <span className="text-slate-600">{typeKey ? dict[typeKey] : customer.customer_type}</span>
        </div>
      </section>

      <p className={`mb-4 ${mutedTextClass}`}>
        {invoiceCount} {invoiceWord} · {dict["customers.lifetimeValue"]}{" "}
        <span dir="ltr">{formatMoney(lifetimeValue)}</span>
      </p>

      <h2 className={`${sectionTitleClass} mb-3`}>{dict["customers.purchaseHistoryTitle"]}</h2>
      {invoices && invoices.length > 0 ? (
        <div className={tableWrapClass}>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className={theadRowClass}>
                <th className={thClass}>{dict["customers.colInvoice"]}</th>
                <th className={thClass}>{dict["customers.colDate"]}</th>
                <th className={thClass}>{dict["customers.colStatus"]}</th>
                <th className={thClass}>{dict["customers.colTotal"]}</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id} className={trClass}>
                  <td className={tdClass}>
                    <Link href={`/dashboard/invoices/${invoice.id}`} className={linkClass}>
                      {invoice.invoice_number}
                    </Link>
                  </td>
                  <td className={tdClass} dir="ltr">
                    {invoice.sale_date}
                  </td>
                  <td className={tdClass}>
                    <StatusBadge status={invoice.status} dict={dict} />
                  </td>
                  <td className={tdClass} dir="ltr">
                    {formatMoney(invoice.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon={Receipt} message={dict["customers.noPurchases"]} />
      )}
    </main>
  );
}
