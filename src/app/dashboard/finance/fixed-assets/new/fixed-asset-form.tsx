"use client";

import { useState } from "react";
import { createFixedAsset } from "./actions";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { todayInShopTimezone } from "@/lib/date";
import { btnPrimary, inputClass, labelClass } from "@/lib/ui";

export function FixedAssetForm() {
  const { t } = useLocale();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const today = todayInShopTimezone();

  async function handleSubmit(formData: FormData) {
    setError(null);
    setIsSubmitting(true);
    const result = await createFixedAsset(formData);

    if (!result.success) {
      setError(result.error);
      setIsSubmitting(false);
    }
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label className={labelClass}>{t("finance.fixedAssets.name")}</label>
        <input name="name" type="text" required className={inputClass} />
      </div>

      <div>
        <label className={labelClass}>{t("finance.fixedAssets.purchaseCost")}</label>
        <input
          name="purchase_cost"
          type="number"
          step="0.01"
          min={0}
          required
          dir="ltr"
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>{t("finance.fixedAssets.purchaseDate")}</label>
        <input
          name="purchase_date"
          type="date"
          required
          defaultValue={today}
          dir="ltr"
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>{t("finance.fixedAssets.usefulLifeYears")}</label>
        {/* Fractional years are allowed (e.g. 2.5), so the step is fine-grained
            rather than whole-year. */}
        <input
          name="useful_life_years"
          type="number"
          step="0.01"
          min={0}
          required
          dir="ltr"
          className={inputClass}
        />
        <p className="mt-1 text-xs text-slate-500">{t("finance.fixedAssets.usefulLifeHint")}</p>
      </div>

      <button type="submit" disabled={isSubmitting} className={`${btnPrimary} mt-2`}>
        {isSubmitting ? t("common.creating") : t("finance.fixedAssets.createButton")}
      </button>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </form>
  );
}
