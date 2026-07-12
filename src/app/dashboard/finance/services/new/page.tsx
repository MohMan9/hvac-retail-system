import { createClient } from "@/lib/supabase/server";
import { ServiceForm } from "./service-form";
import { getServerDictionary } from "@/lib/i18n/get-server-locale";
import { mutedTextClass, pageTitleClass } from "@/lib/ui";

export default async function NewServicePage() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const { dict } = await getServerDictionary();

  const { data: profile } = authData.user
    ? await supabase
        .from("profiles")
        .select("role")
        .eq("id", authData.user.id)
        .single()
    : { data: null };

  const canManage = profile?.role === "manager" || profile?.role === "admin";

  if (!authData.user || !profile || !canManage) {
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
