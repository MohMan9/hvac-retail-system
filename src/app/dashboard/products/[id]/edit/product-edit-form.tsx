"use client";

import { useState } from "react";
import { updateProduct } from "./actions";
import { PricingCostSection } from "../../pricing-cost-section";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { truncateBarcode } from "@/lib/barcode";
import { btnPrimary, inputClass, labelClass } from "@/lib/ui";

type InitialValues = {
  name_ar: string | null;
  name_en: string | null;
  description_ar: string | null;
  description_en: string | null;
  barcode: string;
  serial_suffix_length: number | null;
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
  // Pre-filled from the existing values; both drive the serialized live
  // preview. Re-scanning a new barcode with serial length > 0 re-truncates.
  const [barcode, setBarcode] = useState(initialValues.barcode);
  const [serialSuffix, setSerialSuffix] = useState(String(initialValues.serial_suffix_length ?? 0));

  const serialSuffixLength = Math.max(0, Math.trunc(Number(serialSuffix) || 0));
  const barcodePreview =
    serialSuffixLength > 0 ? truncateBarcode(barcode, serialSuffixLength) : null;

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
          value={barcode}
          onChange={(event) => setBarcode(event.target.value)}
          className={inputClass}
        />
        {barcodePreview !== null && (
          <p className="mt-1 text-xs text-slate-500" dir="ltr">
            {t("productForm.serialPreview")} {barcodePreview}
          </p>
        )}
      </div>

      <div>
        <label className={labelClass}>{t("productForm.serialSuffixLength")}</label>
        <input
          name="serial_suffix_length"
          type="number"
          min={0}
          dir="ltr"
          value={serialSuffix}
          onChange={(event) => setSerialSuffix(event.target.value)}
          className={inputClass}
        />
        <p className="mt-1 text-xs text-slate-500">{t("productForm.serialSuffixHelp")}</p>
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

      <PricingCostSection
        canViewCosts={canViewCosts}
        initial={{
          price_wholesale: initialValues.price_wholesale,
          price_craftsman: initialValues.price_craftsman,
          price_shop: initialValues.price_shop,
          price_retail: initialValues.price_retail,
          factory_price: initialValues.factory_price,
          shipping_cost: initialValues.shipping_cost,
          customs_cost: initialValues.customs_cost,
        }}
      />

      <button type="submit" disabled={isSubmitting} className={`${btnPrimary} mt-2`}>
        {isSubmitting ? t("common.saving") : t("productForm.saveButton")}
      </button>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </form>
  );
}
