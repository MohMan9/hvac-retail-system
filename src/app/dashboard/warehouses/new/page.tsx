import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WarehouseForm } from "./warehouse-form";
import { getServerDictionary } from "@/lib/i18n/get-server-locale";
import { mutedTextClass, pageTitleClass } from "@/lib/ui";

export default async function NewWarehousePage() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const { dict } = await getServerDictionary();

  if (!authData.user) {
    redirect("/signin");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", authData.user.id)
    .single();

  if (!profile || (profile.role !== "manager" && profile.role !== "admin")) {
    return (
      <main className="mx-auto max-w-md px-8 py-6">
        <p className={mutedTextClass}>{dict["warehouses.notAuthorized"]}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-8 py-6">
      <h1 className={`${pageTitleClass} mb-6`}>{dict["warehouses.newTitle"]}</h1>
      <WarehouseForm />
    </main>
  );
}
