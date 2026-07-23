"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { checkPermission } from "@/lib/permissions.server";

type CreateWithdrawalResult = { success: true } | { success: false; error: string };

function roundMoney(value: FormDataEntryValue | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

export async function createWithdrawal(
  partnerId: string,
  formData: FormData
): Promise<CreateWithdrawalResult> {
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

  // Confirm the partner exists in the caller's organization before recording a
  // withdrawal against it.
  const { data: partner } = await supabase
    .from("partners")
    .select("id")
    .eq("id", partnerId)
    .eq("organization_id", profile.organization_id)
    .maybeSingle();

  if (!partner) {
    return { success: false, error: "Partner not found" };
  }

  const amount = roundMoney(formData.get("amount"));

  if (amount <= 0) {
    return { success: false, error: "Enter a valid, positive amount." };
  }

  const withdrawalDate = formData.get("withdrawal_date") as string;

  if (!withdrawalDate) {
    return { success: false, error: "Choose a withdrawal date." };
  }

  const { error } = await supabase.from("partner_withdrawals").insert({
    partner_id: partnerId,
    amount,
    withdrawal_date: withdrawalDate,
    note: (formData.get("note") as string) || null,
    created_by: authData.user.id,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/dashboard/finance/partners/${partnerId}/withdrawals`);
  return { success: true };
}
