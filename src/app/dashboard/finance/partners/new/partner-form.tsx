"use client";

import { useState } from "react";
import { createPartner } from "../actions";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { btnPrimary, inputClass, labelClass } from "@/lib/ui";

export function PartnerForm() {
  const { t } = useLocale();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setIsSubmitting(true);
    const result = await createPartner(formData);

    if (!result.success) {
      setError(result.error);
      setIsSubmitting(false);
    }
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label className={labelClass}>{t("finance.partners.name")}</label>
        <input name="name" type="text" required className={inputClass} />
      </div>

      <div>
        <label className={labelClass}>{t("finance.partners.sharePercent")}</label>
        <input
          name="share_percent"
          type="number"
          step="0.01"
          min={0}
          required
          dir="ltr"
          className={inputClass}
        />
      </div>

      <button type="submit" disabled={isSubmitting} className={`${btnPrimary} mt-2`}>
        {isSubmitting ? t("common.saving") : t("finance.partners.createButton")}
      </button>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </form>
  );
}
