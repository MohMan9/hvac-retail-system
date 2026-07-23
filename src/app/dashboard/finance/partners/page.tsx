import Link from "next/link";
import { Handshake } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getServerDictionary } from "@/lib/i18n/get-server-locale";
import { getEffectivePermissions } from "@/lib/permissions.server";
import { getCurrentUser } from "@/lib/auth.server";
import { hasPermission } from "@/lib/permissions";
import { EmptyState } from "@/components/ui/empty-state";
import {
  btnPrimary,
  linkClass,
  mutedTextClass,
  pageTitleClass,
  tableWrapClass,
  tdClass,
  theadRowClass,
  thClass,
  trClass,
} from "@/lib/ui";

function formatPercent(value: number | string | null) {
  return Number(value ?? 0).toFixed(2);
}

export default async function PartnersPage() {
  const supabase = await createClient();
  const authData = await getCurrentUser();
  const { dict } = await getServerDictionary();

  const permissions = await getEffectivePermissions();

  if (!authData.user || !hasPermission(permissions, "manage_partners")) {
    return (
      <main className="mx-auto max-w-2xl px-8 py-6">
        <p className={mutedTextClass}>{dict["finance.partners.notAuthorized"]}</p>
      </main>
    );
  }

  const { data: partners } = await supabase
    .from("partners")
    .select("id, name, share_percent")
    .order("created_at", { ascending: false });

  const totalAllocated = (partners ?? []).reduce(
    (sum, partner) => sum + Number(partner.share_percent ?? 0),
    0
  );

  return (
    <main className="mx-auto max-w-3xl px-8 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className={pageTitleClass}>{dict["finance.partners.title"]}</h1>
          <p className={`mt-1 ${mutedTextClass}`}>
            {dict["finance.partners.totalAllocated"]}:{" "}
            <span dir="ltr">{formatPercent(totalAllocated)}%</span>
          </p>
        </div>
        <Link href="/dashboard/finance/partners/new" className={btnPrimary}>
          {dict["finance.partners.newButton"]}
        </Link>
      </div>

      {partners && partners.length > 0 ? (
        <div className={tableWrapClass}>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className={theadRowClass}>
                <th className={thClass}>{dict["finance.partners.colName"]}</th>
                <th className={thClass}>{dict["finance.partners.colSharePercent"]}</th>
                <th className={thClass}>{dict["finance.partners.colActions"]}</th>
              </tr>
            </thead>
            <tbody>
              {partners.map((partner) => (
                <tr key={partner.id} className={trClass}>
                  <td className={tdClass}>{partner.name}</td>
                  <td className={tdClass} dir="ltr">
                    {formatPercent(partner.share_percent)}%
                  </td>
                  <td className={tdClass}>
                    <Link
                      href={`/dashboard/finance/partners/${partner.id}/withdrawals`}
                      className={linkClass}
                    >
                      {dict["finance.partners.withdrawalsLink"]}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          icon={Handshake}
          message={dict["finance.partners.notFound"]}
          actionLabel={dict["finance.partners.newButton"]}
          actionHref="/dashboard/finance/partners/new"
        />
      )}
    </main>
  );
}
