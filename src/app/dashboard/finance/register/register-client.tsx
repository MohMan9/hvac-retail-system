"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Banknote, CreditCard } from "lucide-react";
import { closeRegister, openRegister } from "./actions";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { formatShopDateTime } from "@/lib/date";
import {
  btnPrimary,
  btnSecondary,
  cardClass,
  inputClass,
  labelClass,
  tableWrapClass,
  tdClass,
  theadRowClass,
  thClass,
  trClass,
} from "@/lib/ui";

type HistoryRow = {
  id: string;
  opened_at: string;
  closed_at: string | null;
  expected_cash: number;
  actual_cash_counted: number;
  cash_difference: number;
  visa_total: number;
};

type CloseResultData = {
  expected_cash: number;
  actual_cash_counted: number;
  cash_difference: number;
  visa_total: number;
};

function formatMoney(value: number) {
  return Number(value ?? 0).toFixed(2);
}

// Any non-zero cash difference is a discrepancy worth flagging — overage
// (amber, mild) and shortage (red, more concerning) both get a warm color
// and an explicit +/- sign; only an exact match is green. Exported so the
// monthly report's cash session history table can render differences the
// same way.
export function DifferenceValue({ value }: { value: number }) {
  const rounded = Math.round(Number(value ?? 0) * 100) / 100;

  if (rounded === 0) {
    return <span className="font-medium text-emerald-600">0.00</span>;
  }

  return (
    <span className={`font-medium ${rounded > 0 ? "text-amber-600" : "text-red-600"}`}>
      {rounded > 0 ? "+" : ""}
      {formatMoney(rounded)}
    </span>
  );
}

export function RegisterClient({
  isOpen,
  openedAt,
  openedByName,
  runningCashTotal,
  canManage,
  history,
}: {
  isOpen: boolean;
  openedAt: string | null;
  openedByName: string | null;
  runningCashTotal: number;
  canManage: boolean;
  history: HistoryRow[];
}) {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [isOpening, setIsOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [closeResult, setCloseResult] = useState<CloseResultData | null>(null);

  async function handleOpen() {
    setIsOpening(true);
    setError(null);

    const result = await openRegister();

    if (!result.success) {
      setError(result.error);
      setIsOpening(false);
      return;
    }

    router.refresh();
    setIsOpening(false);
  }

  return (
    <div className="flex flex-col gap-8">
      <div className={`${cardClass} p-6`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span
              className={`h-3 w-3 shrink-0 rounded-full ${isOpen ? "bg-emerald-500" : "bg-slate-400"}`}
            />
            <div>
              <p className="text-lg font-semibold text-slate-900">
                {isOpen ? t("finance.register.statusOpen") : t("finance.register.statusClosed")}
              </p>
              {isOpen && (
                <p className="text-sm text-slate-500">
                  {t("finance.register.openedBy")} {openedByName ?? "—"} ·{" "}
                  <span dir="ltr">{formatShopDateTime(openedAt, locale)}</span>
                </p>
              )}
            </div>
          </div>

          {canManage && (
            <div>
              {isOpen ? (
                <button type="button" onClick={() => setIsCloseModalOpen(true)} className={btnPrimary}>
                  {t("finance.register.closeButton")}
                </button>
              ) : (
                <button type="button" onClick={handleOpen} disabled={isOpening} className={btnPrimary}>
                  {isOpening ? t("finance.register.opening") : t("finance.register.openButton")}
                </button>
              )}
            </div>
          )}
        </div>

        {isOpen && (
          <div className="mt-4 border-t border-slate-200 pt-4">
            <p className="text-sm text-slate-500">{t("finance.register.runningCashTotal")}</p>
            <p className="text-2xl font-bold text-slate-900" dir="ltr">
              {formatMoney(runningCashTotal)}
            </p>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>

      {canManage && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-slate-900">
            {t("finance.register.historyTitle")}
          </h2>
          {history.length > 0 ? (
            <div className={tableWrapClass}>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className={theadRowClass}>
                    <th className={thClass}>{t("finance.register.colOpenedAt")}</th>
                    <th className={thClass}>{t("finance.register.colClosedAt")}</th>
                    <th className={thClass}>{t("finance.register.colExpectedCash")}</th>
                    <th className={thClass}>{t("finance.register.colActualCash")}</th>
                    <th className={thClass}>{t("finance.register.colDifference")}</th>
                    <th className={thClass}>{t("finance.register.colVisaTotal")}</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((session) => (
                    <tr key={session.id} className={trClass}>
                      <td className={tdClass} dir="ltr">
                        {formatShopDateTime(session.opened_at, locale)}
                      </td>
                      <td className={tdClass} dir="ltr">
                        {formatShopDateTime(session.closed_at, locale)}
                      </td>
                      <td className={tdClass} dir="ltr">
                        {formatMoney(session.expected_cash)}
                      </td>
                      <td className={tdClass} dir="ltr">
                        {formatMoney(session.actual_cash_counted)}
                      </td>
                      <td className={tdClass} dir="ltr">
                        <DifferenceValue value={session.cash_difference} />
                      </td>
                      <td className={tdClass} dir="ltr">
                        {formatMoney(session.visa_total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-500">{t("finance.register.noHistory")}</p>
          )}
        </section>
      )}

      {isCloseModalOpen && (
        <CloseRegisterModal
          onClose={() => setIsCloseModalOpen(false)}
          onClosed={(data) => {
            setIsCloseModalOpen(false);
            setCloseResult(data);
            router.refresh();
          }}
        />
      )}

      {closeResult && (
        <CloseResultModal result={closeResult} onDone={() => setCloseResult(null)} />
      )}
    </div>
  );
}

function CloseRegisterModal({
  onClose,
  onClosed,
}: {
  onClose: () => void;
  onClosed: (data: CloseResultData) => void;
}) {
  const { t } = useLocale();
  const [actualCashCounted, setActualCashCounted] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsedAmount = Number(actualCashCounted);

    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      setError(t("finance.register.invalidAmount"));
      return;
    }

    setIsSubmitting(true);
    const result = await closeRegister(parsedAmount, notes.trim() || null);

    if (!result.success) {
      setError(result.error);
      setIsSubmitting(false);
      return;
    }

    onClosed(result.data);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className={`w-full max-w-md ${cardClass} p-6`}>
        <h2 className="mb-4 text-lg font-semibold text-slate-900">
          {t("finance.register.closeModalTitle")}
        </h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className={labelClass}>{t("finance.register.actualCashCounted")}</label>
            <input
              type="number"
              min="0"
              step="0.01"
              dir="ltr"
              autoFocus
              required
              value={actualCashCounted}
              onChange={(event) => setActualCashCounted(event.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>{t("finance.register.notes")}</label>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              className={inputClass}
            />
          </div>

          <div className="mt-2 flex gap-3">
            <button type="button" onClick={onClose} className={`${btnSecondary} flex-1`}>
              {t("common.cancel")}
            </button>
            <button type="submit" disabled={isSubmitting} className={`${btnPrimary} flex-1`}>
              {isSubmitting ? t("finance.register.closing") : t("finance.register.confirmClose")}
            </button>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      </div>
    </div>
  );
}

function CloseResultModal({
  result,
  onDone,
}: {
  result: CloseResultData;
  onDone: () => void;
}) {
  const { t } = useLocale();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className={`w-full max-w-sm ${cardClass} p-6`}>
        <h2 className="mb-4 text-lg font-semibold text-slate-900">
          {t("finance.register.closeResultTitle")}
        </h2>

        <div className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between border-b border-slate-100 py-2">
            <span className="text-slate-500">{t("finance.register.expectedCash")}</span>
            <span className="font-medium text-slate-900" dir="ltr">
              {formatMoney(result.expected_cash)}
            </span>
          </div>
          <div className="flex justify-between border-b border-slate-100 py-2">
            <span className="text-slate-500">{t("finance.register.actualCash")}</span>
            <span className="font-medium text-slate-900" dir="ltr">
              {formatMoney(result.actual_cash_counted)}
            </span>
          </div>
          <div className="flex justify-between border-b border-slate-100 py-2">
            <span className="text-slate-500">{t("finance.register.difference")}</span>
            <span dir="ltr">
              <DifferenceValue value={result.cash_difference} />
            </span>
          </div>
          <div className="flex justify-between py-2">
            <span className="flex items-center gap-1.5 text-slate-500">
              <CreditCard className="h-3.5 w-3.5" />
              {t("finance.register.colVisaTotal")}
            </span>
            <span className="font-medium text-slate-900" dir="ltr">
              {formatMoney(result.visa_total)}
            </span>
          </div>
        </div>

        <button type="button" onClick={onDone} className={`${btnPrimary} mt-4 w-full`}>
          <Banknote className="h-4 w-4" />
          {t("finance.register.done")}
        </button>
      </div>
    </div>
  );
}
