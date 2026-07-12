"use client";

import { useState } from "react";
import { updateWarehouse } from "./actions";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { btnPrimary, inputClass, labelClass } from "@/lib/ui";

type InitialValues = { name_ar: string; name_en: string; location: string | null };

export function WarehouseEditForm({
  warehouseId,
  initialValues,
}: {
  warehouseId: string;
  initialValues: InitialValues;
}) {
  const { t } = useLocale();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(formData: FormData) {
    setIsSubmitting(true);
    setError(null);

    const result = await updateWarehouse(warehouseId, formData);

    if (!result.success) {
      setError(result.error);
    }

    setIsSubmitting(false);
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label className={labelClass}>{t("warehouses.nameAr")}</label>
        <input
          name="name_ar"
          type="text"
          required
          defaultValue={initialValues.name_ar}
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>{t("warehouses.nameEn")}</label>
        <input
          name="name_en"
          type="text"
          required
          defaultValue={initialValues.name_en}
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>{t("warehouses.location")}</label>
        <input
          name="location"
          type="text"
          defaultValue={initialValues.location ?? ""}
          className={inputClass}
        />
      </div>

      <button type="submit" disabled={isSubmitting} className={`${btnPrimary} mt-2`}>
        {isSubmitting ? t("common.saving") : t("warehouses.saveButton")}
      </button>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </form>
  );
}
