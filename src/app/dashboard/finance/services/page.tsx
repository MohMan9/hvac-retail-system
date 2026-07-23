import Link from "next/link";
import { Wrench } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getServerDictionary } from "@/lib/i18n/get-server-locale";
import { getEffectivePermissions } from "@/lib/permissions.server";
import { getCurrentUser } from "@/lib/auth.server";
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

export default async function ServicesPage() {
  const supabase = await createClient();
  const authData = await getCurrentUser();
  const { dict } = await getServerDictionary();

  const permissions = await getEffectivePermissions();
  const canManage = hasPermission(permissions, "manage_services");

  if (!authData.user || !canManage) {
    return (
      <main className="mx-auto max-w-2xl px-8 py-6">
        <p className={mutedTextClass}>{dict["finance.services.notAuthorized"]}</p>
      </main>
    );
  }

  const { data: services } = await supabase
    .from("services")
    .select("id, name_ar, name_en, default_price")
    .order("name_en");

  return (
    <main className="mx-auto max-w-3xl px-8 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className={pageTitleClass}>{dict["finance.services.title"]}</h1>
        <Link href="/dashboard/finance/services/new" className={btnPrimary}>
          {dict["finance.services.newButton"]}
        </Link>
      </div>

      {services && services.length > 0 ? (
        <div className={tableWrapClass}>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className={theadRowClass}>
                <th className={thClass}>{dict["finance.services.colName"]}</th>
                <th className={thClass}>{dict["finance.services.colNameAr"]}</th>
                <th className={thClass}>{dict["finance.services.colDefaultPrice"]}</th>
              </tr>
            </thead>
            <tbody>
              {services.map((service) => (
                <tr key={service.id} className={trClass}>
                  <td className={tdClass}>{service.name_en ?? "-"}</td>
                  <td className={tdClass}>{service.name_ar}</td>
                  <td className={tdClass} dir="ltr">
                    {formatMoney(service.default_price)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          icon={Wrench}
          message={dict["finance.services.notFound"]}
          actionLabel={dict["finance.services.newButton"]}
          actionHref="/dashboard/finance/services/new"
        />
      )}
    </main>
  );
}
