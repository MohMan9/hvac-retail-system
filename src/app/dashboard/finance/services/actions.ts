"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, organization_id")
    .eq("id", authData.user.id)
    .single();

  if (!profile || (profile.role !== "manager" && profile.role !== "admin")) {
    return { success: false, error: "Only managers and admins can create services" };
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
