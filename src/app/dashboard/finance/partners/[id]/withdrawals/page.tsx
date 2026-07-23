import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getServerDictionary } from "@/lib/i18n/get-server-locale";
import { getEffectivePermissions } from "@/lib/permissions.server";
import { getCurrentUser } from "@/lib/auth.server";
import { hasPermission } from "@/lib/permissions";
import { WithdrawalForm } from "./withdrawal-form";
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

function formatMoney(value: number | string | null) {
  return Number(value ?? 0).toFixed(2);
}

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function PartnerWithdrawalsPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const authData = await getCurrentUser();
  const { dict } = await getServerDictionary();

  const permissions = await getEffectivePermissions();

  if (!authData.user || !hasPermission(permissions, "manage_partners")) {
    return (
      <main className="mx-auto max-w-2xl px-8 py-6">
        <p className={mutedTextClass}>{dict["finance.withdrawals.notAuthorized"]}</p>
      </main>
    );
  }

  const { data: partner } = await supabase
    .from("partners")
    .select("id, name")
    .eq("id", id)
    .single();

  if (!partner) {
    notFound();
  }

  const { data: withdrawals } = await supabase
    .from("partner_withdrawals")
    .select("id, amount, withdrawal_date, note")
    .eq("partner_id", partner.id)
    .order("withdrawal_date", { ascending: false })
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-2xl px-8 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className={pageTitleClass}>{dict["finance.withdrawals.title"]}</h1>
          <p className={`mt-1 ${mutedTextClass}`}>{partner.name}</p>
        </div>
        <Link href="/dashboard/finance/partners" className={linkClass}>
          {dict["finance.withdrawals.backToPartners"]}
        </Link>
      </div>

      <div className={`${cardClass} mb-8 p-6`}>
        <h2 className={`${sectionTitleClass} mb-4`}>{dict["finance.withdrawals.recordTitle"]}</h2>
        <WithdrawalForm partnerId={partner.id} />
      </div>

      <h2 className={`${sectionTitleClass} mb-3`}>{dict["finance.withdrawals.pastTitle"]}</h2>
      {withdrawals && withdrawals.length > 0 ? (
        <div className={tableWrapClass}>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className={theadRowClass}>
                <th className={thClass}>{dict["finance.withdrawals.colDate"]}</th>
                <th className={thClass}>{dict["finance.withdrawals.colAmount"]}</th>
                <th className={thClass}>{dict["finance.withdrawals.colNote"]}</th>
              </tr>
            </thead>
            <tbody>
              {withdrawals.map((withdrawal) => (
                <tr key={withdrawal.id} className={trClass}>
                  <td className={tdClass} dir="ltr">
                    {withdrawal.withdrawal_date}
                  </td>
                  <td className={tdClass} dir="ltr">
                    {formatMoney(withdrawal.amount)}
                  </td>
                  <td className={tdClass}>{withdrawal.note ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={mutedTextClass}>{dict["finance.withdrawals.noWithdrawals"]}</p>
      )}
    </main>
  );
}
