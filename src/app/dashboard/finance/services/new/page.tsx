import { createClient } from "@/lib/supabase/server";
import { ServiceForm } from "./service-form";
import { getServerDictionary } from "@/lib/i18n/get-server-locale";
import { getEffectivePermissions } from "@/lib/permissions.server";
import { hasPermission } from "@/lib/permissions";
import { mutedTextClass, pageTitleClass } from "@/lib/ui";

export default async function NewServicePage() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const { dict } = await getServerDictionary();

  const permissions = await getEffectivePermissions();
  const canManage = hasPermission(permissions, "manage_services");

  if (!authData.user || !canManage) {
    return (
      <main className="mx-auto max-w-md px-8 py-6">
        <p className={mutedTextClass}>{dict["finance.services.notAuthorized"]}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-8 py-6">
      <h1 className={`${pageTitleClass} mb-6`}>{dict["finance.services.newTitle"]}</h1>
      <ServiceForm />
    </main>
  );
}
