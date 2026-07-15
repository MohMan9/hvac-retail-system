import { createClient } from "@/lib/supabase/server";
import { ExpenseForm } from "./expense-form";
import { getServerDictionary } from "@/lib/i18n/get-server-locale";
import { getEffectivePermissions } from "@/lib/permissions.server";
import { hasPermission } from "@/lib/permissions";
import { mutedTextClass, pageTitleClass } from "@/lib/ui";

export default async function NewExpensePage() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const { dict } = await getServerDictionary();

  const permissions = await getEffectivePermissions();

  if (!authData.user || !hasPermission(permissions, "manage_expenses")) {
    return (
      <main className="mx-auto max-w-md px-8 py-6">
        <p className={mutedTextClass}>{dict["finance.expenses.notAuthorized"]}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-8 py-6">
      <h1 className={`${pageTitleClass} mb-6`}>{dict["finance.expenses.newTitle"]}</h1>
      <ExpenseForm />
    </main>
  );
}
