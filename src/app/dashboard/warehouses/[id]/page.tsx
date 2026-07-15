import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowDownToLine, ArrowUpFromLine, Package2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getServerDictionary } from "@/lib/i18n/get-server-locale";
import { getEffectivePermissions } from "@/lib/permissions.server";
import { hasPermission } from "@/lib/permissions";
import { displayName } from "@/lib/display-name";
import { EmptyState } from "@/components/ui/empty-state";
import {
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

export default async function WarehouseDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const { dict, locale } = await getServerDictionary();

  if (!authData.user) {
    redirect("/signin");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", authData.user.id)
    .single();

  const permissions = await getEffectivePermissions();

  if (!profile || !hasPermission(permissions, "manage_warehouses")) {
    return (
      <main className="mx-auto max-w-2xl px-8 py-6">
        <p className={mutedTextClass}>{dict["warehouses.notAuthorized"]}</p>
      </main>
    );
  }

  const { data: warehouse } = await supabase
    .from("warehouses")
    .select("id, name_ar, name_en, location")
    .eq("id", id)
    .eq("organization_id", profile.organization_id)
    .single();

  if (!warehouse) {
    notFound();
  }

  const { data: stock } = await supabase
    .from("inventory")
    .select("id, quantity, products(name_en, name_ar)")
    .eq("warehouse_id", warehouse.id)
    .order("id");

  const { data: transfers } = await supabase
    .from("stock_transfers")
    .select("id, product_id, from_warehouse_id, to_warehouse_id, quantity, transfer_date")
    .or(`from_warehouse_id.eq.${warehouse.id},to_warehouse_id.eq.${warehouse.id}`)
    .order("transfer_date", { ascending: false })
    .limit(20);

  const productIds = [...new Set((transfers ?? []).map((transfer) => transfer.product_id))];
  const { data: transferProducts } = productIds.length
    ? await supabase.from("products").select("id, name_en, name_ar").in("id", productIds)
    : { data: [] };
  const productNameById = new Map(
    (transferProducts ?? []).map((product) => [
      product.id,
      displayName(product.name_en, product.name_ar, locale),
    ])
  );

  return (
    <main className="mx-auto max-w-5xl px-8 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className={pageTitleClass}>{displayName(warehouse.name_en, warehouse.name_ar, locale)}</h1>
          <p className={mutedTextClass}>{warehouse.location ?? "—"}</p>
        </div>
        <div className="flex items-center gap-4">
          <Link href={`/dashboard/warehouses/${warehouse.id}/edit`} className={linkClass}>
            {dict["common.edit"]}
          </Link>
          <Link href="/dashboard/warehouses" className={linkClass}>
            {dict["warehouses.title"]}
          </Link>
        </div>
      </div>

      <h2 className={`${sectionTitleClass} mb-3`}>{dict["warehouses.stockTitle"]}</h2>
      {stock && stock.length > 0 ? (
        <div className={`${tableWrapClass} mb-8`}>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className={theadRowClass}>
                <th className={thClass}>{dict["inventory.colProduct"]}</th>
                <th className={thClass}>{dict["inventory.colQuantity"]}</th>
              </tr>
            </thead>
            <tbody>
              {stock.map((row) => {
                const product = Array.isArray(row.products) ? row.products[0] : row.products;

                return (
                  <tr key={row.id} className={trClass}>
                    <td className={tdClass}>{displayName(product?.name_en, product?.name_ar, locale)}</td>
                    <td className={tdClass} dir="ltr">
                      {row.quantity}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mb-8">
          <EmptyState icon={Package2} message={dict["warehouses.noStock"]} />
        </div>
      )}

      <h2 className={`${sectionTitleClass} mb-3`}>{dict["inventory.recentTransfersTitle"]}</h2>
      {transfers && transfers.length > 0 ? (
        <div className={tableWrapClass}>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className={theadRowClass}>
                <th className={thClass}>{dict["inventory.colDate"]}</th>
                <th className={thClass}>{dict["inventory.colProduct"]}</th>
                <th className={thClass}></th>
                <th className={thClass}>{dict["inventory.colQuantity"]}</th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((transfer) => {
                const isIn = transfer.to_warehouse_id === warehouse.id;

                return (
                  <tr key={transfer.id} className={trClass}>
                    <td className={tdClass} dir="ltr">
                      {transfer.transfer_date}
                    </td>
                    <td className={tdClass}>{productNameById.get(transfer.product_id)}</td>
                    <td className={tdClass}>
                      {isIn ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600">
                          <ArrowDownToLine className="h-3.5 w-3.5" />
                          {dict["warehouses.directionIn"]}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-600">
                          <ArrowUpFromLine className="h-3.5 w-3.5" />
                          {dict["warehouses.directionOut"]}
                        </span>
                      )}
                    </td>
                    <td className={tdClass} dir="ltr">
                      {transfer.quantity}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon={Package2} message={dict["inventory.noTransfers"]} />
      )}
    </main>
  );
}
