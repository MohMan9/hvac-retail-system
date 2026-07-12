"use client";

import { useState } from "react";
import { createWarehouse } from "./actions";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { btnPrimary, inputClass, labelClass } from "@/lib/ui";

export function WarehouseForm() {
  const { t } = useLocale();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(formData: FormData) {
    setIsSubmitting(true);
    setError(null);

    const result = await createWarehouse(formData);

    if (!result.success) {
      setError(result.error);
    }

    setIsSubmitting(false);
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label className={labelClass}>{t("warehouses.nameAr")}</label>
        <input name="name_ar" type="text" required className={inputClass} />
      </div>

      <div>
        <label className={labelClass}>{t("warehouses.nameEn")}</label>
        <input name="name_en" type="text" required className={inputClass} />
      </div>

      <div>
        <label className={labelClass}>{t("warehouses.location")}</label>
        <input name="location" type="text" className={inputClass} />
      </div>

      <button type="submit" disabled={isSubmitting} className={`${btnPrimary} mt-2`}>
        {isSubmitting ? t("common.creating") : t("warehouses.createButton")}
      </button>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </form>
  );
}
