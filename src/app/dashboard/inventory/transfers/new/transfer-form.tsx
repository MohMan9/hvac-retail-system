"use client";

import { useState } from "react";
import { createStockTransfer } from "./actions";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { btnPrimary, inputClass, labelClass } from "@/lib/ui";

type Product = { id: string; name_en: string | null; name_ar: string | null };
type Warehouse = { id: string; name_en: string | null };

export function TransferForm({
  products,
  warehouses,
}: {
  products: Product[];
  warehouses: Warehouse[];
}) {
  const { t } = useLocale();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  async function handleSubmit(formData: FormData) {
    setError(null);

    const fromWarehouseId = formData.get("from_warehouse") as string;
    const toWarehouseId = formData.get("to_warehouse") as string;

    if (fromWarehouseId && toWarehouseId && fromWarehouseId === toWarehouseId) {
      setError("From and To warehouse cannot be the same.");
      return;
    }

    setIsSubmitting(true);

    const result = await createStockTransfer(formData);

    if (!result.success) {
      setError(result.error);
    }

    setIsSubmitting(false);
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label className={labelClass}>{t("transfers.product")}</label>
        <select name="product_id" required className={inputClass}>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name_en || product.name_ar}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClass}>{t("transfers.fromWarehouse")}</label>
        <select name="from_warehouse" className={inputClass}>
          <option value="">{t("transfers.externalOption")}</option>
          {warehouses.map((warehouse) => (
            <option key={warehouse.id} value={warehouse.id}>
              {warehouse.name_en}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClass}>{t("transfers.toWarehouse")}</label>
        <select name="to_warehouse" className={inputClass}>
          <option value="">{t("transfers.outboundOption")}</option>
          {warehouses.map((warehouse) => (
            <option key={warehouse.id} value={warehouse.id}>
              {warehouse.name_en}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClass}>{t("transfers.quantity")}</label>
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

      <div>
        <label className={labelClass}>{t("transfers.transferDate")}</label>
        <input
          name="transfer_date"
          type="date"
          required
          defaultValue={today}
          dir="ltr"
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>{t("transfers.note")}</label>
        <textarea name="note" rows={3} className={inputClass} />
      </div>

      <button type="submit" disabled={isSubmitting} className={`${btnPrimary} mt-2`}>
        {isSubmitting ? t("common.saving") : t("transfers.createButton")}
      </button>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </form>
  );
}
