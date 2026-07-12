"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createCustomer } from "./actions";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { btnPrimary, inputClass, labelClass, pageTitleClass } from "@/lib/ui";

export default function NewCustomerPage() {
  const { t } = useLocale();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(formData: FormData) {
    setIsSubmitting(true);
    setError(null);

    const result = await createCustomer(formData);

    if (!result.success) {
      setError(result.error);
      setIsSubmitting(false);
      return;
    }

    router.push("/dashboard/customers");
  }

  return (
    <main className="mx-auto max-w-md px-8 py-6">
      <h1 className={`${pageTitleClass} mb-6`}>{t("customers.newTitle")}</h1>

      <form action={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className={labelClass}>{t("customers.name")}</label>
          <input name="name" type="text" required className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>{t("customers.phone")}</label>
          <input name="phone" type="text" dir="ltr" className={inputClass} />
        </div>

        <div>
          <label className={labelClass}>{t("customers.customerType")}</label>
          <select name="customer_type" required className={inputClass}>
            <option value="retail">{t("customerType.retail")}</option>
            <option value="shop">{t("customerType.shop")}</option>
            <option value="craftsman">{t("customerType.craftsman")}</option>
            <option value="wholesale">{t("customerType.wholesale")}</option>
          </select>
        </div>

        <button type="submit" disabled={isSubmitting} className={`${btnPrimary} mt-2`}>
          {isSubmitting ? t("common.creating") : t("customers.createButton")}
        </button>

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </form>
    </main>
  );
}
