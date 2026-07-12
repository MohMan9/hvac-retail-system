import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WarehouseEditForm } from "./warehouse-edit-form";
import { getServerDictionary } from "@/lib/i18n/get-server-locale";
import { mutedTextClass, pageTitleClass } from "@/lib/ui";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditWarehousePage({ params }: PageProps) {
  const { id } = await params;
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

  if (!profile || (profile.role !== "manager" && profile.role !== "admin")) {
    return (
      <main className="mx-auto max-w-md px-8 py-6">
        <p className={mutedTextClass}>{dict["warehouses.notAuthorized"]}</p>
      </main>
    );
  }

  const { data: warehouse } = await supabase
    .from("warehouses")
    .select("id, name_ar, name_en, location")
    .eq("id", id)
    .eq("organization_id", profile.organization_id)
    .single();

  if (!warehouse) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-md px-8 py-6">
      <h1 className={`${pageTitleClass} mb-6`}>{dict["warehouses.editTitle"]}</h1>
      <WarehouseEditForm
        warehouseId={warehouse.id}
        initialValues={{
          name_ar: warehouse.name_ar,
          name_en: warehouse.name_en,
          location: warehouse.location,
        }}
      />
    </main>
  );
}
