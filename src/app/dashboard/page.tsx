import { redirect } from "next/navigation";
import { DollarSign, PackageX, Receipt, TrendingUp, Vault, type LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getServerDictionary } from "@/lib/i18n/get-server-locale";
import { cardClass, pageTitleClass, sectionTitleClass } from "@/lib/ui";

// Products with total inventory (summed across all warehouses) below this
// are surfaced in the manager/admin "low stock" list. Hardcoded for now —
// no per-organization settings UI yet.
const LOW_STOCK_THRESHOLD = 5;

function formatMoney(value: number) {
  return Number(value ?? 0).toFixed(2);
}

function StatCard({
  icon: Icon,
  label,
  value,
  dot,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  dot?: "open" | "closed";
}) {
  return (
    <div className={`${cardClass} p-5`}>
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="mt-2 flex items-center gap-2">
        {dot && (
          <span
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot === "open" ? "bg-emerald-500" : "bg-slate-400"}`}
          />
        )}
        <p className="text-2xl font-bold text-slate-900" dir="ltr">
          {value}
        </p>
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    redirect("/signin");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, organization_id, full_name")
    .eq("id", authData.user.id)
    .single();

  if (!profile) {
    redirect("/signin");
  }

  const { dict } = await getServerDictionary();
  const canManage = profile.role === "manager" || profile.role === "admin";
  const isAdmin = profile.role === "admin";
  const today = new Date().toISOString().slice(0, 10);

  const { data: todayInvoices } = await supabase
    .from("invoices")
    .select("total")
    .eq("organization_id", profile.organization_id)
    .eq("status", "completed")
    .eq("sale_date", today);

  const todaySalesTotal = (todayInvoices ?? []).reduce(
    (sum, invoice) => sum + Number(invoice.total ?? 0),
    0
  );
  const todayInvoiceCount = (todayInvoices ?? []).length;

  // Same open-session check used by the Cash Register page's status card.
  const { data: openSession } = await supabase
    .from("cash_sessions")
    .select("id")
    .eq("organization_id", profile.organization_id)
    .is("closed_at", null)
    .maybeSingle();

  const isRegisterOpen = Boolean(openSession);

  let lowStockItems: { id: string; name: string; quantity: number }[] = [];

  if (canManage) {
    const { data: inventoryRows } = await supabase
      .from("inventory")
      .select("product_id, quantity")
      .eq("organization_id", profile.organization_id);

    const totalByProduct = new Map<string, number>();
    for (const row of inventoryRows ?? []) {
      totalByProduct.set(
        row.product_id,
        (totalByProduct.get(row.product_id) ?? 0) + Number(row.quantity ?? 0)
      );
    }

    const lowStockProductIds = [...totalByProduct.entries()]
      .filter(([, quantity]) => quantity < LOW_STOCK_THRESHOLD)
      .map(([productId]) => productId);

    const { data: lowStockProducts } = lowStockProductIds.length
      ? await supabase.from("products").select("id, name_en, name_ar").in("id", lowStockProductIds)
      : { data: [] };

    lowStockItems = lowStockProductIds
      .map((id) => {
        const product = (lowStockProducts ?? []).find((item) => item.id === id);
        return {
          id,
          name: product?.name_en || product?.name_ar || id,
          quantity: totalByProduct.get(id) ?? 0,
        };
      })
      .sort((a, b) => a.quantity - b.quantity);
  }

  let monthSalesTotal: number | null = null;

  if (isAdmin) {
    const monthStart = new Date();
    monthStart.setDate(1);
    const monthStartStr = monthStart.toISOString().slice(0, 10);

    const { data: monthInvoices } = await supabase
      .from("invoices")
      .select("total")
      .eq("organization_id", profile.organization_id)
      .eq("status", "completed")
      .gte("sale_date", monthStartStr);

    monthSalesTotal = (monthInvoices ?? []).reduce(
      (sum, invoice) => sum + Number(invoice.total ?? 0),
      0
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-8 py-6">
      <h1 className={`${pageTitleClass} mb-6`}>
        {dict["dashboard.greeting"]}
        {profile.full_name ? `, ${profile.full_name}` : ""}
      </h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={DollarSign}
          label={dict["dashboard.todaySales"]}
          value={formatMoney(todaySalesTotal)}
        />
        <StatCard
          icon={Receipt}
          label={dict["dashboard.todayInvoiceCount"]}
          value={String(todayInvoiceCount)}
        />
        <StatCard
          icon={Vault}
          label={dict["nav.register"]}
          value={isRegisterOpen ? dict["finance.register.statusOpen"] : dict["finance.register.statusClosed"]}
          dot={isRegisterOpen ? "open" : "closed"}
        />
        {isAdmin && monthSalesTotal !== null && (
          <StatCard
            icon={TrendingUp}
            label={dict["dashboard.monthSales"]}
            value={formatMoney(monthSalesTotal)}
          />
        )}
      </div>

      {canManage && (
        <section className="mt-8">
          <h2 className={`${sectionTitleClass} mb-3`}>{dict["dashboard.lowStockTitle"]}</h2>
          {lowStockItems.length > 0 ? (
            <div className={`${cardClass} divide-y divide-slate-100`}>
              {lowStockItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <span className="text-slate-700">{item.name}</span>
                  <span className="font-medium text-amber-600" dir="ltr">
                    {item.quantity}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className={`${cardClass} flex items-center gap-2 px-4 py-6 text-sm text-slate-500`}>
              <PackageX className="h-4 w-4" />
              {dict["dashboard.noLowStock"]}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
