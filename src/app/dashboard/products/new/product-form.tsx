"use client";

import { useState } from "react";
import { createProduct } from "./actions";
import { PricingCostSection } from "../pricing-cost-section";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { truncateBarcode } from "@/lib/barcode";
import { MAX_PRODUCT_IMAGE_TOTAL_BYTES } from "@/lib/product-image-limits";
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
  // Tracked for the serialized-barcode live preview. The raw serial-suffix
  // string is kept as typed (no reformatting) and only parsed for display.
  const [barcode, setBarcode] = useState("");
  const [serialSuffix, setSerialSuffix] = useState("0");

  const serialSuffixLength = Math.max(0, Math.trunc(Number(serialSuffix) || 0));
  const barcodePreview =
    serialSuffixLength > 0 ? truncateBarcode(barcode, serialSuffixLength) : null;

  async function handleSubmit(formData: FormData) {
    setIsSubmitting(true);
    setError(null);

    const totalImageBytes = formData
      .getAll("images")
      .filter((value): value is File => value instanceof File && value.size > 0)
      .reduce((total, file) => total + file.size, 0);

    if (totalImageBytes > MAX_PRODUCT_IMAGE_TOTAL_BYTES) {
      setError(t("productForm.imagesTooLarge"));
      setIsSubmitting(false);
      return;
    }

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
        <label className={labelClass}>{t("productForm.itemNumber")}</label>
        <input name="item_number" type="text" dir="ltr" className={inputClass} />
        <p className="mt-1 text-xs text-slate-500">{t("productForm.itemNumberHelp")}</p>
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
        <select name="unit_of_measure" required className={inputClass}>
          <option value="piece">{t("unit.piece")}</option>
          <option value="meter">{t("unit.meter")}</option>
        </select>
      </div>

      <div>
        <label className={labelClass}>{t("productForm.warranty")}</label>
        <input name="warranty_months" type="number" min={0} dir="ltr" className={inputClass} />
      </div>

      <PricingCostSection canViewCosts={canViewCosts} />

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
          <p className="mt-1 text-xs text-slate-500">{t("productForm.imagesSizeHelp")}</p>
        </fieldset>
      )}

      <button type="submit" disabled={isSubmitting} className={`${btnPrimary} mt-2`}>
        {isSubmitting ? t("common.creating") : t("productForm.createButton")}
      </button>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </form>
  );
}
