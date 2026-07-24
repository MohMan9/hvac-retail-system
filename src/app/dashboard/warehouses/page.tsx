import Link from "next/link";
import { redirect } from "next/navigation";
import { Warehouse as WarehouseIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getServerDictionary } from "@/lib/i18n/get-server-locale";
import { getEffectivePermissions } from "@/lib/permissions.server";
import { getCurrentUser } from "@/lib/auth.server";
import { hasPermission } from "@/lib/permissions";
import { ClickableRow } from "@/components/ui/clickable-row";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { ArchiveViewTabs } from "../archive-view-tabs";
import { RestoreButton } from "../restore-button";
import { unarchiveWarehouse } from "../archive-actions";
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

type PageProps = {
  searchParams: Promise<{ message?: string; archived?: string }>;
};

export default async function WarehousesPage({ searchParams }: PageProps) {
  const { message, archived } = await searchParams;
  // Default view is active rows only; ?archived=1 shows ONLY archived ones.
  const showArchived = archived === "1";
  const supabase = await createClient();
  const authData = await getCurrentUser();
  const { dict } = await getServerDictionary();

  if (!authData.user) {
    redirect("/signin");
  }

  const permissions = await getEffectivePermissions();

  if (!hasPermission(permissions, "manage_warehouses")) {
    return (
      <main className="mx-auto max-w-2xl px-8 py-6">
        <p className={mutedTextClass}>{dict["warehouses.notAuthorized"]}</p>
      </main>
    );
  }

  const { data: warehouses } = await supabase
    .from("warehouses")
    .select("id, name_en, location")
    .eq("is_archived", showArchived)
    .order("name_en");

  return (
    <main className="mx-auto max-w-3xl px-8 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className={pageTitleClass}>{dict["warehouses.title"]}</h1>
        <Link href="/dashboard/warehouses/new" className={btnPrimary}>
          {dict["warehouses.newButton"]}
        </Link>
      </div>

      {message && (
        <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {message}
        </p>
      )}

      <ArchiveViewTabs
        basePath="/dashboard/warehouses"
        params={{}}
        showArchived={showArchived}
        dict={dict}
      />

      {warehouses && warehouses.length > 0 ? (
        <div className={tableWrapClass}>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className={theadRowClass}>
                <th className={thClass}>{dict["warehouses.colName"]}</th>
                <th className={thClass}>{dict["warehouses.colLocation"]}</th>
                <th className={thClass}>{dict["warehouses.colActions"]}</th>
              </tr>
            </thead>
            <tbody>
              {warehouses.map((warehouse) => {
                const cells = (
                  <>
                    <td className={tdClass}>
                      <span className="flex items-center gap-2">
                        {warehouse.name_en}
                        {showArchived && <Badge tone="slate">{dict["archive.badge"]}</Badge>}
                      </span>
                    </td>
                    <td className={tdClass}>{warehouse.location}</td>
                    <td className={tdClass}>
                      {showArchived ? (
                        <RestoreButton
                          action={unarchiveWarehouse.bind(null, warehouse.id)}
                          listHref="/dashboard/warehouses"
                        />
                      ) : (
                        <Link
                          href={`/dashboard/warehouses/${warehouse.id}/edit`}
                          className={linkClass}
                        >
                          {dict["common.edit"]}
                        </Link>
                      )}
                    </td>
                  </>
                );

                // Archived rows aren't row-click navigable — the row hosts a
                // Restore button instead, which would fight a wrapping link.
                return showArchived ? (
                  <tr key={warehouse.id} className={trClass}>
                    {cells}
                  </tr>
                ) : (
                  <ClickableRow
                    key={warehouse.id}
                    href={`/dashboard/warehouses/${warehouse.id}`}
                    className={trClass}
                  >
                    {cells}
                  </ClickableRow>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          icon={WarehouseIcon}
          message={dict["warehouses.notFound"]}
          actionLabel={dict["warehouses.newButton"]}
          actionHref="/dashboard/warehouses/new"
        />
      )}
    </main>
  );
}
