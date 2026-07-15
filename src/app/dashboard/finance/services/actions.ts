"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/permissions.server";

type CreateServiceResult = { success: false; error: string };

function roundMoney(value: FormDataEntryValue | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

export async function createService(formData: FormData): Promise<CreateServiceResult> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    return { success: false, error: "Not authenticated" };
  }

  if (!(await checkPermission("manage_services"))) {
    return { success: false, error: "You don't have permission to manage services" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", authData.user.id)
    .single();

  if (!profile) {
    return { success: false, error: "No profile found for this account" };
  }

  const { error } = await supabase.from("services").insert({
    organization_id: profile.organization_id,
    name_ar: formData.get("name_ar") as string,
    name_en: (formData.get("name_en") as string) || null,
    default_price: roundMoney(formData.get("default_price")),
  });

  if (error) {
    return { success: false, error: error.message };
  }

  redirect("/dashboard/finance/services");
}
