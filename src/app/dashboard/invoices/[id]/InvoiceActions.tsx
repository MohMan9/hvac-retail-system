"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { completeInvoice } from "./actions";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { btnPrimary } from "@/lib/ui";

export function InvoiceActions({ invoiceId }: { invoiceId: string }) {
  const { t } = useLocale();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);

  async function handleComplete() {
    setError(null);
    setIsCompleting(true);
    const result = await completeInvoice(invoiceId);
    setIsCompleting(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    // Surface the "cash sale but register is closed" gap instead of letting it
    // pass silently. Use a blocking alert so it's seen before the refresh
    // below re-renders this draft-only component away (the invoice is now
    // completed). The sale still went through either way.
    if (result.cashRegisterClosed) {
      window.alert(t("invoiceDetail.cashRegisterClosedWarning"));
    }

    router.refresh();
  }

  return (
    <div className="mt-6 flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={handleComplete} disabled={isCompleting} className={btnPrimary}>
          <CheckCircle2 className="h-4 w-4" />
          {isCompleting ? t("invoiceDetail.completing") : t("invoiceDetail.completeInvoice")}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
