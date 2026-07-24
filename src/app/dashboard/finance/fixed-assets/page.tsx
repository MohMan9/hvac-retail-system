import Link from "next/link";
import { Building2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth.server";
import { getServerDictionary } from "@/lib/i18n/get-server-locale";
import { getEffectivePermissions } from "@/lib/permissions.server";
import { hasPermission } from "@/lib/permissions";
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

// Straight-line depreciation: the purchase cost spread evenly across the
// asset's useful life in months. Shown for reference only — the report's RPC
// is the source of truth for the amount actually applied to profit.
function monthlyDepreciation(purchaseCost: number, usefulLifeYears: number) {
  const months = usefulLifeYears * 12;
  return months > 0 ? purchaseCost / months : 0;
}

export default async function FixedAssetsPage() {
  const supabase = await createClient();
  const authData = await getCurrentUser();
  const { dict } = await getServerDictionary();

  const permissions = await getEffectivePermissions();

  if (!authData.user || !hasPermission(permissions, "manage_expenses")) {
    return (
      <main className="mx-auto max-w-2xl px-8 py-6">
        <p className={mutedTextClass}>{dict["finance.fixedAssets.notAuthorized"]}</p>
      </main>
    );
  }

  const { data: assets } = await supabase
    .from("fixed_assets")
    .select("id, name, purchase_cost, purchase_date, useful_life_years")
    .order("purchase_date", { ascending: false });

  return (
    <main className="mx-auto max-w-4xl px-8 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className={pageTitleClass}>{dict["finance.fixedAssets.title"]}</h1>
        <Link href="/dashboard/finance/fixed-assets/new" className={btnPrimary}>
          {dict["finance.fixedAssets.newButton"]}
        </Link>
      </div>

      {assets && assets.length > 0 ? (
        <div className={tableWrapClass}>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className={theadRowClass}>
                <th className={thClass}>{dict["finance.fixedAssets.colName"]}</th>
                <th className={thClass}>{dict["finance.fixedAssets.colCost"]}</th>
                <th className={thClass}>{dict["finance.fixedAssets.colPurchaseDate"]}</th>
                <th className={thClass}>{dict["finance.fixedAssets.colUsefulLife"]}</th>
                <th className={thClass}>{dict["finance.fixedAssets.colMonthlyDepreciation"]}</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((asset) => (
                <tr key={asset.id} className={trClass}>
                  <td className={tdClass}>{asset.name}</td>
                  <td className={tdClass} dir="ltr">
                    {formatMoney(asset.purchase_cost)}
                  </td>
                  <td className={tdClass} dir="ltr">
                    {asset.purchase_date}
                  </td>
                  <td className={tdClass} dir="ltr">
                    {Number(asset.useful_life_years ?? 0)}
                  </td>
                  <td className={tdClass} dir="ltr">
                    {formatMoney(
                      monthlyDepreciation(
                        Number(asset.purchase_cost ?? 0),
                        Number(asset.useful_life_years ?? 0)
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          icon={Building2}
          message={dict["finance.fixedAssets.notFound"]}
          actionLabel={dict["finance.fixedAssets.newButton"]}
          actionHref="/dashboard/finance/fixed-assets/new"
        />
      )}
    </main>
  );
}
