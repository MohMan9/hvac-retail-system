"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createUser } from "./actions";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { btnPrimary, inputClass, labelClass } from "@/lib/ui";

export function AdminForm() {
  const { t } = useLocale();
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(formData: FormData) {
    setIsSubmitting(true);
    setMessage(null);

    const result = await createUser(formData);

    if (result.success) {
      setMessage(t("admin.userCreatedSuccess"));
      router.refresh();
    } else {
      setMessage(`Error: ${result.error}`);
    }

    setIsSubmitting(false);
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label className={labelClass}>{t("admin.fullName")}</label>
        <input name="fullName" type="text" required className={inputClass} />
      </div>

      <div>
        <label className={labelClass}>{t("admin.email")}</label>
        <input name="email" type="email" required dir="ltr" className={inputClass} />
      </div>

      <div>
        <label className={labelClass}>{t("admin.password")}</label>
        <input name="password" type="password" required minLength={6} className={inputClass} />
      </div>

      <div>
        <label className={labelClass}>{t("admin.role")}</label>
        <select name="role" required className={inputClass}>
          <option value="salesperson">{t("roles.salesperson")}</option>
          <option value="manager">{t("roles.manager")}</option>
          <option value="admin">{t("roles.admin")}</option>
        </select>
      </div>

      <button type="submit" disabled={isSubmitting} className={`${btnPrimary} mt-2`}>
        {isSubmitting ? t("common.creating") : t("admin.createButton")}
      </button>

      {message && <p className="mt-2 text-sm text-slate-600">{message}</p>}
    </form>
  );
}
