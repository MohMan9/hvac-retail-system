"use client";

import { useState } from "react";
import { createExpense } from "../actions";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { todayInShopTimezone } from "@/lib/date";
import { btnPrimary, inputClass, labelClass } from "@/lib/ui";

// Sentinel select value that reveals the free-text "new category" input.
const ADD_NEW_CATEGORY = "__add_new__";

// The 5 originally-seeded categories have translated labels; any custom
// category added by a user is shown verbatim (it's already a display name).
const seededCategoryKeys: Record<string, keyof Dictionary> = {
  electricity: "finance.expenses.categoryElectricity",
  water: "finance.expenses.categoryWater",
  labor: "finance.expenses.categoryLabor",
  fixed_setup: "finance.expenses.categoryFixedSetup",
  misc: "finance.expenses.categoryMisc",
};

export function ExpenseForm({ categories }: { categories: string[] }) {
  const { t } = useLocale();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Selected category value, or the ADD_NEW_CATEGORY sentinel. Defaults to the
  // first existing category so a normal save needs no extra interaction.
  const [selectedCategory, setSelectedCategory] = useState(categories[0] ?? ADD_NEW_CATEGORY);
  const [newCategory, setNewCategory] = useState("");
  const today = todayInShopTimezone();

  const isAddingNew = selectedCategory === ADD_NEW_CATEGORY;

  function categoryLabel(category: string) {
    const key = seededCategoryKeys[category];
    return key ? t(key) : category;
  }

  async function handleSubmit(formData: FormData) {
    setError(null);

    // Resolve the final category string: either the picked existing one or the
    // typed new name. The server action inserts a brand-new name into
    // expense_categories before saving the expense.
    const category = isAddingNew ? newCategory.trim() : selectedCategory;

    if (!category) {
      setError(t("finance.expenses.newCategoryRequired"));
      return;
    }

    formData.set("category", category);

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
        <select
          value={selectedCategory}
          onChange={(event) => setSelectedCategory(event.target.value)}
          className={inputClass}
        >
          {categories.map((category) => (
            <option key={category} value={category}>
              {categoryLabel(category)}
            </option>
          ))}
          <option value={ADD_NEW_CATEGORY}>{t("finance.expenses.addNewCategory")}</option>
        </select>
      </div>

      {isAddingNew && (
        <div>
          <label className={labelClass}>{t("finance.expenses.newCategoryName")}</label>
          <input
            type="text"
            value={newCategory}
            onChange={(event) => setNewCategory(event.target.value)}
            autoFocus
            className={inputClass}
          />
        </div>
      )}

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
