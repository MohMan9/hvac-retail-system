"use client";

import { useState } from "react";
import { createProduct } from "./actions";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { btnPrimary, inputClass, labelClass } from "@/lib/ui";

type Warehouse = { id: string; name_en: string | null };

const fieldsetClass = "rounded-lg border border-slate-200 p-4";
const legendClass = "px-1 text-sm font-medium text-slate-700";

// Permission flags are decided server-side (page.tsx) and passed in as props,
// so protected sections are never rendered to unauthorized users.
export function ProductForm({
  canManage,
  canViewCosts,
  warehouses,
}: {
  canManage: boolean;
  canViewCosts: boolean;
  warehouses: Warehouse[];
}) {
  const { t } = useLocale();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(formData: FormData) {
    setIsSubmitting(true);
    setError(null);

    const result = await createProduct(formData);

    if (!result.success) {
      setError(result.error);
    }

    setIsSubmitting(false);
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label className={labelClass}>{t("productForm.nameAr")}</label>
        <input name="name_ar" type="text" required className={inputClass} />
      </div>

      <div>
        <label className={labelClass}>{t("productForm.nameEn")}</label>
        <input name="name_en" type="text" className={inputClass} />
      </div>

      <div>
        <label className={labelClass}>{t("productForm.descriptionAr")}</label>
        <textarea name="description_ar" rows={3} className={inputClass} />
      </div>

      <div>
        <label className={labelClass}>{t("productForm.descriptionEn")}</label>
        <textarea name="description_en" rows={3} className={inputClass} />
      </div>

      <div>
        <label className={labelClass}>{t("productForm.barcode")}</label>
        <input name="barcode" type="text" required dir="ltr" className={inputClass} />
      </div>

      <div>
        <label className={labelClass}>{t("productForm.unit")}</label>
        <select name="unit_of_measure" required className={inputClass}>
          <option value="piece">{t("unit.piece")}</option>
          <option value="meter">{t("unit.meter")}</option>
        </select>
      </div>

      <div>
        <label className={labelClass}>{t("productForm.warranty")}</label>
        <input name="warranty_months" type="number" min={0} dir="ltr" className={inputClass} />
      </div>

      <fieldset className={fieldsetClass}>
        <legend className={legendClass}>{t("productForm.pricingLegend")}</legend>

        <div className="flex flex-col gap-4">
          <div>
            <label className={labelClass}>{t("productForm.wholesalePrice")}</label>
            <input
              name="price_wholesale"
              type="number"
              step="0.01"
              min={0}
              required
              dir="ltr"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>{t("productForm.craftsmanPrice")}</label>
            <input
              name="price_craftsman"
              type="number"
              step="0.01"
              min={0}
              required
              dir="ltr"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>{t("productForm.shopPrice")}</label>
            <input
              name="price_shop"
              type="number"
              step="0.01"
              min={0}
              required
              dir="ltr"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>{t("productForm.retailPrice")}</label>
            <input
              name="price_retail"
              type="number"
              step="0.01"
              min={0}
              required
              dir="ltr"
              className={inputClass}
            />
          </div>
        </div>
      </fieldset>

      <fieldset className={fieldsetClass}>
        <legend className={legendClass}>{t("productForm.initialStockLegend")}</legend>
        <p className="mb-3 text-xs text-slate-500">{t("productForm.initialStockHint")}</p>

        <div className="flex flex-col gap-4">
          <div>
            <label className={labelClass}>{t("productForm.initialWarehouseLabel")}</label>
            <select name="initial_warehouse_id" className={inputClass}>
              <option value="">{t("productForm.initialWarehouseNone")}</option>
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
              name="initial_quantity"
              type="number"
              step="0.01"
              min={0}
              dir="ltr"
              className={inputClass}
            />
          </div>
        </div>
      </fieldset>

      {canManage && (
        <fieldset className={fieldsetClass}>
          <legend className={legendClass}>{t("productForm.imagesLegend")}</legend>
          <label className={labelClass}>{t("productForm.imagesLabel")}</label>
          <input name="images" type="file" accept="image/*" multiple className={inputClass} />
        </fieldset>
      )}

      {canViewCosts && (
        <fieldset className={fieldsetClass}>
          <legend className={legendClass}>{t("productForm.costLegend")}</legend>

          <div className="flex flex-col gap-4">
            <div>
              <label className={labelClass}>{t("productForm.factoryPrice")}</label>
              <input
                name="factory_price"
                type="number"
                step="0.01"
                min={0}
                dir="ltr"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>{t("productForm.shippingCost")}</label>
              <input
                name="shipping_cost"
                type="number"
                step="0.01"
                min={0}
                dir="ltr"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>{t("productForm.customsCost")}</label>
              <input
                name="customs_cost"
                type="number"
                step="0.01"
                min={0}
                dir="ltr"
                className={inputClass}
              />
            </div>
          </div>
        </fieldset>
      )}

      <button type="submit" disabled={isSubmitting} className={`${btnPrimary} mt-2`}>
        {isSubmitting ? t("common.creating") : t("productForm.createButton")}
      </button>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </form>
  );
}
