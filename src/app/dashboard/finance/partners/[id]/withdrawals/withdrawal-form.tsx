"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createWithdrawal } from "./actions";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { todayInShopTimezone } from "@/lib/date";
import { btnPrimary, inputClass, labelClass } from "@/lib/ui";

export function WithdrawalForm({ partnerId }: { partnerId: string }) {
  const { t } = useLocale();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const today = todayInShopTimezone();

  async function handleSubmit(formData: FormData) {
    setError(null);
    setIsSubmitting(true);
    const result = await createWithdrawal(partnerId, formData);

    if (!result.success) {
      setError(result.error);
      setIsSubmitting(false);
      return;
    }

    // Reset the fields (date falls back to today's defaultValue) and refresh so
    // the new row appears in the list below.
    formRef.current?.reset();
    setIsSubmitting(false);
    router.refresh();
  }

  return (
    <form ref={formRef} action={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label className={labelClass}>{t("finance.withdrawals.amount")}</label>
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
        <label className={labelClass}>{t("finance.withdrawals.date")}</label>
        <input
          name="withdrawal_date"
          type="date"
          required
          defaultValue={today}
          dir="ltr"
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>{t("finance.withdrawals.note")}</label>
        <textarea name="note" rows={3} className={inputClass} />
      </div>

      <button type="submit" disabled={isSubmitting} className={`${btnPrimary} mt-2`}>
        {isSubmitting ? t("common.saving") : t("finance.withdrawals.createButton")}
      </button>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </form>
  );
}
