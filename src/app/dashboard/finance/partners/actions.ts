"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, organization_id")
    .eq("id", authData.user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    return { success: false, error: "Only admins can create partners" };
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
