import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TransferForm } from "./transfer-form";
import { getServerDictionary } from "@/lib/i18n/get-server-locale";
import { mutedTextClass, pageTitleClass } from "@/lib/ui";

export default async function NewStockTransferPage() {
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
      <main className="mx-auto max-w-2xl px-8 py-6">
        <p className={mutedTextClass}>{dict["transfers.notAuthorized"]}</p>
      </main>
    );
  }

  const { data: products } = await supabase
    .from("products")
    .select("id, name_en, name_ar")
    .order("name_en");

  const { data: warehouses } = await supabase
    .from("warehouses")
    .select("id, name_en")
    .order("name_en");

  return (
    <main className="mx-auto max-w-2xl px-8 py-6">
      <h1 className={`${pageTitleClass} mb-6`}>{dict["transfers.title"]}</h1>
      <TransferForm products={products ?? []} warehouses={warehouses ?? []} />
    </main>
  );
}
