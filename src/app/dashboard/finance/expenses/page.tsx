import Link from "next/link";
import { Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getServerDictionary } from "@/lib/i18n/get-server-locale";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { EmptyState } from "@/components/ui/empty-state";
import {
  btnPrimary,
  mutedTextClass,
  pageTitleClass,
  tableWrapClass,
  tdClass,
  theadRowClass,
  thClass,
  trClass,
} from "@/lib/ui";

function formatMoney(value: number | string | null) {
  return Number(value ?? 0).toFixed(2);
}

const categoryKeys: Record<string, keyof Dictionary> = {
  electricity: "finance.expenses.categoryElectricity",
  water: "finance.expenses.categoryWater",
  labor: "finance.expenses.categoryLabor",
  fixed_setup: "finance.expenses.categoryFixedSetup",
  misc: "finance.expenses.categoryMisc",
};

type PageProps = {
  searchParams: Promise<{ message?: string }>;
};

export default async function ExpensesPage({ searchParams }: PageProps) {
  const { message } = await searchParams;
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const { dict } = await getServerDictionary();

  const { data: profile } = authData.user
    ? await supabase
        .from("profiles")
        .select("role")
        .eq("id", authData.user.id)
        .single()
    : { data: null };

  if (!authData.user || !profile || profile.role !== "admin") {
    return (
      <main className="mx-auto max-w-2xl px-8 py-6">
        <p className={mutedTextClass}>{dict["finance.expenses.notAuthorized"]}</p>
      </main>
    );
  }

  const { data: expenses } = await supabase
    .from("expenses")
    .select("id, category, amount, expense_date, note")
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-4xl px-8 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className={pageTitleClass}>{dict["finance.expenses.title"]}</h1>
        <Link href="/dashboard/finance/expenses/new" className={btnPrimary}>
          {dict["finance.expenses.newButton"]}
        </Link>
      </div>

      {message && (
        <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {message}
        </p>
      )}

      {expenses && expenses.length > 0 ? (
        <div className={tableWrapClass}>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className={theadRowClass}>
                <th className={thClass}>{dict["finance.expenses.colCategory"]}</th>
                <th className={thClass}>{dict["finance.expenses.colAmount"]}</th>
                <th className={thClass}>{dict["finance.expenses.colDate"]}</th>
                <th className={thClass}>{dict["finance.expenses.colNote"]}</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((expense) => {
                const categoryKey = categoryKeys[expense.category];

                return (
                  <tr key={expense.id} className={trClass}>
                    <td className={tdClass}>{categoryKey ? dict[categoryKey] : expense.category}</td>
                    <td className={tdClass} dir="ltr">
                      {formatMoney(expense.amount)}
                    </td>
                    <td className={tdClass} dir="ltr">
                      {expense.expense_date}
                    </td>
                    <td className={tdClass}>{expense.note ?? "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          icon={Wallet}
          message={dict["finance.expenses.notFound"]}
          actionLabel={dict["finance.expenses.newButton"]}
          actionHref="/dashboard/finance/expenses/new"
        />
      )}
    </main>
  );
}
