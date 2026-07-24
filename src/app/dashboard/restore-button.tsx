"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { RestoreResult } from "./archive-actions";
import { btnSecondarySm } from "@/lib/ui";

// Restores an archived row, then sends the user back to the ACTIVE list so the
// restored item is visible where it now belongs.
export function RestoreButton({
  action,
  listHref,
}: {
  action: () => Promise<RestoreResult>;
  listHref: string;
}) {
  const { t } = useLocale();
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  async function handleRestore() {
    setIsPending(true);
    const result = await action();

    if (!result.success) {
      window.alert(result.error);
      setIsPending(false);
      return;
    }

    router.push(`${listHref}?message=${encodeURIComponent(t("archive.restored"))}`);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleRestore}
      disabled={isPending}
      className={`${btnSecondarySm} gap-1`}
    >
      <RotateCcw className="h-3 w-3" />
      {isPending ? t("common.saving") : t("archive.restore")}
    </button>
  );
}
