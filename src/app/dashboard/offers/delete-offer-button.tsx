"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteOffer } from "./actions";
import { useLocale } from "@/lib/i18n/LocaleProvider";

export function DeleteOfferButton({ ruleId }: { ruleId: string }) {
  const { t } = useLocale();
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDelete() {
    if (!window.confirm(t("offers.confirmDelete"))) {
      return;
    }

    setIsDeleting(true);
    const result = await deleteOffer(ruleId);

    if (!result.success) {
      window.alert(result.error);
      setIsDeleting(false);
      return;
    }

    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isDeleting}
      aria-label={t("offers.delete")}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
