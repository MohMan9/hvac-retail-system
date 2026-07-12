"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

type UpdateWarehouseResult = { success: false; error: string };

export async function updateWarehouse(
  warehouseId: string,
  formData: FormData
): Promise<UpdateWarehouseResult> {
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

  if (!profile) {
    return { success: false, error: "No profile found for this account" };
  }

  if (profile.role !== "manager" && profile.role !== "admin") {
    return { success: false, error: "Only managers and admins can edit warehouses" };
  }

  const name_ar = formData.get("name_ar") as string;
  const name_en = formData.get("name_en") as string;
  const location = (formData.get("location") as string) || null;

  const { error } = await supabase
    .from("warehouses")
    .update({ name_ar, name_en, location })
    .eq("id", warehouseId)
    .eq("organization_id", profile.organization_id);

  if (error) {
    return { success: false, error: error.message };
  }

  redirect("/dashboard/warehouses");
}
