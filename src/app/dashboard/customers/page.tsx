import Link from "next/link";
import { redirect } from "next/navigation";
import { Search, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Pagination } from "@/components/pagination";
import { PAGE_SIZE, pageRange, parsePage, sanitizeSearchTerm } from "@/lib/pagination";
import { getServerDictionary } from "@/lib/i18n/get-server-locale";
import { EmptyState } from "@/components/ui/empty-state";
import { ClickableRow } from "@/components/ui/clickable-row";
import {
  btnPrimary,
  btnSecondary,
  inputClass,
  pageTitleClass,
  tableWrapClass,
  tdClass,
  theadRowClass,
  thClass,
  trClass,
} from "@/lib/ui";

type CustomersPageProps = {
  searchParams: Promise<{ q?: string; page?: string }>;
};

const customerTypeKeys: Record<string, "customerType.wholesale" | "customerType.craftsman" | "customerType.shop" | "customerType.retail"> = {
  wholesale: "customerType.wholesale",
  craftsman: "customerType.craftsman",
  shop: "customerType.shop",
  retail: "customerType.retail",
};

export default async function CustomersPage({ searchParams }: CustomersPageProps) {
  const { q: rawQ, page: pageParam } = await searchParams;
  const q = sanitizeSearchTerm(rawQ);
  const page = parsePage(pageParam);
  const { from, to } = pageRange(page);
  const { dict } = await getServerDictionary();

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();

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

  let customersQuery = supabase
    .from("customers")
    .select("id, name, phone, customer_type", { count: "exact" })
    .eq("organization_id", profile.organization_id)
    .order("name")
    .range(from, to);

  if (q) {
    customersQuery = customersQuery.or(`name.ilike.%${q}%,phone.ilike.%${q}%`);
  }

  const { data: customers, count } = await customersQuery;
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  const customerIds = (customers ?? []).map((customer) => customer.id);

  const { data: completedInvoices } = customerIds.length
    ? await supabase
        .from("invoices")
        .select("customer_id")
        .in("customer_id", customerIds)
        .eq("status", "completed")
    : { data: [] };

  const completedCountByCustomer = new Map<string, number>();

  for (const invoice of completedInvoices ?? []) {
    if (!invoice.customer_id) continue;
    completedCountByCustomer.set(
      invoice.customer_id,
      (completedCountByCustomer.get(invoice.customer_id) ?? 0) + 1
    );
  }

  const isEmpty = !customers || customers.length === 0;

  return (
    <main className="mx-auto max-w-4xl px-8 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className={pageTitleClass}>{dict["customers.title"]}</h1>
        <Link href="/dashboard/customers/new" className={btnPrimary}>
          {dict["customers.newButton"]}
        </Link>
      </div>

      <form action="/dashboard/customers" method="get" className="mb-4 flex gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-slate-400" />
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder={dict["customers.searchPlaceholder"]}
            className={`${inputClass} ps-9`}
          />
        </div>
        <button type="submit" className={btnSecondary}>
          {dict["common.search"]}
        </button>
      </form>

      {isEmpty ? (
        <EmptyState
          icon={Users}
          message={dict["customers.notFound"]}
          actionLabel={dict["customers.newButton"]}
          actionHref="/dashboard/customers/new"
        />
      ) : (
        <div className={tableWrapClass}>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className={theadRowClass}>
                <th className={thClass}>{dict["customers.colName"]}</th>
                <th className={thClass}>{dict["customers.colPhone"]}</th>
                <th className={thClass}>{dict["customers.colType"]}</th>
                <th className={thClass}>{dict["customers.colCompletedInvoices"]}</th>
              </tr>
            </thead>
            <tbody>
              {customers?.map((customer) => {
                const typeKey = customerTypeKeys[customer.customer_type];

                return (
                  <ClickableRow
                    key={customer.id}
                    href={`/dashboard/customers/${customer.id}`}
                    className={trClass}
                  >
                    <td className={tdClass}>
                      <Link
                        href={`/dashboard/customers/${customer.id}`}
                        className="font-medium text-slate-900 hover:text-blue-600"
                      >
                        {customer.name}
                      </Link>
                    </td>
                    <td className={tdClass} dir="ltr">
                      {customer.phone ?? "—"}
                    </td>
                    <td className={tdClass}>{typeKey ? dict[typeKey] : customer.customer_type}</td>
                    <td className={tdClass} dir="ltr">
                      {completedCountByCustomer.get(customer.id) ?? 0}
                    </td>
                  </ClickableRow>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        basePath="/dashboard/customers"
        params={{ q }}
        page={page}
        totalPages={totalPages}
        dict={dict}
      />
    </main>
  );
}
