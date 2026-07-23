import Link from "next/link";
import { redirect } from "next/navigation";
import { Boxes, History } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getServerDictionary } from "@/lib/i18n/get-server-locale";
import { getEffectivePermissions } from "@/lib/permissions.server";
import { getCurrentUser } from "@/lib/auth.server";
import { hasPermission } from "@/lib/permissions";
import { displayName } from "@/lib/display-name";
import { EmptyState } from "@/components/ui/empty-state";
import {
  btnPrimary,
  pageTitleClass,
  sectionTitleClass,
  tableWrapClass,
  tdClass,
  theadRowClass,
  thClass,
  trClass,
} from "@/lib/ui";

export default async function InventoryPage() {
  const supabase = await createClient();
  const authData = await getCurrentUser();
  const { dict, locale } = await getServerDictionary();

  if (!authData.user) {
    redirect("/signin");
  }

  const permissions = await getEffectivePermissions();
  const canManage = hasPermission(permissions, "manage_inventory_transfers");

  const { data: inventory } = await supabase
    .from("inventory")
    .select("id, quantity, products(name_en, name_ar), warehouses(name_en, name_ar)")
    .order("id");

  const { data: transfers } = await supabase
    .from("stock_transfers")
    .select("id, product_id, from_warehouse_id, to_warehouse_id, quantity, transfer_date")
    .order("transfer_date", { ascending: false })
    .limit(20);

  // stock_transfers has two foreign keys into warehouses (from/to), which
  // makes relationship embedding ambiguous without guessing constraint
  // names. Resolve product/warehouse names with separate lookups instead,
  // same approach used for prices on the products page.
  const productIds = [...new Set((transfers ?? []).map((t) => t.product_id))];
  const warehouseIds = [
    ...new Set(
      (transfers ?? [])
        .flatMap((t) => [t.from_warehouse_id, t.to_warehouse_id])
        .filter((id): id is string => Boolean(id))
    ),
  ];

  const { data: transferProducts } = productIds.length
    ? await supabase.from("products").select("id, name_en, name_ar").in("id", productIds)
    : { data: [] };

  const { data: transferWarehouses } = warehouseIds.length
    ? await supabase.from("warehouses").select("id, name_en, name_ar").in("id", warehouseIds)
    : { data: [] };

  const productNameById = new Map(
    (transferProducts ?? []).map((p) => [p.id, displayName(p.name_en, p.name_ar, locale)])
  );
  const warehouseNameById = new Map(
    (transferWarehouses ?? []).map((w) => [w.id, displayName(w.name_en, w.name_ar, locale)])
  );

  return (
    <main className="mx-auto max-w-4xl px-8 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className={pageTitleClass}>{dict["inventory.title"]}</h1>
        {canManage && (
          <Link href="/dashboard/inventory/transfers/new" className={btnPrimary}>
            {dict["inventory.newTransferButton"]}
          </Link>
        )}
      </div>

      {inventory && inventory.length > 0 ? (
        <div className={tableWrapClass}>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className={theadRowClass}>
                <th className={thClass}>{dict["inventory.colProduct"]}</th>
                <th className={thClass}>{dict["inventory.colWarehouse"]}</th>
                <th className={thClass}>{dict["inventory.colQuantity"]}</th>
              </tr>
            </thead>
            <tbody>
              {inventory.map((row) => {
                const product = Array.isArray(row.products) ? row.products[0] : row.products;
                const warehouse = Array.isArray(row.warehouses) ? row.warehouses[0] : row.warehouses;

                return (
                  <tr key={row.id} className={trClass}>
                    <td className={tdClass}>{displayName(product?.name_en, product?.name_ar, locale)}</td>
                    <td className={tdClass}>{displayName(warehouse?.name_en, warehouse?.name_ar, locale)}</td>
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
        <EmptyState icon={Boxes} message={dict["inventory.notFound"]} />
      )}

      <h2 className={`${sectionTitleClass} mb-3 mt-10`}>{dict["inventory.recentTransfersTitle"]}</h2>

      {transfers && transfers.length > 0 ? (
        <div className={tableWrapClass}>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className={theadRowClass}>
                <th className={thClass}>{dict["inventory.colDate"]}</th>
                <th className={thClass}>{dict["inventory.colProduct"]}</th>
                <th className={thClass}>{dict["inventory.colFrom"]}</th>
                <th className={thClass}>{dict["inventory.colTo"]}</th>
                <th className={thClass}>{dict["inventory.colQuantity"]}</th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((transfer) => (
                <tr key={transfer.id} className={trClass}>
                  <td className={tdClass} dir="ltr">
                    {transfer.transfer_date}
                  </td>
                  <td className={tdClass}>{productNameById.get(transfer.product_id)}</td>
                  <td className={tdClass}>
                    {transfer.from_warehouse_id
                      ? warehouseNameById.get(transfer.from_warehouse_id)
                      : dict["inventory.external"]}
                  </td>
                  <td className={tdClass}>
                    {transfer.to_warehouse_id
                      ? warehouseNameById.get(transfer.to_warehouse_id)
                      : dict["inventory.outbound"]}
                  </td>
                  <td className={tdClass} dir="ltr">
                    {transfer.quantity}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon={History} message={dict["inventory.noTransfers"]} />
      )}
    </main>
  );
}
