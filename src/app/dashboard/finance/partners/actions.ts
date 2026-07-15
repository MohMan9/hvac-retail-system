"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/permissions.server";

type CreatePartnerResult = { success: false; error: string };

function roundPercent(value: FormDataEntryValue | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

export async function createPartner(formData: FormData): Promise<CreatePartnerResult> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user) {
    return { success: false, error: "Not authenticated" };
  }

  if (!(await checkPermission("manage_partners"))) {
    return { success: false, error: "You don't have permission to manage partners" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", authData.user.id)
    .single();

  if (!profile) {
    return { success: false, error: "No profile found for this account" };
  }

  const { error } = await supabase.from("partners").insert({
    organization_id: profile.organization_id,
    name: formData.get("name") as string,
    share_percent: roundPercent(formData.get("share_percent")),
  });

  if (error) {
    return { success: false, error: error.message };
  }

  redirect("/dashboard/finance/partners");
}
