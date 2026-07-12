"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { PaymentMethodBadge } from "@/components/ui/badge";
import { DifferenceValue } from "../register/register-client";
import { btnPrimary, cardClass, inputClass, labelClass, sectionTitleClass, tableWrapClass, tdClass, theadRowClass, thClass } from "@/lib/ui";

type PartnerDistribution = {
  name: string;
  share_percent: number;
  amount: number;
};

type InvoiceDetail = {
  invoice_number: string;
  sale_date: string;
  customer_name: string | null;
  payment_method: string;
  subtotal: number;
  discount_total: number;
  vat_amount: number;
  total: number;
};

type ExpenseDetail = {
  expense_date: string;
  category: string;
  amount: number;
  note: string | null;
};

type CashSessionDetail = {
  opened_at: string;
  closed_at: string;
  expected_cash: number;
  actual_cash_counted: number;
  cash_difference: number;
  visa_total: number;
};

type MonthlyReport = {
  period: string;
  total_sales: number;
  cogs: number;
  gross_profit: number;
  vat_collected: number;
  expenses_by_category: Record<string, number>;
  total_expenses: number;
  profit_before_tax: number;
  income_tax_rate: number;
  income_tax: number;
  net_profit: number;
  partner_distribution: PartnerDistribution[];
  invoices_detail: InvoiceDetail[];
  expenses_detail: ExpenseDetail[];
  cash_sessions_detail: CashSessionDetail[];
};

function formatMoney(value: number) {
  return Number(value ?? 0).toFixed(2);
}

function formatPercent(value: number) {
  return Number(value ?? 0).toFixed(2);
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-slate-100 py-2 text-sm last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-900" dir="ltr">
        {value}
      </span>
    </div>
  );
}

export function ReportClient({ dict }: { dict: Dictionary }) {
  const { t } = useLocale();
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [period, setPeriod] = useState(currentMonth);
  const [incomeTaxRate, setIncomeTaxRate] = useState("15");
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsGenerating(true);

    const [year, month] = period.split("-").map((part) => Number(part));
    const parsedTaxRate = Number(incomeTaxRate);
    const supabase = createClient();

    const { data, error: rpcError } = await supabase.rpc("get_monthly_report", {
      p_year: year,
      p_month: month,
      p_income_tax_rate: Number.isFinite(parsedTaxRate) ? parsedTaxRate : 0,
    });

    setIsGenerating(false);

    if (rpcError) {
      setReport(null);
      setError(rpcError.message);
      return;
    }

    setReport(data as MonthlyReport);
  }

  const totalDistributed =
    report?.partner_distribution.reduce((sum, partner) => sum + Number(partner.amount ?? 0), 0) ??
    0;
  const distributionDelta = report ? Math.abs(totalDistributed - report.net_profit) : 0;
  const distributionMatches = distributionDelta < 0.01;

  return (
    <div className="flex flex-col gap-8">
      <form
        onSubmit={handleSubmit}
        className={`grid gap-4 ${cardClass} p-4 md:grid-cols-[1fr_1fr_auto]`}
      >
        <div>
          <label className={labelClass}>{t("finance.report.month")}</label>
          <input
            type="month"
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
            required
            dir="ltr"
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>{t("finance.report.incomeTaxRate")}</label>
          <input
            type="number"
            step="0.01"
            min={0}
            value={incomeTaxRate}
            onChange={(event) => setIncomeTaxRate(event.target.value)}
            required
            dir="ltr"
            className={inputClass}
          />
        </div>

        <div className="flex items-end">
          <button type="submit" disabled={isGenerating} className={`${btnPrimary} w-full`}>
            {isGenerating ? t("finance.report.generating") : t("finance.report.generate")}
          </button>
        </div>
      </form>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {report && (
        <div className="flex flex-col gap-8">
          <section className={`${cardClass} p-4`}>
            <h2 className={`${sectionTitleClass} mb-3`}>{t("finance.report.salesAndCostTitle")}</h2>
            <p className="mb-3 text-sm text-slate-500">
              {t("finance.report.period")}: <span dir="ltr">{report.period}</span>
            </p>
            <StatRow label={t("finance.report.totalSales")} value={formatMoney(report.total_sales)} />
            <StatRow label={t("finance.report.cogs")} value={formatMoney(report.cogs)} />
            <StatRow label={t("finance.report.grossProfit")} value={formatMoney(report.gross_profit)} />
          </section>

          <section>
            <h2 className={`${sectionTitleClass} mb-3`}>{t("finance.report.expensesTitle")}</h2>
            <div className={tableWrapClass}>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className={theadRowClass}>
                    <th className={thClass}>{t("finance.report.colCategory")}</th>
                    <th className={thClass}>{t("finance.report.colAmount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(report.expenses_by_category).map(([category, amount]) => (
                    <tr key={category} className="border-b border-slate-100 last:border-0">
                      <td className={tdClass}>{category}</td>
                      <td className={tdClass} dir="ltr">
                        {formatMoney(amount)}
                      </td>
                    </tr>
                  ))}
                  <tr className="font-semibold text-slate-900">
                    <td className={tdClass}>{t("finance.report.totalExpenses")}</td>
                    <td className={tdClass} dir="ltr">
                      {formatMoney(report.total_expenses)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className={`${cardClass} p-4`}>
            <h2 className={`${sectionTitleClass} mb-3`}>{t("finance.report.taxTitle")}</h2>
            <StatRow label={t("finance.report.vatCollected")} value={formatMoney(report.vat_collected)} />
            <StatRow
              label={t("finance.report.profitBeforeTax")}
              value={formatMoney(report.profit_before_tax)}
            />
            <StatRow
              label={t("finance.report.incomeTaxRateLabel")}
              value={`${formatPercent(report.income_tax_rate)}%`}
            />
            <StatRow label={t("finance.report.incomeTax")} value={formatMoney(report.income_tax)} />
            <StatRow label={t("finance.report.netProfit")} value={formatMoney(report.net_profit)} />
          </section>

          <section>
            <h2 className={`${sectionTitleClass} mb-3`}>
              {t("finance.report.partnerDistributionTitle")}
            </h2>
            {!distributionMatches && (
              <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {t("finance.report.distributionMismatch")}
              </p>
            )}
            <div className={tableWrapClass}>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className={theadRowClass}>
                    <th className={thClass}>{t("finance.report.colName")}</th>
                    <th className={thClass}>{t("finance.report.colSharePercent")}</th>
                    <th className={thClass}>{t("finance.report.colAmountShare")}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.partner_distribution.map((partner) => (
                    <tr key={partner.name} className="border-b border-slate-100 last:border-0">
                      <td className={tdClass}>{partner.name}</td>
                      <td className={tdClass} dir="ltr">
                        {formatPercent(partner.share_percent)}%
                      </td>
                      <td className={tdClass} dir="ltr">
                        {formatMoney(partner.amount)}
                      </td>
                    </tr>
                  ))}
                  <tr className="font-semibold text-slate-900">
                    <td className={tdClass} colSpan={2}>
                      {t("finance.report.totalDistributed")}
                    </td>
                    <td className={tdClass} dir="ltr">
                      {formatMoney(totalDistributed)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className={`${sectionTitleClass} mb-4`}>{t("finance.report.detailsTitle")}</h2>

            <div className="flex flex-col gap-8">
              <div>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                  {t("finance.report.invoicesDetailTitle")}
                </h3>
                {report.invoices_detail.length > 0 ? (
                  <div className={`${tableWrapClass} max-h-96 overflow-y-auto`}>
                    <table className="w-full border-collapse text-sm">
                      <thead className="sticky top-0">
                        <tr className={theadRowClass}>
                          <th className={thClass}>{t("invoices.colDate")}</th>
                          <th className={thClass}>{t("invoices.colInvoice")}</th>
                          <th className={thClass}>{t("invoices.colCustomer")}</th>
                          <th className={thClass}>{t("finance.report.colPaymentMethod")}</th>
                          <th className={thClass}>{t("invoiceDetail.subtotal")}</th>
                          <th className={thClass}>{t("invoiceDetail.discount")}</th>
                          <th className={thClass}>{t("invoiceDetail.vat")}</th>
                          <th className={thClass}>{t("invoices.colTotal")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.invoices_detail.map((invoice) => (
                          <tr key={invoice.invoice_number} className="border-b border-slate-100 last:border-0">
                            <td className={tdClass} dir="ltr">
                              {invoice.sale_date}
                            </td>
                            <td className={tdClass} dir="ltr">
                              {invoice.invoice_number}
                            </td>
                            <td className={tdClass}>{invoice.customer_name ?? t("invoices.walkIn")}</td>
                            <td className={tdClass}>
                              <PaymentMethodBadge paymentMethod={invoice.payment_method} dict={dict} />
                            </td>
                            <td className={tdClass} dir="ltr">
                              {formatMoney(invoice.subtotal)}
                            </td>
                            <td className={tdClass} dir="ltr">
                              {formatMoney(invoice.discount_total)}
                            </td>
                            <td className={tdClass} dir="ltr">
                              {formatMoney(invoice.vat_amount)}
                            </td>
                            <td className={tdClass} dir="ltr">
                              {formatMoney(invoice.total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">{t("invoices.notFound")}</p>
                )}
              </div>

              <div>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                  {t("finance.report.expensesDetailTitle")}
                </h3>
                {report.expenses_detail.length > 0 ? (
                  <div className={tableWrapClass}>
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className={theadRowClass}>
                          <th className={thClass}>{t("finance.report.colExpenseDate")}</th>
                          <th className={thClass}>{t("finance.report.colCategory")}</th>
                          <th className={thClass}>{t("finance.report.colAmount")}</th>
                          <th className={thClass}>{t("finance.report.colNote")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.expenses_detail.map((expense, index) => (
                          <tr key={index} className="border-b border-slate-100 last:border-0">
                            <td className={tdClass} dir="ltr">
                              {expense.expense_date}
                            </td>
                            <td className={tdClass}>{expense.category}</td>
                            <td className={tdClass} dir="ltr">
                              {formatMoney(expense.amount)}
                            </td>
                            <td className={tdClass}>{expense.note ?? "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">{t("finance.expenses.notFound")}</p>
                )}
              </div>

              <div>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                  {t("finance.report.cashHistoryTitle")}
                </h3>
                {report.cash_sessions_detail.length > 0 ? (
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
                        {report.cash_sessions_detail.map((session, index) => (
                          <tr key={index} className="border-b border-slate-100 last:border-0">
                            <td className={tdClass} dir="ltr">
                              {session.opened_at}
                            </td>
                            <td className={tdClass} dir="ltr">
                              {session.closed_at}
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
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
