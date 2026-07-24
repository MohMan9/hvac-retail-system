"use client";

import { useLocale } from "@/lib/i18n/LocaleProvider";
import { btnDestructiveSolid, btnPrimary, btnSecondary, cardClass } from "@/lib/ui";

// Styled confirmation modal, matching the pattern already used by the product
// image manager (overlay + centered card + Cancel / confirm pair). Use this
// instead of window.confirm so confirmations look like the rest of the app.
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  isPending,
  tone = "danger",
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  isPending?: boolean;
  tone?: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useLocale();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className={`w-full max-w-sm ${cardClass} p-6`}>
        <h3 className="mb-2 text-lg font-semibold text-slate-900">{title}</h3>
        <p className="mb-5 text-sm text-slate-500">{body}</p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className={`${btnSecondary} flex-1`}
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className={`${tone === "danger" ? btnDestructiveSolid : btnPrimary} flex-1`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
