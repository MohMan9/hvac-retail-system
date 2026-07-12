import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProductForm } from "./product-form";
import { getServerDictionary } from "@/lib/i18n/get-server-locale";
import { mutedTextClass, pageTitleClass } from "@/lib/ui";

export default async function NewProductPage() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const { dict } = await getServerDictionary();

  if (!authData.user) {
    redirect("/signin");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, organization_id")
    .eq("id", authData.user.id)
    .single();

  const isAdmin = profile?.role === "admin";
  const canManage = profile?.role === "manager" || profile?.role === "admin";

  if (!canManage || !profile) {
    return (
      <main className="mx-auto max-w-2xl px-8 py-6">
        <p className={mutedTextClass}>{dict["productForm.notAuthorized"]}</p>
      </main>
    );
  }

  const { data: warehouses } = await supabase
    .from("warehouses")
    .select("id, name_en")
    .eq("organization_id", profile.organization_id)
    .order("name_en");

  return (
    <main className="mx-auto max-w-2xl px-8 py-6">
      <h1 className={`${pageTitleClass} mb-6`}>{dict["productForm.newTitle"]}</h1>
      <ProductForm canManage={canManage} isAdmin={isAdmin} warehouses={warehouses ?? []} />
    </main>
  );
}
