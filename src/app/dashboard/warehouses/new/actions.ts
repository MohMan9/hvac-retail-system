"use server";

import { createClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/permissions.server";
import { redirect } from "next/navigation";

type CreateWarehouseResult = { success: false; error: string };

export async function createWarehouse(formData: FormData): Promise<CreateWarehouseResult> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    return { success: false, error: "Not authenticated" };
  }

  // The page already gates this, but re-check here too — the page check alone
  // doesn't stop a direct call to this action (RLS is the real backstop).
  if (!(await checkPermission("manage_warehouses"))) {
    return { success: false, error: "You don't have permission to manage warehouses" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", authData.user.id)
    .single();

  if (!profile) {
    return { success: false, error: "No profile found for this account" };
  }

  const name_ar = formData.get("name_ar") as string;
  const name_en = formData.get("name_en") as string;
  const location = (formData.get("location") as string) || null;

  const { error } = await supabase.from("warehouses").insert({
    organization_id: profile.organization_id,
    name_ar,
    name_en,
    location,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  redirect(`/dashboard/warehouses?message=${encodeURIComponent("Warehouse created.")}`);
}
