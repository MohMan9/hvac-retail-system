import Link from "next/link";
import { redirect } from "next/navigation";
import { Receipt, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth.server";
import { Pagination } from "@/components/pagination";
import { PAGE_SIZE, buildPageHref, pageRange, parsePage, sanitizeSearchTerm } from "@/lib/pagination";
import { getServerDictionary } from "@/lib/i18n/get-server-locale";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  btnPrimary,
  btnSecondary,
  inputClass,
  linkClass,
  pageTitleClass,
  tableWrapClass,
  tdClass,
  theadRowClass,
  thClass,
  trClass,
} from "@/lib/ui";

type InvoicesPageProps = {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
};

const STATUS_OPTIONS = ["all", "draft", "completed"] as const;
type StatusFilter = (typeof STATUS_OPTIONS)[number];

const statusLabelKeys: Record<StatusFilter, keyof Dictionary> = {
  all: "invoices.statusAll",
  draft: "status.draft",
  completed: "status.completed",
};

function parseStatus(value: string | undefined): StatusFilter {
  // Return the value only when it's actually one of the known filter options;
  // otherwise — including the common case where no `status` param is in the
  // URL yet — fall back to "all". The previous version applied the `?? "all"`
  // default only inside the membership check and then returned the raw
  // `value`, so the no-param case yielded `undefined`. That left the hidden
  // status <input> uncontrolled on first render (value={undefined}) and turned
  // it controlled once a status was chosen, triggering React's
  // "changing an uncontrolled input to be controlled" warning.
  return value !== undefined && (STATUS_OPTIONS as readonly string[]).includes(value)
    ? (value as StatusFilter)
    : "all";
}

function formatMoney(value: number | string | null) {
  return Number(value ?? 0).toFixed(2);
}

export default async function InvoicesPage({ searchParams }: InvoicesPageProps) {
  const { q: rawQ, status: rawStatus, page: pageParam } = await searchParams;
  const q = sanitizeSearchTerm(rawQ);
  const status = parseStatus(rawStatus);
  const page = parsePage(pageParam);
  const { from, to } = pageRange(page);
  const { dict } = await getServerDictionary();

  const supabase = await createClient();
  const authData = await getCurrentUser();

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

  // Text search matches invoice_number directly, or the name of a matching
  // customer — PostgREST can't filter on a joined table's column via .or(),
  // so resolve matching customer ids first, then filter invoices by either.
  let matchingCustomerIds: string[] = [];

  if (q) {
    const { data: matchingCustomers } = await supabase
      .from("customers")
      .select("id")
      .eq("organization_id", profile.organization_id)
      .ilike("name", `%${q}%`);

    matchingCustomerIds = (matchingCustomers ?? []).map((customer) => customer.id);
  }

  let invoicesQuery = supabase
    .from("invoices")
    .select("id, invoice_number, customer_id, sale_date, status, total", { count: "exact" })
    .eq("organization_id", profile.organization_id)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (status !== "all") {
    invoicesQuery = invoicesQuery.eq("status", status);
  }

  if (q) {
    const orParts = [`invoice_number.ilike.%${q}%`];
    if (matchingCustomerIds.length > 0) {
      orParts.push(`customer_id.in.(${matchingCustomerIds.join(",")})`);
    }
    invoicesQuery = invoicesQuery.or(orParts.join(","));
  }

  const { data: invoices, count } = await invoicesQuery;
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  const customerIds = [
    ...new Set((invoices ?? []).map((invoice) => invoice.customer_id).filter(Boolean)),
  ] as string[];

  const { data: customers } = customerIds.length
    ? await supabase.from("customers").select("id, name").in("id", customerIds)
    : { data: [] };

  const customerNameById = new Map((customers ?? []).map((customer) => [customer.id, customer.name]));
  const isEmpty = !invoices || invoices.length === 0;

  return (
    <main className="mx-auto max-w-5xl px-8 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className={pageTitleClass}>{dict["invoices.title"]}</h1>
        <Link href="/dashboard/sales" className={btnPrimary}>
          {dict["invoices.newSaleButton"]}
        </Link>
      </div>

      <form action="/dashboard/invoices" method="get" className="mb-4 flex flex-wrap gap-2">
        <input type="hidden" name="status" value={status} />
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-slate-400" />
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder={dict["invoices.searchPlaceholder"]}
            className={`${inputClass} ps-9`}
          />
        </div>
        <button type="submit" className={btnSecondary}>
          {dict["common.search"]}
        </button>
      </form>

      <div className="mb-4 flex gap-2 text-sm">
        {STATUS_OPTIONS.map((option) => (
          <Link
            key={option}
            href={buildPageHref(
              "/dashboard/invoices",
              { q, status: option === "all" ? undefined : option },
              1
            )}
            className={`rounded-full px-3 py-1.5 font-medium ${
              status === option
                ? "bg-blue-600 text-white"
                : "border border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {dict[statusLabelKeys[option]]}
          </Link>
        ))}
      </div>

      {isEmpty ? (
        <EmptyState icon={Receipt} message={dict["invoices.notFound"]} />
      ) : (
        <div className={tableWrapClass}>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className={theadRowClass}>
                <th className={thClass}>{dict["invoices.colInvoice"]}</th>
                <th className={thClass}>{dict["invoices.colCustomer"]}</th>
                <th className={thClass}>{dict["invoices.colDate"]}</th>
                <th className={thClass}>{dict["invoices.colStatus"]}</th>
                <th className={thClass}>{dict["invoices.colTotal"]}</th>
              </tr>
            </thead>
            <tbody>
              {(invoices ?? []).map((invoice) => (
                <tr key={invoice.id} className={trClass}>
                  <td className={tdClass}>
                    <Link href={`/dashboard/invoices/${invoice.id}`} className={linkClass}>
                      {invoice.invoice_number}
                    </Link>
                  </td>
                  <td className={tdClass}>
                    {invoice.customer_id
                      ? customerNameById.get(invoice.customer_id)
                      : dict["invoices.walkIn"]}
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
      )}

      <Pagination
        basePath="/dashboard/invoices"
        params={{ q, status: status === "all" ? undefined : status }}
        page={page}
        totalPages={totalPages}
        dict={dict}
      />
    </main>
  );
}
