import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getServerDictionary } from "@/lib/i18n/get-server-locale";
import { getEffectivePermissions } from "@/lib/permissions.server";
import { getCurrentUser } from "@/lib/auth.server";
import { hasPermission } from "@/lib/permissions";
import { RegisterClient } from "./register-client";
import { pageTitleClass } from "@/lib/ui";

export default async function CashRegisterPage() {
  const supabase = await createClient();
  const authData = await getCurrentUser();

  if (!authData.user) {
    redirect("/signin");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, organization_id")
    .eq("id", authData.user.id)
    .single();

  if (!profile) {
    redirect("/signin");
  }

  // The read-only status card + running total stay visible to everyone; only
  // the open/close actions and the history table are gated on this.
  const permissions = await getEffectivePermissions();
  const canManage = hasPermission(permissions, "manage_cash_register");
  const { dict } = await getServerDictionary();

  const { data: openSession } = await supabase
    .from("cash_sessions")
    .select("opened_at, opened_by")
    .eq("organization_id", profile.organization_id)
    .is("closed_at", null)
    .maybeSingle();

  let openedByName: string | null = null;
  let runningCashTotal = 0;

  if (openSession) {
    const { data: openerProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", openSession.opened_by)
      .single();

    openedByName = openerProfile?.full_name ?? null;

    // Live preview of what closing would currently compute — the official
    // total is only locked in by the close_cash_session RPC itself. Sum the
    // CASH portions from invoice_payments (not invoices.total), so a split
    // payment only contributes its cash slice — matching how the RPC now
    // computes expected_cash. Filter on the parent invoice's completed_at
    // (when the sale was actually finalized), matching the RPC — an invoice
    // created before the session opened but completed after it still belongs
    // to this session.
    const { data: cashPayments } = await supabase
      .from("invoice_payments")
      .select("amount, invoices!inner(organization_id, status, completed_at)")
      .eq("payment_method", "cash")
      .eq("invoices.organization_id", profile.organization_id)
      .eq("invoices.status", "completed")
      .gte("invoices.completed_at", openSession.opened_at);

    runningCashTotal = (cashPayments ?? []).reduce(
      (sum, payment) => sum + Number(payment.amount ?? 0),
      0
    );
  }

  const { data: history } = canManage
    ? await supabase
        .from("cash_sessions")
        .select(
          "id, opened_at, closed_at, expected_cash, actual_cash_counted, cash_difference, visa_total, cheque_total"
        )
        .eq("organization_id", profile.organization_id)
        .not("closed_at", "is", null)
        .order("closed_at", { ascending: false })
        .limit(10)
    : { data: [] };

  return (
    <main className="mx-auto max-w-4xl px-8 py-6">
      <h1 className={`${pageTitleClass} mb-6`}>{dict["finance.register.title"]}</h1>
      <RegisterClient
        isOpen={Boolean(openSession)}
        openedAt={openSession?.opened_at ?? null}
        openedByName={openedByName}
        runningCashTotal={runningCashTotal}
        canManage={canManage}
        history={history ?? []}
      />
    </main>
  );
}
