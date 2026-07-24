"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth.server";
import { checkPermission } from "@/lib/permissions.server";

type CreateFixedAssetResult = { success: false; error: string };

function roundMoney(value: FormDataEntryValue | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function toNumber(value: FormDataEntryValue | null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function createFixedAsset(formData: FormData): Promise<CreateFixedAssetResult> {
  const supabase = await createClient();
  const authData = await getCurrentUser();

  if (!authData.user) {
    return { success: false, error: "Not authenticated" };
  }

  if (!(await checkPermission("manage_expenses"))) {
    return { success: false, error: "You don't have permission to manage fixed assets" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", authData.user.id)
    .single();

  if (!profile) {
    return { success: false, error: "No profile found for this account" };
  }

  const name = ((formData.get("name") as string) ?? "").trim();
  const purchaseCost = roundMoney(formData.get("purchase_cost"));
  const purchaseDate = formData.get("purchase_date") as string;
  const usefulLifeYears = toNumber(formData.get("useful_life_years"));

  if (!name) {
    return { success: false, error: "Enter a name for this asset." };
  }

  if (purchaseCost <= 0) {
    return { success: false, error: "Enter a valid, positive purchase cost." };
  }

  if (!purchaseDate) {
    return { success: false, error: "Choose a purchase date." };
  }

  // Useful life drives the straight-line depreciation divisor, so it must be
  // strictly positive — zero would make monthly depreciation undefined.
  if (usefulLifeYears <= 0) {
    return { success: false, error: "Enter a useful life greater than zero." };
  }

  const { error } = await supabase.from("fixed_assets").insert({
    organization_id: profile.organization_id,
    name,
    purchase_cost: purchaseCost,
    purchase_date: purchaseDate,
    useful_life_years: usefulLifeYears,
    created_by: authData.user.id,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  redirect("/dashboard/finance/fixed-assets");
}
