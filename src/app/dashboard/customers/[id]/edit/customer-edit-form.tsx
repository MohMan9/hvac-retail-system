"use client";

import { useState } from "react";
import { updateCustomer } from "./actions";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { btnPrimary, inputClass, labelClass } from "@/lib/ui";

type InitialValues = { name: string; phone: string | null; customer_type: string };

export function CustomerEditForm({
  customerId,
  initialValues,
}: {
  customerId: string;
  initialValues: InitialValues;
}) {
  const { t } = useLocale();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(formData: FormData) {
    setIsSubmitting(true);
    setError(null);

    const result = await updateCustomer(customerId, formData);

    if (!result.success) {
      setError(result.error);
    }

    setIsSubmitting(false);
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label className={labelClass}>{t("customers.name")}</label>
        <input
          name="name"
          type="text"
          required
          defaultValue={initialValues.name}
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>{t("customers.phone")}</label>
        <input
          name="phone"
          type="text"
          dir="ltr"
          defaultValue={initialValues.phone ?? ""}
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>{t("customers.customerType")}</label>
        <select
          name="customer_type"
          required
          defaultValue={initialValues.customer_type}
          className={inputClass}
        >
          <option value="retail">{t("customerType.retail")}</option>
          <option value="shop">{t("customerType.shop")}</option>
          <option value="craftsman">{t("customerType.craftsman")}</option>
          <option value="wholesale">{t("customerType.wholesale")}</option>
        </select>
      </div>

      <button type="submit" disabled={isSubmitting} className={`${btnPrimary} mt-2`}>
        {isSubmitting ? t("common.saving") : t("customers.saveButton")}
      </button>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </form>
  );
}
