"use client";

import { useState } from "react";
import { createService } from "../actions";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { btnPrimary, inputClass, labelClass } from "@/lib/ui";

export function ServiceForm() {
  const { t } = useLocale();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setIsSubmitting(true);
    const result = await createService(formData);

    if (!result.success) {
      setError(result.error);
      setIsSubmitting(false);
    }
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label className={labelClass}>{t("finance.services.nameAr")}</label>
        <input name="name_ar" type="text" required className={inputClass} />
      </div>

      <div>
        <label className={labelClass}>{t("finance.services.nameEn")}</label>
        <input name="name_en" type="text" className={inputClass} />
      </div>

      <div>
        <label className={labelClass}>{t("finance.services.defaultPrice")}</label>
        <input
          name="default_price"
          type="number"
          step="0.01"
          min={0}
          required
          dir="ltr"
          className={inputClass}
        />
      </div>

      <button type="submit" disabled={isSubmitting} className={`${btnPrimary} mt-2`}>
        {isSubmitting ? t("common.saving") : t("finance.services.createButton")}
      </button>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </form>
  );
}
