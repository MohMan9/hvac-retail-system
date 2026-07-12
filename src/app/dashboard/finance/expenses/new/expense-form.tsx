"use client";

import { useState } from "react";
import { createExpense } from "../actions";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { btnPrimary, inputClass, labelClass } from "@/lib/ui";

const categories = [
  "electricity",
  "water",
  "labor",
  "fixed_setup",
  "misc",
] as const;

const categoryKeys: Record<(typeof categories)[number], keyof Dictionary> = {
  electricity: "finance.expenses.categoryElectricity",
  water: "finance.expenses.categoryWater",
  labor: "finance.expenses.categoryLabor",
  fixed_setup: "finance.expenses.categoryFixedSetup",
  misc: "finance.expenses.categoryMisc",
};

export function ExpenseForm() {
  const { t } = useLocale();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setIsSubmitting(true);
    const result = await createExpense(formData);

    if (!result.success) {
      setError(result.error);
      setIsSubmitting(false);
    }
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label className={labelClass}>{t("finance.expenses.category")}</label>
        <select name="category" required className={inputClass}>
          {categories.map((category) => (
            <option key={category} value={category}>
              {t(categoryKeys[category])}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClass}>{t("finance.expenses.amount")}</label>
        <input
          name="amount"
          type="number"
          step="0.01"
          min={0}
          required
          dir="ltr"
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>{t("finance.expenses.date")}</label>
        <input
          name="expense_date"
          type="date"
          required
          defaultValue={today}
          dir="ltr"
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>{t("finance.expenses.note")}</label>
        <textarea name="note" rows={3} className={inputClass} />
      </div>

      <button type="submit" disabled={isSubmitting} className={`${btnPrimary} mt-2`}>
        {isSubmitting ? t("common.saving") : t("finance.expenses.createButton")}
      </button>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </form>
  );
}
