import { createClient } from "@/lib/supabase/server";
import { ReportClient } from "./report-client";
import { getServerDictionary } from "@/lib/i18n/get-server-locale";
import { getEffectivePermissions } from "@/lib/permissions.server";
import { hasPermission } from "@/lib/permissions";
import { mutedTextClass, pageTitleClass } from "@/lib/ui";

export default async function FinanceReportPage() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const { dict } = await getServerDictionary();

  const permissions = await getEffectivePermissions();

  if (!authData.user || !hasPermission(permissions, "view_monthly_report")) {
    return (
      <main className="mx-auto max-w-2xl px-8 py-6">
        <p className={mutedTextClass}>{dict["finance.report.notAuthorized"]}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-8 py-6">
      <h1 className={`${pageTitleClass} mb-6`}>{dict["finance.report.title"]}</h1>
      <ReportClient dict={dict} />
    </main>
  );
}
