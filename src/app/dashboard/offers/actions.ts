"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/permissions.server";

type ActionResult = { success: true } | { success: false; error: string };

export async function deleteOffer(ruleId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    return { success: false, error: "Not authenticated" };
  }

  if (!(await checkPermission("manage_products"))) {
    return { success: false, error: "You don't have permission to manage offers" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", authData.user.id)
    .single();

  if (!profile) {
    return { success: false, error: "No profile found for this account" };
  }

  const { error } = await supabase
    .from("quantity_price_rules")
    .delete()
    .eq("id", ruleId)
    .eq("organization_id", profile.organization_id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard/offers");
  return { success: true };
}
