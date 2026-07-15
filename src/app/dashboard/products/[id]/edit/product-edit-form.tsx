"use client";

import { useState } from "react";
import { updateProduct } from "./actions";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { btnPrimary, inputClass, labelClass } from "@/lib/ui";

type InitialValues = {
  name_ar: string | null;
  name_en: string | null;
  description_ar: string | null;
  description_en: string | null;
  barcode: string;
  unit_of_measure: string;
  warranty_months: number | null;
  price_wholesale: number | string | null;
  price_craftsman: number | string | null;
  price_shop: number | string | null;
  price_retail: number | string | null;
  factory_price: number | string | null;
  shipping_cost: number | string | null;
  customs_cost: number | string | null;
};

const fieldsetClass = "rounded-lg border border-slate-200 p-4";
const legendClass = "px-1 text-sm font-medium text-slate-700";

// canViewCosts (the view_product_costs permission) is decided server-side
// (page.tsx) and passed in as a prop, so the cost section is never even
// rendered to an unauthorized user — not just CSS-hidden.
export function ProductEditForm({
  productId,
  canViewCosts,
  initialValues,
}: {
  productId: string;
  canViewCosts: boolean;
  initialValues: InitialValues;
}) {
  const { t } = useLocale();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(formData: FormData) {
    setIsSubmitting(true);
    setError(null);

    const result = await updateProduct(productId, formData);

    if (!result.success) {
      setError(result.error);
    }

    setIsSubmitting(false);
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label className={labelClass}>{t("productForm.nameAr")}</label>
        <input
          name="name_ar"
          type="text"
          required
          defaultValue={initialValues.name_ar ?? ""}
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>{t("productForm.nameEn")}</label>
        <input
          name="name_en"
          type="text"
          defaultValue={initialValues.name_en ?? ""}
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>{t("productForm.descriptionAr")}</label>
        <textarea
          name="description_ar"
          rows={3}
          defaultValue={initialValues.description_ar ?? ""}
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>{t("productForm.descriptionEn")}</label>
        <textarea
          name="description_en"
          rows={3}
          defaultValue={initialValues.description_en ?? ""}
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>{t("productForm.barcode")}</label>
        <input
          name="barcode"
          type="text"
          required
          dir="ltr"
          defaultValue={initialValues.barcode}
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>{t("productForm.unit")}</label>
        <select
          name="unit_of_measure"
          required
          defaultValue={initialValues.unit_of_measure}
          className={inputClass}
        >
          <option value="piece">{t("unit.piece")}</option>
          <option value="meter">{t("unit.meter")}</option>
        </select>
      </div>

      <div>
        <label className={labelClass}>{t("productForm.warranty")}</label>
        <input
          name="warranty_months"
          type="number"
          min={0}
          dir="ltr"
          defaultValue={initialValues.warranty_months ?? ""}
          className={inputClass}
        />
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
              defaultValue={initialValues.price_wholesale ?? ""}
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
              defaultValue={initialValues.price_craftsman ?? ""}
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
              defaultValue={initialValues.price_shop ?? ""}
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
              defaultValue={initialValues.price_retail ?? ""}
              className={inputClass}
            />
          </div>
        </div>
      </fieldset>

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
                defaultValue={initialValues.factory_price ?? ""}
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
                defaultValue={initialValues.shipping_cost ?? ""}
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
                defaultValue={initialValues.customs_cost ?? ""}
                className={inputClass}
              />
            </div>
          </div>
        </fieldset>
      )}

      <button type="submit" disabled={isSubmitting} className={`${btnPrimary} mt-2`}>
        {isSubmitting ? t("common.saving") : t("productForm.saveButton")}
      </button>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </form>
  );
}
