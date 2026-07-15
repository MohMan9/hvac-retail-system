"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
// Reuse the existing New Transfer action — it already inserts exactly the
// stock_transfers row we need (from_warehouse_id null, to = selected, and a
// DB trigger updates `inventory`). On success it redirects to the inventory
// page, same as the New Transfer form does.
import { createStockTransfer } from "@/app/dashboard/inventory/transfers/new/actions";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import {
  btnPrimary,
  cardClass,
  inputClass,
  labelClass,
  sectionTitleClass,
  tableWrapClass,
  tdClass,
  theadRowClass,
  thClass,
  trClass,
} from "@/lib/ui";

type InventoryRow = { warehouseName: string; quantity: number };
type Warehouse = { id: string; name: string };

export function ProductStockSection({
  productId,
  today,
  inventory,
  warehouses,
}: {
  productId: string;
  today: string;
  inventory: InventoryRow[];
  warehouses: Warehouse[];
}) {
  const { t } = useLocale();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleAddStock(formData: FormData) {
    setError(null);
    setIsSubmitting(true);

    // createStockTransfer redirects on success, so control only returns here
    // when it fails.
    const result = await createStockTransfer(formData);

    if (!result.success) {
      setError(result.error);
    }

    setIsSubmitting(false);
  }

  return (
    <section className={`${cardClass} p-6`}>
      <h2 className={`${sectionTitleClass} mb-4`}>{t("productEdit.stockTitle")}</h2>

      {inventory.length > 0 ? (
        <div className={`${tableWrapClass} mb-5`}>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className={theadRowClass}>
                <th className={thClass}>{t("inventory.colWarehouse")}</th>
                <th className={thClass}>{t("inventory.colQuantity")}</th>
              </tr>
            </thead>
            <tbody>
              {inventory.map((row, index) => (
                <tr key={index} className={trClass}>
                  <td className={tdClass}>{row.warehouseName}</td>
                  <td className={tdClass} dir="ltr">
                    {row.quantity}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mb-5 text-sm text-slate-500">{t("productEdit.noStock")}</p>
      )}

      <form action={handleAddStock} className="flex flex-col gap-4 border-t border-slate-200 pt-5">
        <p className="text-sm font-medium text-slate-700">{t("productEdit.addStockTitle")}</p>

        {/* Fixed fields the reused action expects — the user only picks a
            warehouse and a quantity. */}
        <input type="hidden" name="product_id" value={productId} />
        <input type="hidden" name="transfer_date" value={today} />
        <input type="hidden" name="note" value="Added from product edit page" />

        <div className="grid gap-4 sm:grid-cols-[1fr_140px_auto] sm:items-end">
          <div>
            <label className={labelClass}>{t("inventory.colWarehouse")}</label>
            <select name="to_warehouse" required className={inputClass}>
              <option value="">{t("productEdit.chooseWarehouse")}</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>{t("transfers.quantity")}</label>
            {/* Plain numeric input — no reformatting while typing, matching the
                New Transfer form's quantity field. */}
            <input
              name="quantity"
              type="number"
              step="0.01"
              min="0.01"
              required
              dir="ltr"
              className={inputClass}
            />
          </div>

          <button type="submit" disabled={isSubmitting} className={btnPrimary}>
            <Plus className="h-4 w-4" />
            {isSubmitting ? t("common.saving") : t("productEdit.addStockTitle")}
          </button>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </section>
  );
}
